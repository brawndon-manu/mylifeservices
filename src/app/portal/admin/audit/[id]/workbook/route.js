import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { buildAuditWorkbook } from "@/lib/timesheet/audit-workbook";

// The whole audit as one styled workbook - same gate as the audit page,
// generated fresh on request like every document route here.
export async function GET(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) return new NextResponse("Forbidden", { status: 403 });
  const out = await buildAuditWorkbook(id);
  if (!out) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(out.bytes, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${out.filename}"`,
    },
  });
}
