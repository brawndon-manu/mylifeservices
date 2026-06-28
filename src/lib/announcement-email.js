// builds the HTML for an announcement email. email-safe: a solid dark hero band
// (logo + title block) over a white body, inline styles only, no radial
// gradients (email clients strip them). mirrors the in-portal announcement look
// closely enough while staying robust across Gmail/Outlook/Apple Mail.

import { formatInstant, formatDuration } from "@/lib/meeting-time";
import {
  isCompanyMeeting,
  formatHasOnline,
  formatHasAddress,
} from "@/lib/announcements";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// meeting access block for a Company Meeting email: time (in the set zone, since
// email can't know the reader's), a Join button, the link + passcode as text
// (no working copy buttons in email), and the address. empty for non-meetings.
export function buildMeetingBlockHtml(post) {
  if (!post || !isCompanyMeeting(post.tag)) return "";
  const parts = [];
  if (post.meetingAt) {
    const iso = post.meetingAt instanceof Date ? post.meetingAt.toISOString() : post.meetingAt;
    const t = formatInstant(iso, post.meetingTimezone || "America/Los_Angeles");
    const dur = formatDuration(post.meetingDurationFromMin, post.meetingDurationToMin);
    parts.push(
      `<div style="font-size:15px;color:#1f2937;margin-bottom:8px;"><strong>${esc(t)}</strong>${dur ? ` &middot; ${esc(dur)}` : ""}</div>`,
    );
  }
  if (formatHasOnline(post.meetingFormat) && post.zoomLink) {
    parts.push(
      `<div style="margin:6px 0 10px;"><a href="${post.zoomLink}" style="display:inline-block;background:#2f6feb;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600;">Join meeting</a></div>`,
    );
    parts.push(
      `<div style="font-size:13px;color:#4b5563;word-break:break-all;">Link: <a href="${post.zoomLink}" style="color:#2f6feb;">${esc(post.zoomLink)}</a></div>`,
    );
    if (post.zoomCode) {
      parts.push(
        `<div style="font-size:13px;color:#4b5563;">Passcode: <strong style="font-family:monospace;letter-spacing:1px;">${esc(post.zoomCode)}</strong></div>`,
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

export function buildAnnouncementEmailHtml({
  logoUrl,
  title,
  authorName,
  authorTitle,
  dateStr,
  requireAck = false,
  bodyHtml = "",
  ackUrl = null,
  meetingHtml = "",
}) {
  const role = authorTitle
    ? `<span style="color:#8ab4f0;font-style:italic;"> &middot; ${esc(authorTitle)}</span>`
    : "";
  const ackLine = requireAck
    ? `<div style="margin-top:8px;color:#f85149;font-size:13px;font-weight:600;">Acknowledgment required</div>`
    : "";
  const logo = logoUrl
    ? `<img src="${logoUrl}" width="64" alt="" style="display:block;margin:0 auto 10px;opacity:.95;" />`
    : "";
  const ackButton =
    requireAck && ackUrl
      ? `<div style="margin-top:24px;">
           <a href="${ackUrl}" style="display:inline-block;background:#2f6feb;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600;">Acknowledge that I've read this</a>
           <div style="margin-top:8px;color:#8a93a0;font-size:12px;">One click confirms it, no login needed.</div>
         </div>`
      : "";

  return `
  <div style="background:#eef1f5;padding:24px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e3e8ef;">
      <div style="background:#0b1020;padding:30px 28px 26px;text-align:center;">
        ${logo}
        <div style="color:#58a6ff;font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;">Announcement</div>
        <h1 style="color:#f0f3f8;font-size:24px;line-height:1.25;font-weight:600;margin:10px 0 0;">${esc(title)}</h1>
        <div style="margin-top:12px;color:#e6edf3;font-size:14px;">${esc(authorName)}${role}</div>
        <div style="margin-top:4px;color:#9aa4b2;font-size:13px;">${esc(dateStr)}</div>
        ${ackLine}
      </div>
      <div style="padding:26px 28px 30px;color:#33414f;font-size:15px;line-height:1.7;">
        ${bodyHtml}
        ${meetingHtml}
        ${ackButton}
      </div>
      <div style="padding:14px 28px;border-top:1px solid #eef1f5;color:#9aa4b2;font-size:12px;text-align:center;">
        My Life Services &middot; staff announcement
      </div>
    </div>
  </div>`;
}
