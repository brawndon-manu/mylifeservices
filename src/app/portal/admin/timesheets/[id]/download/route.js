import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";

// every signed timesheet in a batch, merged into one PDF for re-uploading to
// QSP. gated + streamed like the single-sheet route.
export async function GET(_req, { params }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    select: {
      periodFrom: true,
      periodTo: true,
      timesheets: {
        where: { signedPdfUrl: { not: null } },
        orderBy: { sourceName: "asc" },
        select: { signedPdfUrl: true, sourceName: true },
      },
    },
  });
  if (!batch) return new NextResponse("Not found", { status: 404 });
  if (!batch.timesheets.length) {
    return new NextResponse("Nothing signed yet", { status: 404 });
  }

  const merged = await PDFDocument.create();
  let added = 0;
  for (const ts of batch.timesheets) {
    try {
      const res = await fetch(ts.signedPdfUrl);
      if (!res.ok) continue;
      const src = await PDFDocument.load(await res.arrayBuffer());
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
      added++;
    } catch (e) {
      // one bad file shouldn't sink the whole export - skip it and carry on
      console.error(`merge skipped ${ts.sourceName}:`, e);
    }
  }
  if (!added) return new NextResponse("Couldn't read any signed files", { status: 500 });

  const bytes = await merged.save();
  const name = `timesheets-${(batch.periodFrom || "").replace(/\//g, "-")}-signed.pdf`;
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
