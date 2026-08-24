import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAttestationAccess,
  fetchStored,
  formFileName,
} from "@/lib/client-attestations/serve";

// ONE CLIENT'S FORM, to print and take to them - and once a signature is on
// file, the SIGNED copy, because from then on that is the document. Served
// inline so it opens in a viewer rather than landing in Downloads unread.
export async function GET(req, { params }) {
  const { deny } = await requireAttestationAccess();
  if (deny) return deny;

  const { id, attestationId } = await params;
  const row = await prisma.clientAttestation.findFirst({
    where: { id: attestationId, batchId: id },
    select: {
      clientName: true,
      formUrl: true,
      signedPdfUrl: true,
      clientSignedPdfUrl: true,
      batch: { select: { monthLabel: true } },
    },
  });
  if (!row) return new NextResponse("Not found", { status: 404 });
  if (!row.formUrl) {
    return new NextResponse(
      "This client's form did not render, so there is nothing stored to hand back. Re-upload the month to build it again.",
      { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  // signed beats client-half beats blank: the most complete version on file
  const buf = await fetchStored(row.signedPdfUrl || row.clientSignedPdfUrl || row.formUrl);
  if (!buf) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${formFileName(row.clientName, row.batch.monthLabel)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
