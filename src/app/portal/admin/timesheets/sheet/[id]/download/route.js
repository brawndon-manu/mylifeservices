import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { logFileOpen, logFileDenied } from "@/lib/file-log";
import { accessLabel, periodRange } from "@/lib/access-labels";
import { sheetName } from "@/lib/file-describe";
import { parseBlobUrl } from "@/lib/blob-paths";
import { renderSheet, RENDER_SELECT, BASES } from "@/lib/timesheet/render-sheet";
import { answersByDate, confirmedFromAnswers } from "@/lib/timesheet/premium-split";
import { loadBreakReasons, loadTimeOffFor } from "@/lib/timesheet/load-break-reasons";
import { fetchBlob } from "@/lib/blob";

// gated download of one timesheet - the signed copy when it exists, otherwise
// the generated one. same stream-it-ourselves pattern as the résumé route: the
// stored url never reaches the browser, and every open is written down.
export async function GET(req, { params }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) {
    await logFileDenied({ user, pathname: `timesheets/sheet/${id}`, req, label: "Timesheet" });
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

  // WHICH OF THE THREE DOCUMENTS. Anything unrecognised falls back to the
  // default sheet, so a mistyped link cannot silently hand somebody a figure 664
  // hours away from the one they asked for. That fallback is now the FULL
  // figure rather than the reduced one, which is the safe direction to be wrong
  // in: a mistyped basis over-states what is owed instead of hiding it.
  const query = new URL(req.url).searchParams;
  const asked = query.get("basis");
  const basis = BASES.includes(asked) ? asked : "projected";

  // EXACTLY THE SIGNED OR EXACTLY THE APPROVED COPY, for the signed-timesheets
  // screen. The default below serves approved-or-signed as one idea, which is
  // right for "give me this sheet" - but a screen listing both copies side by
  // side has to be able to name one, and a 404 is the honest answer when the
  // named copy does not exist rather than quietly handing back the other.
  const copy = query.get("copy");
  if (copy === "signed" || copy === "approved") {
    const url = copy === "signed" ? ts.signedPdfUrl : ts.approvedPdfUrl;
    if (!url) return new NextResponse("Not found", { status: 404 });
    const res = await fetchBlob(url);
    if (!res.ok) return new NextResponse("Not found", { status: 404 });
    await logFileOpen({
      user,
      pathname: parseBlobUrl(url)?.pathname || `timesheets/sheet/${id}`,
      req,
      label: accessLabel(
        copy === "signed" ? "Signed timesheet" : "Approved timesheet",
        sheetName(ts),
        periodRange(ts.batch.periodFrom, ts.batch.periodTo),
      ),
    });
    const safeName = (ts.sourceName || "timesheet").replace(/[^\w.\- ]/g, "_");
    return new NextResponse(await res.arrayBuffer(), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${safeName}-${copy}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  // A SIGNED or APPROVED copy is a stored artefact - it carries somebody's
  // actual signature and cannot be regenerated. The unsigned sheet is built
  // from `data` on demand, so there is no stale blob to go looking for.
  //
  // AN ASSUMED OR CORRECTED COPY IS NEVER SERVED FROM THE BLOB. Those two are
  // a reading of an open question as it stands today; the stored file is the
  // document somebody signed, which is a different claim and a different total.
  const wantOriginal = query.get("original") === "1";
  const storedUrl =
    wantOriginal || basis !== "projected" ? null : ts.approvedPdfUrl || ts.signedPdfUrl;

  let buf;
  if (storedUrl) {
    const res = await fetchBlob(storedUrl);
    if (!res.ok) return new NextResponse("Not found", { status: 404 });
    buf = await res.arrayBuffer();
  } else {
    const rendered = await renderSheet(ts, {
      basis,
      breakReasons: await loadBreakReasons(ts),
      timeOff: await loadTimeOffFor(ts),
      confirmed: confirmedFromAnswers(ts.corrections),
      answers: answersByDate(ts.corrections),
      // silence settles it once their date to reply has gone by. No due date
      // means nobody has been asked yet, which is not the same as being late.
      pastDue: !!ts.dueAt && ts.dueAt.getTime() < Date.now(),
    });
    if (!rendered) return new NextResponse("Not found", { status: 404 });
    buf = rendered.bytes;
  }

  // the line says which document it was: a stored copy is the signed or
  // approved one; anything built here is the sheet as it stands
  const kind = storedUrl
    ? ts.approvedPdfUrl ? "Approved timesheet" : "Signed timesheet"
    : basis === "corrected" ? "Corrected timesheet" : "Timesheet";
  await logFileOpen({
    user,
    pathname: (storedUrl && parseBlobUrl(storedUrl)?.pathname) || `timesheets/sheet/${id}`,
    req,
    label: accessLabel(kind, sheetName(ts), periodRange(ts.batch.periodFrom, ts.batch.periodTo)),
  });

  const safe = (ts.sourceName || "timesheet").replace(/[^\w.\- ]/g, "_");
  const suffix =
    basis !== "projected"
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
