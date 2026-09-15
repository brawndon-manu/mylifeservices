// THE ONLY WAY TO A RESTRICTED FORM'S FILE.
//
// Every other form in the library is a static file under public/, which the
// proxy matcher skips because its path has a dot in it - so those come back
// 200 to anybody who types the url, with no session at all. That was fine
// while the library was the handbook and the break policy. It is not fine for
// the field supervisor set, which is monthly supervision checklists carrying
// corrective actions against named staff.
//
// So a restricted form's file is stored on Blob and read back HERE, where the
// role is checked against the same `minRole` the listing uses. The blob address
// is never handed to a browser; `formFileHref` points every restricted form at
// this route instead.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canSeeForm } from "@/lib/form-visibility";
import { readStoredPdf } from "@/lib/stored-file";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  // NOT a redirect to login. This is a document fetch, and an unauthenticated
  // caller should be told no rather than handed an html page where a PDF was
  // expected.
  if (!user) return new NextResponse("Not found", { status: 404 });

  const form = await prisma.form.findUnique({
    where: { id },
    // minRole is the whole point of this route. Left off the select it comes
    // back undefined, canSeeForm reads that as an open form, and the route
    // hands the file to anybody signed in - which is the trap the check flags
    // sprang three times.
    select: { id: true, title: true, fileUrl: true, minRole: true },
  });

  // SAME ANSWER FOR "does not exist" AND "not yours". A 403 on a real id and a
  // 404 on a made-up one tells a staff member which documents exist above them.
  if (!form || !canSeeForm(form, user.role)) {
    return new NextResponse("Not found", { status: 404 });
  }

  // BOTH SHAPES. A restricted form is on Blob, but this route is a valid href
  // for any form, and a library pick is a path into public/ that `fetch`
  // cannot take - which is how this answered 502 the first time it was asked
  // for an ordinary form.
  const bytes = await readStoredPdf(form.fileUrl);
  if (!bytes) return new NextResponse("The file could not be read", { status: 502 });

  const safeName = (form.title || "form").replace(/[^\w\s.-]/g, "").trim() || "form";
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      // inline so it opens in the viewer like every other form does
      "Content-Disposition": `inline; filename="${safeName}.pdf"`,
      // a restricted document must not sit in a shared cache, and must not
      // survive in the browser's after somebody's role changes
      "Cache-Control": "private, no-store",
    },
  });
}
