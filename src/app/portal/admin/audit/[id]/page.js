import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import BackLink from "@/components/BackLink";
import AuditCards from "./AuditCards";
import { buildAudit } from "./build";

export const metadata = { title: "Audit", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// THE THREE RECORDS OF ONE SHIFT, LINED UP.
//
// The roster says what was billed, the clock export says what was worked, and
// the service note says what was documented. They come from three separate
// uploads and are joined in ./build.js on the person and the day - shared with
// the client-hours report route, so the document can never disagree with the
// screen.
//
// Nothing on this page changes an hour, a premium or a signed timesheet. It
// reports what three documents say and ranks the disagreements for a person to
// read - see the note at the top of note-audit.js for why none of these rules
// concludes anything on its own.
export default async function AuditBatchPage({ params }) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) redirect("/portal");

  const { id } = await params;
  const data = await buildAudit(id);
  if (!data) notFound();
  const { batch, rows, orphans, notesCount, clockLoaded, periodLabels, authorized, authMonthLabel, hasAuthorizations } = data;

  return (
    <section className="mx-auto max-w-[90rem] px-6 py-12 sm:py-16">
      <BackLink href="/portal/admin/audit">Back to Audit</BackLink>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">
        {batch.periodFrom} to {batch.periodTo}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Service notes against what was billed
        </h1>
        {/* the findings leave this screen as documents - each rendered fresh
            from the current decisions on every open, so none of them can
            disagree with the cards behind them. */}
        <div className="flex flex-wrap gap-2">
          <a
            href={`/portal/admin/audit/${batch.id}/client-report`}
            target="_blank"
            className="rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
          >
            Client hours (PDF)
          </a>
          <a
            href={`/portal/admin/audit/${batch.id}/client-report?detailed=1`}
            target="_blank"
            className="rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
          >
            Client hours, detailed (PDF)
          </a>
          {rows.some((r) => r.review?.decision === "flagged") && (
            <a
              href={`/portal/admin/audit/${batch.id}/report`}
              target="_blank"
              className="rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
            >
              Flagged report (PDF)
            </a>
          )}
        </div>
      </div>

      <AuditCards
        rows={rows}
        orphans={orphans}
        authorized={hasAuthorizations ? authorized : null}
        authMonthLabel={authMonthLabel}
        periods={periodLabels}
        totals={{
          notes: notesCount,
          shifts: rows.length,
          clocked: clockLoaded,
          orphans: orphans.length,
          // which of the two service notes reports this period actually got.
          // Neither is complete on its own, so a period holding one of them is
          // a period whose "no service note" count is partly about the file.
          fromPdf: batch.serviceNotes?.pdfCount || 0,
          fromXls: batch.serviceNotes?.serviceCount || 0,
          notesName: batch.notesName || null,
          serviceNotesName: batch.serviceNotesName || null,
        }}
      />
    </section>
  );
}

