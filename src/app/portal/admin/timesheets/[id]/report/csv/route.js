import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { batchPremiumStanding } from "@/lib/timesheet/premium-split";
import { miscTimeOffHours } from "@/lib/timesheet/time-off";

// the payout figures as data. payroll keys these in somewhere else, and typing
// them off a PDF is how a digit goes missing.
export const dynamic = "force-dynamic";

const r2 = (n) => (Math.round((n || 0) * 100) / 100).toFixed(2);

// excel treats a leading = + - @ as a formula, so anything user-supplied gets
// a leading apostrophe. names come from a payroll export, but they're still
// text we didn't write.
function cell(v) {
  const s = String(v ?? "");
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function GET(_req, { params }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) {
    return new Response("Not found", { status: 404 });
  }

  const { id } = await params;
  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    include: {
      timesheets: {
        orderBy: { sourceName: "asc" },
        include: {
          user: {
            select: { name: true, preferredFirstName: true, preferredLastName: true },
          },
          corrections: {
            where: { OR: [{ status: "open" }, { kind: { startsWith: "q_" } }] },
            select: { id: true, kind: true, date: true, status: true },
          },
        },
      },
    },
  });
  if (!batch) return new Response("Not found", { status: 404 });

  // the CHARGED figure, same as the page and the PDF. Payroll keys these in
  // somewhere else, so this is the last place a stale column could survive.
  const standing = batchPremiumStanding(batch.timesheets, {
    restRows: batch.restsByDate || [],
  });

  // RECORDED TIME OFF, under its own two codes - same rows and same split as
  // the payout page. Pay, never worked hours; joins only the payable column.
  const ptoRows = await prisma.ptoEntry.findMany({
    where: {
      program: batch.program || "MLS",
      periodFrom: batch.periodFrom,
      periodTo: batch.periodTo,
    },
    select: { personKey: true, hours: true, kind: true },
  });
  const timeOffBy = new Map();
  for (const p of ptoRows) {
    const cur = timeOffBy.get(p.personKey) || { pto: 0, sick: 0 };
    if (p.kind === "sick") cur.sick += p.hours || 0;
    else cur.pto += p.hours || 0;
    timeOffBy.set(p.personKey, cur);
  }

  const header = [
    "Employee",
    "As printed by QSP",
    "Matched",
    "Regular hours",
    "Overtime hours",
    "Double time hours",
    "Hours worked",
    "Premium hours",
    "Premium hours that come off if assumptions confirmed",
    "PTO hours",
    "Sick hours",
    "Total hours payable",
    "Miles driven",
    "Partial week",
    "Status",
    "Corrected",
  ];

  const lines = [header.map(cell).join(",")];
  const t = { reg: 0, ot: 0, dbl: 0, paid: 0, prem: 0, assumptions: 0, pto: 0, sick: 0, payable: 0, miles: 0 };

  for (const ts of batch.timesheets) {
    const charged = standing.byId[ts.id]?.charged ?? 0;
    const assumptions = standing.byId[ts.id]?.assumptions ?? 0;
    const cal = (ts.userId && timeOffBy.get(ts.userId)) || { pto: 0, sick: 0 };
    // Misc time classified as PTO/sick moves columns rather than adding -
    // it is already inside the QSP-paid figures, so worked shrinks by what
    // the PTO/Sick columns gain and payable is untouched by construction.
    const misc = miscTimeOffHours(ts.data?.days);
    const workedReg = Math.max(0, (ts.regularHours || 0) - misc.total);
    const worked = Math.max(0, (ts.paidHours || 0) - misc.total);
    const pto = cal.pto + misc.pto;
    const sick = cal.sick + misc.sick;
    const payable = (ts.paidHours || 0) + charged + cal.pto + cal.sick;
    t.reg += workedReg;
    t.ot += ts.otHours || 0;
    t.dbl += ts.doubleHours || 0;
    t.paid += worked;
    t.prem += charged;
    t.assumptions += assumptions;
    t.pto += pto;
    t.sick += sick;
    t.payable += payable;
    // reimbursed per mile rather than paid as hours, so it is summed on its own
    // and never folded into payable
    t.miles += ts.data?.qspMiles || 0;

    lines.push(
      [
        ts.user ? preferredName(ts.user) : ts.sourceName,
        ts.sourceName,
        ts.userId ? "yes" : "no",
        r2(workedReg),
        r2(ts.otHours),
        r2(ts.doubleHours),
        r2(worked),
        r2(charged),
        r2(assumptions),
        r2(pto),
        r2(sick),
        r2(payable),
        r2(ts.data?.qspMiles),
        ts.partialWeek ? "yes" : "no",
        ts.corrections.some((c) => c.status === "open")
          ? "reported a problem"
          : ts.approvedAt
            ? "approved"
            : ts.signedAt
              ? "signed"
              : "not signed",
        ts.recomputedAt ? "yes" : "no",
      ]
        .map(cell)
        .join(","),
    );
  }

  lines.push(
    [
      `TOTAL (${batch.timesheets.length} employees)`,
      "",
      "",
      r2(t.reg),
      r2(t.ot),
      r2(t.dbl),
      r2(t.paid),
      r2(t.prem),
      r2(t.assumptions),
      r2(t.pto),
      r2(t.sick),
      r2(t.payable),
      r2(t.miles),
      "",
      "",
      "",
    ]
      .map(cell)
      .join(","),
  );

  // WHETHER THE PREMIUM COLUMN IS FINISHED CHANGING, as its own row rather than
  // a comment - a CSV has nowhere else to put it, and payroll keys off this.
  lines.push("");
  lines.push([
    standing.settled
      ? `FINAL: all ${standing.people} have answered. Nothing further can move the premium column.`
      : `PROVISIONAL: ${standing.waiting} of ${standing.people} have not answered yet. Up to ${r2(standing.assumptions)} premium hours come OFF if they all confirm they took their breaks. This total can fall and cannot rise.`,
  ].map(cell).join(","));

  const slug = `${batch.periodFrom}-${batch.periodTo}`.replace(/[^\w]+/g, "-");
  // BOM so Excel opens it as UTF-8 and doesn't mangle accented names
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payout-${slug}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
