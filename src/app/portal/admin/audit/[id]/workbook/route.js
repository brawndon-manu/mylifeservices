import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { isAdminUp } from "@/lib/roles";
import { logFileOpen, logFileDenied } from "@/lib/file-log";
import { accessLabel, periodRange } from "@/lib/access-labels";
import { buildAuditWorkbook } from "@/lib/timesheet/audit-workbook";

// The whole audit as one styled workbook - same gate as the audit page,
// generated fresh on request like every document route here.
export async function GET(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) {
    await logFileDenied({ user, pathname: `audit/${id}/workbook`, req, label: "Audit workbook" });
    return new NextResponse("Forbidden", { status: 403 });
  }
  const out = await buildAuditWorkbook(id);
  if (!out) return new NextResponse("Not found", { status: 404 });
  const batch = await prisma.timesheetBatch.findUnique({ where: { id }, select: { periodFrom: true, periodTo: true } });
  await logFileOpen({
    user,
    pathname: `audit/${id}/workbook`,
    req,
    label: accessLabel("Audit workbook", batch && periodRange(batch.periodFrom, batch.periodTo)),
  });
  return new NextResponse(out.bytes, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${out.filename}"`,
    },
  });
}
