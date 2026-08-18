import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { sendModeSummary } from "@/lib/timesheet-send";
import BackLink from "@/components/BackLink";
import SendModeBanner from "../timesheets/_components/SendModeBanner";
import PeriodCards from "../timesheets/_components/PeriodCards";
import { groupByPeriod } from "@/lib/timesheet/batch-state";

export const metadata = { title: "Day program", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// THE DAY PROGRAM'S OWN TIMESHEETS SCREEN. Mánu 2026-08-18: "I essenetially
// just wanted ot make a copy of the timesheets into the day program card and
// just make some new rules for it specifically ... its own batch seperate
// from the ILS one ... they cant mix."
//
// So: the same period cards, the same machinery, the same deep pages - over
// ONLY the batches whose program is DP. The agency's list at
// /portal/admin/timesheets is scoped to MLS the same way, and the group key
// carries the program, so neither side can ever fold or supersede the other.
export default async function DayProgramBatchesPage() {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");

  const batches = await prisma.timesheetBatch.findMany({
    where: { program: "DP" },
    orderBy: { createdAt: "desc" },
    include: {
      uploadedBy: { select: { name: true, preferredFirstName: true, preferredLastName: true } },
      timesheets: { select: { id: true, sentAt: true, signedAt: true, userId: true } },
    },
  });
  const periods = groupByPeriod(batches);
  const mode = sendModeSummary();

  return (
    <section className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
      <BackLink href="/portal/admin">Back to Admin</BackLink>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">Admin</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Day program
        </h1>
        <Link
          href="/portal/admin/day-program/new"
          className="rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
        >
          Upload a pay period
        </Link>
      </div>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
        The day program&apos;s pay periods, separate from the agency&apos;s.
        Hours and overtime come from the QSP timesheet, rest breaks from the
        Rest Periods report, and meals stay on the clock under the on-duty
        meal agreement.
      </p>

      <SendModeBanner mode={mode} />

      {batches.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-border-strong bg-surface-2 p-10 text-center">
          <p className="text-sm font-medium text-foreground">No day program periods uploaded yet.</p>
          <p className="mt-1 text-sm text-muted">
            Download the Simple Timesheet and Rest Periods exports from QSP, then upload them here.
          </p>
        </div>
      ) : (
        <PeriodCards periods={periods} />
      )}
    </section>
  );
}
