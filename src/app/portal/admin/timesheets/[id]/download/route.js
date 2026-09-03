import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { renderSheet } from "@/lib/timesheet/render-sheet";
import { premiumStanding } from "@/lib/timesheet/premium-split";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { loadBreakReasons, loadTimeOffFor } from "@/lib/timesheet/load-break-reasons";

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
      restsByDate: true,
      // loadBreakReasons scopes by it. Left out it falls back to MLS, and a
      // day program sheet in this bundle prints the OTHER payroll's reasons
      // for anybody who works both.
      program: true,
      timesheets: {
        // an unsigned sheet is rendered from `data`, so it needs no stored
        // file to be includable - renderOk is the signal that it can be built.
        where: includeUnsigned
          ? {
              OR: [
                { renderOk: true },
                { signedPdfUrl: { not: null } },
                { approvedPdfUrl: { not: null } },
              ],
            }
          : { OR: [{ signedPdfUrl: { not: null } }, { approvedPdfUrl: { not: null } }] },
        orderBy: { sourceName: "asc" },
        select: {
          id: true, data: true, signedPdfUrl: true, approvedPdfUrl: true, sourceName: true,
          dueAt: true,
          // the break reasons hang off it - see the note in RENDER_SELECT.
          // Without it `loadBreakReasons` returns [] and every sheet in the
          // merged PDF quietly loses its Comments lines.
          userId: true,
          // the answers, because an unsigned sheet is rendered here on the
          // SAME basis the employee signs on. Merging the ignoring-assumptions
          // copy into a batch export would hand payroll a different figure from
          // the one on the document that person actually attested to.
          corrections: {
            where: { kind: { startsWith: "q_" }, status: { not: "open" } },
            select: { kind: true, date: true, status: true },
          },
        },
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
      // always the best copy we hold: approved beats signed beats a fresh
      // render of the unsigned sheet
      const url = ts.approvedPdfUrl || ts.signedPdfUrl;
      let bytes;
      if (url) {
        const res = await fetch(url);
        if (!res.ok) continue;
        bytes = await res.arrayBuffer();
      } else {
        const standing = premiumStanding(ts.data?.days || [], ts.corrections);
        const rendered = await renderSheet({ ...ts, batch }, {
          basis: "corrected",
          breakReasons: await loadBreakReasons({ ...ts, batch }),
          timeOff: await loadTimeOffFor({ ...ts, batch }),
          confirmed: standing.confirmed,
          answers: standing.answers,
          pastDue: !!ts.dueAt && ts.dueAt.getTime() < Date.now(),
        });
        if (!rendered) continue;
        bytes = rendered.bytes;
      }
      const src = await PDFDocument.load(bytes);
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
