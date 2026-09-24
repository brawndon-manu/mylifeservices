// THE SIGNED COPY GOING BACK. Mánu 2026-08-17: "once signed a signed copy
// gets emailed back to the employee along with the changes if any they need
// to make in quicksolve." Amended 2026-08-25: the office makes the QuickSolve
// edits now, so this email states each correction as a fact of the record and
// carries no instruction - the instructions go to the office instead (see
// timesheet-review-email.js, which the employee is deliberately not told
// about).
//
// The attachment is the exact bytes they signed - the same PDF the sign
// action stores - so what lands in their inbox and what the portal holds can
// never be two documents. The corrections list comes from qsp-changes.js, the
// one derivation of what their answers mean for the QuickSolve record.
//
// LIKE EVERY EMPLOYEE SURFACE, IT CARRIES NO FIGURES AND SAYS NOTHING ABOUT
// PAY. The corrections are record facts - a break not logged, times recorded
// wrong - stated in the record's own voice.
import { Resend } from "resend";
import { buildTimesheetShell } from "@/lib/announcement-email";
import { signedCopySubject } from "@/lib/timesheet-subjects";
import { resolveRecipients } from "@/lib/timesheet-mode";

const BTN =
  "display:inline-block;background:#2f6feb;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600;";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildSignedTimesheetEmailHtml({
  link = null,
  employeeName,
  periodLabel,
  // [{ date, said, changes }] from reviewChoices. only whether there are any
  // matters here - the answers themselves are on their copy, not the email
  items = [],
  redirectedFrom = null,
}) {
  // the same loud banner the send email uses, for the same reason
  const testBanner = redirectedFrom
    ? `<div style="margin:0 0 18px;padding:12px 14px;background:#fff4e5;border:1px solid #f0b37e;border-radius:8px;color:#7a4a12;font-size:13px;">
         <strong>TEST SEND.</strong> This was addressed to
         <strong>${esc(redirectedFrom)}</strong> and redirected here. Nobody else received it.
       </div>`
    : "";

  // NO ANSWERS AND NO PDF ON THE EMAIL. their answers can name a person
  // served, and so can the notes printed on the sheet, so both stay on their
  // copy, one click away through their own link.
  const review = items.length
    ? `<p style="margin:0 0 18px;">Your answers are on your copy.</p>`
    : "";
  const button = link
    ? `<p style="margin:0 0 18px;"><a href="${esc(link)}" style="${BTN}">Open my signed timesheet</a></p>`
    : "";

  const body = `
    ${testBanner}
    <p style="margin:0 0 14px;">Hi ${esc(employeeName)},</p>
    <p style="margin:0 0 18px;">Thank you - your timesheet for <strong>${esc(periodLabel)}</strong> is signed. Your copy is ready whenever you need it.</p>
    ${button}
    ${review}
    <p style="margin:18px 0 0;font-size:13px;color:#6b7280;">If anything looks wrong on your copy, reply to this email.</p>`;

  return buildTimesheetShell({ title: `Signed timesheet - ${periodLabel}`, bodyHtml: body });
}

export async function sendSignedTimesheetCopy({
  intendedEmail,
  employeeName,
  periodLabel,
  items = [],
  // their own copy, through their link - the email carries no pdf
  link = null,
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

  const subject = signedCopySubject({
    periodLabel,
    redirectedFrom: redirected ? intendedEmail : null,
  });
  const html = buildSignedTimesheetEmailHtml({
    employeeName,
    periodLabel,
    items,
    link,
    redirectedFrom: redirected ? intendedEmail : null,
  });

  // the plain-text copy says the same thing and no more, so a client that
  // strips html gets the same email rather than a different one
  const text = [
    redirected ? `*** TEST SEND - this was meant for ${intendedEmail} ***\n` : "",
    `Hi ${employeeName},`,
    ``,
    `Thank you - your timesheet for ${periodLabel} is signed. Your copy is ready whenever you need it.`,
    link ? `Open my signed timesheet: ${link}` : "",
    items.length ? `\nYour answers are on your copy.` : "",
    ``,
    `If anything looks wrong on your copy, reply to this email.`,
  ]
    .filter(Boolean)
    .join("\n");

  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    const { error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      text,
    });
    if (error) {
      console.error("signed copy send error:", error);
      return { ok: false, error: "send" };
    }
  } catch (e) {
    console.error("signed copy send threw:", e);
    return { ok: false, error: "send" };
  }
  return { ok: true, redirected, sentTo: to.join(", ") };
}
