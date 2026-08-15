// THE SUBJECT LINE OF ALL THREE TIMESHEET EMAILS, in one dependency-free place.
//
// Same reasoning as timesheet-mode.js: these are the strings that decide what
// lands in somebody's inbox, they have no dependencies at all, and keeping them
// out of the modules that pull in Resend and the email shell is what lets them
// be tested directly and previewed without constructing a mail client.
//
// They were inline inside the two send functions until the Tests card needed to
// show them. A preview that copies a subject is a preview that drifts the day
// somebody edits the original, and nothing would fail to say so.

// THE TWO THAT GO TO AN EMPLOYEE.
//
// A SECOND SEND NEEDS A DIFFERENT SUBJECT. Gmail threads on subject + sender and
// collapses the repeat behind "Show trimmed content", so a re-sent timesheet
// would otherwise arrive with its body hidden, above a signature.
//
//   TIMESHEET TO REVIEW   the first send
//   SIGNING REMINDER      any send to somebody who already has a `sentAt`
//
// The BODY is the same for both - only this differs.
export function timesheetSubject({ periodLabel, isResend = false, redirectedFrom = null }) {
  const line = isResend
    ? `Reminder: your timesheet for ${periodLabel} still needs signing`
    : `Your timesheet for ${periodLabel} - please review and sign`;
  return redirectedFrom ? `[TEST -> ${redirectedFrom}] ${line}` : line;
}

// THE ONE THAT COMES TO US, when somebody reports a problem from their
// timesheet review page.
//
// THE TEST LINE AND THE LIVE LINE DO NOT SAY THE SAME THING, and that predates
// this file rather than being introduced by it: live reads "reported a problem
// with their timesheet", test reads "reported a timesheet problem". Left exactly
// as it was. A preview whose whole job is to show what goes out must not quietly
// tidy what goes out, and a test pins both spellings so changing one is a
// decision rather than an accident.
export function correctionAlertSubject({ employeeName, redirectedFrom = null }) {
  return redirectedFrom
    ? `[TEST -> ${redirectedFrom}] ${employeeName} reported a timesheet problem`
    : `${employeeName} reported a problem with their timesheet`;
}
