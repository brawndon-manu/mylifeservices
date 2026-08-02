import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";

// gated download of one timesheet - the signed copy when it exists, otherwise
// the generated one. same stream-it-ourselves pattern as the résumé route: Blob
// is a public store, so its url never reaches the browser.
export async function GET(req, { params }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const ts = await prisma.timesheet.findUnique({
    where: { id },
    select: { pdfUrl: true, signedPdfUrl: true, approvedPdfUrl: true, sourceName: true, signedAt: true, approvedAt: true },
  });
  if (!ts) return new NextResponse("Not found", { status: 404 });

  const wantOriginal = new URL(req.url).searchParams.get("original") === "1";
  const url = wantOriginal ? ts.pdfUrl : ts.approvedPdfUrl || ts.signedPdfUrl || ts.pdfUrl;
  if (!url) return new NextResponse("Not found", { status: 404 });

  const res = await fetch(url);
  if (!res.ok) return new NextResponse("Not found", { status: 404 });

  const buf = await res.arrayBuffer();
  const safe = (ts.sourceName || "timesheet").replace(/[^\w.\- ]/g, "_");
  const suffix = wantOriginal ? "" : ts.approvedPdfUrl ? "-approved" : ts.signedPdfUrl ? "-signed" : "";
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safe}${suffix}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
