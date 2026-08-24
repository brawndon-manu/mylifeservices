// THE ANNOUNCEMENT EMAIL SEND, AS A LIBRARY.
//
// Moved out of the announcements server-action file on 2026-08-23, verbatim,
// so the cron can send a scheduled publish through the exact same code the
// Publish dialog uses. A "use server" file's exports are invocable endpoints,
// which is the wrong shape for something a cron calls with no user - and
// copying the send into the cron would be a second definition of how an
// announcement is emailed, which is the drift every bug on 2026-08-11 grew
// from. One send, two callers.
//
// Everything here behaves exactly as it did in actions.js, including the
// test-mode redirect: off the real deployment, every message reroutes to the
// test inbox with the intended recipient named in the subject.
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { firstNameOf, preferredName } from "@/lib/contacts";
import { ACK_EXEMPT_TITLE } from "@/lib/positions";
import { signAckToken } from "@/lib/ack-token";
import { signRsvpToken } from "@/lib/rsvp-token";
import { renderMarkdown } from "@/lib/markdown";
import {
  buildAnnouncementEmailHtml,
  buildMeetingBlockHtml,
  buildRsvpButtons,
  postButton,
  EMAIL_TZ,
} from "@/lib/announcement-email";
import { resolveAnnouncementRecipients } from "@/lib/timesheet-mode";
import {
  isCompanyMeeting,
  emailAttachmentsOf,
  titleSegmentMatch,
} from "@/lib/announcements";

export function emailAudienceWhere({ everyone, titles, userIds = [] }) {
  if (everyone) return { deactivatedAt: null };
  if (!titles?.length && !userIds?.length) return null;
  return {
    deactivatedAt: null,
    OR: [
      ...titles.map((t) => titleSegmentMatch(t)),
      ...(userIds.length ? [{ id: { in: userIds } }] : []),
    ],
  };
}

// core email send, shared by the dialog AND the create form. `where` is the
// recipient query (null = nobody). `includeDirector` also adds the Owner/
// Director (used by "same as ack" where they're otherwise excluded). when the
// announcement requires ack, each email carries that person's one-click link.
// best-effort; stamps ackEmailSentAt when any go out. returns { ok, sent,
// reason }. `post` must include id/title/content/requireAck/createdAt + author.
export async function emailAnnouncement(
  post,
  where,
  // `reminder` overrides the has-it-been-sent check for callers that know the
  // answer already, like the "email whoever has not acknowledged" button.
  { includeDirector = false, reminder = null } = {},
) {
  const from = process.env.ANNOUNCEMENTS_FROM || process.env.AUTH_RESEND_FROM;
  const base = (process.env.AUTH_URL || "").replace(/\/$/, "");
  if (!from || !base || !process.env.RESEND_API_KEY) {
    console.error("announcement email misconfigured - missing from/base/key");
    return { ok: false, reason: "config", sent: 0 };
  }
  if (!where) return { ok: false, reason: "recipients", sent: 0 };
  const select = {
    id: true,
    email: true,
    name: true,
    preferredFirstName: true,
    preferredLastName: true,
  };
  // THE DOCUMENTS, FETCHED ONCE AND SHARED BY EVERY MESSAGE. Mánu 2026-08-10:
  // staff should get the PDFs in the email the way HR sends them today, AND the
  // button back to the portal to sign. A library attachment is a same-origin
  // path, so it is resolved against the site's own base url.
  //
  // Best effort by design: a document that will not fetch must not stop the
  // announcement going out. It is still on the post, and the email still links
  // there.
  // THE SIGNABLE FORM COUNTS AS ONE OF THE DOCUMENTS. A post's `formId` and its
  // attachment list are separate fields, so choosing a form to be signed did not
  // put that form in the email - people were sent the reading material and not
  // the thing they were being asked to sign. Looked up here rather than trusted
  // off `post`, because emailAnnouncement is called with several different
  // selects and only some of them carry the form.
  const signForm = post.formId
    ? await prisma.form.findUnique({
        where: { id: post.formId },
        select: { id: true, title: true, fileUrl: true },
      })
    : null;

  // HAS THIS POST BEEN EMAILED BEFORE? Gmail threads on subject + sender and
  // hides the repeat behind "Show trimmed content", so a second send of the same
  // subject arrives with its body collapsed. Read from the row rather than from
  // `post`, for the same reason as the form above: the callers pass different
  // selects and only some carry `ackEmailSentAt`.
  const priorSend =
    reminder ??
    !!(
      await prisma.announcement.findUnique({
        where: { id: post.id },
        select: { ackEmailSentAt: true },
      })
    )?.ackEmailSentAt;

  const files = [];
  for (const a of emailAttachmentsOf(post, signForm)) {
    try {
      const url = a.url.startsWith("/") ? `${base}${a.url}` : a.url;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      files.push({
        filename: `${a.name.replace(/[^\w .-]/g, "_").slice(0, 80)}.pdf`,
        content: buf.toString("base64"),
      });
    } catch (e) {
      console.error(`announcement attachment skipped (${a.url}):`, e?.message || e);
    }
  }

  const recipients = await prisma.user.findMany({ where, select });
  if (includeDirector) {
    const director = await prisma.user.findFirst({
      where: { deactivatedAt: null, OR: titleSegmentMatch(ACK_EXEMPT_TITLE).OR },
      select,
    });
    if (director && !recipients.some((r) => r.id === director.id)) {
      recipients.push(director);
    }
  }
  if (!recipients.length) return { ok: true, sent: 0 };

  const title = post.title || "Announcement";
  // "Reminder: Acknowledgment required: X" reads badly, so the second send gets
  // its own sentence rather than a prefix bolted onto the first one's.
  const subject = priorSend
    ? post.requireAck
      ? `Reminder: ${title} still needs your acknowledgment`
      : `Reminder: ${title}`
    : post.requireAck
      ? `Acknowledgment required: ${title}`
      : title;
  // email mode: any picture in the body gets sized inline, since there's no
  // stylesheet on the other end to keep it inside the card.
  const bodyHtml = renderMarkdown(post.content, { email: true });
  const dateStr = new Date(post.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: EMAIL_TZ,
  });
  // Blob-hosted logo so it renders in every mail client (base is localhost in
  // dev, which recipients can't reach); falls back to the on-site logo.
  const logoUrl = process.env.EMAIL_LOGO_URL || `${base}/logo/treelogo_gradient.png`;
  const authorName = preferredName(post.author);
  const authorTitle = post.author?.title || null;
  const isMeeting = isCompanyMeeting(post.tag);
  const opts = Array.isArray(post.meetingOptions) ? post.meetingOptions : [];
  // a meeting with sessions to pick lists every date in the RSVP buttons already,
  // so skip the redundant date block; a single-session meeting keeps its time +
  // Join block.
  const meetingHtml = isMeeting && opts.length === 0 ? buildMeetingBlockHtml(post) : "";

  const messages = recipients.map((r) => {
    // a meeting gets one-click RSVP buttons (responding also records the ack, so
    // no separate ack button); everything else gets the ack link + a "go to post"
    // button. both are signed per recipient so the link needs no login.
    const ackUrl =
      post.requireAck && !isMeeting ? `${base}/a/ack/${signAckToken(post.id, r.id)}` : null;
    // THE POST IN THE PORTAL. Mánu 2026-08-10: this button points at
    // /portal/announcements/<id> and that is deliberate. Signed in, you land on
    // the announcement; not signed in, the proxy shows you the login screen.
    // That is the intended behaviour, not a wall to route around - "Review and
    // sign" is the button that works without a login.
    const ctaHtml = isMeeting
      ? buildRsvpButtons(post, `${base}/a/rsvp/${signRsvpToken(post.id, r.id, "pick")}`)
      : postButton(`${base}/portal/announcements/${post.id}`, "Go to the announcement");
    const html = buildAnnouncementEmailHtml({
      logoUrl,
      title,
      authorName,
      authorTitle,
      dateStr,
      eyebrow: isMeeting ? "Company meeting" : "Announcement",
      requireAck: post.requireAck && !isMeeting,
      // a form-backed post cannot be finished with a tick - the button takes
      // them to the document instead
      ackNeedsSignature: !!post.formId,
      bodyHtml,
      ackUrl,
      meetingHtml,
      ctaHtml,
      footer: isMeeting ? "My Life Services &middot; staff meeting" : undefined,
    });
    const firstName = firstNameOf(r) || "there";
    const text = isMeeting
      ? `${title}\n\nHi ${firstName}, please RSVP for this meeting: ${base}/portal/announcements/${post.id}`
      : post.requireAck && ackUrl
        ? post.formId
          ? `${title}\n\nHi ${firstName}, please review this and sign the form: ${ackUrl}`
          : `${title}\n\nHi ${firstName}, please read this announcement and acknowledge: ${ackUrl}`
        : `${title}\n\nHi ${firstName}, a new announcement was posted. View it in the portal.`;
    // OFF THE REAL DEPLOYMENT THIS DOES NOT GO TO STAFF. Publishing from a
    // laptop used to email every targeted employee for real, with every link
    // pointing at localhost so none of them worked. Timesheets have been
    // guarded since one reached an employee mid-meeting; announcements were
    // not, which is why a "test" post reached Britny. On production nothing
    // changes. Mánu 2026-08-10.
    const route = resolveAnnouncementRecipients(r.email);
    return {
      from,
      to: route.to,
      subject: route.redirected ? `[TEST - would have gone to ${route.intendedEmail}] ${subject}` : subject,
      html,
      text,
      ...(files.length ? { attachments: files } : {}),
    };
  });

  const resend = new Resend(process.env.RESEND_API_KEY);
  let sent = 0;
  try {
    if (files.length) {
      // ONE AT A TIME WHEN THERE ARE DOCUMENTS, because Resend's BATCH endpoint
      // does not accept attachments - "the attachments field is not supported
      // yet" - and it does not complain. The batch call succeeds and the PDFs
      // are silently dropped, so every announcement this week went out with its
      // documents missing. The SDK says the same thing in its own types:
      // CreateBatchEmailOptions = Omit<CreateEmailOptions, 'attachments' | ...>.
      //
      // Each message is already addressed to one person, so this changes how
      // they are handed over, not who receives what.
      for (const m of messages) {
        // Resend allows 10 requests a second per team. Sequential awaits are
        // usually slower than that on their own, but not always, so hold the
        // floor rather than find out during a 77-person send.
        if (sent > 0) await new Promise((r) => setTimeout(r, 120));
        const { error } = await resend.emails.send(m);
        if (error) console.error(`announcement email failed (${m.to}):`, error);
        else sent += 1;
      }
    } else {
      for (let i = 0; i < messages.length; i += 100) {
        const chunk = messages.slice(i, i + 100);
        const { error } = await resend.batch.send(chunk);
        if (error) console.error("announcement email batch error:", error);
        else sent += chunk.length;
      }
    }
  } catch (e) {
    console.error("announcement email send threw:", e);
  }

  if (sent > 0) {
    await prisma.announcement.update({
      where: { id: post.id },
      data: { ackEmailSentAt: new Date() },
    });
  }
  return { ok: true, sent };
}
export const EMAIL_AUTHOR_SELECT = {
  name: true,
  preferredFirstName: true,
  preferredLastName: true,
  title: true,
};

// meeting fields the email needs to render the access block.
export const EMAIL_MEETING_SELECT = {
  tag: true,
  meetingFormat: true,
  zoomLink: true,
  zoomCode: true,
  meetingAddress: true,
  meetingAt: true,
  meetingTimezone: true,
  meetingDurationFromMin: true,
  meetingDurationToMin: true,
  meetingOptions: true,
};

