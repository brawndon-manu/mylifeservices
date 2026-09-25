import { attestationLinkOpen } from "@/lib/link-life";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAttestationToken } from "@/lib/client-attestations/token";
import { formFileName } from "@/lib/client-attestations/serve";
import { fetchBlob } from "@/lib/blob";
import { logFileOpen } from "@/lib/file-log";
import { accessLabel, clientInitials } from "@/lib/access-labels";
import { parseBlobUrl } from "@/lib/blob-paths";
import { isFieldSupervisor } from "@/lib/client-attestations/serve";
import { supervisorOf } from "@/lib/client-attestations/routing";

// the form behind the signing page. The token is the credential, and the
// stored url never reaches the browser - same rule as every other stored
// document here. Every open is written down against the person the link was
// cut for; the client's own link has no account behind it.
export async function GET(req, { params }) {
  const { token } = await params;
  const parsed = verifyAttestationToken(token);
  if (!parsed) return new NextResponse("Not found", { status: 404 });
  if (!(await attestationLinkOpen(parsed.attestationId, parsed.audience))) {
    return NextResponse.redirect(new URL("/a/expired", req.url));
  }

  const row = await prisma.clientAttestation.findUnique({
    where: { id: parsed.attestationId },
    select: {
      clientName: true,
      formUrl: true,
      clientSignedPdfUrl: true,
      batch: { select: { monthLabel: true } },
      supervisor: { select: { id: true, email: true, role: true } },
      staffUser: { select: { id: true, email: true, role: true, title: true } },
    },
  });
  if (!row?.formUrl) return new NextResponse("Not found", { status: 404 });

  // once the client's half is filed, every link renders from that copy - the
  // supervisor finishes the same document the client signed, not a fresh blank
  const url = row.clientSignedPdfUrl || row.formUrl;
  const res = await fetchBlob(url);
  if (!res.ok) return new NextResponse("Not found", { status: 404 });

  const holder =
    parsed.audience === "supervisor"
      ? supervisorOf({ supervisor: row.supervisor, staffUser: row.staffUser, isFieldSupervisor }).supervisor
      : parsed.audience === "staff" ? row.staffUser : null;
  await logFileOpen({
    user: holder,
    pathname: parseBlobUrl(url)?.pathname || `client-attestations/${parsed.attestationId}`,
    req,
    // which link it was: the client's, the staff member's or the supervisor's
    via: `${parsed.audience}-link`,
    // this link serves the blank form or the client's half, never the finished copy
    label: accessLabel("Client attestation", clientInitials(row.clientName), row.batch.monthLabel),
  });

  return new NextResponse(await res.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${formFileName(row.clientName, row.batch.monthLabel)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
