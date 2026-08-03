import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { renderPayoutReport } from "@/lib/timesheet/payout-pdf";

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
          corrections: { where: { status: "open" }, select: { id: true } },
        },
      },
    },
  });
  if (!batch) return new NextResponse("Not found", { status: 404 });

  let bytes;
  try {
    const out = await renderPayoutReport(
      {
        periodFrom: batch.periodFrom,
        periodTo: batch.periodTo,
        rows: batch.timesheets.map((t) => ({
          who: t.user ? preferredName(t.user) : t.sourceName,
          matched: !!t.userId,
          regularHours: t.regularHours,
          otHours: t.otHours,
          doubleHours: t.doubleHours,
          paidHours: t.paidHours,
          premiumHours: t.premiumHours,
          partialWeek: t.partialWeek,
          disputed: t.corrections.length > 0,
        })),
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
