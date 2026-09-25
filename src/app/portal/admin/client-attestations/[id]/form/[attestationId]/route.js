import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAttestationAccess,
  fetchStored,
  formFileName,
  isFieldSupervisor,
  OWNER_SELECT,
} from "@/lib/client-attestations/serve";
import { attestationIsTheirs } from "@/lib/client-attestations/routing";
import { logFileOpen, logFileDenied } from "@/lib/file-log";
import { accessLabel, clientInitials } from "@/lib/access-labels";
import { parseBlobUrl } from "@/lib/blob-paths";

// ONE CLIENT'S FORM, to print and take to them - and once a signature is on
// file, the SIGNED copy, because from then on that is the document. Served
// inline so it opens in a viewer rather than landing in Downloads unread.
//
// a field supervisor opens the forms assigned to them and no others; anyone
// else's looks like a form that isn't there.
export async function GET(req, { params }) {
  const { id, attestationId } = await params;
  const { user, office, deny } = await requireAttestationAccess();
  if (deny) {
    await logFileDenied({ user, pathname: `client-attestations/${attestationId}`, req, label: "Client attestation" });
    return deny;
  }

  const row = await prisma.clientAttestation.findFirst({
    where: { id: attestationId, batchId: id },
    select: {
      clientName: true,
      formUrl: true,
      signedPdfUrl: true,
      clientSignedPdfUrl: true,
      batch: { select: { monthLabel: true } },
      ...OWNER_SELECT,
    },
  });
  if (!row) return new NextResponse("Not found", { status: 404 });
  const label = accessLabel(
    row.signedPdfUrl ? "Signed client attestation" : "Client attestation",
    clientInitials(row.clientName),
    row.batch.monthLabel,
  );
  if (!office && !attestationIsTheirs(row, user.id, isFieldSupervisor)) {
    await logFileDenied({ user, pathname: `client-attestations/${attestationId}`, req, label });
    return new NextResponse("Not found", { status: 404 });
  }
  if (!row.formUrl) {
    return new NextResponse(
      "This client's form did not render, so there is nothing stored to hand back. Re-upload the month to build it again.",
      { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  // signed beats client-half beats blank: the most complete version on file
  const url = row.signedPdfUrl || row.clientSignedPdfUrl || row.formUrl;
  const buf = await fetchStored(url);
  if (!buf) return new NextResponse("Not found", { status: 404 });
  await logFileOpen({ user, pathname: parseBlobUrl(url)?.pathname || `client-attestations/${attestationId}`, req, label });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${formFileName(row.clientName, row.batch.monthLabel)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
