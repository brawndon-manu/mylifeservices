import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { buildPayrollWorkbook } from "@/lib/timesheet/payroll-workbook";

// the payroll workbook - Summary, Payout, Penalty hours as one .xlsx. The
// build lives in payroll-workbook.js; this route is the auth in front of it.
export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  let out;
  try {
    out = await buildPayrollWorkbook(id);
  } catch (e) {
    console.error("payroll workbook failed:", e);
    return new NextResponse("Could not build the workbook", { status: 500 });
  }
  if (!out) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(out.bytes, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${out.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
