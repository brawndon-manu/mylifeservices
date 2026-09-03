import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import BackLink from "@/components/BackLink";
import { batchPremiumStanding } from "@/lib/timesheet/premium-split";
import { miscTimeOffHours } from "@/lib/timesheet/time-off";

export const metadata = { title: "Payout report", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const fmt = (n) => (Math.round((n || 0) * 100) / 100).toFixed(2);

export default async function PayoutReportPage({ params }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");

  const { id } = await params;
  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    include: {
      timesheets: {
        orderBy: { sourceName: "asc" },
        include: {
          user: {
            select: { name: true, preferredFirstName: true, preferredLastName: true },
          },
          corrections: {
            where: { OR: [{ status: "open" }, { kind: { startsWith: "q_" } }] },
            select: { id: true, kind: true, date: true, status: true },
          },
        },
      },
    },
  });
  if (!batch) notFound();

  // THE CHARGED FIGURE, and whether it is finished changing. Mánu 2026-08-09
  // late: the projected report is the one. This page keyed off the stored
  // `premiumHours` column, which is the ignoring-assumptions total - 684.00
  // against 59 signed sheets charging 14.00.
  const standing = batchPremiumStanding(batch.timesheets, {
    restRows: batch.restsByDate || [],
  });

  // RECORDED TIME OFF JOINS THE PAYOUT, Mánu's ruling 2026-09-02 off the mock:
  // the calendar's PtoEntry rows are hours of PAY, and a payout report that
  // omits them under-keys payroll until QSP catches up. Split PTO from Sick
  // because payroll keys each under its own code. They stay out of worked
  // hours and overtime entirely - pay yes, work no.
  const ptoRows = await prisma.ptoEntry.findMany({
    where: {
      program: batch.program || "MLS",
      periodFrom: batch.periodFrom,
      periodTo: batch.periodTo,
    },
    select: { personKey: true, hours: true, kind: true },
  });
  const timeOffBy = new Map();
  for (const p of ptoRows) {
    const cur = timeOffBy.get(p.personKey) || { pto: 0, sick: 0 };
    if (p.kind === "sick") cur.sick += p.hours || 0;
    else cur.pto += p.hours || 0;
    timeOffBy.set(p.personKey, cur);
  }

  const rows = batch.timesheets.map((t) => {
    // Misc time classified as PTO/sick sits INSIDE the QSP-paid figures, so
    // it moves columns here rather than adding - worked shrinks by exactly
    // what PTO/Sick gain, and payable is untouched by construction.
    const misc = miscTimeOffHours(t.data?.days);
    return {
    id: t.id,
    who: t.user ? preferredName(t.user) : t.sourceName,
    sourceName: t.sourceName,
    matched: !!t.userId,
    regularHours: Math.max(0, (t.regularHours || 0) - misc.total),
    otHours: t.otHours,
    doubleHours: t.doubleHours,
    paidHours: Math.max(0, (t.paidHours || 0) - misc.total),
    premiumHours: standing.byId[t.id]?.charged ?? 0,
    assumptionHours: standing.byId[t.id]?.assumptions ?? 0,
    ptoHours: ((t.userId && timeOffBy.get(t.userId)?.pto) || 0) + misc.pto,
    sickHours: ((t.userId && timeOffBy.get(t.userId)?.sick) || 0) + misc.sick,
    payable:
      (t.paidHours || 0)
      + (standing.byId[t.id]?.charged ?? 0)
      + ((t.userId && timeOffBy.get(t.userId)?.pto) || 0)
      + ((t.userId && timeOffBy.get(t.userId)?.sick) || 0),
    // MILES DRIVEN, from the payroll report's own column, stored on the sheet
    // at upload. Null where that report was not uploaded or predates the
    // column - which is not zero miles, so the cell says nothing rather than
    // 0.00. Reimbursed per mile, never hours, so it stays out of `payable`.
    miles: t.data?.qspMiles ?? null,
    partialWeek: t.partialWeek,
    signedAt: t.signedAt,
    approvedAt: t.approvedAt,
    // ONLY the open ones - a `q_` row is an ANSWER, not a reported problem
    disputed: t.corrections.some((c) => c.status === "open"),
    recomputed: !!t.recomputedAt,
    };
  });

  const sum = (k) => rows.reduce((n, r) => n + (r[k] || 0), 0);
  const totals = {
    regularHours: sum("regularHours"),
    otHours: sum("otHours"),
    doubleHours: sum("doubleHours"),
    paidHours: sum("paidHours"),
    premiumHours: sum("premiumHours"),
    ptoHours: sum("ptoHours"),
    sickHours: sum("sickHours"),
    timeOff: sum("ptoHours") + sum("sickHours"),
    payable: sum("payable"),
    miles: Math.round(rows.reduce((n, r) => n + (r.miles || 0), 0) * 100) / 100,
  };
  // THE COLUMN ALWAYS SHOWS. Mánu 2026-08-17: it should be there reading 0
  // until a report carrying the mileage column is uploaded.
  //
  // `knownMiles` is what stops that being a lie. A batch whose payroll report
  // predates the column has NO figure, which is not the same as nobody having
  // driven - so when nothing is known the table says so underneath in one
  // line, rather than leaving 0.00 to be read as a fact on a payroll document.
  const knownMiles = rows.some((r) => r.miles != null);

  const disputed = rows.filter((r) => r.disputed).length;
  const unmatched = rows.filter((r) => !r.matched).length;
  const partial = rows.filter((r) => r.partialWeek).length;

  return (
    <section className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink href={`/portal/admin/timesheets/${batch.id}`}>Back to the batch</BackLink>
        <span className="flex flex-wrap items-center gap-2">
          <a
            href={`/portal/admin/timesheets/${batch.id}/report/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-brand bg-brand/10 px-3 py-1.5 text-sm font-semibold text-brand transition hover:bg-brand/20"
          >
            Download PDF
          </a>
          <a
            href={`/portal/admin/timesheets/${batch.id}/report/csv`}
            className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
          >
            Download CSV
          </a>
        </span>
      </div>

      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Payout report
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {batch.periodFrom} to {batch.periodTo}
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        What this pay period owes, per person and in total. This is the figures
        only - the signed timesheets are a separate record and download
        separately from the batch.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Big label="Hours worked" value={fmt(totals.paidHours)} />
        <Big label="Premium hours" value={fmt(totals.premiumHours)} tone="prem" />
        {/* the calendar's recorded time off - pay, never worked time, so it
            has its own tile and joins only the payable figure */}
        <Big label="Time off hours" value={fmt(totals.timeOff)} />
        <Big label="Total hours payable" value={fmt(totals.payable)} strong />
        {/* mileage is reimbursed rather than paid as hours, so it sits beside
            the hour figures and is never added into them */}
        <Big label="Miles driven" value={fmt(totals.miles)} />
      </div>

      {/* WHETHER THE PREMIUM COLUMN IS FINISHED CHANGING, AND WHICH WAY.
          THIS INVERTED ON 2026-08-11. It used to read "can rise and cannot
          fall": a break somebody said they missed put a premium back on. Now
          every fault is charged from the start and confirming one is what takes
          it off, so the total can only come DOWN. The warning is no longer that
          an employee gets shortchanged - it is that payroll budgets a figure
          that has not finished shrinking. */}
      {standing.settled ? (
        <div className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
          <strong>Final.</strong> All {standing.people} have answered what they were
          asked about their breaks. Nothing further can move the premium column,
          in either direction.
        </div>
      ) : (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          <strong>Provisional.</strong> {standing.waiting} of {standing.people} have not
          answered yet. Every break the reports do not show is charged here, so up to{" "}
          <strong>{fmt(standing.assumptions)}</strong> premium hours come OFF if everyone
          still to answer confirms they took theirs. This total can fall and cannot
          rise.
        </div>
      )}

      {(disputed > 0 || unmatched > 0 || partial > 0) && (
        <div className="mt-4 space-y-2">
          {disputed > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              <strong>{disputed}</strong>{" "}
              {disputed === 1 ? "person has" : "people have"} reported a problem
              that hasn&apos;t been resolved. Those figures are likely to change.{" "}
              <Link
                href={`/portal/admin/timesheets/${batch.id}/corrections`}
                className="font-semibold underline underline-offset-4"
              >
                Review them
              </Link>
              .
            </div>
          )}
          {unmatched > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              <strong>{unmatched}</strong> row
              {unmatched === 1 ? " is" : "s are"} not matched to an account. They
              are counted in the totals but named only as QSP printed them.
            </div>
          )}
          {/* The two boundary weeks are NOT the same and this used to call both
              provisional. The one at the START is missing days that already
              happened, so QSP's export can see them and we now take its printed
              overtime where it is higher - that is settled. The one at the END
              is missing days that had not happened when anything was exported,
              so nobody can know them yet. That one is genuinely still open. */}
          {partial > 0 && (
            <div className="rounded-md border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
              <strong>{partial}</strong> sheet{partial === 1 ? "" : "s"} include a
              workweek cut off by the pay-period boundary. The week at the start
              of the period is settled: its missing days sit in the previous
              export, QSP could see them, and the overtime here takes QSP&apos;s
              own figure wherever that is higher than ours. The week at the END
              is still open - its last days fall after this period closes, so no
              export holds them yet, and anyone sitting on 40.00 hours here would
              go into overtime for any time worked on those days.
            </div>
          )}
        </div>
      )}

      <div className="mt-8 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[940px] text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted">
            <tr>
              <Th align="left">Employee</Th>
              <Th>Regular</Th>
              <Th>OT</Th>
              <Th>Double</Th>
              <Th>Hours worked</Th>
              <Th>Premium</Th>
              <Th>PTO</Th>
              <Th>Sick</Th>
              <Th>Total payable</Th>
              <Th>Miles driven</Th>
              <Th align="left">Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 text-foreground">
                  {r.who}
                  {!r.matched && (
                    <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">
                      unmatched
                    </span>
                  )}
                  {r.partialWeek && (
                    <span className="ml-2 text-xs text-muted">partial week</span>
                  )}
                </td>
                <Td>{fmt(r.regularHours)}</Td>
                <Td>{fmt(r.otHours)}</Td>
                <Td>{fmt(r.doubleHours)}</Td>
                <Td strong>{fmt(r.paidHours)}</Td>
                <Td tone={r.premiumHours > 0 ? "prem" : undefined}>
                  {fmt(r.premiumHours)}
                </Td>
                <Td strong={r.ptoHours > 0}>{fmt(r.ptoHours)}</Td>
                <Td strong={r.sickHours > 0}>{fmt(r.sickHours)}</Td>
                <Td strong>{fmt(r.payable)}</Td>
                <Td>{fmt(r.miles || 0)}</Td>
                <td className="px-3 py-2 text-xs text-muted">
                  {r.disputed
                    ? "Reported a problem"
                    : r.approvedAt
                      ? "Approved"
                      : r.signedAt
                        ? "Signed"
                        : "Not signed"}
                  {r.recomputed && " · corrected"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-border-strong bg-surface-2 font-semibold">
            <tr>
              <td className="px-3 py-3 text-foreground">
                {rows.length} employee{rows.length === 1 ? "" : "s"}
              </td>
              <Td>{fmt(totals.regularHours)}</Td>
              <Td>{fmt(totals.otHours)}</Td>
              <Td>{fmt(totals.doubleHours)}</Td>
              <Td strong>{fmt(totals.paidHours)}</Td>
              <Td tone="prem">{fmt(totals.premiumHours)}</Td>
              <Td>{fmt(totals.ptoHours)}</Td>
              <Td>{fmt(totals.sickHours)}</Td>
              <Td strong>{fmt(totals.payable)}</Td>
              <Td strong>{fmt(totals.miles)}</Td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* THE ONE LINE THAT KEEPS THE ZERO HONEST. The column reads 0.00 until a
          payroll report carrying `Miles Driven` is uploaded, and on a payroll
          document a zero somebody cannot account for is worse than a blank. So
          where no figure is known at all, the table says why underneath. */}
      {!knownMiles && (
        <p className="mt-3 text-xs text-muted">
          Miles driven reads 0.00 because the payroll report for this period was
          uploaded before QuickSolve added its mileage column. Upload the current
          report to fill it in.
        </p>
      )}
    </section>
  );
}

function Th({ children, align }) {
  return (
    <th className={`px-3 py-2 font-semibold ${align === "left" ? "text-left" : "text-right"}`}>
      {children}
    </th>
  );
}

function Td({ children, strong, tone }) {
  return (
    <td
      className={`px-3 py-2 text-right tabular-nums ${
        tone === "prem" ? "text-rose-600 dark:text-rose-400" : "text-foreground"
      } ${strong ? "font-semibold" : ""}`}
    >
      {children}
    </td>
  );
}

function Big({ label, value, tone, strong }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          tone === "prem" ? "text-rose-600 dark:text-rose-400" : "text-foreground"
        } ${strong ? "text-3xl" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}
