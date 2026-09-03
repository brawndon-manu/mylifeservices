// A REPLACED UPLOAD IS READ ONLY.
//
// A pay period has one current export and any number of earlier ones. The old
// ones stay openable, because there are real reasons to go back and look - what
// did the 12:36 AM pull say, when did this figure move. But nothing may be
// CHANGED from them.
//
// The reason is continuity rather than tidiness. A mark carries a horizon: how
// far the data reached when somebody made it. Marking from the 08/09 upload
// today would stamp "covered through 08/09" on a fresh decision, so the newest
// batch would show a mark that claims to have looked at three days nobody had
// seen. Worse for the figures: a recompute from an old export would rebuild
// sheets from data the current one has already replaced.
//
// WHAT CARRIES FORWARD ANYWAY IS EVERYTHING WORTH KEEPING. Notes, contact marks,
// confirmed-not-taken and their reasons are all keyed on (period, person,
// finding), so they follow the person onto the next upload on their own. Nothing
// is lost by refusing the write - it just has to be made on the current one.
import { prisma } from "@/lib/prisma";

// Given a batch, is there a NEWER upload of the same pay period?
//
// Returns the current batch when there is, so a caller can say where to go
// rather than only that the door is shut.
export async function supersededBy(batchId) {
  if (!batchId) return null;
  const batch = await prisma.timesheetBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true, periodFrom: true, periodTo: true, createdAt: true,
      program: true, auditOnly: true,
    },
  });
  if (!batch) return null;
  return prisma.timesheetBatch.findFirst({
    where: {
      periodFrom: batch.periodFrom,
      periodTo: batch.periodTo,
      // SAME PROGRAM ONLY. The day program and the agency run the same
      // fortnights, so without this a DP upload would mark the live MLS batch
      // replaced - sixty sheets out for signature going read-only because a
      // different payroll arrived.
      program: batch.program,
      // AND SAME KIND. An audit copy exists to be read against fresh QSP
      // exports without touching the payroll batch - Mánu 2026-09-03: "the
      // newer data doesnt override the exisiting signed off sheets." So a
      // payroll batch is only ever superseded by a newer payroll batch, and
      // an audit copy only by a newer audit copy.
      auditOnly: batch.auditOnly,
      createdAt: { gt: batch.createdAt },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true },
  });
}

// the same question starting from a timesheet, since half the write actions are
// handed one of those instead
export async function supersededByForTimesheet(timesheetId) {
  if (!timesheetId) return null;
  const ts = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    select: { batchId: true },
  });
  return ts ? supersededBy(ts.batchId) : null;
}

// what a refused write returns. `currentBatchId` is the point of it: the answer
// to "then where do I do this" is on the screen rather than left to be guessed.
export function refusal(current) {
  return {
    ok: false,
    error: "superseded",
    currentBatchId: current?.id || null,
    say: "This upload has been replaced. Make the change on the current one - "
      + "notes, marks and answers carry over to it on their own.",
  };
}
