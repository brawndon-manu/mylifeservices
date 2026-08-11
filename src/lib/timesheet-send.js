// sending timesheets out to staff. this is the one place in the app that can
// email 60+ people their own payroll document, so it is deliberately fail-safe:
//
//   TEST MODE IS THE DEFAULT, and it takes TWO things to leave it: the exact
//   TIMESHEET_LIVE_SEND phrase, AND this being the real deployment. A missing,
//   empty, typo'd or truthy-but-wrong phrase keeps it in test mode, and so does
//   running anywhere that cannot prove it is production - a laptop above all.
//   See src/lib/timesheet-mode.js for why the second lock exists.
//
// in test mode the mail still renders exactly as staff would see it, but the
// TO line is the tester and the subject/body say who it was meant for, so a
// dry run is realistic without anyone's hours reaching them by accident.
import { Resend } from "resend";
import { buildTimesheetEmailHtml } from "@/lib/timesheet-email";
import { restMealPolicyLink } from "@/lib/policy-form";

// the guard itself lives in its own dependency-free module so it can be tested
// in isolation - see src/lib/timesheet-mode.js.
export {
  isLiveSend,
  liveSendConfigured,
  isProductionDeployment,
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
  checks = [],
  // has this person already had this sheet? drives the subject only
  isResend = false,
}) {
  if (!intendedEmail) return { ok: false, error: "norecipient" };
  const from =
    process.env.TIMESHEET_FROM ||
    process.env.ANNOUNCEMENTS_FROM ||
    process.env.AUTH_RESEND_FROM;
  if (!from || !process.env.RESEND_API_KEY) return { ok: false, error: "config" };

  const { to, redirected } = resolveRecipients(intendedEmail);
  if (!to.length) return { ok: false, error: "norecipient" };

  // A SECOND SEND NEEDS A DIFFERENT SUBJECT. Gmail threads on subject + sender
  // and collapses the repeat behind "Show trimmed content" - so a re-sent
  // timesheet arrives with the paragraph explaining the assumed hours hidden,
  // above a signature. Mánu 2026-08-10 asked for this once it was spotted.
  const line = isResend
    ? `Reminder: your timesheet for ${periodLabel} still needs signing`
    : `Your timesheet for ${periodLabel} - please review and sign`;
  const subject = redirected ? `[TEST -> ${intendedEmail}] ${line}` : line;

  // the policy the break assumption rests on, so the sentence naming it can be
  // opened. Resolved per send rather than cached: it is one small query against
  // a table with a handful of rows, and a stale slug is a dead link.
  const base = (process.env.AUTH_URL || "https://www.mylifeservicesinc.com").replace(/\/$/, "");
  const policy = summary?.assumedPremium > 0 ? await restMealPolicyLink() : null;
  const policyUrl = policy ? `${base}${policy.path}` : null;

  const html = buildTimesheetEmailHtml({
    employeeName,
    periodLabel,
    message,
    dueAt,
    signUrl,
    summary,
    checks,
    redirectedFrom: redirected ? intendedEmail : null,
    policyUrl,
  });

  const text = [
    redirected ? `*** TEST SEND - this was meant for ${intendedEmail} ***\n` : "",
    `Hi ${employeeName},`,
    ``,
    `Your timesheet for ${periodLabel} is ready to review and sign.`,
    // the plain-text copy carries the same reasoning and the same link, so a
    // client that strips html does not drop the basis for the figure
    summary?.assumedPremium > 0
      ? `\n${summary.assumedPremium} hours of breaks are assumed taken and are NOT on this timesheet. Under the Rest & Meal Period Policy and Acknowledgement you signed, recording your rest periods and meal breaks is your responsibility, so an undocumented break is treated as a record that was not kept rather than a break you did not receive. If you did miss one, say so and the penalty pay is added.${policyUrl ? `\nRead the policy: ${policyUrl}` : ""}\n`
      : "",
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
