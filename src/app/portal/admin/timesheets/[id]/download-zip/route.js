import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { buildZip, safeEntryName } from "@/lib/zip";

// every completed timesheet in a batch as separate PDFs in one zip - the
// counterpart to the merged download, for when payroll needs them filed
// per person rather than as one document.
//
// takes the most complete version of each: approved > employee-signed > blank.
export async function GET(req, { params }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    select: {
      periodFrom: true,
      timesheets: {
        orderBy: { sourceName: "asc" },
        select: {
          sourceName: true,
          pdfUrl: true,
          signedPdfUrl: true,
          approvedPdfUrl: true,
          signedAt: true,
        },
      },
    },
  });
  if (!batch) return new NextResponse("Not found", { status: 404 });

  // ?all=1 includes unsigned sheets too; by default only what's come back
  const includeUnsigned = new URL(req.url).searchParams.get("all") === "1";
  const wanted = batch.timesheets.filter((t) =>
    includeUnsigned ? t.approvedPdfUrl || t.signedPdfUrl || t.pdfUrl : t.signedPdfUrl || t.approvedPdfUrl,
  );
  if (!wanted.length) {
    return new NextResponse("Nothing to download yet", { status: 404 });
  }

  const files = [];
  const seen = new Map();
  for (const t of wanted) {
    const url = t.approvedPdfUrl || t.signedPdfUrl || t.pdfUrl;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = Buffer.from(await res.arrayBuffer());

      // two people can share a printed name - never let one silently overwrite
      // the other inside the archive.
      let base = safeEntryName(t.sourceName, "timesheet");
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      if (n > 1) base = `${base} (${n})`;
      const suffix = t.approvedPdfUrl ? " - approved" : t.signedPdfUrl ? " - signed" : "";

      files.push({ name: `${base}${suffix}.pdf`, data });
    } catch (e) {
      // one unreadable file shouldn't sink the whole export
      console.error(`zip skipped ${t.sourceName}:`, e);
    }
  }
  if (!files.length) return new NextResponse("Couldn't read any files", { status: 500 });

  const zip = buildZip(files);
  const name = `timesheets-${(batch.periodFrom || "").replace(/\//g, "-")}.zip`;
  return new NextResponse(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
