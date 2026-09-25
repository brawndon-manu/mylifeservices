import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { fetchBlob } from "@/lib/blob";
import { parseBlobUrl } from "@/lib/blob-paths";
import { logFileOpen } from "@/lib/file-log";
import { submissionLabel } from "@/lib/file-describe";
import { submissionOpenTo } from "@/lib/submission-access";

// THE REPORT ITSELF, behind the page its email links to. the same people as
// that page (submissionOpenTo), after signing in, and every open and every
// refusal is written down.
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    const back = new URL(req.url);
    return NextResponse.redirect(new URL(`/login?callbackUrl=${encodeURIComponent(back.pathname)}`, req.url));
  }

  const sub = await prisma.formSubmission.findUnique({
    where: { id },
    select: {
      pdfUrl: true,
      pdfName: true,
      sentTo: true,
      userId: true,
      createdAt: true,
      submitterName: true,
      user: { select: { name: true, preferredFirstName: true, preferredLastName: true, email: true } },
      form: { select: { title: true } },
    },
  });
  if (!sub) return new NextResponse("Not found", { status: 404 });

  const pathname = parseBlobUrl(sub.pdfUrl)?.pathname || `form-submissions/${id}`;
  const label = submissionLabel(sub);
  if (!submissionOpenTo(user, sub)) {
    await logFileOpen({ user, pathname, req, action: "denied", label });
    return new NextResponse("Not found", { status: 404 });
  }

  const res = await fetchBlob(sub.pdfUrl);
  if (!res.ok) return new NextResponse("Not found", { status: 404 });
  await logFileOpen({ user, pathname, req, label });

  const name = (sub.pdfName || `${sub.form?.title || "form"}.pdf`).replace(/[^\w.\- ]/g, "_");
  return new NextResponse(await res.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
