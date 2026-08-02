// sending timesheets out to staff. this is the one place in the app that can
// email 60+ people their own payroll document, so it is deliberately fail-safe:
//
//   TEST MODE IS THE DEFAULT. every send is redirected to the test inbox unless
//   TIMESHEET_LIVE_SEND is set to the exact opt-in phrase below. a missing,
//   empty, typo'd or truthy-but-wrong value all keep it in test mode.
//
// in test mode the mail still renders exactly as staff would see it, but the
// TO line is the tester and the subject/body say who it was meant for, so a
// dry run is realistic without anyone's hours reaching them by accident.
import { Resend } from "resend";
import { buildTimesheetEmailHtml } from "@/lib/timesheet-email";

// the guard itself lives in its own dependency-free module so it can be tested
// in isolation - see src/lib/timesheet-mode.js.
export {
  isLiveSend,
  testRecipients,
  sendModeSummary,
  resolveRecipients,
} from "@/lib/timesheet-mode";
import { isLiveSend, resolveRecipients } from "@/lib/timesheet-mode";

export async function sendTimesheet({
  intendedEmail,
  employeeName,
  periodLabel,
  message,
  dueAt,
  signUrl,
  summary,
}) {
  if (!intendedEmail) return { ok: false, error: "norecipient" };
  const from =
    process.env.TIMESHEET_FROM ||
    process.env.ANNOUNCEMENTS_FROM ||
    process.env.AUTH_RESEND_FROM;
  if (!from || !process.env.RESEND_API_KEY) return { ok: false, error: "config" };

  const { to, redirected } = resolveRecipients(intendedEmail);
  if (!to.length) return { ok: false, error: "norecipient" };

  const subject = redirected
    ? `[TEST -> ${intendedEmail}] Your timesheet for ${periodLabel}`
    : `Your timesheet for ${periodLabel} - please review and sign`;

  const html = buildTimesheetEmailHtml({
    employeeName,
    periodLabel,
    message,
    dueAt,
    signUrl,
    summary,
    redirectedFrom: redirected ? intendedEmail : null,
  });

  const text = [
    redirected ? `*** TEST SEND - this was meant for ${intendedEmail} ***\n` : "",
    `Hi ${employeeName},`,
    ``,
    `Your timesheet for ${periodLabel} is ready to review and sign.`,
    message ? `\n${message}\n` : "",
    dueAt ? `Please sign it by ${dueAt}.` : "",
    ``,
    signUrl,
  ]
    .filter(Boolean)
    .join("\n");

  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    const { error } = await resend.emails.send({ from, to, subject, html, text });
    if (error) {
      console.error("timesheet send error:", error);
      return { ok: false, error: "send" };
    }
  } catch (e) {
    console.error("timesheet send threw:", e);
    return { ok: false, error: "send" };
  }
  return { ok: true, redirected, sentTo: to.join(", ") };
}
