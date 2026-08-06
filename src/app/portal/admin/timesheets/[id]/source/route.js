import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";

// the two documents a batch was built from: QSP's timesheet export and the
// Employee Schedules calendar. Served so the checks screen can send someone
// straight to the page a figure was read off.
//
// Same stream-it-ourselves pattern as every other stored document here - Blob is
// a public store, so the url never reaches the browser and access dies with the
// session rather than living on in a link someone pasted somewhere.
//
// Served inline on purpose: `#page=N` is a viewer instruction, handled entirely
// in the browser and never sent to us, and it only does anything if the PDF
// opens in a viewer rather than downloading.
const DOCS = {
  timesheet: { url: "sourceUrl", name: "sourceName", fallback: "qsp-export" },
  schedule: { url: "scheduleUrl", name: "scheduleName", fallback: "schedule" },
};

export async function GET(req, { params }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const which = new URL(req.url).searchParams.get("doc") || "timesheet";
  const doc = DOCS[which];
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    select: { sourceUrl: true, sourceName: true, scheduleUrl: true, scheduleName: true },
  });
  if (!batch) return new NextResponse("Not found", { status: 404 });

  const url = batch[doc.url];
  if (!url) {
    // batches uploaded before the schedule was kept land here. say so, rather
    // than a bare 404 that reads like the whole feature is broken.
    return new NextResponse(
      which === "schedule"
        ? "No schedule was stored with this batch. Uploads before 2026-08-04 kept only what was read out of the schedule, not the file. Re-upload the period to get it."
        : "No source export was stored with this batch.",
      { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  const res = await fetch(url);
  if (!res.ok) return new NextResponse("Not found", { status: 404 });

  const buf = await res.arrayBuffer();
  const safe = (batch[doc.name] || doc.fallback).replace(/[^\w.\- ]/g, "_").replace(/\.pdf$/i, "");
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safe}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
