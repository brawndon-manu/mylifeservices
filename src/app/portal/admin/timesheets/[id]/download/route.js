import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { renderSheet, RENDER_SELECT_SHEET } from "@/lib/timesheet/render-sheet";
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
          // THE RENDERER'S OWN CONTRACT, not a copy of it - same correction as
          // the zip beside it (Mánu 2026-09-09). The copy here asked only for
          // answered `q_` corrections, so a reported sheet was merged into this
          // bundle as the ordinary one-page document with no sign it was
          // disputed. Minus the batch, which this query holds and passes in.
          ...RENDER_SELECT_SHEET,
          signedPdfUrl: true,
          approvedPdfUrl: true,
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
        // EXACTLY THE DOCUMENT THE EMPLOYEE SIGNS (Mánu 2026-09-09), the same
        // correction as the zip beside it and for the same reason: `corrected`
        // stamps "AS CORRECTED" and "Not the copy sent for signature" and prints
        // a different figure, so merging it handed payroll a bundle of pages
        // marked unsignable. `projected` is the copy that is emailed, signed and
        // paid - see render-sheet.js - and it takes no
        // `confirmed`/`answers`/`pastDue`, per /t/[token]/pdf.
        const rendered = await renderSheet({ ...ts, batch }, {
          basis: "projected",
          breakReasons: await loadBreakReasons({ ...ts, batch }),
          timeOff: await loadTimeOffFor({ ...ts, batch }),
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
