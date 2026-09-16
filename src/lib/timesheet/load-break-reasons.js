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
// `client` so a caller inside an interactive transaction reads the same view it
// is writing - see `rebuildSheetFor`, which the answer action now runs in one.
export async function loadTimeOffFor(ts, client = prisma) {
  if (!ts?.userId || !ts?.batch?.periodFrom) return [];
  return client.ptoEntry.findMany({
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

// THE SAME ROWS FOR A WHOLE BATCH, one query, grouped by person. The desk and
// the legacy page walk every signed sheet, and one fetch per sheet would be one
// per person for nothing.
export async function loadBreakReasonsForBatch(batch, personKeys = []) {
  const keys = [...new Set((personKeys || []).filter(Boolean))];
  const by = new Map(keys.map((k) => [k, []]));
  if (!batch?.periodFrom || !keys.length) return by;
  const rows = await prisma.timesheetBreakAnswer.findMany({
    where: {
      program: batch.program || "MLS",
      periodFrom: batch.periodFrom,
      periodTo: batch.periodTo,
      personKey: { in: keys },
    },
    orderBy: { date: "asc" },
  });
  for (const r of rows) by.get(r.personKey)?.push(r);
  return by;
}
