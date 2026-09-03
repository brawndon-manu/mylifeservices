import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderSheet } from "@/lib/timesheet/render-sheet";
import { premiumStanding } from "@/lib/timesheet/premium-split";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { buildZip, safeEntryName } from "@/lib/zip";
import { loadBreakReasons, loadTimeOffFor } from "@/lib/timesheet/load-break-reasons";

// every completed timesheet in a batch as separate PDFs in one zip - the
// counterpart to the merged download, for when payroll needs them filed
// per person rather than as one document.
//
// takes the most complete version of each: approved > employee-signed > blank.
export async function GET(req, { params }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    select: {
      periodFrom: true,
      periodTo: true,
      restsByDate: true,
      // loadBreakReasons scopes by it. Left out it falls back to MLS, and a
      // day program sheet in this bundle prints the OTHER payroll's reasons
      // for anybody who works both.
      program: true,
      timesheets: {
        orderBy: { sourceName: "asc" },
        select: {
          id: true,
          sourceName: true,
          data: true,
          signedPdfUrl: true,
          approvedPdfUrl: true,
          signedAt: true,
          dueAt: true,
          // the break reasons hang off it - see the note in RENDER_SELECT.
          // Without it `loadBreakReasons` returns [] and every sheet in the
          // zip quietly loses its Comments lines.
          userId: true,
          // rendered on the SAME basis the employee signs on, so a batch export
          // cannot carry a different figure from the document that person
          // actually attested to.
          corrections: {
            where: { kind: { startsWith: "q_" }, status: { not: "open" } },
            select: { kind: true, date: true, status: true },
          },
        },
      },
    },
  });
  if (!batch) return new NextResponse("Not found", { status: 404 });

  // ?all=1 includes unsigned sheets too; by default only what's come back
  const includeUnsigned = new URL(req.url).searchParams.get("all") === "1";
  // an unsigned sheet no longer needs a stored file to be includable - it is
  // rendered from `data`, so "has days" is the test.
  const wanted = batch.timesheets.filter((t) =>
    includeUnsigned
      ? t.approvedPdfUrl || t.signedPdfUrl || (t.data?.days || []).length > 0
      : t.signedPdfUrl || t.approvedPdfUrl,
  );
  if (!wanted.length) {
    return new NextResponse("Nothing to download yet", { status: 404 });
  }

  const files = [];
  const seen = new Map();
  for (const t of wanted) {
    const url = t.approvedPdfUrl || t.signedPdfUrl;
    try {
      let data;
      if (url) {
        const res = await fetch(url);
        if (!res.ok) continue;
        data = Buffer.from(await res.arrayBuffer());
      } else {
        const standing = premiumStanding(t.data?.days || [], t.corrections);
        const rendered = await renderSheet({ ...t, batch }, {
          basis: "corrected",
          breakReasons: await loadBreakReasons({ ...t, batch }),
          timeOff: await loadTimeOffFor({ ...t, batch }),
          confirmed: standing.confirmed,
          answers: standing.answers,
          pastDue: !!t.dueAt && t.dueAt.getTime() < Date.now(),
        });
        if (!rendered) continue;
        data = Buffer.from(rendered.bytes);
      }

      // two people can share a printed name - never let one silently overwrite
      // the other inside the archive.
      let base = safeEntryName(t.sourceName, "timesheet");
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      if (n > 1) base = `${base} (${n})`;
      const suffix = t.approvedPdfUrl ? " - approved" : t.signedPdfUrl ? " - signed" : "";

      files.push({ name: `${base}${suffix}.pdf`, data });
    } catch (e) {
      // one unreadable file shouldn't sink the whole export
      console.error(`zip skipped ${t.sourceName}:`, e);
    }
  }
  if (!files.length) return new NextResponse("Couldn't read any files", { status: 500 });

  const zip = buildZip(files);
  const name = `timesheets-${(batch.periodFrom || "").replace(/\//g, "-")}.zip`;
  return new NextResponse(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
