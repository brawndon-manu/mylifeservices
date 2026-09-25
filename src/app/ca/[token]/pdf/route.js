import { amendmentLinkOpen } from "@/lib/link-life";
import { NextResponse } from "next/server";
import { verifyAmendmentToken } from "@/lib/clock-amendment/token";
import { formNumber } from "@/lib/clock-amendment/rules";
import { loadAmendment, withNames, buildAmendmentDocument, shownName } from "@/lib/clock-amendment/document";
import { fetchBlob } from "@/lib/blob";
import { parseBlobUrl } from "@/lib/blob-paths";
import { logFileOpen } from "@/lib/file-log";
import { accessLabel } from "@/lib/access-labels";

// THE STAFF MEMBER'S OWN COPY of an approved addendum, through the same link
// they signed it on. the approval email no longer carries the pdf - it links
// here - and the page says their copy is here whenever they need it. only an
// approved addendum has a copy to give; every open is written down.
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const { token } = await params;
  const id = verifyAmendmentToken(token);
  if (!id) return new NextResponse("Not found", { status: 404 });
  if (!(await amendmentLinkOpen(id))) return NextResponse.redirect(new URL("/a/expired", req.url));
  const a = await loadAmendment(id);
  if (!a || !a.approvedAt) return new NextResponse("Not found", { status: 404 });

  let bytes = null;
  if (a.pdfUrl) {
    const res = await fetchBlob(a.pdfUrl);
    if (res.ok) bytes = await res.arrayBuffer();
  }
  if (!bytes) bytes = (await buildAmendmentDocument(withNames(a))).bytes;

  await logFileOpen({
    user: a.staff ? { id: a.staff.id, email: a.staff.email, role: a.staff.role } : null,
    pathname: parseBlobUrl(a.pdfUrl)?.pathname || `clock-amendments/${a.id}`,
    req,
    via: "addendum-link",
    label: accessLabel("Clock addendum", formNumber(a), shownName(a.staff)),
  });
  return new NextResponse(bytes, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${formNumber(a)}.pdf"`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
}
