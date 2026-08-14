import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTimesheetToken } from "@/lib/timesheet-token";
import { renderSheet, RENDER_SELECT } from "@/lib/timesheet/render-sheet";
import { loadBreakReasons } from "@/lib/timesheet/load-break-reasons";

// serve one employee their own timesheet PDF, authorised purely by the signed
// token in the url. the token only ever unlocks this single document.
//
// A signed copy is stored and served as-is - it carries their signature. The
// unsigned sheet is rendered from `data` on request, so what they open is
// always the current figures rather than a snapshot taken at upload. That is
// the point: they are about to attest to it.
//
// THIS IS THE `projected` COPY, AND IT HAS TO BE THE ONE THE PAGE IS QUOTING.
//
// It was `corrected` from 2026-08-09 late, and that was right then: the page
// said a break nobody recorded was assumed taken and charged nothing, so a
// document charging all of them would have contradicted it above a signature.
//
// THE FLIP INVERTED IT ON 2026-08-11 and left this route pointing at the wrong
// one. Aranda's page reads "Break penalty pay included 19.00" while the sheet
// under it printed "AS CORRECTED - not the copy sent for signature" and 2.00.
// Same defect as the original, other way round, and worse: she would have
// signed a document 17 hours short of what she is owed. Found by opening the
// page - the build passed and 318 tests passed with this in place.
//
// `corrected` applies every policy assumption except the ones somebody has
// settled, which is an ADMIN reading of an open question. The employee signs
// what payroll pays.
export async function GET(_req, { params }) {
  const { token } = await params;
  const id = verifyTimesheetToken(token);
  if (!id) return new NextResponse("Not found", { status: 404 });

  const ts = await prisma.timesheet.findUnique({
    where: { id },
    select: {
      ...RENDER_SELECT,
      signedPdfUrl: true,
    },
  });
  if (!ts) return new NextResponse("Not found", { status: 404 });

  let buf;
  if (ts.signedPdfUrl) {
    const res = await fetch(ts.signedPdfUrl);
    if (!res.ok) return new NextResponse("Not found", { status: 404 });
    buf = await res.arrayBuffer();
  } else {
    // no `confirmed`/`answers`/`pastDue`: the projected copy is the stored days
    // exactly as they are. Answers already reach it, because accepting one
    // rebuilds the sheet - and a deadline going by no longer moves anybody's
    // figure, which is the point of the reversal.
    const rendered = await renderSheet(ts, {
      basis: "projected",
      breakReasons: await loadBreakReasons(ts),
    });
    if (!rendered) return new NextResponse("Not found", { status: 404 });
    buf = rendered.bytes;
  }

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="timesheet.pdf"',
      "Cache-Control": "private, no-store",
    },
  });
}
