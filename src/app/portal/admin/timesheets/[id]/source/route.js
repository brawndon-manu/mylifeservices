import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { logFileOpen, logFileDenied } from "@/lib/file-log";
import { accessLabel, periodRange } from "@/lib/access-labels";
import { parseBlobUrl } from "@/lib/blob-paths";
import { fetchBlob } from "@/lib/blob";

// the two documents a batch was built from: QSP's timesheet export and the
// Employee Schedules calendar. Served so the checks screen can send someone
// straight to the page a figure was read off.
//
// Same stream-it-ourselves pattern as every other stored document here - the url
// never reaches the browser, access dies with the session rather than living on
// in a link someone pasted somewhere, and every open is written down.
//
// Served inline on purpose: `#page=N` is a viewer instruction, handled entirely
// in the browser and never sent to us, and it only does anything if the PDF
// opens in a viewer rather than downloading.
//
// The Rest Periods Report is the exception: it is a spreadsheet, so it has no
// pages to deep-link to and no viewer to open inline. It downloads.
const DOCS = {
  timesheet: { url: "sourceUrl", name: "sourceName", fallback: "qsp-export", ext: "pdf", type: "application/pdf", inline: true, what: "QSP timesheet export" },
  schedule: { url: "scheduleUrl", name: "scheduleName", fallback: "schedule", ext: "pdf", type: "application/pdf", inline: true, what: "QSP employee schedules" },
  rests: { url: "restsUrl", name: "restsName", fallback: "rest-periods", ext: "xls", type: "application/vnd.ms-excel", inline: false, what: "QSP rest periods report" },
};

export async function GET(req, { params }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) {
    await logFileDenied({ user, pathname: `timesheets/${id}/source`, req, label: "QSP export" });
    return new NextResponse("Forbidden", { status: 403 });
  }

  const which = new URL(req.url).searchParams.get("doc") || "timesheet";
  const doc = DOCS[which];
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    select: {
      sourceUrl: true, sourceName: true,
      scheduleUrl: true, scheduleName: true,
      restsUrl: true, restsName: true,
      periodFrom: true, periodTo: true,
    },
  });
  if (!batch) return new NextResponse("Not found", { status: 404 });

  const url = batch[doc.url];
  if (!url) {
    // batches uploaded before a document was kept land here. say so, rather
    // than a bare 404 that reads like the whole feature is broken.
    const why = {
      schedule:
        "No schedule was stored with this batch. Uploads before 2026-08-04 kept only what was read out of the schedule, not the file. Re-upload the period to get it.",
      rests: "No Rest Periods Report was stored with this batch.",
    };
    return new NextResponse(why[which] || "No source export was stored with this batch.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const res = await fetchBlob(url);
  if (!res.ok) return new NextResponse("Not found", { status: 404 });

  const buf = await res.arrayBuffer();
  await logFileOpen({
    user,
    pathname: parseBlobUrl(url)?.pathname || `timesheets/${id}/source`,
    req,
    label: accessLabel(doc.what, periodRange(batch.periodFrom, batch.periodTo)),
  });
  const safe = (batch[doc.name] || doc.fallback)
    .replace(/[^\w.\- ]/g, "_")
    .replace(/\.(pdf|xlsx?)$/i, "");
  return new NextResponse(buf, {
    headers: {
      "Content-Type": doc.type,
      "Content-Disposition": `${doc.inline ? "inline" : "attachment"}; filename="${safe}.${doc.ext}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
