import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTimesheetToken } from "@/lib/timesheet-token";
import { renderSheet, RENDER_SELECT } from "@/lib/timesheet/render-sheet";

// serve one employee their own timesheet PDF, authorised purely by the signed
// token in the url. the token only ever unlocks this single document.
//
// A signed copy is stored and served as-is - it carries their signature. The
// unsigned sheet is rendered from `data` on request, so what they open is
// always the current figures rather than a snapshot taken at upload. That is
// the point: they are about to attest to it.
export async function GET(_req, { params }) {
  const { token } = await params;
  const id = verifyTimesheetToken(token);
  if (!id) return new NextResponse("Not found", { status: 404 });

  const ts = await prisma.timesheet.findUnique({
    where: { id },
    select: { ...RENDER_SELECT, signedPdfUrl: true },
  });
  if (!ts) return new NextResponse("Not found", { status: 404 });

  let buf;
  if (ts.signedPdfUrl) {
    const res = await fetch(ts.signedPdfUrl);
    if (!res.ok) return new NextResponse("Not found", { status: 404 });
    buf = await res.arrayBuffer();
  } else {
    const rendered = await renderSheet(ts);
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
