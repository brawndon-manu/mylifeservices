import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { sendModeSummary } from "@/lib/timesheet-send";
import BackLink from "@/components/BackLink";
import SendModeBanner from "./_components/SendModeBanner";
import { companyDate } from "@/lib/company-time";
import LiveBadge from "./_components/LiveBadge";
import PeriodPresence, { BatchFaces, FoldedCount } from "./_components/CardPresence";
import { groupByPeriod, batchState } from "@/lib/timesheet/batch-state";
import TestBatchBadge from "./_components/TestBatchBadge";

export const metadata = { title: "Timesheets", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function TimesheetBatchesPage() {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");

  const batches = await prisma.timesheetBatch.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      uploadedBy: { select: { name: true, preferredFirstName: true, preferredLastName: true } },
      timesheets: { select: { id: true, sentAt: true, signedAt: true, userId: true } },
    },
  });

  // ONE CARD PER PAY PERIOD. Four uploads of one fortnight were four rows that
  // all looked equally current, and only the newest is - the rest fold under it.
  const periods = groupByPeriod(batches);

  const mode = sendModeSummary();

  return (
    <section className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
      <BackLink href="/portal/admin">Back to Admin</BackLink>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">Admin</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Timesheets
        </h1>
        <Link
          href="/portal/admin/timesheets/new"
          className="rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
        >
          Upload a pay period
        </Link>
      </div>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
        Upload the QSP export for a pay period. Every employee&apos;s hours are
        recalculated with paid rest breaks and California overtime, then sent out
        for signature.
      </p>

      <SendModeBanner mode={mode} />

      {batches.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-border-strong bg-surface-2 p-10 text-center">
          <p className="text-sm font-medium text-foreground">No pay periods uploaded yet.</p>
          <p className="mt-1 text-sm text-muted">
            Download the Simple Timesheet export from QSP, then upload it here.
          </p>
        </div>
      ) : (
        <ul className="mt-8 space-y-4">
          {periods.map((g) => {
            const b = g.current;
            const total = b.timesheets.length;
            const sent = b.timesheets.filter((t) => t.sentAt).length;
            const signed = b.timesheets.filter((t) => t.signedAt).length;
            const unmatched = b.timesheets.filter((t) => !t.userId).length;
            const state = batchState(b);
            return (
              <li key={g.key} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
                {/* ONE POLL FOR THE WHOLE PERIOD, answered per upload. The card
                    reads its own slice and each folded row reads its own, so a
                    face lands on the upload somebody is actually in rather than
                    on the newest one. Only while the period is unfinished: a
                    poller per period per tab grows for ever. */}
                <PeriodPresence
                  batchId={state.key === "final" ? null : b.id}
                  alsoBatchIds={g.earlier.map((o) => o.id)}
                >
                <div className="relative">
                  {/* THE FACES SIT OUTSIDE THE LINK. A card that is one big anchor
                      cannot hold a second interactive thing, and a tooltip inside
                      an anchor is swallowed by the navigation. */}
                  <div className="pointer-events-none absolute right-5 top-5 z-10">
                    <div className="pointer-events-auto">
                      {/* only the CURRENT upload is watched, and only while the
                          period is still open. A finished fortnight is not one
                          anybody is chasing, and a poller per card would be a
                          request per pay period per tab, for ever. */}
                      {/* THIS upload only. Somebody reading the 12:36 AM export
                          is in that one, not this one - two uploads of a
                          fortnight are two documents with two sets of timesheet
                          rows. */}
                      <BatchFaces batchId={b.id} />
                    </div>
                  </div>

                  <Link
                    href={`/portal/admin/timesheets/${b.id}`}
                    className="group block p-5 card-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold tracking-tight text-foreground">
                            {b.periodFrom} to {b.periodTo}
                          </p>
                          {/* THE REACH HERE COMES OFF restsByDate ALONE, because this
                              list does not load the day blobs and 60 of them per
                              batch is not worth a badge. batchReach takes the LATER
                              of its two sources, so a lagging rest report can only
                              understate how far the data goes - which shows LIVE and
                              refuses to send. Wrong in the safe direction. */}
                          <LiveBadge batch={b} size="sm" />
                          <TestBatchBadge batch={b} size="sm" showAddress={false} />
                        </div>
                        {/* WHEN THE EXPORT LANDED, TO THE MINUTE. The date alone made
                            two pulls of one fortnight on the same day
                            indistinguishable, and this period has had three. Not when
                            QSP generated the file - nothing in the four exports
                            records that - so it says uploaded rather than exported. */}
                        <p className="mt-1 font-mono text-xs text-muted">
                          uploaded {companyDate(b.createdAt, {
                            month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                          })}
                          {state.reach ? <> &middot; reaches <span className="text-foreground">{state.reach}</span></> : null}
                          {state.daysToCome ? ` \u00b7 ${state.daysToCome} day${state.daysToCome === 1 ? "" : "s"} to come` : ""}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {total} employee{total === 1 ? "" : "s"} &middot;{" "}
                          {g.uploads} upload{g.uploads === 1 ? "" : "s"} of this period
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-7">
                        {b.testMode && (
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                            Test sends
                          </span>
                        )}
                        {/* a partial batch stops looking partial the moment you stop
                            remembering uploading it, and its hours are not a whole
                            period - so it says so wherever it is listed */}
                        {b.partialPeriod && (
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                            Partial
                            {b.partialFrom && b.partialThrough
                              ? ` \u00b7 ${b.partialFrom}\u2013${b.partialThrough}`
                              : b.partialThrough
                                ? ` \u00b7 through ${b.partialThrough}`
                                : ""}
                          </span>
                        )}
                        {unmatched > 0 && (
                          <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                            {unmatched} unmatched
                          </span>
                        )}
                        <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-semibold text-brand">
                          {sent}/{total} sent
                        </span>
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                          {signed}/{total} signed
                        </span>
                      </div>
                    </div>
                  </Link>
                </div>

                {/* EARLIER UPLOADS OF THE SAME FORTNIGHT, SHUT BY DEFAULT - the whole
                    point of folding them is that they are out of the way. A details
                    element rather than state, so it needs no client component and it
                    works before hydration. */}
                {g.earlier.length > 0 && (
                  <details className="border-t border-border bg-surface-2">
                    <summary className="cursor-pointer list-none px-5 py-2.5 text-xs font-semibold text-muted hover:text-foreground">
                      <span className="mr-1.5 inline-block text-[10px] text-faint">&#9656;</span>
                      {g.earlier.length} earlier upload{g.earlier.length === 1 ? "" : "s"} of this period
                      {/* a shut fold must not hide a person. The face itself is
                          on the row inside; this is only the reason to open it. */}
                      <FoldedCount batchIds={g.earlier.map((o) => o.id)} />
                    </summary>
                    <ul>
                      {g.earlier.map((o) => (
                        <li key={o.id}>
                          <Link
                            href={`/portal/admin/timesheets/${o.id}`}
                            className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-dashed border-border py-2.5 pl-10 pr-5 text-xs transition hover:bg-surface-3"
                          >
                            <span className="min-w-[9rem] font-mono text-muted">
                              {companyDate(o.createdAt, {
                                month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                              })}
                            </span>
                            <span className="min-w-[7rem] font-mono text-faint">
                              reached {batchState(o).reach || "\u2014"}
                            </span>
                            <span className="min-w-[4.5rem] font-semibold text-foreground">
                              {o.timesheets.length} sheets
                            </span>
                            <LiveBadge batch={o} size="sm" newerInPeriod />
                            <BatchFaces batchId={o.id} compact />
                            <span className="ml-auto font-semibold text-brand">Open &rarr;</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                </PeriodPresence>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
