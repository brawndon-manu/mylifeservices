import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { buildAudit } from "../build";
import { clientHoursModel, renderClientHoursReport } from "@/lib/timesheet/client-hours-report";

// each client's billable hours against their monthly authorization, as a
// document - summary by default, ?detailed=1 for the per-employee, dated
// breakdown. Built from the same rows the audit screen shows, freshly, so it
// can never disagree with the cards behind it.
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { id } = await params;
  const data = await buildAudit(id);
  if (!data) return new NextResponse("Not found", { status: 404 });

  const detailed = new URL(req.url).searchParams.get("detailed") === "1";
  const model = clientHoursModel({
    periodFrom: data.batch.periodFrom,
    periodTo: data.batch.periodTo,
    monthLabel: data.authMonthLabel,
    rows: data.rows,
    authorized: data.hasAuthorizations ? data.authorized : null,
    detailed,
    generatedOn: new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" }),
  });

  let bytes;
  try {
    bytes = await renderClientHoursReport(model);
  } catch (e) {
    console.error("client hours report failed:", e);
    return new NextResponse("Could not build the report", { status: 500 });
  }

  const stamp = `${data.batch.periodFrom}-${data.batch.periodTo}`.replaceAll("/", "-");
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="client-hours${detailed ? "-detailed" : ""}-${stamp}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
