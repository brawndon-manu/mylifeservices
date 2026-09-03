import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
// LEGAL NAMES ON EVERY DOWNLOADABLE DOCUMENT - see payrollName
import { payrollName } from "@/lib/contacts";
import { renderPayoutReport } from "@/lib/timesheet/payout-pdf";
import { batchPremiumStanding } from "@/lib/timesheet/premium-split";
import { miscTimeOffHours } from "@/lib/timesheet/time-off";

// same figures as the payout page and its CSV, as a document. built on demand so
// it can never disagree with the screen.
export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

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
  if (!batch) return new NextResponse("Not found", { status: 404 });

  // the CHARGED figure, not the stored ignoring-assumptions column, plus how
  // many people have still to answer - because until they all have, the penalty
  // column can only go up.
  const standing = batchPremiumStanding(batch.timesheets, {
    restRows: batch.restsByDate || [],
  });

  // recorded time off, the same rows the page and the CSV read - the print
  // carries one combined column, so only the sum rides per person
  const ptoRows = await prisma.ptoEntry.findMany({
    where: {
      program: batch.program || "MLS",
      periodFrom: batch.periodFrom,
      periodTo: batch.periodTo,
    },
    select: { personKey: true, hours: true },
  });
  const timeOffBy = new Map();
  for (const p of ptoRows) {
    timeOffBy.set(p.personKey, (timeOffBy.get(p.personKey) || 0) + (p.hours || 0));
  }

  let bytes;
  try {
    const out = await renderPayoutReport(
      {
        periodFrom: batch.periodFrom,
        periodTo: batch.periodTo,
        rows: batch.timesheets.map((t) => {
          // Misc-classified PTO/sick moves out of worked and into Time off -
          // payable is untouched: (paid - misc) + premium + (calendar + misc)
          // equals what it always was.
          const misc = miscTimeOffHours(t.data?.days);
          return {
          who: payrollName(t.user, t.sourceName),
          matched: !!t.userId,
          regularHours: Math.max(0, (t.regularHours || 0) - misc.total),
          otHours: t.otHours,
          doubleHours: t.doubleHours,
          paidHours: Math.max(0, (t.paidHours || 0) - misc.total),
          premiumHours: standing.byId[t.id]?.charged ?? 0,
          timeOffHours: ((t.userId && timeOffBy.get(t.userId)) || 0) + misc.total,
          // mileage off the payroll report, and whether the sheet has been
          // signed - Mánu 2026-08-17. Both read at request time, so a download
          // taken after somebody signs shows it.
          miles: t.data?.qspMiles ?? 0,
          signedAt: t.signedAt,
          approvedAt: t.approvedAt,
          partialWeek: t.partialWeek,
          // ONLY the open ones. The query now also returns the `q_` answers, and
          // counting those would mark everybody as having reported a problem.
          disputed: t.corrections.some((c) => c.status === "open"),
          };
        }),
        standing,
      },
      {
        generatedOn: new Date().toLocaleDateString("en-US", {
          timeZone: "America/Los_Angeles",
        }),
      },
    );
    bytes = out.bytes;
  } catch (e) {
    console.error("payout report pdf failed:", e);
    return new NextResponse("Could not build the report", { status: 500 });
  }

  const slug = `${batch.periodFrom}-${batch.periodTo}`.replace(/[^\w]+/g, "-");
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="payroll-hours-and-penalties-${slug}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
