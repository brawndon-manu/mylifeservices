import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { sendModeSummary } from "@/lib/timesheet-send";
import { Plus, Files } from "lucide-react";
import SendModeBanner from "../timesheets/_components/SendModeBanner";
import PeriodCards from "../timesheets/_components/PeriodCards";
import OfficeSwitch from "../timesheets/_components/OfficeSwitch";
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
    <section className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">Day program</h1>
        <Link
          href="/portal/admin/day-program/new"
          className="inline-flex items-center gap-1.5 rounded-[9px] bg-brand px-4 py-2 text-[13.5px] font-semibold text-white shadow-sm transition hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Plus size={15} strokeWidth={2} aria-hidden="true" />
          Upload a pay period
        </Link>
      </div>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted">
        The day program&apos;s pay periods, separate from the agency&apos;s.
        Hours and overtime come from the QSP timesheet, rest breaks and the
        second breaks staff note on their own schedules from the Rest Periods
        report, and miles from the mileage export. Meals stay on the clock
        under the on-duty meal agreement.
      </p>
      <OfficeSwitch current="DP" />

      <SendModeBanner mode={mode} />

      <div className="mt-4 flex items-baseline justify-between gap-4">
        <h2 className="text-[17px] font-semibold tracking-tight text-foreground">Pay periods</h2>
        <span className="text-[11px] text-faint">Latest upload first</span>
      </div>

      {batches.length === 0 ? (
        <div className="mt-6 border-y border-sep py-12 text-center">
          <Files size={26} strokeWidth={1.5} aria-hidden="true" className="mx-auto text-faint" />
          <p className="mt-4 text-[15px] font-semibold text-foreground">
            No day program periods uploaded yet.
          </p>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-muted">
            Download the Simple Timesheet and Rest Periods exports from QSP, then upload them here.
          </p>
          <Link
            href="/portal/admin/day-program/new"
            className="mt-5 inline-flex items-center gap-1.5 rounded-[9px] bg-brand px-4 py-2 text-[13.5px] font-semibold text-white shadow-sm transition hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <Plus size={15} strokeWidth={2} aria-hidden="true" />
            Upload a pay period
          </Link>
        </div>
      ) : (
        <PeriodCards periods={periods} />
      )}
    </section>
  );
}
