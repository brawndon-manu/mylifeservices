import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { formNumber } from "@/lib/clock-amendment/rules";
import { loadAmendment, withNames, buildAmendmentDocument } from "@/lib/clock-amendment/document";
import { fetchBlob } from "@/lib/blob";

export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) return new NextResponse("Not allowed", { status: 403 });
  const { id } = await params;
  const a = await loadAmendment(id);
  if (!a) return new NextResponse("Not found", { status: 404 });

  // the approved copy is stored; streamed from here, because its address is in
  // the private store and opens for nobody
  let bytes = null;
  if (a.pdfUrl) {
    const res = await fetchBlob(a.pdfUrl);
    if (res.ok) bytes = await res.arrayBuffer();
  }
  if (!bytes) bytes = (await buildAmendmentDocument(withNames(a))).bytes;
  return new NextResponse(bytes, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${formNumber(a)}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
