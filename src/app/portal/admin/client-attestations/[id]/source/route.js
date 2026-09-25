import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAttestationAccess, fetchStored } from "@/lib/client-attestations/serve";
import { logFileOpen, logFileDenied } from "@/lib/file-log";
import { accessLabel, clientInitials } from "@/lib/access-labels";
import { parseBlobUrl } from "@/lib/blob-paths";

// the QSP export the month was cut from, kept for audit: every form traces back
// to a page of this document. every client is on it, so it is the office's.
export async function GET(req, { params }) {
  const { id } = await params;
  const { user, deny } = await requireAttestationAccess({ wholeMonth: true });
  if (deny) {
    await logFileDenied({ user, pathname: `client-attestations/${id}/source`, req, label: "QSP client schedules" });
    return deny;
  }

  const batch = await prisma.clientAttestationBatch.findUnique({
    where: { id },
    select: { sourceUrl: true, sourceName: true, monthLabel: true },
  });
  if (!batch?.sourceUrl) return new NextResponse("Not found", { status: 404 });

  const buf = await fetchStored(batch.sourceUrl);
  if (!buf) return new NextResponse("Not found", { status: 404 });
  await logFileOpen({
    user,
    pathname: parseBlobUrl(batch.sourceUrl)?.pathname || `client-attestations/${id}/source`,
    req,
    label: accessLabel("QSP client schedules", batch.monthLabel),
  });

  const safe = (batch.sourceName || "client-schedules")
    .replace(/[^\w.\- ]/g, "_")
    .replace(/\.pdf$/i, "");
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safe}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
