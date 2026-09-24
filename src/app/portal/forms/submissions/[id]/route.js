import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canViewFormRecords } from "@/lib/roles";
import { fetchBlob } from "@/lib/blob";
import { parseBlobUrl } from "@/lib/blob-paths";
import { logFileOpen } from "@/lib/file-log";

// ONE STORED FORM, FOR THE PEOPLE IT WAS SENT TO. a form about a person served
// (the incident report) is emailed as a link to here instead of as a pdf. it
// opens for the people the email went to, the person who sent it, and the
// form-records roles - after signing in - and every open is written down.
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
    select: { pdfUrl: true, pdfName: true, sentTo: true, userId: true, form: { select: { title: true } } },
  });
  if (!sub) return new NextResponse("Not found", { status: 404 });

  const mine = String(user.email || "").toLowerCase();
  const allowed =
    canViewFormRecords(user.role) ||
    (!!sub.userId && sub.userId === user.id) ||
    (sub.sentTo || []).some((e) => String(e).toLowerCase() === mine);
  const pathname = parseBlobUrl(sub.pdfUrl)?.pathname || `form-submissions/${id}`;
  if (!allowed) {
    await logFileOpen({ user, pathname, req, action: "denied" });
    return new NextResponse("Not found", { status: 404 });
  }

  const res = await fetchBlob(sub.pdfUrl);
  if (!res.ok) return new NextResponse("Not found", { status: 404 });
  await logFileOpen({ user, pathname, req });

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
