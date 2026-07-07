// builds the HTML for announcement + meeting + sign-in emails. email-safe: a
// solid dark hero band (logo + title block) over a white body, inline styles
// only, no radial gradients (email clients strip them). all email types share
// one shell so they look consistent.

import { formatInstant, formatDuration } from "@/lib/meeting-time";
import {
  isCompanyMeeting,
  formatHasOnline,
  formatHasAddress,
} from "@/lib/announcements";

// emails always show times in Pacific. a static email can't convert to each
// reader's zone the way the in-portal view does, and ~all staff are in CA, so we
// pin one zone instead of printing whatever zone the author happened to set.
export const EMAIL_TZ = "America/Los_Angeles";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const BTN =
  "display:inline-block;background:#2f6feb;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600;";
const BTN_GHOST =
  "display:inline-block;background:#ffffff;color:#2f6feb;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600;border:1px solid #cdd9ec;";

// the shared shell: dark logo hero + white card + footer. `subtitle` is raw HTML
// (built by the caller); `eyebrow` + `title` are escaped here. `footer` lets a
// caller swap the footer line (sign-in emails aren't "staff announcements").
function emailShell({
  logoUrl,
  eyebrow,
  title,
  subtitle = "",
  bodyHtml,
  footer = "My Life Services &middot; staff announcement",
}) {
  const logo = logoUrl
    ? `<img src="${logoUrl}" width="64" alt="" style="display:block;margin:0 auto 10px;opacity:.95;" />`
    : "";
  return `
  <div style="background:#eef1f5;padding:24px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e3e8ef;">
      <div style="background:#0b1020;padding:30px 28px 26px;text-align:center;">
        ${logo}
        <div style="color:#58a6ff;font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;">${esc(eyebrow)}</div>
        <h1 style="color:#f0f3f8;font-size:24px;line-height:1.25;font-weight:600;margin:10px 0 0;">${esc(title)}</h1>
        ${subtitle}
      </div>
      <div style="padding:26px 28px 30px;color:#33414f;font-size:15px;line-height:1.7;">
        ${bodyHtml}
      </div>
      <div style="padding:14px 28px;border-top:1px solid #eef1f5;color:#9aa4b2;font-size:12px;text-align:center;">
        ${footer}
      </div>
    </div>
  </div>`;
}

// a "See original post" ghost button.
export function seeOriginalButton(url) {
  return `<div style="margin-top:18px;"><a href="${url}" style="${BTN_GHOST}">See original post</a></div>`;
}

// a primary button linking to the announcement (e.g. "Respond now" for a meeting,
// "Go to the announcement" otherwise) so recipients can open the post directly.
export function postButton(url, label = "Go to the announcement") {
  return `<div style="margin-top:22px;"><a href="${url}" style="${BTN}">${esc(label)}</a></div>`;
}

// meeting access block: the time (a specific `session` if given - so a reminder
// shows only the session that person chose; else the single meeting time; else
// the full list to pick from), a Join button, the link + passcode, the address.
export function buildMeetingBlockHtml(post, session = null) {
  if (!post || !isCompanyMeeting(post.tag)) return "";
  const parts = [];
  // per-session link wins (each session can have its own Zoom), else the
  // meeting-level link (single-session meetings).
  const link = (session && session.zoomLink) || post.zoomLink;
  const code = (session && session.zoomCode) || post.zoomCode;
  if (session && session.at) {
    const t = formatInstant(session.at, EMAIL_TZ);
    const dur = formatDuration(session.durationFromMin, session.durationToMin);
    const lbl = session.label ? `${esc(session.label)} &middot; ` : "";
    parts.push(
      `<div style="font-size:15px;color:#1f2937;margin-bottom:8px;">${lbl}<strong>${esc(t)}</strong>${dur ? ` &middot; ${esc(dur)}` : ""}</div>`,
    );
  } else if (post.meetingAt) {
    const iso = post.meetingAt instanceof Date ? post.meetingAt.toISOString() : post.meetingAt;
    const t = formatInstant(iso, EMAIL_TZ);
    const dur = formatDuration(post.meetingDurationFromMin, post.meetingDurationToMin);
    parts.push(
      `<div style="font-size:15px;color:#1f2937;margin-bottom:8px;"><strong>${esc(t)}</strong>${dur ? ` &middot; ${esc(dur)}` : ""}</div>`,
    );
  } else {
    const sessions = Array.isArray(post.meetingOptions) ? post.meetingOptions : [];
    const isSeries = sessions.some((o) => o && o.seriesId);
    const rowFor = (o, bullet) => {
      const t = o.at ? esc(formatInstant(o.at, EMAIL_TZ)) : "";
      const dur = esc(formatDuration(o.durationFromMin, o.durationToMin) || "");
      const meta = [t, dur].filter(Boolean).join(" &middot; ");
      const label = bullet ? `&bull; ${esc(o.label)}` : `<strong>${esc(o.label)}</strong>`;
      return `<div style="font-size:14px;color:#1f2937;margin:${bullet ? "2px 0 2px 12px" : "0 0 4px"};">${label}${meta ? ` &mdash; ${meta}` : ""}</div>`;
    };
    if (sessions.length && isSeries) {
      // grouped by series; the reader picks one date from each.
      const groups = [];
      for (const o of sessions) {
        let g = groups.find((x) => x.id === o.seriesId);
        if (!g) {
          g = { id: o.seriesId, label: o.seriesLabel || "Series", opts: [] };
          groups.push(g);
        }
        g.opts.push(o);
      }
      const blocks = groups.map(
        (g) =>
          `<div style="margin-bottom:10px;"><div style="font-size:13px;font-weight:700;color:#111827;">${esc(g.label)} <span style="font-weight:400;color:#6b7280;">(pick one)</span></div>${g.opts.map((o) => rowFor(o, true)).join("")}</div>`,
      );
      parts.push(
        `<div style="margin-bottom:8px;"><div style="font-size:13px;color:#6b7280;margin-bottom:6px;">Pick one date from each series:</div>${blocks.join("")}</div>`,
      );
    } else if (sessions.length) {
      parts.push(
        `<div style="margin-bottom:8px;"><div style="font-size:13px;color:#6b7280;margin-bottom:4px;">Sessions to choose from:</div>${sessions.map((o) => rowFor(o, false)).join("")}</div>`,
      );
    }
  }
  if (formatHasOnline(post.meetingFormat) && link) {
    parts.push(
      `<div style="margin:6px 0 10px;"><a href="${link}" style="${BTN}">Join meeting</a></div>`,
    );
    parts.push(
      `<div style="font-size:13px;color:#4b5563;word-break:break-all;">Link: <a href="${link}" style="color:#2f6feb;">${esc(link)}</a></div>`,
    );
    if (code) {
      parts.push(
        `<div style="font-size:13px;color:#4b5563;">Passcode: <strong style="font-family:monospace;letter-spacing:1px;">${esc(code)}</strong></div>`,
      );
    }
  }
  if (formatHasAddress(post.meetingFormat) && post.meetingAddress) {
    parts.push(
      `<div style="font-size:13px;color:#4b5563;margin-top:6px;">Location: ${esc(post.meetingAddress)}</div>`,
    );
  }
  if (!parts.length) return "";
  return `<div style="margin:18px 0;padding:16px;background:#f6f8fb;border:1px solid #e3e8ef;border-radius:10px;">${parts.join("")}</div>`;
}

// pre-meeting email to the author: add the link + passcode if missing, or confirm
// they're still correct if already set.
export function buildAuthorNudgeHtml({ logoUrl, title, editUrl, zoomLink, zoomCode }) {
  let body;
  if (zoomLink) {
    body = `
      <p style="margin:0 0 4px;">Your meeting is coming up soon. Quick check - is the Zoom info still correct?</p>
      <div style="margin:14px 0;padding:14px;background:#f6f8fb;border:1px solid #e3e8ef;border-radius:10px;">
        <div style="font-size:13px;color:#4b5563;word-break:break-all;">Link: <a href="${zoomLink}" style="color:#2f6feb;">${esc(zoomLink)}</a></div>
        ${zoomCode ? `<div style="font-size:13px;color:#4b5563;margin-top:4px;">Passcode: <strong style="font-family:monospace;letter-spacing:1px;">${esc(zoomCode)}</strong></div>` : `<div style="font-size:13px;color:#9aa3ad;margin-top:4px;">No passcode set.</div>`}
      </div>
      <p style="margin:0 0 18px;font-size:13px;color:#6b7280;">Attendees get this link in their reminder, so make sure it&apos;s right.</p>
      <a href="${editUrl}" style="${BTN}">Edit if needed</a>`;
  } else {
    body = `
      <p style="margin:0 0 18px;">Your meeting is coming up soon and still has <strong>no Zoom link or passcode</strong>. Attendees get the link automatically in their reminder, so add it before then.</p>
      <a href="${editUrl}" style="${BTN}">Add the Zoom link + passcode</a>`;
  }
  return emailShell({
    logoUrl,
    eyebrow: zoomLink ? "Confirm details" : "Action needed",
    title,
    bodyHtml: body,
  });
}

// the magic-link sign-in email. replaces Auth.js's plain default ("Sign in to
// localhost:3000") so the one email people get before they're even logged in
// still looks like us. `url` is the one-time link; it's dropped straight into an
// href so it must already be a trusted Auth.js callback URL (it is).
export function buildSignInEmailHtml({ logoUrl, url }) {
  const body = `
    <p style="margin:0 0 14px;">Here's your one-time link to sign in to the My Life Services employee portal.</p>
    <a href="${url}" style="${BTN}">Sign in</a>
    <p style="margin:18px 0 0;font-size:13px;color:#6b7280;">This link is good for the next 24 hours and can only be used once. If you didn't request it, you can safely ignore this email. No one can sign in without it.</p>`;
  return emailShell({
    logoUrl,
    eyebrow: "Employee portal",
    title: "Sign in to the portal",
    bodyHtml: body,
    footer: "My Life Services &middot; employee portal",
  });
}

// second-notice to people who haven't responded by the response-due date.
export function buildResponseNoticeHtml({ logoUrl, title, firstName, url }) {
  const body = `
    <p style="margin:0 0 6px;">Hi ${esc(firstName)},</p>
    <p style="margin:0 0 18px;">Second notice - please let us know if you can attend. A response is needed by end of day.</p>
    <a href="${url}" style="${BTN}">Respond now</a>`;
  return emailShell({ logoUrl, eyebrow: "Response needed", title, bodyHtml: body });
}

export function buildAnnouncementEmailHtml({
  logoUrl,
  title,
  authorName,
  authorTitle,
  dateStr,
  eyebrow = "Announcement",
  requireAck = false,
  bodyHtml = "",
  ackUrl = null,
  meetingHtml = "",
  ctaHtml = "",
}) {
  const role = authorTitle
    ? `<span style="color:#8ab4f0;font-style:italic;"> &middot; ${esc(authorTitle)}</span>`
    : "";
  const subtitle = `
    <div style="margin-top:12px;color:#e6edf3;font-size:14px;">${esc(authorName)}${role}</div>
    <div style="margin-top:4px;color:#9aa4b2;font-size:13px;">${esc(dateStr)}</div>
    ${requireAck ? `<div style="margin-top:8px;color:#f85149;font-size:13px;font-weight:600;">Acknowledgment required</div>` : ""}`;
  const ackButton =
    requireAck && ackUrl
      ? `<div style="margin-top:24px;"><a href="${ackUrl}" style="${BTN}">Acknowledge that I've read this</a><div style="margin-top:8px;color:#8a93a0;font-size:12px;">One click confirms it, no login needed.</div></div>`
      : "";
  return emailShell({
    logoUrl,
    eyebrow,
    title,
    subtitle,
    bodyHtml: `${bodyHtml}${meetingHtml}${ctaHtml}${ackButton}`,
  });
}
