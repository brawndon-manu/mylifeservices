import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAttestationToken } from "@/lib/client-attestations/token";
import { formFileName } from "@/lib/client-attestations/serve";

// the form behind the signing page. The token is the credential; Blob is a
// public store, so the stored url never reaches the browser - same rule as
// every other stored document here.
export async function GET(req, { params }) {
  const { token } = await params;
  const parsed = verifyAttestationToken(token);
  if (!parsed) return new NextResponse("Not found", { status: 404 });

  const row = await prisma.clientAttestation.findUnique({
    where: { id: parsed.attestationId },
    select: {
      clientName: true,
      formUrl: true,
      clientSignedPdfUrl: true,
      batch: { select: { monthLabel: true } },
    },
  });
  if (!row?.formUrl) return new NextResponse("Not found", { status: 404 });

  // once the client's half is filed, every link renders from that copy - the
  // supervisor finishes the same document the client signed, not a fresh blank
  const res = await fetch(row.clientSignedPdfUrl || row.formUrl);
  if (!res.ok) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(await res.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${formFileName(row.clientName, row.batch.monthLabel)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
