import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readStoredPdf } from "@/lib/stored-file";

// A BLANK TEMPLATE, for the pages that answer with no session: the /f share
// link, and the /a sign and attest links from an announcement email. those
// hand this path to the filler instead of the file's own address, because an
// uploaded template sits in the private store and its address opens for nobody.
//
// open forms only. a restricted form (minRole) is never served here - it has
// its own route inside the portal that re-checks the role - so this answers
// exactly what a share link already hands to anyone who has one: an empty form.
export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const { id } = await params;
  const form = await prisma.form.findUnique({
    where: { id },
    select: { title: true, fileUrl: true, minRole: true },
  });
  if (!form || form.minRole) return new NextResponse("Not found", { status: 404 });

  const bytes = await readStoredPdf(form.fileUrl);
  if (!bytes) return new NextResponse("The file could not be read", { status: 502 });

  const safeName = (form.title || "form").replace(/[^\w\s.-]/g, "").trim() || "form";
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeName}.pdf"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-cache",
    },
  });
}
