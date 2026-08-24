import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAttestationAccess, fetchStored } from "@/lib/client-attestations/serve";

// the QSP export the month was cut from, kept for audit: every form traces back
// to a page of this document.
export async function GET(req, { params }) {
  const { deny } = await requireAttestationAccess();
  if (deny) return deny;

  const { id } = await params;
  const batch = await prisma.clientAttestationBatch.findUnique({
    where: { id },
    select: { sourceUrl: true, sourceName: true },
  });
  if (!batch?.sourceUrl) return new NextResponse("Not found", { status: 404 });

  const buf = await fetchStored(batch.sourceUrl);
  if (!buf) return new NextResponse("Not found", { status: 404 });

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
