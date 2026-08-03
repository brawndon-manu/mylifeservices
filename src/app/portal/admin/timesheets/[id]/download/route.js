import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";

// a whole batch merged into one PDF for re-uploading to QSP. gated + streamed
// like the single-sheet route.
//
// ?all=1 takes every corrected sheet whether or not it has come back signed,
// which is how you read the batch over before anyone is emailed. without it you
// get only what has been signed, which is what you want at filing time.
export async function GET(req, { params }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const includeUnsigned = new URL(req.url).searchParams.get("all") === "1";

  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    select: {
      periodFrom: true,
      periodTo: true,
      timesheets: {
        where: includeUnsigned
          ? {
              OR: [
                { pdfUrl: { not: null } },
                { signedPdfUrl: { not: null } },
                { approvedPdfUrl: { not: null } },
              ],
            }
          : { OR: [{ signedPdfUrl: { not: null } }, { approvedPdfUrl: { not: null } }] },
        orderBy: { sourceName: "asc" },
        select: { pdfUrl: true, signedPdfUrl: true, approvedPdfUrl: true, sourceName: true },
      },
    },
  });
  if (!batch) return new NextResponse("Not found", { status: 404 });
  if (!batch.timesheets.length) {
    return new NextResponse(
      includeUnsigned ? "This batch has no generated sheets" : "Nothing signed yet",
      { status: 404 },
    );
  }

  const merged = await PDFDocument.create();
  let added = 0;
  for (const ts of batch.timesheets) {
    try {
      // always the best copy we hold: approved beats signed beats the blank
      const res = await fetch(ts.approvedPdfUrl || ts.signedPdfUrl || ts.pdfUrl);
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
  if (!added) return new NextResponse("Couldn't read any of the files", { status: 500 });

  const bytes = await merged.save();
  const name = `timesheets-${(batch.periodFrom || "").replace(/\//g, "-")}-${
    includeUnsigned ? "corrected" : "signed"
  }.pdf`;
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
