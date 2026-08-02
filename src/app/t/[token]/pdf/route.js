import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTimesheetToken } from "@/lib/timesheet-token";

// serve one employee their own timesheet PDF, authorised purely by the signed
// token in the url. the Blob url stays server-side, and the token only ever
// unlocks this single document.
export async function GET(_req, { params }) {
  const { token } = await params;
  const id = verifyTimesheetToken(token);
  if (!id) return new NextResponse("Not found", { status: 404 });

  const ts = await prisma.timesheet.findUnique({
    where: { id },
    select: { pdfUrl: true, signedPdfUrl: true },
  });
  const url = ts?.signedPdfUrl || ts?.pdfUrl;
  if (!url) return new NextResponse("Not found", { status: 404 });

  const res = await fetch(url);
  if (!res.ok) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(await res.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="timesheet.pdf"',
      "Cache-Control": "private, no-store",
    },
  });
}
