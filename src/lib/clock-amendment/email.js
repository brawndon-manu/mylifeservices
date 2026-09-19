// THE TWO EMAILS A CLOCK AMENDMENT SENDS, and the sender they share.
//
//   THE FORM        to the one person asked to confirm and sign, with the link
//   THE DOCUMENT    the approved copy, attached, to the office and the staff member
//
// both go through the amendment's own send lock (timesheet-mode.js): off the
// real deployment everything is redirected and the banner says so. a rehearsal
// row forces its mail to one address on top of that.
import { Resend } from "resend";
import { buildTimesheetShell } from "@/lib/announcement-email";
import { resolveAmendmentRecipients } from "@/lib/timesheet-mode";
import { amendmentFormSubject, amendmentDocumentSubject } from "./subjects.js";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const BTN =
  "display:inline-block;background:#2f6feb;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600;";

// loud banner so a test send can never be mistaken for the real thing
function testBanner(redirectedFrom) {
  return redirectedFrom
    ? `<div style="margin:0 0 18px;padding:12px 14px;background:#fff4e5;border:1px solid #f0b37e;border-radius:8px;color:#7a4a12;font-size:13px;">
         <strong>TEST SEND.</strong> This was addressed to
         <strong>${esc(redirectedFrom)}</strong> and redirected here. Nobody else received it.
       </div>`
    : "";
}

export function buildAmendmentFormEmailHtml({
  recipientName,
  staffName,
  clientName,
  service,
  date,
  scheduled,
  missing,
  officeNote,
  formUrl,
  redirectedFrom = null,
}) {
  const bodyHtml = `
    ${testBanner(redirectedFrom)}
    <p style="margin:0 0 14px;color:#0f172a;font-size:15px;">Hi ${esc(recipientName)},</p>
    <p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.6;">
      The office has raised a clock amendment for <strong>${esc(staffName)}</strong>'s shift with
      <strong>${esc(clientName)}</strong> on <strong>${esc(date)}</strong>
      (${esc(service)}${scheduled ? `, scheduled ${esc(scheduled)}` : ""}). ${esc(missing)}
    </p>
    <p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.6;">
      The form carries what the office already holds about the shift and what was reported on the
      phone. Please check it, correct anything that is wrong, and sign. Then hand the phone to the
      person served so they can sign as well.
    </p>
    ${officeNote ? `<p style="margin:0 0 14px;padding:10px 12px;background:#f1f5f9;border-radius:8px;color:#334155;font-size:13px;line-height:1.6;">${esc(officeNote)}</p>` : ""}
    <div style="margin:22px 0 8px;"><a href="${esc(formUrl)}" style="${BTN}">Open the form</a></div>
    <p style="margin:14px 0 0;color:#8a93a0;font-size:12px;line-height:1.6;">
      This link is yours alone. It opens this one form and nothing else.
    </p>`;
  return buildTimesheetShell({ title: "A clock amendment to confirm and sign", bodyHtml, eyebrow: "Timekeeping" });
}

export function buildAmendmentDocumentEmailHtml({ formNumber, staffName, clientName, date, approvedBy, redirectedFrom = null }) {
  const bodyHtml = `
    ${testBanner(redirectedFrom)}
    <p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.6;">
      Clock amendment <strong>${esc(formNumber)}</strong> for <strong>${esc(staffName)}</strong>'s shift with
      <strong>${esc(clientName)}</strong> on <strong>${esc(date)}</strong> has been approved by ${esc(approvedBy)}.
    </p>
    <p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.6;">
      The signed document is attached. It carries the clock record, the service note for the visit,
      the reason the clock is wrong, the amended time, and every signature.
    </p>`;
  return buildTimesheetShell({ title: `Approved: clock amendment ${formNumber}`, bodyHtml, eyebrow: "Timekeeping" });
}

function fromAddress() {
  return process.env.TIMESHEET_FROM || process.env.ANNOUNCEMENTS_FROM || process.env.AUTH_RESEND_FROM;
}

export async function sendAmendmentForm({
  intendedEmail,
  forceTo = null,
  isResend = false,
  recipientName,
  staffName,
  clientName,
  service,
  date,
  scheduled,
  missing,
  officeNote,
  formUrl,
}) {
  if (!intendedEmail) return { ok: false, error: "norecipient" };
  const from = fromAddress();
  if (!from || !process.env.RESEND_API_KEY) return { ok: false, error: "config" };

  const { to, redirected } = resolveAmendmentRecipients(intendedEmail, process.env, { forceTo });
  if (!to.length) return { ok: false, error: "norecipient" };
  const redirectedFrom = redirected ? intendedEmail : null;

  const subject = amendmentFormSubject({ staffName, date, isResend, redirectedFrom });
  const html = buildAmendmentFormEmailHtml({
    recipientName, staffName, clientName, service, date, scheduled, missing, officeNote, formUrl, redirectedFrom,
  });
  const text = [
    redirected ? `*** TEST SEND - this was meant for ${intendedEmail} ***\n` : "",
    `Hi ${recipientName},`,
    ``,
    `The office has raised a clock amendment for ${staffName}'s shift with ${clientName} on ${date}. ${missing}`,
    `Please check it, correct anything that is wrong, sign, and hand the phone to the person served to sign as well.`,
    ``,
    `Open the form: ${formUrl}`,
  ].join("\n");

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({ from, to, subject, html, text });
  if (error) return { ok: false, error: "send", detail: String(error?.message || error) };
  return { ok: true, sentTo: to.join(", "), redirected };
}

// the approved document, to several people at once. each intended address
// goes through the lock on its own and the answers are merged, so a redirected
// send lands once in the local inbox rather than once per person
export async function sendAmendmentDocument({
  intendedEmails = [],
  forceTo = null,
  formNumber,
  staffName,
  clientName,
  date,
  approvedBy,
  pdfBytes,
  filename,
}) {
  const from = fromAddress();
  if (!from || !process.env.RESEND_API_KEY) return { ok: false, error: "config" };
  const intended = [...new Set(intendedEmails.filter(Boolean))];
  if (!intended.length) return { ok: false, error: "norecipient" };

  const to = new Set();
  let redirected = false;
  for (const email of intended) {
    const r = resolveAmendmentRecipients(email, process.env, { forceTo });
    r.to.forEach((t) => to.add(t));
    if (r.redirected) redirected = true;
  }
  const redirectedFrom = redirected ? intended.join(", ") : null;

  const subject = amendmentDocumentSubject({ formNumber, staffName, date, redirectedFrom });
  const html = buildAmendmentDocumentEmailHtml({ formNumber, staffName, clientName, date, approvedBy, redirectedFrom });
  const text = [
    redirected ? `*** TEST SEND - this was meant for ${intended.join(", ")} ***\n` : "",
    `Clock amendment ${formNumber} for ${staffName}'s shift with ${clientName} on ${date} has been approved by ${approvedBy}.`,
    `The signed document is attached.`,
  ].join("\n");

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from,
    to: [...to],
    subject,
    html,
    text,
    attachments: [{ filename, content: Buffer.from(pdfBytes) }],
  });
  if (error) return { ok: false, error: "send", detail: String(error?.message || error) };
  return { ok: true, sentTo: [...to].join(", "), redirected };
}
