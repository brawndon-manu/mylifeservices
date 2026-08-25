import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canViewFormRecords } from "@/lib/roles";

// gated form-submission download, same pattern as the résumé route: the PDF
// lives in Blob under an unguessable key, but Blob is a PUBLIC store - so we
// re-check the role here and stream the file back ourselves instead of ever
// handing the raw Blob url to the browser.
export async function GET(_req, { params }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!canViewFormRecords(user?.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const submission = await prisma.formSubmission.findUnique({
    where: { id },
    select: { pdfUrl: true, pdfName: true },
  });
  if (!submission?.pdfUrl) return new NextResponse("Not found", { status: 404 });

  const res = await fetch(submission.pdfUrl);
  if (!res.ok) return new NextResponse("Not found", { status: 404 });

  const buf = await res.arrayBuffer();
  const safeName = (submission.pdfName || "form.pdf").replace(/[^\w.\- ]/g, "_");
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
