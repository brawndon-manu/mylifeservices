import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildZip, safeEntryName } from "@/lib/zip";
import {
  requireAttestationAccess,
  fetchStored,
  formFileName,
} from "@/lib/client-attestations/serve";

// THE WHOLE MONTH AS ONE ZIP, one PDF per client, so a supervisor round can be
// printed in a single go.
//
// Takes the SIGNED copy where there is one, so a re-download after signatures
// have come back is the filing copy rather than a folder of blanks.
export async function GET(req, { params }) {
  const { deny } = await requireAttestationAccess();
  if (deny) return deny;

  const { id } = await params;
  const batch = await prisma.clientAttestationBatch.findUnique({
    where: { id },
    select: {
      monthLabel: true,
      attestations: {
        orderBy: { clientName: "asc" },
        select: { clientName: true, formUrl: true, signedPdfUrl: true },
      },
    },
  });
  if (!batch) return new NextResponse("Not found", { status: 404 });

  const files = [];
  for (const a of batch.attestations) {
    const buf = await fetchStored(a.signedPdfUrl || a.formUrl);
    if (!buf) continue;
    files.push({
      name: safeEntryName(formFileName(a.clientName, batch.monthLabel), "form.pdf"),
      data: buf,
    });
  }
  if (!files.length) {
    return new NextResponse("No forms are stored for this month.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const zip = buildZip(files);
  const safe = batch.monthLabel.replace(/[^\w.\- ]/g, "_");
  return new NextResponse(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="Client attestations - ${safe}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
