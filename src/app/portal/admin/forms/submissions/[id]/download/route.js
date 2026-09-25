import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canViewFormRecords } from "@/lib/roles";
import { logFileOpen, logFileDenied } from "@/lib/file-log";
import { describeStoredFile } from "@/lib/file-describe";
import { parseBlobUrl } from "@/lib/blob-paths";
import { fetchBlob } from "@/lib/blob";

// gated form-submission download, same pattern as the résumé route: re-check
// the role and stream the file back ourselves instead of ever handing a
// stored url to the browser. every open and refusal is written down.
export async function GET(req, { params }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!canViewFormRecords(user?.role)) {
    await logFileDenied({ user, pathname: `form-submissions/${id}`, req, label: "Signed form" });
    return new NextResponse("Forbidden", { status: 403 });
  }

  const submission = await prisma.formSubmission.findUnique({
    where: { id },
    select: { pdfUrl: true, pdfName: true },
  });
  if (!submission?.pdfUrl) return new NextResponse("Not found", { status: 404 });

  const res = await fetchBlob(submission.pdfUrl);
  if (!res.ok) return new NextResponse("Not found", { status: 404 });

  const buf = await res.arrayBuffer();
  const pathname = parseBlobUrl(submission.pdfUrl)?.pathname || `form-submissions/${id}`;
  await logFileOpen({ user, pathname, req, label: await describeStoredFile(pathname) });
  const safeName = (submission.pdfName || "form.pdf").replace(/[^\w.\- ]/g, "_");
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
