import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { sendModeSummary } from "@/lib/timesheet-send";
import BackLink from "@/components/BackLink";
import SendModeBanner from "./_components/SendModeBanner";
import { companyDate } from "@/lib/company-time";

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
        <ul className="mt-8 space-y-3">
          {batches.map((b) => {
            const total = b.timesheets.length;
            const sent = b.timesheets.filter((t) => t.sentAt).length;
            const signed = b.timesheets.filter((t) => t.signedAt).length;
            const unmatched = b.timesheets.filter((t) => !t.userId).length;
            return (
              <li key={b.id}>
                <Link
                  href={`/portal/admin/timesheets/${b.id}`}
                  className="group block rounded-2xl border border-border bg-surface p-5 shadow-sm card-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold tracking-tight text-foreground">
                        {b.periodFrom} to {b.periodTo}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {total} employee{total === 1 ? "" : "s"} ·{" "}
                        {companyDate(b.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {b.testMode && (
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                          Test sends
                        </span>
                      )}
                      {/* a partial batch stops looking partial the moment you
                          stop remembering uploading it, and its hours are not a
                          whole period - so it says so wherever it is listed */}
                      {b.partialPeriod && (
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                          Partial
                          {b.partialFrom && b.partialThrough
                            ? ` · ${b.partialFrom}–${b.partialThrough}`
                            : b.partialThrough
                              ? ` · through ${b.partialThrough}`
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
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
