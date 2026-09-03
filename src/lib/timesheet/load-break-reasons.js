// THE REASONS FOR ONE SHEET, FETCHED THE ONE WAY.
//
// Four routes render a timesheet - the employee's own PDF, the admin single
// download, the batch download and the zip - and every one of them has to hand
// the same reasons to `renderSheet`. A route that forgets prints a sheet with
// the block silently short, which is indistinguishable from a person who was
// never asked anything.
//
// So the fetch lives here rather than being written out four times, and
// `renderSheet` itself stays a pure function of what it is given.
//
// KEYED ON (period, person), never on the timesheet: a reason gathered against
// one export has to print on the sheet generated from the next.
import { prisma } from "@/lib/prisma";

export async function loadBreakReasons(ts) {
  if (!ts?.userId || !ts?.batch?.periodFrom) return [];
  return prisma.timesheetBreakAnswer.findMany({
    where: {
      // the batch's program, defaulted for callers whose select predates the
      // column. Velasquez works BOTH payrolls in one fortnight, so without
      // this his day program sheet would print the reasons gathered for his
      // MLS one.
      program: ts.batch.program || "MLS",
      periodFrom: ts.batch.periodFrom,
      periodTo: ts.batch.periodTo,
      personKey: ts.userId,
    },
    orderBy: { date: "asc" },
  });
}

// THE RECORDED TIME OFF FOR ONE SHEET, the same one-fetch rule as the reasons
// above and for the same reason: every route that renders a sheet hands these
// to `renderSheet`, and a route that forgets prints a sheet silently missing
// its time-off line. Keyed (program, period, person) like the PtoEntry rows
// themselves, so the record survives every re-upload.
export async function loadTimeOffFor(ts) {
  if (!ts?.userId || !ts?.batch?.periodFrom) return [];
  return prisma.ptoEntry.findMany({
    where: {
      program: ts.batch.program || "MLS",
      periodFrom: ts.batch.periodFrom,
      periodTo: ts.batch.periodTo,
      personKey: ts.userId,
    },
    select: { date: true, hours: true, kind: true },
    orderBy: { date: "asc" },
  });
}
