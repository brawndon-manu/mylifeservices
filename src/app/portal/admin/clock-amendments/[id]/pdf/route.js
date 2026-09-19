import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { formNumber } from "@/lib/clock-amendment/rules";
import { loadAmendment, withNames, buildAmendmentDocument } from "@/lib/clock-amendment/document";

// THE DOCUMENT AS IT STANDS. An approved amendment has its own stored copy and
// this sends the reader there, so the bytes that were hashed and mailed are the
// bytes they open. Anything earlier is rendered on request from the record, so
// the office can read the form as the staff member will sign it, before
// anything is sent.
export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) return new NextResponse("Not allowed", { status: 403 });
  const { id } = await params;
  const a = await loadAmendment(id);
  if (!a) return new NextResponse("Not found", { status: 404 });
  if (a.pdfUrl) return NextResponse.redirect(a.pdfUrl);

  const doc = await buildAmendmentDocument(withNames(a));
  return new NextResponse(doc.bytes, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${formNumber(a)}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
