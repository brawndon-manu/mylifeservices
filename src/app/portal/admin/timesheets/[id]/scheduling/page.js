import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronDown, Info, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { batchPeriodLabels } from "@/lib/timesheet/batch-overview";
import { buildFindings } from "@/lib/timesheet/findings";
import { attendanceOf, COMPLIANCE_KINDS } from "@/lib/timesheet/compliance";
import { schedulingView } from "@/lib/timesheet/scheduling-view";
import BackLink from "@/components/BackLink";
import BatchViews from "../../_components/BatchViews";
import SchedulingFindings from "./SchedulingFindings";
import styles from "../checks/DataChecks.module.css";

export const metadata = { title: "Scheduling issues", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SchedulingPage({ params }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");
  const { id } = await params;
  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    include: { timesheets: {
      orderBy: { sourceName: "asc" },
      include: { user: { select: { name: true, preferredFirstName: true, preferredLastName: true } } },
    } },
  });
  if (!batch) notFound();

  const names = Object.fromEntries(batch.timesheets.map((sheet) => [sheet.id, sheet.user ? preferredName(sheet.user) : sheet.sourceName]));
  const { rows, groups } = schedulingView(batch, names);
  const { dayViews, anySchedule } = buildFindings(batch);
  const sheets = new Map(batch.timesheets.map((sheet) => [sheet.id, sheet]));
  // Each day is sent once, even when several bookings or clock findings name it.
  const days = {};
  for (const row of rows) {
    if (days[row.dayKey]) continue;
    const sheet = sheets.get(row.timesheetId);
    const attendance = attendanceOf(batch, sheet.sourceName);
    days[row.dayKey] = {
      preview: dayViews.get(row.dayKey) || { day: { date: row.date } },
      schedulePages: sheet.data?.scheduleCheck?.byDate?.[row.date]?.pages || [],
      clockMatched: !!attendance?.matched,
      clockIssues: (attendance?.findings || []).filter((f) => f.date === row.date)
        .map((f) => `${COMPLIANCE_KINDS[f.kind].label}: ${COMPLIANCE_KINDS[f.kind].describe(f)}`),
    };
  }
  const period = batchPeriodLabels(batch.periodFrom, batch.periodTo);
  const people = new Set(rows.map((row) => row.timesheetId)).size;

  return (
    <section className={styles.page}>
      <BackLink href={`/portal/admin/timesheets/${id}`}>Back to pay period</BackLink>
      <header className={styles.header}>
        <div>
          <p className={styles.period}>{period.eyebrow} · {batch.program === "DP" ? "Day program" : "ILS"}</p>
          <h1>Scheduling issues</h1>
          <p className={styles.subtitle}>{period.title}</p>
        </div>
        <Link href={`/portal/admin/timesheets/${id}/people`} className={styles.button}>
          <Users size={16} aria-hidden="true" /> View all employees
        </Link>
      </header>
      <BatchViews batchId={id} count={batch.timesheets.length} active="scheduling" />
      <div className={styles.overview}>
        <div className={styles.reviewSummary}>
          <span className={styles.reviewCount}>{rows.length}</span>
          <div><p>Scheduling findings</p><span>Across {people} {people === 1 ? "employee" : "employees"} in this pay period.</span></div>
        </div>
        <details className={styles.about}>
          <summary><Info size={16} aria-hidden="true" /> About these findings <ChevronDown size={14} aria-hidden="true" /></summary>
          <p>Booking limits, overlaps, travel and clock-report issues for the office to review. These findings do not add premium hours or appear on signed timesheets. Correct the schedule in QuickSolve and review clock discrepancies against the source report.</p>
        </details>
      </div>
      {!anySchedule && <p className={styles.warning}>No matched schedule is available for this period. Scheduling checks are limited to the data in this upload.</p>}
      {!batch.clockFindings && <p className={styles.warning}>No clock report is available for this period. Clock-in, clock-out, location and worked-duration checks could not be assessed.</p>}
      <SchedulingFindings batchId={id} rows={rows} groups={groups} days={days} hasSchedule={!!batch.scheduleUrl} hasClock={!!batch.clockFindings} />
      <footer className={styles.footer}>
        <p className="font-semibold text-foreground">Prevent the same issues next period</p>
        <p>Use the findings to correct bookings in QuickSolve and follow up on clock records. Nothing on this page changes hours or premiums.</p>
        <Link href={`/portal/admin/timesheets/patterns?program=${batch.program}`} className={styles.textLink}>View repeat patterns across periods →</Link>
      </footer>
    </section>
  );
}
