import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { renderSheet, RENDER_SELECT, BASES } from "@/lib/timesheet/render-sheet";
import { answersByDate, confirmedFromAnswers } from "@/lib/timesheet/premium-split";

// gated download of one timesheet - the signed copy when it exists, otherwise
// the generated one. same stream-it-ourselves pattern as the résumé route: Blob
// is a public store, so its url never reaches the browser.
export async function GET(req, { params }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const ts = await prisma.timesheet.findUnique({
    where: { id },
    select: {
      ...RENDER_SELECT,
      signedPdfUrl: true,
      approvedPdfUrl: true,
      dueAt: true,
      // the `q_` answers, which is what the corrected copy is corrected BY.
      // Scoped to the answered ones: an open correction is a reported problem
      // and a different thing entirely.
      corrections: {
        where: { kind: { startsWith: "q_" }, status: { not: "open" } },
        select: { kind: true, date: true, status: true },
      },
    },
  });
  if (!ts) return new NextResponse("Not found", { status: 404 });

  // WHICH OF THE THREE DOCUMENTS. Anything unrecognised falls back to the sheet
  // as it has always been, so a mistyped link cannot silently hand somebody a
  // figure 670 hours away from the one they asked for.
  const query = new URL(req.url).searchParams;
  const asked = query.get("basis");
  const basis = BASES.includes(asked) ? asked : "ignoring";

  // A SIGNED or APPROVED copy is a stored artefact - it carries somebody's
  // actual signature and cannot be regenerated. The unsigned sheet is built
  // from `data` on demand, so there is no stale blob to go looking for.
  //
  // A PROJECTED OR CORRECTED COPY IS NEVER SERVED FROM THE BLOB. Those two are
  // a reading of an open question as it stands today; the stored file is the
  // document somebody signed, which is a different claim and a different total.
  const wantOriginal = query.get("original") === "1";
  const storedUrl =
    wantOriginal || basis !== "ignoring" ? null : ts.approvedPdfUrl || ts.signedPdfUrl;

  let buf;
  if (storedUrl) {
    const res = await fetch(storedUrl);
    if (!res.ok) return new NextResponse("Not found", { status: 404 });
    buf = await res.arrayBuffer();
  } else {
    const rendered = await renderSheet(ts, {
      basis,
      confirmed: confirmedFromAnswers(ts.corrections),
      answers: answersByDate(ts.corrections),
      // silence settles it once their date to reply has gone by. No due date
      // means nobody has been asked yet, which is not the same as being late.
      pastDue: !!ts.dueAt && ts.dueAt.getTime() < Date.now(),
    });
    if (!rendered) return new NextResponse("Not found", { status: 404 });
    buf = rendered.bytes;
  }

  const safe = (ts.sourceName || "timesheet").replace(/[^\w.\- ]/g, "_");
  const suffix =
    basis !== "ignoring"
      ? `-${basis}`
      : wantOriginal ? "" : ts.approvedPdfUrl ? "-approved" : ts.signedPdfUrl ? "-signed" : "";
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safe}${suffix}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
