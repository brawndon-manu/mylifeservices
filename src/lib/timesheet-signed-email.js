// THE SIGNED COPY GOING BACK. Mánu 2026-08-17: "once signed a signed copy
// gets emailed back to the employee along with the changes if any they need
// to make in quicksolve."
//
// The attachment is the exact bytes they signed - the same PDF the sign
// action stores - so what lands in their inbox and what the portal holds can
// never be two documents. The changes list comes from qsp-changes.js, the one
// derivation of what their answers mean for the QuickSolve record.
//
// LIKE EVERY EMPLOYEE SURFACE, IT CARRIES NO FIGURES AND SAYS NOTHING ABOUT
// PAY. The changes are record fixes - times to log, punches to correct - and
// the vocabulary is the page's own: "things to fix in QuickSolve".
import { Resend } from "resend";
import { buildTimesheetShell } from "@/lib/announcement-email";
import { signedCopySubject } from "@/lib/timesheet-subjects";
import { resolveRecipients } from "@/lib/timesheet-mode";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildSignedTimesheetEmailHtml({
  employeeName,
  periodLabel,
  // [{ date, said, changes: [text] }] from reviewChoices - the choices they
  // made on their review, each with the QuickSolve edits it produced
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

  // EVERY CHANGE SITS UNDER THE CHOICE THAT PRODUCED IT. An instruction with
  // no memory of the answer behind it asks somebody to trust it blind; this
  // way each edit reads as "you told us this, so change this". Choices that
  // produced no edit are listed too - the rest of their review record.
  const fixCount = items.reduce((n, it) => n + (it.changes?.length || 0), 0);
  const itemHtml = (it) => {
    const saidLine = it.said
      ? `<p style="margin:0 0 4px;color:#5f4a17;">${esc(it.said)}</p>`
      : "";
    const changeLines = (it.changes || []).map((t) =>
      `<p style="margin:0 0 4px;color:#7a4a12;"><strong>Change in QuickSolve:</strong> ${esc(t)}</p>`,
    ).join("");
    const nothing = !it.changes?.length && it.said
      ? `<p style="margin:0 0 4px;font-size:13px;color:#8a7a4a;">Nothing to change for this one.</p>`
      : "";
    return `<li style="margin:0 0 12px;">
        <p style="margin:0 0 4px;font-weight:600;color:#5f4a17;">${esc(it.date)}</p>
        ${saidLine}${changeLines}${nothing}
      </li>`;
  };

  const review = items.length
    ? `<div style="margin:0 0 18px;padding:14px 16px;background:#fffbeb;border:1px solid #f0d48a;border-radius:10px;">
         <p style="margin:0 0 10px;font-weight:600;color:#7a5a12;">
           ${fixCount === 0
             ? "What you told us on your review"
             : fixCount === 1
               ? "One thing to fix in QuickSolve, from your review"
               : `${fixCount} things to fix in QuickSolve, from your review`}
         </p>
         <ul style="margin:0;padding:0 0 0 18px;list-style:none;">
           ${items.map(itemHtml).join("")}
         </ul>
       </div>`
    : "";

  const body = `
    ${testBanner}
    <p style="margin:0 0 14px;">Hi ${esc(employeeName)},</p>
    <p style="margin:0 0 18px;">Thank you - your timesheet for <strong>${esc(periodLabel)}</strong> is signed. Your copy is attached to this email.</p>
    ${review}
    <p style="margin:18px 0 0;font-size:13px;color:#6b7280;">If anything looks wrong on the attached copy, reply to this email.</p>`;

  return buildTimesheetShell({ title: `Signed timesheet - ${periodLabel}`, bodyHtml: body });
}

export async function sendSignedTimesheetCopy({
  intendedEmail,
  employeeName,
  periodLabel,
  items = [],
  // the exact bytes they signed, as a Buffer
  pdfBytes,
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
    redirectedFrom: redirected ? intendedEmail : null,
  });

  // the plain-text copy says the same thing and no more, so a client that
  // strips html gets the same email rather than a different one
  const fixCount = items.reduce((n, it) => n + (it.changes?.length || 0), 0);
  const itemText = (it) => [
    `  ${it.date}`,
    it.said ? `    ${it.said}` : "",
    ...(it.changes || []).map((t) => `    Change in QuickSolve: ${t}`),
  ].filter(Boolean).join("\n");
  const text = [
    redirected ? `*** TEST SEND - this was meant for ${intendedEmail} ***\n` : "",
    `Hi ${employeeName},`,
    ``,
    `Thank you - your timesheet for ${periodLabel} is signed. Your copy is attached.`,
    items.length
      ? `\n${fixCount === 0
          ? "What you told us on your review:"
          : `${fixCount === 1 ? "One thing" : `${fixCount} things`} to fix in QuickSolve, from your review:`}\n`
        + items.map(itemText).join("\n")
      : "",
    ``,
    `If anything looks wrong on the attached copy, reply to this email.`,
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
      attachments: [
        {
          filename: `Signed timesheet ${periodLabel}.pdf`,
          content: pdfBytes,
        },
      ],
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
