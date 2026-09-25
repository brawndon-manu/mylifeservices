import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canViewFormRecords } from "@/lib/roles";
import { logFileOpen, logFileDenied } from "@/lib/file-log";
import { accessLabel } from "@/lib/access-labels";
import { fetchStored } from "@/lib/client-attestations/serve";
import { buildZip, safeEntryName } from "@/lib/zip";
import { fileDate } from "../../../../acknowledgments/audit";

// one file per person, named for them, so a single certificate can be sent on
// its own without splitting the printed batch.
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!canViewFormRecords(user?.role)) {
    await logFileDenied({ user, pathname: `certificates/batch/${id}/zip`, req, label: "Certificates · zip" });
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

  const files = [];
  const seen = new Map();
  for (const c of batch.certificates) {
    const bytes = await fetchStored(c.pdfUrl);
    if (!bytes) continue;
    // two people can share a name; a zip cannot share an entry
    const base = safeEntryName(c.printedName, "certificate");
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    files.push({ name: n === 1 ? `${base}.pdf` : `${base} (${n}).pdf`, data: bytes });
  }
  if (!files.length) return new NextResponse("Nothing to send", { status: 404 });
  await logFileOpen({ user, pathname: `certificates/batch/${id}/zip`, req, label: accessLabel("Certificates", batch.title, "zip") });

  const slug = batch.title.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "certificates";
  return new NextResponse(buildZip(files), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slug}-${fileDate()}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
