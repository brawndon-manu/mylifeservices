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
  // the only number the email carries. See timesheet-email.js.
  questionCount = 0,
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

  // NO POLICY LOOKUP ANY MORE. The paragraph it fed was cut with the rest of the
  // figures on 2026-08-11; the page still names and links the policy, beside the
  // document it is about.
  const html = buildTimesheetEmailHtml({
    employeeName,
    periodLabel,
    message,
    dueAt,
    signUrl,
    questionCount,
    redirectedFrom: redirected ? intendedEmail : null,
  });

  const text = [
    redirected ? `*** TEST SEND - this was meant for ${intendedEmail} ***\n` : "",
    `Hi ${employeeName},`,
    ``,
    `Your timesheet for ${periodLabel} is ready to review and sign.`,
    // the plain-text copy says the same thing and no more, so a client that
    // strips html gets the same email rather than a different one
    questionCount > 0
      ? `\nThere ${questionCount === 1 ? "is" : "are"} ${questionCount > 10 ? "several" : questionCount} ${questionCount === 1 ? "question" : "questions"} about your breaks on the page. Answering ${questionCount === 1 ? "it" : "them"} is optional.\n`
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
