import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import {
  requireAttestationAccess,
  fetchStored,
} from "@/lib/client-attestations/serve";

// THE WHOLE MONTH AS ONE CONTINUOUS PDF, one page per client, for printing the
// round in a single go. The zip next to it is for filing per client; this is
// for a printer.
//
// Same preference as the zip: the signed copy where one exists, then the
// client-signed half, then the blank form - the most complete version on file.
//
// EACH FORM IS FLATTENED BEFORE MERGING. The blank forms carry live AcroForm
// fields, and copyPages moves a page's widgets without the document-level
// AcroForm dictionary they belong to - fields in the merged file would be
// orphans that some viewers draw and some don't. Printed is what this is for,
// so the fields are baked to their current appearance instead.
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
        select: {
          clientName: true,
          formUrl: true,
          clientSignedPdfUrl: true,
          signedPdfUrl: true,
        },
      },
    },
  });
  if (!batch) return new NextResponse("Not found", { status: 404 });

  // THE BLOBS COME DOWN IN PARALLEL LANES. One at a time this was 252 round
  // trips and over a minute of somebody watching a spinner; a dozen at a time
  // it is a few seconds. Results land by index, so the merged file stays in
  // client order.
  const rows = batch.attestations;
  const fetched = new Array(rows.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: 12 }, async () => {
      while (next < rows.length) {
        const mine = next++;
        const a = rows[mine];
        fetched[mine] = await fetchStored(
          a.signedPdfUrl || a.clientSignedPdfUrl || a.formUrl,
        );
      }
    }),
  );

  const merged = await PDFDocument.create();
  const missing = [];
  for (let i = 0; i < rows.length; i++) {
    const a = rows[i];
    const bytes = fetched[i];
    if (!bytes) {
      missing.push(a.clientName);
      continue;
    }
    try {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      try {
        src.getForm().flatten();
      } catch {
        // a copy with no fields left (signed ones) has nothing to flatten
      }
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
    } catch (e) {
      console.error(`attestation merge skipped ${a.clientName}:`, e?.message || e);
      missing.push(a.clientName);
    }
  }

  if (merged.getPageCount() === 0) {
    return new NextResponse("No forms are stored for this month.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  if (missing.length) {
    // named in the log rather than silently shorter - a printed stack that is
    // three clients light should be traceable to which three
    console.warn(`attestation merge missing ${missing.length}: ${missing.join(", ")}`);
  }

  const safe = batch.monthLabel.replace(/[^\w.\- ]/g, "_");
  return new NextResponse(Buffer.from(await merged.save()), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Client attestations - ${safe}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
