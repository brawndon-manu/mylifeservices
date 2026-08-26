import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { clockKey, clockShifts, clockCoverage, clockDisagreements } from "@/lib/timesheet/clock";
import { isCappedService, CAP_MINUTES } from "@/lib/timesheet/compliance";
import BackLink from "@/components/BackLink";
import AuditTable from "./AuditTable";

export const metadata = {
  title: "QSClock Time and Attendance",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

// THE AUDIT SCREEN FOR THE CLOCK EXPORT.
//
// Mánu 2026-08-26: "this is for auditing. so we need to see every instance of
// clocked in and clocked out vs what the schedule has them under ... geofence
// as well. overe 3.5 hours as well."
//
// It reads the export back off the file the upload stored and computes nothing
// an hour depends on. The clock export is observation only - see the note at the
// top of compliance.js - so nothing on this page reaches pay, a premium or a
// signed sheet, and no employee ever sees it.
export default async function AttendancePage({ params }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");

  const { id } = await params;
  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    include: {
      timesheets: {
        select: {
          sourceName: true,
          user: {
            select: { name: true, preferredFirstName: true, preferredLastName: true },
          },
        },
      },
    },
  });
  if (!batch) notFound();

  // READ BACK OFF THE FILE, not out of the batch row. See the note beside
  // `clockFindings` in the uploader: the rows are a quarter of a megabyte a
  // week, and putting them in a column every other query drags along costs far
  // more than the 8ms it takes to read them here.
  //
  // A file that will not come back is reported and skipped rather than thrown:
  // the second week of a fortnight going missing must not blank the first.
  const clock = batch.clockFindings;
  const files = clock?.files?.length
    ? clock.files
    : clock && batch.clockUrl
      // uploaded before the file list existed, 2026-08-26
      ? [{ name: batch.clockName, url: batch.clockUrl, shifts: clock.shifts }]
      : [];

  const rows = [];
  const unreadable = [];
  for (const f of files) {
    if (!f.url) continue;
    try {
      const res = await fetch(f.url, { cache: "no-store" });
      if (!res.ok) throw new Error(`the file came back ${res.status}`);
      rows.push(...clockShifts(Buffer.from(await res.arrayBuffer())));
    } catch (e) {
      console.error(`clock export unreadable (${f.name}):`, e);
      unreadable.push(f.name || "a file");
    }
  }

  // THE EXPORT'S SPELLING IS THE RECORD, the portal's is the one people read.
  //
  // An audit of a document should show what the document says, so the QSP name
  // is what falls back. Where the period holds a timesheet under the same name
  // the portal's preferred name is shown instead, because a reviewer working
  // down this list knows their staff by the name the rest of the portal uses.
  const byKey = new Map();
  for (const t of batch.timesheets) {
    if (t.user) byKey.set(clockKey(t.sourceName), preferredName(t.user));
  }

  const shifts = rows.map((r, i) => ({
    ...r,
    i,
    who: byKey.get(r.key) || r.name,
    // recomputed here rather than stored: it is a reading of the row, and a
    // reading that changes when the rule changes must not be frozen into a
    // batch uploaded before it
    disagrees: clockDisagreements(r),
    overCap:
      isCappedService(r.service) && r.workedMin != null && r.workedMin > CAP_MINUTES,
  }));

  return (
    <section className="mx-auto max-w-[90rem] px-6 py-12 sm:py-16">
      <BackLink href={`/portal/admin/timesheets/${batch.id}`}>Back to the pay period</BackLink>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">
        {batch.periodFrom} to {batch.periodTo}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        QSClock Time and Attendance
      </h1>

      {unreadable.length > 0 && (
        <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          {unreadable.join(", ")} could not be read back, so no shift from it is on this page.
        </p>
      )}

      {shifts.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-border-strong bg-surface-2 p-10 text-center">
          <p className="text-sm font-medium text-foreground">
            No clock export has been uploaded for this pay period.
          </p>
          <p className="mt-1 text-sm text-muted">
            The report is optional and nothing else on the period depends on it. Without it there
            is no record of who clocked in, who clocked out, or where they were.
          </p>
        </div>
      ) : (
        <AuditTable
          shifts={shifts}
          files={files}
          coverage={clockCoverage(rows)}
          capMinutes={CAP_MINUTES}
        />
      )}
    </section>
  );
}
