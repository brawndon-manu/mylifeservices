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
import { ackAudienceWhere, formatHasOnline } from "@/lib/announcements";
import { firstNameOf } from "@/lib/contacts";
import { renderMarkdown } from "@/lib/markdown";
import { instantToZoned, zonedToInstant } from "@/lib/meeting-time";
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
  const result = { reminders: 0, nudges: 0, notices: 0, emails: 0 };

  // test mode: while CRON_TEST_RECIPIENTS is set, only those addresses ever get
  // an email - so you can dry-run the whole thing on prod without hitting staff.
  const testList = (process.env.CRON_TEST_RECIPIENTS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const sendBatch = async (messagesIn) => {
    const messages = testList.length
      ? messagesIn.filter((m) => m.to.some((a) => testList.includes(a.toLowerCase())))
      : messagesIn;
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
  };

  const meetings = await prisma.announcement.findMany({
    where: { tag: "Company Meeting", deletedAt: null },
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

  const logoUrl = `${base}/logo/treelogo_white.png`;

  // going recipients for a session (optionId "" = single-session meeting).
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
    if (!ids.length) return [];
    return prisma.user.findMany({
      where: { id: { in: ids }, deactivatedAt: null },
      select: RECIP_SELECT,
    });
  };

  // one reminder email to a session's going attendees. `session` is the option
  // that person chose (null for a single-session meeting), so the email shows
  // only their session's time. carries a "See original post" button.
  const sendSessionReminder = async (m, optionId, hasOptions, subject, eyebrow, session) => {
    const recipients = await goingRecipients(m, optionId, hasOptions);
    if (!recipients.length) return;
    const bodyHtml = renderMarkdown(m.content);
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
    await sendBatch(messages);
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
    for (const s of sessions) {
      // starting-soon (confirmation)
      if (!sent.has(`soon:${s.optionId}`)) {
        const remindAt = s.at.getTime() - lead;
        if (now.getTime() >= remindAt && now.getTime() <= s.at.getTime() + GRACE_MS) {
          await sendSessionReminder(
            m, s.optionId, opts.length > 0,
            `Coming up - you're confirmed: ${title}`, "Reminder", s.opt,
          );
          await prisma.announcementMeetingReminder
            .create({ data: { announcementId: m.id, optionId: s.optionId, kind: "soon" } })
            .catch(() => {});
          result.reminders++;
        }
      }
      // night-before ("meeting tomorrow"), only while it's genuinely the day before
      if (m.meetingNightBefore && !sent.has(`night:${s.optionId}`)) {
        const nightAt = nightBeforeMs(s.at, s.tz);
        const nowDate = instantToZoned(now.toISOString(), s.tz).date;
        const sessDate = instantToZoned(s.at.toISOString(), s.tz).date;
        if (nightAt && now.getTime() >= nightAt && nowDate < sessDate) {
          await sendSessionReminder(
            m, s.optionId, opts.length > 0,
            `Meeting tomorrow: ${title}`, "Tomorrow", s.opt,
          );
          await prisma.announcementMeetingReminder
            .create({ data: { announcementId: m.id, optionId: s.optionId, kind: "night" } })
            .catch(() => {});
          result.reminders++;
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
          await sendBatch([
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
          await prisma.announcement.update({
            where: { id: m.id },
            data: { meetingAuthorNudgeSentAt: new Date() },
          });
          result.nudges++;
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
        await sendBatch(messages);
      }
      await prisma.announcement.update({
        where: { id: m.id },
        data: { meetingResponseNoticeSentAt: new Date() },
      });
      result.notices++;
    }
  }

  return NextResponse.json({ ok: true, at: now.toISOString(), ...result });
}
