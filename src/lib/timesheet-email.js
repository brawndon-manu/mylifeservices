// the "your timesheet is ready to sign" email. reuses the shared portal email
// shell so it matches every other message we send.
import { buildTimesheetShell } from "@/lib/announcement-email";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const BTN =
  "display:inline-block;background:#2f6feb;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600;";

export function buildTimesheetEmailHtml({
  employeeName,
  periodLabel,
  message,
  dueAt,
  signUrl,
  summary,
  redirectedFrom = null,
}) {
  // loud banner so a test send can never be mistaken for the real thing
  const testBanner = redirectedFrom
    ? `<div style="margin:0 0 18px;padding:12px 14px;background:#fff4e5;border:1px solid #f0b37e;border-radius:8px;color:#7a4a12;font-size:13px;">
         <strong>TEST SEND.</strong> This was addressed to
         <strong>${esc(redirectedFrom)}</strong> and redirected here. Nobody else received it.
       </div>`
    : "";

  const rows = summary
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 18px;border-collapse:collapse;font-size:14px;">
         ${summaryRow("Hours worked (corrected)", `${summary.paidHours} hrs`)}
         ${summary.otHours > 0 ? summaryRow("Overtime", `${summary.otHours} hrs`) : ""}
         ${summary.doubleHours > 0 ? summaryRow("Double time", `${summary.doubleHours} hrs`) : ""}
         ${summary.premiumHours > 0 ? summaryRow("Break premium hours owed", `${summary.premiumHours} hrs`) : ""}
       </table>`
    : "";

  const note = message
    ? `<div style="margin:0 0 18px;padding:14px 16px;background:#f6f8fb;border:1px solid #e3e8ef;border-radius:10px;color:#33414f;">${esc(message).replace(/\n/g, "<br>")}</div>`
    : "";

  const due = dueAt
    ? `<p style="margin:0 0 18px;color:#b45309;font-size:14px;font-weight:600;">Please sign it by ${esc(dueAt)}.</p>`
    : "";

  const body = `
    ${testBanner}
    <p style="margin:0 0 14px;">Hi ${esc(employeeName)},</p>
    <p style="margin:0 0 18px;">Your timesheet for <strong>${esc(periodLabel)}</strong> is ready. Please review the hours and breaks, then sign it.</p>
    ${rows}
    ${note}
    ${due}
    <a href="${signUrl}" style="${BTN}">Review &amp; sign my timesheet</a>
    <p style="margin:18px 0 0;font-size:13px;color:#6b7280;">This link is just for you - no login needed. If anything looks wrong, reply to this email instead of signing.</p>`;

  return buildTimesheetShell({ title: `Timesheet - ${periodLabel}`, bodyHtml: body });
}

function summaryRow(label, value) {
  return `<tr>
    <td style="padding:6px 0;color:#64748b;border-bottom:1px solid #eef1f5;">${esc(label)}</td>
    <td style="padding:6px 0;text-align:right;font-weight:600;color:#0f2230;border-bottom:1px solid #eef1f5;">${esc(value)}</td>
  </tr>`;
}
