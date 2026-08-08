import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { renderSheet, RENDER_SELECT } from "@/lib/timesheet/render-sheet";

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
    select: { ...RENDER_SELECT, signedPdfUrl: true, approvedPdfUrl: true },
  });
  if (!ts) return new NextResponse("Not found", { status: 404 });

  // A SIGNED or APPROVED copy is a stored artefact - it carries somebody's
  // actual signature and cannot be regenerated. The unsigned sheet is built
  // from `data` on demand, so there is no stale blob to go looking for.
  const wantOriginal = new URL(req.url).searchParams.get("original") === "1";
  const storedUrl = wantOriginal ? null : ts.approvedPdfUrl || ts.signedPdfUrl;

  let buf;
  if (storedUrl) {
    const res = await fetch(storedUrl);
    if (!res.ok) return new NextResponse("Not found", { status: 404 });
    buf = await res.arrayBuffer();
  } else {
    const rendered = await renderSheet(ts);
    if (!rendered) return new NextResponse("Not found", { status: 404 });
    buf = rendered.bytes;
  }

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
