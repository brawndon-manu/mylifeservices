import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canViewFormRecords } from "@/lib/roles";
import { logFileOpen, logFileDenied } from "@/lib/file-log";
import { accessLabel } from "@/lib/access-labels";
import { fetchStored } from "@/lib/client-attestations/serve";
import { mergeCertificates } from "@/lib/certificates/render";
import { fileDate } from "../../../../acknowledgments/audit";

// every certificate in the run as one file, a page each, ready for a printer.
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!canViewFormRecords(user?.role)) {
    await logFileDenied({ user, pathname: `certificates/batch/${id}/pdf`, req, label: "Certificates · one PDF" });
    return new NextResponse("Not found", { status: 404 });
  }

  const batch = await prisma.certificateBatch.findUnique({
    where: { id },
    select: {
      title: true,
      certificates: { orderBy: { printedName: "asc" }, select: { pdfUrl: true, printedName: true } },
    },
  });
  if (!batch) return new NextResponse("Not found", { status: 404 });

  const parts = [];
  for (const c of batch.certificates) {
    const bytes = await fetchStored(c.pdfUrl);
    // a certificate whose file will not fetch is left out rather than faked -
    // the record page still lists it, so the gap is visible there
    if (bytes) parts.push(bytes);
  }
  if (!parts.length) return new NextResponse("Nothing to print", { status: 404 });

  const merged = await mergeCertificates(parts);
  await logFileOpen({ user, pathname: `certificates/batch/${id}/pdf`, req, label: accessLabel("Certificates", batch.title, "one PDF") });
  const slug = batch.title.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "certificates";
  return new NextResponse(Buffer.from(merged), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${slug}-${fileDate()}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
