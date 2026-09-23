// THE SUBJECT LINES OF THE TWO CLOCK AMENDMENT EMAILS, dependency-free so they
// can be tested and previewed without a mail client. Same reasoning as
// timesheet-subjects.js.
//
//   THE FORM        to the person asked to confirm and sign
//   THE DOCUMENT    the approved copy, to the office and the staff member
//
// a repeat send needs a different subject or gmail folds it into the first one
// and hides the body

function prefixed(line, redirectedFrom) {
  return redirectedFrom ? `[TEST -> ${redirectedFrom}] ${line}` : line;
}

export function amendmentFormSubject({ staffName, date, isResend = false, redirectedFrom = null }) {
  const line = isResend
    ? `Reminder: the clock amendment for ${staffName}'s ${date} shift still needs signing`
    : `Clock amendment for ${staffName}'s ${date} shift - please confirm and sign`;
  return prefixed(line, redirectedFrom);
}

export function amendmentDocumentSubject({ formNumber, staffName, date, redirectedFrom = null }) {
  return prefixed(`Approved clock amendment ${formNumber}: ${staffName}, ${date}`, redirectedFrom);
}

// THE CLIENT LINK, to a parent or representative who is not in the room
export function clientSignSubject({ staffName, clientName, date, redirectedFrom = null }) {
  return prefixed(`Please confirm ${staffName}'s visit with ${clientName} on ${date}`, redirectedFrom);
}
