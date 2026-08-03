// "someone says their timesheet is wrong" - the alert that goes to whoever runs
// payroll. it carries the actual claims rather than a bare "go look", because
// the whole point of this feature is that nobody has to go digging to find out
// what changed.
//
// it goes through the same send guard as everything else in this feature: in
// test mode it is redirected to the tester like any other timesheet email, so a
// dry run never pages real management.
import { Resend } from "resend";
import { buildTimesheetShell } from "@/lib/announcement-email";
import { resolveRecipients } from "@/lib/timesheet-mode";
import { CORRECTION_KINDS } from "@/lib/timesheet/corrections";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const BTN =
  "display:inline-block;background:#2f6feb;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600;";

export function buildCorrectionAlertHtml({
  employeeName,
  periodLabel,
  items,
  reviewUrl,
  redirectedFrom = null,
}) {
  const testBanner = redirectedFrom
    ? `<div style="margin:0 0 18px;padding:12px 14px;background:#fff4e5;border:1px solid #f0b37e;border-radius:8px;color:#7a4a12;font-size:13px;">
         <strong>TEST SEND.</strong> This was addressed to
         <strong>${esc(redirectedFrom)}</strong> and redirected here.
       </div>`
    : "";

  const rows = items
    .map(
      (it) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e6ecf2;font-size:13px;white-space:nowrap;">
          ${esc(it.date || "Whole sheet")}
        </td>
        <td style="padding:8px 10px;border-bottom:1px solid #e6ecf2;font-size:13px;">
          ${esc(CORRECTION_KINDS[it.kind]?.label || it.kind)}
          ${
            it.claimedHours != null
              ? `<br><span style="color:#5b6b7c;">They say: ${esc(
                  it.claimedHours,
                )} hrs</span>`
              : ""
          }
          ${it.note ? `<br><span style="color:#5b6b7c;">"${esc(it.note)}"</span>` : ""}
        </td>
      </tr>`,
    )
    .join("");

  const bodyHtml = `
    ${testBanner}
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#1b2430;">
      <strong>${esc(employeeName)}</strong> says something is wrong with their
      timesheet for <strong>${esc(periodLabel)}</strong>.
    </p>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#5b6b7c;">
      Their signature is on hold until this is resolved. Nothing has changed on
      the timesheet - the figures only move if you accept a correction.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 22px;border:1px solid #e6ecf2;border-radius:8px;">
      <thead>
        <tr style="background:#f4f8fc;">
          <th style="padding:8px 10px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#5b6b7c;">Day</th>
          <th style="padding:8px 10px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#5b6b7c;">What they reported</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin:0 0 8px;">
      <a href="${esc(reviewUrl)}" style="${BTN}">Review it</a>
    </p>`;

  return buildTimesheetShell({
    title: "A timesheet needs looking at",
    bodyHtml,
    eyebrow: "Payroll",
  });
}

export async function sendCorrectionAlert({
  to,
  employeeName,
  periodLabel,
  items,
  reviewUrl,
}) {
  if (!to?.length) return { ok: false, error: "norecipient" };
  const from =
    process.env.TIMESHEET_FROM ||
    process.env.ANNOUNCEMENTS_FROM ||
    process.env.AUTH_RESEND_FROM;
  if (!from || !process.env.RESEND_API_KEY) return { ok: false, error: "config" };

  // one intended address drives the guard; the rest ride along on the same
  // decision so a test run can't half-redirect.
  const { to: resolved, redirected } = resolveRecipients(to[0]);
  const finalTo = redirected ? resolved : to;

  const subject = redirected
    ? `[TEST -> ${to.join(", ")}] ${employeeName} reported a timesheet problem`
    : `${employeeName} reported a problem with their timesheet`;

  const html = buildCorrectionAlertHtml({
    employeeName,
    periodLabel,
    items,
    reviewUrl,
    redirectedFrom: redirected ? to.join(", ") : null,
  });

  const text = [
    redirected ? `*** TEST SEND - meant for ${to.join(", ")} ***\n` : "",
    `${employeeName} says something is wrong with their timesheet for ${periodLabel}.`,
    ``,
    ...items.map(
      (it) =>
        `- ${it.date || "Whole sheet"}: ${
          CORRECTION_KINDS[it.kind]?.label || it.kind
        }${it.claimedHours != null ? ` (they say ${it.claimedHours} hrs)` : ""}${
          it.note ? ` - "${it.note}"` : ""
        }`,
    ),
    ``,
    `Their signature is on hold until it's resolved.`,
    reviewUrl,
  ]
    .filter(Boolean)
    .join("\n");

  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    const { error } = await resend.emails.send({
      from,
      to: finalTo,
      subject,
      html,
      text,
    });
    if (error) {
      console.error("correction alert send error:", error);
      return { ok: false, error: "send" };
    }
  } catch (e) {
    console.error("correction alert send threw:", e);
    return { ok: false, error: "send" };
  }
  return { ok: true, redirected, sentTo: finalTo.join(", ") };
}
