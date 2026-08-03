import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { renderComplianceReport } from "@/lib/timesheet/report";

// the companion compliance report for one employee. generated on demand rather
// than stored: it's derived entirely from the timesheet row, so there's nothing
// to keep in sync and no second copy to go stale after a correction.
export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const ts = await prisma.timesheet.findUnique({
    where: { id },
    include: { batch: { select: { periodFrom: true, periodTo: true } } },
  });
  if (!ts) return new NextResponse("Not found", { status: 404 });

  const stored = ts.data || {};
  const days = stored.days || [];
  if (!days.length) {
    return new NextResponse(
      "This timesheet has no day detail stored, so a report can't be built from it. Re-upload the pay period.",
      { status: 409 },
    );
  }

  let bytes;
  try {
    const out = await renderComplianceReport(
      {
        employee: ts.sourceName,
        payPeriod:
          stored.payPeriod || { from: ts.batch.periodFrom, to: ts.batch.periodTo },
        days,
        totals: {
          rawHours: ts.rawHours,
          paidHours: ts.paidHours,
          regularHours: ts.regularHours,
          otHours: ts.otHours,
          doubleHours: ts.doubleHours,
        },
        premiums: stored.premiums || {
          mealDays: [], restDays: [], mealHours: 0, restHours: 0, totalHours: ts.premiumHours,
        },
        partialWeekDates: stored.partialWeekDates || [],
      },
      {
        generatedOn: new Date().toLocaleDateString("en-US", {
          timeZone: "America/Los_Angeles",
        }),
        overrides: ts.overrides || null,
      },
    );
    bytes = out.bytes;
  } catch (e) {
    console.error(`compliance report failed for ${ts.sourceName}:`, e);
    return new NextResponse("Could not build the report", { status: 500 });
  }

  const safe = (ts.sourceName || "timesheet").replace(/[^\w.\- ]/g, "_");
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safe}-hours-and-penalties.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
