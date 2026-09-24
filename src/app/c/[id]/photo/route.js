import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readBlob } from "@/lib/blob";

// THE PHOTO ON A PUBLIC CONTACT CARD. profile pictures live in the private
// store, whose addresses open for nobody, and this card answers with no
// session - so the card links here and this reads the one picture the card
// already shows. same rule as the card itself: an active account, by the id in
// the link, and nothing else about them.
export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const { id } = await params;
  const p = await prisma.user.findFirst({
    where: { id, deactivatedAt: null },
    select: { image: true },
  });
  if (!p?.image) return new NextResponse("Not found", { status: 404 });

  const file = await readBlob(p.image);
  if (!file) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(file.bytes, {
    headers: {
      "Content-Type": file.contentType || "image/jpeg",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-cache",
    },
  });
}
