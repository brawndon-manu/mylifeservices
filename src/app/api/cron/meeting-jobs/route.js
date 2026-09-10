// Phase C scheduler. A free external pinger (cron-job.org / GitHub Actions) hits
// this every ~5 min with the CRON_SECRET. Each run scans Company Meetings and,
// reading live state, fires three kinds of timed jobs (idempotent via stamps):
//   1. "starting soon" reminder - per session, at start - leadMin, to its going
//      attendees (includes the current Zoom link, so a link added late just works)
//   2. author nudge - when the Zoom link is still "to be provided" near the meeting
//   3. response-due second notice - to anyone who hasn't responded by the due date
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { ackAudienceWhere, ackOwedWhere, formatHasOnline, isCompanyMeeting } from "@/lib/announcements";
import { notifyOversight } from "@/lib/notify";
// the deadline's windows and words, one definition - see the module note
import {
  chaseWindowOpen,
  deadlinePassed,
  chaseEmailCopy,
  missedBellCopy,
  dueDateLong,
} from "@/lib/announcement-deadline";
import {
  emailAnnouncement,
  emailAudienceWhere,
  EMAIL_AUTHOR_SELECT,
  EMAIL_MEETING_SELECT,
} from "@/lib/announce-send";
import { firstNameOf } from "@/lib/contacts";
import { instantToZoned, zonedToInstant } from "@/lib/meeting-time";
import { resolveAnnouncementRecipients } from "@/lib/timesheet-mode";
import {
  buildAnnouncementEmailHtml,
  buildMeetingBlockHtml,
  buildAuthorNudgeHtml,
  buildResponseNoticeHtml,
  seeOriginalButton,
  EMAIL_TZ,
} from "@/lib/announcement-email";

export const dynamic = "force-dynamic";

const GRACE_MS = 30 * 60 * 1000; // don't fire a reminder more than 30 min late
const NUDGE_LEAD_MS = 3 * 60 * 60 * 1000; // author email ~3h before the meeting

const RECIP_SELECT = {
  id: true,
  email: true,
  name: true,
  preferredFirstName: true,
  preferredLastName: true,
};

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(request.url);
  const provided =
    (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("secret") ||
    "";
  if (!secret || provided !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const from = process.env.ANNOUNCEMENTS_FROM || process.env.AUTH_RESEND_FROM;
  const base = (process.env.AUTH_URL || "").replace(/\/$/, "");
  if (!from || !base || !process.env.RESEND_API_KEY) {
    return NextResponse.json({ ok: false, error: "email not configured" }, { status: 500 });
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const now = new Date();
  const result = {
    reminders: 0, nudges: 0, notices: 0, emails: 0, held: 0, published: 0,
    chases: 0, deadlineBells: 0,
  };

  // ---- scheduled publishes, first ----
  //
  // SEND LATER, 2026-08-23. A draft whose publishAt has passed goes live here,
  // through emailAnnouncement - the exact code the Publish button runs - so a
  // scheduled post cannot behave differently from a hand-published one. First,
  // before the reminder passes below, so a meeting published at 8:00 is
  // already live when the same run walks meetings.
  //
  // Publish-then-email in that order, and the publishedAt write is the claim:
  // a row updated by this pass belongs to this pass, so a slow run overlapping
  // the next five-minute tick cannot double-send.
  {
    const due = await prisma.announcement.findMany({
      where: { publishedAt: null, deletedAt: null, publishAt: { lte: now } },
      select: {
        id: true, tag: true, title: true, content: true, attachments: true,
        formId: true, requireAck: true, createdAt: true,
        ackEveryone: true, ackTitles: true, ackUserIds: true,
        publishEmail: true,
        ...EMAIL_MEETING_SELECT,
        author: { select: EMAIL_AUTHOR_SELECT },
      },
    });
    for (const post of due) {
      const claimed = await prisma.announcement.updateMany({
        where: { id: post.id, publishedAt: null },
        data: { publishedAt: new Date(), publishAt: null, publishEmail: null },
      });
      if (!claimed.count) continue; // another pass got here first
      result.published += 1;
      const plan = post.publishEmail || {};
      if (plan.doEmail) {
        const hasAudience = isCompanyMeeting(post.tag) || post.requireAck;
        const where = hasAudience
          ? ackAudienceWhere(post)
          : emailAudienceWhere({
              everyone: !!plan.everyone,
              titles: Array.isArray(plan.titles) ? plan.titles : [],
              userIds: Array.isArray(plan.userIds) ? plan.userIds : [],
            });
        if (where) {
          const res = await emailAnnouncement(post, where);
          result.emails += res.sent || 0;
        }
      }
    }
  }

  // test mode: while CRON_TEST_RECIPIENTS is set, only those addresses ever get
  // an email - so you can dry-run the whole thing on prod without hitting staff.
  const testList = (process.env.CRON_TEST_RECIPIENTS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  // returns whether the caller may stamp this job as done. a batch that was held
  // back was NOT delivered, and stamping it would retire a reminder nobody got.
  const sendBatch = async (messagesIn) => {
    // ALL OR NOTHING, and that is the fix. this used to drop the addresses it
    // did not recognise and quietly send the rest, while the caller stamped the
    // job as done either way. so with the list set, a real meeting's reminder
    // was thrown away AND marked as sent, and it could never fire again.
    //
    // holding the whole batch also avoids the other half of that trade: send
    // only the one recognised address out of five and skip the stamp, and that
    // one person gets the same reminder again every five minutes until the
    // grace window closes.
    //
    // so the list is now a guard. either every recipient in a batch is on it, or
    // nothing leaves and the job stays unstamped for when the list comes off.
    if (testList.length) {
      const off = messagesIn.filter(
        (m) => !m.to.some((a) => testList.includes(a.toLowerCase())),
      );
      if (off.length) {
        console.warn(
          `cron: held ${messagesIn.length} message(s), ${off.length} not on CRON_TEST_RECIPIENTS`,
        );
        result.held += messagesIn.length;
        return false;
      }
    }
    // AND THE LOCK, because the list above is opt-in and is usually not set at
    // all: with CRON_TEST_RECIPIENTS unset this route mails real staff from
    // wherever it is run. Off the real deployment every reminder and notice is
    // redirected, same rule as announcements and form submissions.
    const messages = messagesIn.map((m) => {
      const route = resolveAnnouncementRecipients(m.to[0]);
      if (!route.redirected) return m;
      return {
        ...m,
        to: route.to,
        subject: `[TEST - would have gone to ${route.intendedEmail}] ${m.subject}`,
      };
    });
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      try {
        const { error } = await resend.batch.send(chunk);
        if (error) console.error("cron email batch error:", error);
        else result.emails += chunk.length;
      } catch (e) {
        console.error("cron email threw:", e);
      }
    }
    return true;
  };

  const meetings = await prisma.announcement.findMany({
    where: {
      tag: "Company Meeting",
      deletedAt: null,
      // A DRAFT NEVER EMAILS ANYBODY (Mánu 2026-09-09, off three reminders for
      // one meeting). This asked only that the announcement was not deleted, so
      // an UNPUBLISHED copy sent reminders exactly like a live one. There were
      // three records titled "September zoom trainings", created seven seconds
      // apart on 2026-08-21 by what looks like a submit that fired three times;
      // two were never published, both carried the same session with the
      // night-before reminder on, and one cron run walked all three and sent one
      // email each at 8:00pm. The drafts had nobody signed up, so their only
      // recipients were the six in ALWAYS_REMINDED below, who got three copies
      // while the twenty people actually booked onto the session got the one
      // correct email from the published record.
      //
      // Filtered HERE rather than at each sender, because none of the four jobs
      // in this file should touch a draft: nobody has been invited to it, so the
      // author nudge, the response-due notice and the attestation are all noise
      // for the same reason the reminders were wrong.
      publishedAt: { not: null },
    },
    select: {
      id: true,
      title: true,
      content: true,
      createdAt: true,
      tag: true,
      meetingFormat: true,
      zoomLink: true,
      zoomCode: true,
      zoomLinkTbd: true,
      meetingAddress: true,
      meetingOptions: true,
      meetingAt: true,
      meetingTimezone: true,
      meetingDurationFromMin: true,
      meetingDurationToMin: true,
      meetingReminderLeadMin: true,
      meetingNightBefore: true,
      meetingResponseDueAt: true,
      meetingResponseNoticeSentAt: true,
      meetingAuthorNudgeSentAt: true,
      ackEveryone: true,
      ackTitles: true,
      ackUserIds: true,
      author: { select: { email: true } },
      meetingReminders: { select: { optionId: true, kind: true } },
    },
  });

  // Blob-hosted logo so reminder/nudge emails show it in every mail client
  // (base is localhost in dev); falls back to the on-site logo.
  const logoUrl = process.env.EMAIL_LOGO_URL || `${base}/logo/treelogo_gradient.png`;

  // UPPER MANAGEMENT RIDES EVERY SESSION REMINDER - Mánu 2026-09-04: "always
  // get the emails ... even if they pick no dates for the meetings or if they
  // pick only one. these upper managment always attend anyway." By NAME, the
  // way the corrections email's TO line is - an id in code stops meaning
  // anything the day an account is recreated. A name that no longer resolves
  // to an active account is skipped rather than failing the send.
  const ALWAYS_REMINDED = [
    "Brandon Uribe",
    "Gabriel Miranda",
    "Britny Arevalo",
    "April Martinez",
    "David Zermeno",
    "Kristy Hatt",
  ];

  // going recipients for a session (optionId "" = single-session meeting),
  // plus the standing management roster, deduped.
  const goingRecipients = async (m, optionId, hasOptions) => {
    let ids;
    if (hasOptions) {
      const choices = await prisma.announcementMeetingChoice.findMany({
        where: { announcementId: m.id, optionId },
        select: { userId: true },
      });
      ids = choices.map((c) => c.userId);
    } else {
      const resps = await prisma.announcementMeetingResponse.findMany({
        where: { announcementId: m.id, cantMakeIt: false },
        select: { userId: true },
      });
      ids = resps.map((r) => r.userId);
    }
    const [picked, always] = await Promise.all([
      ids.length
        ? prisma.user.findMany({
            where: { id: { in: ids }, deactivatedAt: null },
            select: RECIP_SELECT,
          })
        : [],
      prisma.user.findMany({
        where: {
          deactivatedAt: null,
          OR: ALWAYS_REMINDED.map((n) => ({ name: { equals: n, mode: "insensitive" } })),
        },
        select: RECIP_SELECT,
      }),
    ]);
    const seen = new Set();
    return [...picked, ...always].filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  };

  // one reminder email to a session's going attendees. `session` is the option
  // that person chose (null for a single-session meeting), so the email shows
  // only their session's time. carries a "See original post" button.
  const sendSessionReminder = async (m, optionId, hasOptions, subject, eyebrow, session, line) => {
    const recipients = await goingRecipients(m, optionId, hasOptions);
    // nobody is going, so there is nothing to send and nothing to wait for.
    // stamp it and stop asking on every tick.
    if (!recipients.length) return true;
    // ONE LINE, THEN THE LINK. This carried the whole announcement body, so
    // the reminder read as the original post sent again with the join block
    // buried under twelve hundred characters - Mánu 2026-09-03, off the 8pm
    // send: "i thought it was supposed to be an email saying heres the link
    // for tomorrow." The See-original button below carries the full post.
    const bodyHtml = `<p style="font-size:15px;color:#1f2937;margin:0 0 8px;">${line}</p>`;
    const meetingHtml = buildMeetingBlockHtml(m, session);
    const ctaHtml = seeOriginalButton(`${base}/portal/announcements/${m.id}`);
    // header date = the meeting date, always shown in Pacific (emails pin one zone).
    const sessIso = session?.at || (m.meetingAt instanceof Date ? m.meetingAt.toISOString() : m.meetingAt);
    const dateStr = sessIso
      ? new Date(sessIso).toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: EMAIL_TZ,
        })
      : "";
    const messages = recipients.map((r) => ({
      from,
      to: [r.email],
      subject,
      html: buildAnnouncementEmailHtml({
        logoUrl,
        title: m.title || "Company meeting",
        authorName: "My Life Services",
        authorTitle: null,
        dateStr,
        eyebrow,
        requireAck: false,
        bodyHtml,
        ackUrl: null,
        meetingHtml,
        ctaHtml,
      }),
      text: `${subject}. ${m.zoomLink || ""}`,
    }));
    return sendBatch(messages);
  };

  // 8pm the day before a session, in the session's own zone, as an instant.
  const nightBeforeMs = (at, tz) => {
    const z = instantToZoned(at.toISOString(), tz);
    const [y, mo, d] = z.date.split("-").map(Number);
    const prev = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
    prev.setUTCDate(prev.getUTCDate() - 1);
    const prevDate = prev.toISOString().slice(0, 10);
    const iso = zonedToInstant(prevDate, "20:00", tz);
    return iso ? new Date(iso).getTime() : null;
  };

  for (const m of meetings) {
    const opts = Array.isArray(m.meetingOptions) ? m.meetingOptions : [];
    const lead = (m.meetingReminderLeadMin ?? 10) * 60 * 1000;
    const defTz = m.meetingTimezone || "America/Los_Angeles";

    // session reminders: "soon" (lead-min before) + optional "night" (8pm prior)
    const sent = new Set(m.meetingReminders.map((r) => `${r.kind}:${r.optionId}`));
    const sessions = opts.length
      ? opts.filter((o) => o.at).map((o) => ({ optionId: o.id, at: new Date(o.at), tz: o.tz || defTz, opt: o }))
      : m.meetingAt
        ? [{ optionId: "", at: new Date(m.meetingAt), tz: defTz, opt: null }]
        : [];
    const title = m.title || "Company meeting";
    // a signing is a visit somebody booked, not a meeting they attend - same
    // reminders, words that say what the thing is. Manu 2026-08-23.
    const signing = m.meetingFormat === "signing";
    for (const s of sessions) {
      // starting-soon (confirmation)
      if (!sent.has(`soon:${s.optionId}`)) {
        const remindAt = s.at.getTime() - lead;
        if (now.getTime() >= remindAt && now.getTime() <= s.at.getTime() + GRACE_MS) {
          const ok = await sendSessionReminder(
            m, s.optionId, opts.length > 0,
            // "meeting today it should say" - Mánu 2026-09-03, naming the pair
            // with the night-before's "Meeting tomorrow:"
            signing
              ? `Your visit is today: ${title}`
              : `Meeting today: ${title}`,
            "Today", s.opt,
            signing ? "Your visit starts soon." : "Your session starts soon.",
          );
          if (ok) {
            await prisma.announcementMeetingReminder
              .create({ data: { announcementId: m.id, optionId: s.optionId, kind: "soon" } })
              .catch(() => {});
            result.reminders++;
          }
        }
      }
      // night-before ("meeting tomorrow"), only while it's genuinely the day before
      if (m.meetingNightBefore && !sent.has(`night:${s.optionId}`)) {
        const nightAt = nightBeforeMs(s.at, s.tz);
        const nowDate = instantToZoned(now.toISOString(), s.tz).date;
        const sessDate = instantToZoned(s.at.toISOString(), s.tz).date;
        if (nightAt && now.getTime() >= nightAt && nowDate < sessDate) {
          const ok = await sendSessionReminder(
            m, s.optionId, opts.length > 0,
            signing ? `Your visit is tomorrow: ${title}` : `Meeting tomorrow: ${title}`,
            "Tomorrow", s.opt,
            signing ? "Your visit is tomorrow." : "Your session is tomorrow.",
          );
          if (ok) {
            await prisma.announcementMeetingReminder
              .create({ data: { announcementId: m.id, optionId: s.optionId, kind: "night" } })
              .catch(() => {});
            result.reminders++;
          }
        }
      }
    }

    // 2. author email (all online meetings, ~3h out): add the link + passcode if
    //    missing, or confirm they're still correct if already set.
    if (formatHasOnline(m.meetingFormat) && !m.meetingAuthorNudgeSentAt) {
      const ats = (opts.length ? opts.filter((o) => o.at).map((o) => new Date(o.at)) : m.meetingAt ? [new Date(m.meetingAt)] : []).map((d) => d.getTime());
      if (ats.length) {
        const earliest = Math.min(...ats);
        if (now.getTime() >= earliest - NUDGE_LEAD_MS && now.getTime() < earliest) {
          const editUrl = `${base}/portal/announcements/${m.id}`;
          const hasLink = !!m.zoomLink;
          const ok = await sendBatch([
            {
              from,
              to: [m.author.email],
              subject: hasLink
                ? `Confirm your Zoom link: ${m.title}`
                : `Add the Zoom link: ${m.title}`,
              html: buildAuthorNudgeHtml({
                logoUrl,
                title: m.title,
                editUrl,
                zoomLink: m.zoomLink,
                zoomCode: m.zoomCode,
              }),
              text: hasLink
                ? `Your meeting "${m.title}" is coming up. Confirm the Zoom link + passcode are still correct: ${editUrl}`
                : `Your meeting "${m.title}" is coming up and has no Zoom link yet. Add it: ${editUrl}`,
            },
          ]);
          if (ok) {
            await prisma.announcement.update({
              where: { id: m.id },
              data: { meetingAuthorNudgeSentAt: new Date() },
            });
            result.nudges++;
          }
        }
      }
    }

    // 3. response-due second notice
    if (m.meetingResponseDueAt && !m.meetingResponseNoticeSentAt && now >= new Date(m.meetingResponseDueAt)) {
      const [audience, responded] = await Promise.all([
        prisma.user.findMany({ where: ackAudienceWhere(m), select: RECIP_SELECT }),
        prisma.announcementMeetingResponse.findMany({
          where: { announcementId: m.id },
          select: { userId: true },
        }),
      ]);
      const respondedIds = new Set(responded.map((r) => r.userId));
      const noResp = audience.filter((u) => !respondedIds.has(u.id));
      // everybody answered, so there is no notice to send and the job is done.
      let ok = true;
      if (noResp.length) {
        const link = `${base}/portal/announcements/${m.id}`;
        const messages = noResp.map((u) => ({
          from,
          to: [u.email],
          subject: `Second notice: ${m.title}`,
          html: buildResponseNoticeHtml({
            logoUrl,
            firstName: firstNameOf(u) || "there",
            title: m.title,
            url: link,
          }),
          text: `Second notice - please respond to "${m.title}": ${link}`,
        }));
        ok = await sendBatch(messages);
      }
      if (ok) {
        await prisma.announcement.update({
          where: { id: m.id },
          data: { meetingResponseNoticeSentAt: new Date() },
        });
        result.notices++;
      }
    }
  }

  // ---- sign/acknowledge deadlines ----
  //
  // Mánu 2026-09-08: "the deadline is a call to action for the peple who
  // havet signed and us to be notified that they missed the deadlne to sign."
  // Two one-shot jobs per deadline, stamped like the meeting jobs above:
  //   4. the night-before chase - 8 PM California, to exactly the people who
  //      still owe it (the owed audience minus whoever has done the thing -
  //      the SIGNATURE on a form post, the ack otherwise)
  //   5. the missed bell - the moment a run sees the deadline passed with
  //      anyone outstanding, the elevated tier's bells ring with the count
  // The composer has PROMISED the chase since it shipped ("Anyone who hasn't
  // signed by then gets a reminder.") - this is the machinery behind that
  // sentence, which until now was words.
  {
    const ackPosts = await prisma.announcement.findMany({
      where: {
        requireAck: true,
        deletedAt: null,
        publishedAt: { not: null },
        tag: { not: "Company Meeting" },
        expiresAt: { not: null },
        OR: [{ ackReminderSentAt: null }, { deadlineNoticedAt: null }],
      },
      select: {
        id: true, title: true, formId: true, expiresAt: true,
        ackEveryone: true, ackTitles: true, ackUserIds: true, ackExemptUserIds: true,
        ackReminderSentAt: true, deadlineNoticedAt: true,
      },
    });
    for (const post of ackPosts) {
      const owedUsers = await prisma.user.findMany({
        where: ackOwedWhere(post),
        select: RECIP_SELECT,
      });
      const ids = owedUsers.map((u) => u.id);
      const doneRows = !ids.length
        ? []
        : post.formId
          ? await prisma.formSubmission.findMany({
              where: { announcementId: post.id, userId: { in: ids } },
              select: { userId: true },
            })
          : await prisma.announcementAck.findMany({
              where: { announcementId: post.id, userId: { in: ids } },
              select: { userId: true },
            });
      const done = new Set(doneRows.map((r) => r.userId));
      const outstanding = owedUsers.filter((u) => !done.has(u.id));

      // 4. the night-before chase. Nobody outstanding = nothing to send, and
      // the stamp still lands so the tick stops asking.
      if (!post.ackReminderSentAt && chaseWindowOpen(post.expiresAt, now)) {
        let ok = true;
        if (outstanding.length) {
          const { subject, line } = chaseEmailCopy(post);
          const bodyHtml = `<p style="font-size:15px;color:#1f2937;margin:0 0 8px;">${line}</p>`;
          const ctaHtml = seeOriginalButton(`${base}/portal/announcements/${post.id}`);
          ok = await sendBatch(
            outstanding.map((r) => ({
              from,
              to: [r.email],
              subject,
              html: buildAnnouncementEmailHtml({
                logoUrl,
                title: post.title || "Announcement",
                authorName: "My Life Services",
                authorTitle: null,
                dateStr: dueDateLong(post.expiresAt),
                eyebrow: "Reminder",
                requireAck: false,
                bodyHtml,
                ackUrl: null,
                meetingHtml: null,
                ctaHtml,
              }),
              text: `${subject}. ${line}`,
            })),
          );
        }
        if (ok) {
          await prisma.announcement.update({
            where: { id: post.id },
            data: { ackReminderSentAt: new Date() },
          });
          result.chases++;
        }
      }

      // 5. the missed-deadline bell. Stamped even when everyone made it -
      // "everyone signed" is the job finishing quietly, not a bell.
      if (!post.deadlineNoticedAt && deadlinePassed(post.expiresAt, now)) {
        if (outstanding.length) {
          const { title, body } = missedBellCopy(post, outstanding);
          await notifyOversight({
            type: "ACK_DEADLINE_MISSED",
            title,
            body,
            link: `/portal/announcements/${post.id}`,
          });
          result.deadlineBells++;
        }
        await prisma.announcement.update({
          where: { id: post.id },
          data: { deadlineNoticedAt: new Date() },
        });
      }
    }
  }

  return NextResponse.json({ ok: true, at: now.toISOString(), ...result });
}
