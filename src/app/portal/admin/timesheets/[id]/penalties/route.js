import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { renderPenaltyRoster } from "@/lib/timesheet/penalty-roster";

// the whole batch as one sheet: names and penalty hours, nothing else. built on
// demand from the rows, so it always agrees with the review screen.
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
        },
      },
    },
  });
  if (!batch) return new NextResponse("Not found", { status: 404 });

  let bytes;
  try {
    const out = await renderPenaltyRoster(
      {
        periodFrom: batch.periodFrom,
        periodTo: batch.periodTo,
        rows: batch.timesheets.map((t) => ({
          who: t.user ? preferredName(t.user) : t.sourceName,
          premiumHours: t.premiumHours,
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
    console.error("penalty roster failed:", e);
    return new NextResponse("Could not build the sheet", { status: 500 });
  }

  const slug = `${batch.periodFrom}-${batch.periodTo}`.replace(/[^\w]+/g, "-");
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="break-penalty-hours-${slug}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
