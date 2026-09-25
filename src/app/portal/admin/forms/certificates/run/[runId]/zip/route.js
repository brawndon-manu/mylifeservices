import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canViewFormRecords } from "@/lib/roles";
import { logFileOpen, logFileDenied } from "@/lib/file-log";
import { accessLabel } from "@/lib/access-labels";
import { fetchStored } from "@/lib/client-attestations/serve";
import { buildZip, safeEntryName } from "@/lib/zip";
import { fileDate } from "../../../../../acknowledgments/audit";

// EVERY CERTIFICATE MADE IN ONE GO, in one download - Mánu 2026-09-13, on six
// certificates for eighteen people: "i dont want to enter the names and dates 6
// different times". Having to fetch six zips afterwards would put the same
// repetition back at the other end.
//
// A folder per certificate, a file per person inside it, so 108 files arrive
// sorted rather than in one heap.
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const { runId } = await params;
  const user = await getCurrentUser();
  if (!canViewFormRecords(user?.role)) {
    await logFileDenied({ user, pathname: `certificates/run/${runId}/zip`, req, label: "Certificates · zip" });
    return new NextResponse("Not found", { status: 404 });
  }

  const batches = await prisma.certificateBatch.findMany({
    where: { runId },
    orderBy: { createdAt: "asc" },
    select: {
      title: true,
      certificates: { orderBy: { printedName: "asc" }, select: { pdfUrl: true, printedName: true } },
    },
  });
  if (!batches.length) return new NextResponse("Not found", { status: 404 });

  const files = [];
  for (const b of batches) {
    const folder = safeEntryName(b.title, "certificates");
    const seen = new Map();
    for (const c of b.certificates) {
      const bytes = await fetchStored(c.pdfUrl);
      if (!bytes) continue;
      // two people can share a name; a zip cannot share an entry
      const base = safeEntryName(c.printedName, "certificate");
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      files.push({ name: `${folder}/${n === 1 ? base : `${base} (${n})`}.pdf`, data: bytes });
    }
  }
  if (!files.length) return new NextResponse("Nothing to send", { status: 404 });
  await logFileOpen({
    user,
    pathname: `certificates/run/${runId}/zip`,
    req,
    label: accessLabel("Certificates", batches.map((b) => b.title).join(", "), "zip"),
  });

  return new NextResponse(buildZip(files), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="certificates-${fileDate()}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
