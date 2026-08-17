// WHO GAVE AN ANSWER, out of the two people who can be holding the page.
//
// `answerTimesheetQuestion` is reached by the timesheet token alone, so the
// employee on their emailed link and a reviewer on the preview link arrive
// looking identical. The one tell is a signed-in portal session with timesheet
// access: employees answer from an email, reviewers answer from inside the
// portal, usually while the person is on the phone.
//
// The distinction is load-bearing for the premium counters. An hour the
// EMPLOYEE waves off stays in the locked projected figure until their
// signature lands; an hour a REVIEWER records settles on its own. That is the
// rule of 2026-08-17: an employee answer alone may not settle premium.
//
// Defaulting to the employee is deliberate. When nobody can say who answered -
// no session, an old row from before this existed - the hour stays visible
// rather than quietly settling itself. The failure mode is a figure that reads
// high until a signature lands, never one that pays short.
//
// Kept dependency-free so `node --test` can reach it - same reason the subject
// strings live in timesheet-subjects.js.

// the id to store on the answer's correction row: the reviewer's own when a
// reviewer is driving somebody else's sheet, the employee's otherwise. A
// manager answering their OWN sheet is the employee here - what matters is
// whose premium the answer moves, not what their badge says.
export function answerActorId(viewer, viewerCanManage, employeeId) {
  if (viewer?.id && viewerCanManage && viewer.id !== employeeId) return viewer.id;
  return employeeId || null;
}

// "admin" | "employee" from a stored row, judged against the sheet it sits on
// AND against who actually reviews timesheets. `reviewerIds` is the set of
// user ids that hold timesheet access; a resolver outside it is never
// "admin", however much their id differs from the sheet's.
//
// The second check is not decoration. Attribution judged on "differs from the
// sheet's current userId" alone flips the moment a sheet is re-matched or its
// match cleared: every answer the old employee gave suddenly reads as a
// reviewer's and settles hours with nobody's signature. Judged against the
// reviewer set, a re-match leaves them as the employee, and an ex-reviewer's
// old answers fall back to employee too - both failures keep the hour
// visible, neither settles it.
//
// Rows written before provenance existed carry the employee's id (or null on
// an unmatched sheet), and both of those read as the employee - see above.
export function actorKindFor(resolvedById, employeeId, reviewerIds) {
  if (!resolvedById || resolvedById === (employeeId || null)) return "employee";
  return reviewerIds && reviewerIds.has(resolvedById) ? "admin" : "employee";
}
