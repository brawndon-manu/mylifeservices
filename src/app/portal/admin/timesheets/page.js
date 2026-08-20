import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { sendModeSummary } from "@/lib/timesheet-send";
import BackLink from "@/components/BackLink";
import SendModeBanner from "./_components/SendModeBanner";
import { groupByPeriod } from "@/lib/timesheet/batch-state";
import PeriodCards from "./_components/PeriodCards";
import OfficeSwitch from "./_components/OfficeSwitch";

export const metadata = { title: "Timesheets", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function TimesheetBatchesPage() {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");

  const batches = await prisma.timesheetBatch.findMany({
    // THIS LIST IS THE AGENCY'S. The day program's batches live under their
    // own card at /portal/admin/day-program - Mánu 2026-08-18: "it needs to
    // be its own seperate entity ... they cant mix." Same tables, same
    // machinery, never the same screen.
    where: { program: "MLS" },
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
      <OfficeSwitch current="MLS" />
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
        <PeriodCards periods={periods} />
      )}
    </section>
  );
}
