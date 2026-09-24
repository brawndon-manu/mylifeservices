import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { fetchBlob } from "@/lib/blob";
import { parseBlobUrl } from "@/lib/blob-paths";
import { logFileOpen } from "@/lib/file-log";
import { loadAmendment, withNames, buildAmendmentDocument } from "@/lib/clock-amendment/document";

// ONE OF MY DOCUMENTS - a document the signed-in person signed or holds, and
// nobody else's. every kind answers the same question the same way: is this
// row theirs? not theirs and not there look the same, and every open and
// every refusal is written down.
export const dynamic = "force-dynamic";

// kind -> how to find the row, who owns it, and which stored copy to hand over
const KINDS = {
  timesheet: async (id) => {
    const t = await prisma.timesheet.findUnique({ where: { id }, select: { userId: true, signedPdfUrl: true, approvedPdfUrl: true } });
    return t && { owner: t.userId, url: t.approvedPdfUrl || t.signedPdfUrl };
  },
  "day-program": async (id) => {
    const t = await prisma.dayProgramSheet.findUnique({ where: { id }, select: { userId: true, signedPdfUrl: true, approvedPdfUrl: true } });
    return t && { owner: t.userId, url: t.approvedPdfUrl || t.signedPdfUrl };
  },
  addendum: async (id) => {
    const a = await prisma.clockAmendment.findUnique({ where: { id }, select: { staffId: true, approvedAt: true, pdfUrl: true } });
    return a && a.approvedAt && { owner: a.staffId, url: a.pdfUrl, rebuild: true };
  },
  form: async (id) => {
    const f = await prisma.formSubmission.findUnique({ where: { id }, select: { userId: true, pdfUrl: true } });
    return f && { owner: f.userId, url: f.pdfUrl };
  },
  certificate: async (id) => {
    const c = await prisma.certificate.findUnique({ where: { id }, select: { userId: true, pdfUrl: true } });
    return c && { owner: c.userId, url: c.pdfUrl };
  },
};

export async function GET(req, { params }) {
  const { kind, id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    const back = new URL(req.url);
    return NextResponse.redirect(new URL(`/login?callbackUrl=${encodeURIComponent(back.pathname)}`, req.url));
  }
  const find = KINDS[kind];
  if (!find) return new NextResponse("Not found", { status: 404 });

  const doc = await find(id);
  const pathname = parseBlobUrl(doc?.url)?.pathname || `${kind}/${id}`;
  if (!doc || !doc.owner || doc.owner !== user.id) {
    if (doc) await logFileOpen({ user, pathname, req, action: "denied" });
    return new NextResponse("Not found", { status: 404 });
  }

  let bytes = null;
  if (doc.url) {
    const res = await fetchBlob(doc.url);
    if (res.ok) bytes = await res.arrayBuffer();
  }
  // an approved addendum whose stored copy is missing is drawn again from the
  // record, the same fallback the office's own route uses
  if (!bytes && doc.rebuild) {
    const a = await loadAmendment(id);
    if (a) bytes = (await buildAmendmentDocument(withNames(a))).bytes;
  }
  if (!bytes) return new NextResponse("Not found", { status: 404 });

  await logFileOpen({ user, pathname, req });
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${kind}.pdf"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
