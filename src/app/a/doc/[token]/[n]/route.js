import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAckToken } from "@/lib/ack-token";
import { attachmentsOf } from "@/lib/announcement-attachments";
import { readStoredPdf } from "@/lib/stored-file";

// AN ANNOUNCEMENT'S DOCUMENT, opened from the /a/sign or /a/attest link the
// email carried. those pages answer with no session, and an uploaded pdf sits
// in the private store, so the link on the page points here instead: the same
// signed token the page itself checked, then attachment n of that one post.
//
// the token only ever unlocks the documents of the announcement it was minted
// for, and stops working once the post is deleted or the account deactivated -
// the same rules as the page it is linked from.
export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const { token, n } = await params;
  const parsed = verifyAckToken(token);
  const index = Number.parseInt(n, 10);
  if (!parsed || !Number.isInteger(index) || index < 0) {
    return new NextResponse("Not found", { status: 404 });
  }

  const [post, user] = await Promise.all([
    prisma.announcement.findUnique({
      where: { id: parsed.announcementId },
      select: { attachments: true, deletedAt: true },
    }),
    prisma.user.findUnique({ where: { id: parsed.userId }, select: { deactivatedAt: true } }),
  ]);
  if (!post || post.deletedAt || !user || user.deactivatedAt) {
    return new NextResponse("Not found", { status: 404 });
  }

  const doc = attachmentsOf(post)[index];
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const bytes = await readStoredPdf(doc.url);
  if (!bytes) return new NextResponse("The file could not be read", { status: 502 });

  const safeName = (doc.name || "document").replace(/[^\w\s.-]/g, "").trim() || "document";
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeName}.pdf"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
