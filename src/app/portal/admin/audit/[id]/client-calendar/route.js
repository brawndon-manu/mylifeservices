import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { buildAudit } from "../build";
import { clientDayModel, renderClientCalendars } from "@/lib/timesheet/client-calendar-report";

// each client's billable hours laid on a month calendar, one client per
// page, then a page breaking every day into its shifts - the shape David
// bills in on the DDS eBilling site, so he can cross-reference day by day.
// Built from the same rows the audit screen shows, freshly, so it can never
// disagree with the cards behind it.
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { id } = await params;
  const data = await buildAudit(id);
  if (!data) return new NextResponse("Not found", { status: 404 });

  let bytes;
  try {
    bytes = await renderClientCalendars({
      periodFrom: data.batch.periodFrom,
      generatedOn: new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" }),
      clients: clientDayModel(data.rows),
      authorized: data.hasAuthorizations ? data.authorized : null,
      authMonthLabel: data.authMonthLabel,
    });
  } catch (e) {
    console.error("client calendar report failed:", e);
    return new NextResponse("Could not build the report", { status: 500 });
  }

  const stamp = `${data.batch.periodFrom}-${data.batch.periodTo}`.replaceAll("/", "-");
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="client-calendars-${stamp}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
