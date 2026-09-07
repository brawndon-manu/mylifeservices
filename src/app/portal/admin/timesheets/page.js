import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { sendModeSummary } from "@/lib/timesheet-send";
import { Plus, Files } from "lucide-react";
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
    // machinery, never the same screen. Audit copies live on the Audit page
    // the same way - never here, where the main button is Send all.
    where: { program: "MLS", auditOnly: false },
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
    <section className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">Timesheets</h1>
        <Link
          href="/portal/admin/timesheets/new"
          className="inline-flex items-center gap-1.5 rounded-[9px] bg-brand px-4 py-2 text-[13.5px] font-semibold text-white shadow-sm transition hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Plus size={15} strokeWidth={2} aria-hidden="true" />
          Upload a pay period
        </Link>
      </div>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted">
        Review hours, paid rest breaks, and overtime.
        <br className="hidden sm:block" /> Send each pay period to staff for signature.
      </p>
      <OfficeSwitch current="MLS" />

      <SendModeBanner mode={mode} />

      <div className="mt-4 flex items-baseline justify-between gap-4">
        <h2 className="text-[17px] font-semibold tracking-tight text-foreground">Pay periods</h2>
        <span className="text-[11px] text-faint">Latest upload first</span>
      </div>

      {batches.length === 0 ? (
        <div className="mt-6 border-y border-sep py-12 text-center">
          <Files size={26} strokeWidth={1.5} aria-hidden="true" className="mx-auto text-faint" />
          <p className="mt-4 text-[15px] font-semibold text-foreground">
            Your first pay period starts here.
          </p>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-muted">
            Download the Simple Timesheet export from QSP, then upload it to
            review staff hours.
          </p>
          <Link
            href="/portal/admin/timesheets/new"
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
