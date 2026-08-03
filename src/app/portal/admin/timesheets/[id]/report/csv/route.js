import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";

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
          corrections: { where: { status: "open" }, select: { id: true } },
        },
      },
    },
  });
  if (!batch) return new Response("Not found", { status: 404 });

  const header = [
    "Employee",
    "As printed by QSP",
    "Matched",
    "Regular hours",
    "Overtime hours",
    "Double time hours",
    "Hours worked",
    "Premium hours",
    "Total hours payable",
    "Partial week",
    "Status",
    "Corrected",
  ];

  const lines = [header.map(cell).join(",")];
  const t = { reg: 0, ot: 0, dbl: 0, paid: 0, prem: 0, payable: 0 };

  for (const ts of batch.timesheets) {
    const payable = (ts.paidHours || 0) + (ts.premiumHours || 0);
    t.reg += ts.regularHours || 0;
    t.ot += ts.otHours || 0;
    t.dbl += ts.doubleHours || 0;
    t.paid += ts.paidHours || 0;
    t.prem += ts.premiumHours || 0;
    t.payable += payable;

    lines.push(
      [
        ts.user ? preferredName(ts.user) : ts.sourceName,
        ts.sourceName,
        ts.userId ? "yes" : "no",
        r2(ts.regularHours),
        r2(ts.otHours),
        r2(ts.doubleHours),
        r2(ts.paidHours),
        r2(ts.premiumHours),
        r2(payable),
        ts.partialWeek ? "yes" : "no",
        ts.corrections.length
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
      r2(t.payable),
      "",
      "",
      "",
    ]
      .map(cell)
      .join(","),
  );

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
