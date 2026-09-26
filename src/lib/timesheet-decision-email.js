// THE EMAIL ON PAYROLL'S DECISION - Mánu 2026-09-25: "you will receive a new
// email based on the decisions made". Sent once, when the LAST report on a
// sheet is decided, with the bell's own title and sentence and the same link,
// so the inbox and the portal tell one story. See ringDecision in the
// timesheet actions, which sends it right after the bell.
//
// NOTHING ELSE RIDES IN IT. No office note - a declined report's note is
// payroll's reason and is read on the page, not mailed - no figures, and no
// client details, which is the rule for every email that leaves this app.
//
// Same guards as every timesheet email: a rehearsal batch forces its one
// address (`forceTo`), and anywhere that cannot prove it is the real
// deployment is redirected to the test inboxes with the banner on.
import { Resend } from "resend";
import { buildTimesheetShell } from "@/lib/announcement-email";
import { resolveRecipients } from "@/lib/timesheet-mode";
import { decisionSubject } from "@/lib/timesheet-subjects";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const BTN =
  "display:inline-block;background:#2f6feb;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600;";

export function buildDecisionEmailHtml({ employeeName, title, body, signUrl, redirectedFrom = null }) {
  // loud banner so a test send can never be mistaken for the real thing
  const testBanner = redirectedFrom
    ? `<div style="margin:0 0 18px;padding:12px 14px;background:#fff4e5;border:1px solid #f0b37e;border-radius:8px;color:#7a4a12;font-size:13px;">
         <strong>TEST SEND.</strong> This was addressed to
         <strong>${esc(redirectedFrom)}</strong> and redirected here. Nobody else received it.
       </div>`
    : "";
  const html = `
    ${testBanner}
    <p style="margin:0 0 14px;">Hi ${esc(employeeName)},</p>
    <p style="margin:0 0 18px;">${esc(body)}</p>
    <a href="${signUrl}" style="${BTN}">Open my timesheet</a>
    <p style="margin:18px 0 0;font-size:13px;color:#6b7280;">This link is just for you - no login needed.</p>`;
  return buildTimesheetShell({ title, bodyHtml: html });
}

export async function sendDecisionEmail({
  intendedEmail,
  employeeName,
  // the bell's title and sentence, exactly as the portal shows them
  title,
  body,
  signUrl,
  // set from `TimesheetBatch.testOnly` - every message from a rehearsal batch
  // goes to this one address and nowhere else
  forceTo = null,
}) {
  if (!intendedEmail) return { ok: false, error: "norecipient" };
  const from =
    process.env.TIMESHEET_FROM ||
    process.env.ANNOUNCEMENTS_FROM ||
    process.env.AUTH_RESEND_FROM;
  if (!from || !process.env.RESEND_API_KEY) return { ok: false, error: "config" };

  const { to, redirected } = resolveRecipients(intendedEmail, process.env, { forceTo });
  if (!to.length) return { ok: false, error: "norecipient" };
  const redirectedFrom = redirected ? intendedEmail : null;

  const subject = decisionSubject({ title, redirectedFrom });
  const html = buildDecisionEmailHtml({ employeeName, title, body, signUrl, redirectedFrom });
  const text = [
    redirected ? `*** TEST SEND - meant for ${intendedEmail} ***\n` : "",
    `Hi ${employeeName},`,
    ``,
    body,
    ``,
    signUrl,
  ]
    .filter(Boolean)
    .join("\n");

  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    const { error } = await resend.emails.send({ from, to, subject, html, text });
    if (error) {
      console.error("decision email error:", error);
      return { ok: false, error: "send" };
    }
  } catch (e) {
    console.error("decision email threw:", e);
    return { ok: false, error: "send" };
  }
  return { ok: true, redirected, sentTo: to.join(", ") };
}
