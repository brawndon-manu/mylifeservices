import PayoutTable from "./PayoutTable";
import { ChevronDown, Download, FileSpreadsheet, FileText, Check, CircleAlert } from "lucide-react";
import { batchPeriodLabels } from "@/lib/timesheet/batch-overview";
import styles from "./PayoutReport.module.css";
import BatchViews from "../../_components/BatchViews";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { payrollName, preferredName } from "@/lib/contacts";
import BackLink from "@/components/BackLink";
import { batchPremiumStanding } from "@/lib/timesheet/premium-split";
import { payoutTimeOff } from "@/lib/timesheet/time-off";

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
            // SALARIED EXEMPT, because the status column reads "Exempt" for them
            // rather than saying whether they signed. Left off the select it
            // comes back undefined, which reads as not exempt, and the column
            // would go back to asking a question nobody can answer.
            select: { name: true, preferredFirstName: true, preferredLastName: true, salariedExempt: true },
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
    // Every record of this person's time off at once - see payoutTimeOff.
    // `moved` is already inside the QSP-paid figures so worked shrinks by it
    // and payable cannot change; `added` is what payable grows by.
    const off = payoutTimeOff(t, (t.userId && timeOffBy.get(t.userId)) || null);
    return {
    id: t.id,
    who: payrollName(t.user, t.sourceName),
    preferred: preferredLabel(t.user),
    sourceName: t.sourceName,
    matched: !!t.userId,
    regularHours: Math.max(0, (t.regularHours || 0) - off.moved),
    otHours: t.otHours,
    doubleHours: t.doubleHours,
    paidHours: Math.max(0, (t.paidHours || 0) - off.moved),
    premiumHours: standing.byId[t.id]?.charged ?? 0,
    assumptionHours: standing.byId[t.id]?.assumptions ?? 0,
    ptoHours: off.pto,
    sickHours: off.sick,
    payable:
      (t.paidHours || 0)
      + (standing.byId[t.id]?.charged ?? 0)
      + off.added,
    // MILES DRIVEN, from the payroll report's own column, stored on the sheet
    // at upload. Null where that report was not uploaded or predates the
    // column - which is not zero miles, so the cell says nothing rather than
    // 0.00. Reimbursed per mile, never hours, so it stays out of `payable`.
    miles: t.data?.qspMiles ?? null,
    signedAt: t.signedAt,
    approvedAt: t.approvedAt,
    // THE STATUS COLUMN SAYS "EXEMPT" INSTEAD OF WHETHER THEY SIGNED - Mánu
    // 2026-09-16: "for the payout report too it would just say exempt if they
    // signed or not". They are never emailed and their sheet asks for no
    // signature, so "Not signed" was reading as an outstanding job on three
    // people who have nothing to do. April and Kristy DID sign in August,
    // before the flag existed, and the column says Exempt on those too - his
    // wording, and the signature is not what the row is about any more.
    salariedExempt: t.user?.salariedExempt === true,
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

  const period = batchPeriodLabels(batch.periodFrom, batch.periodTo);
  const number = (value) => Number(fmt(value)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <section className={styles.report}>
      <div className={styles.back}>
        <BackLink href={`/portal/admin/timesheets/${batch.id}`}>Back to the batch</BackLink>
      </div>
      <header className={styles.header}>
        <div>
          <p className={styles.month}>{period.eyebrow} · {batch.program === "DP" ? "Day program" : "ILS"}</p>
          <h1>Payout report</h1>
          <p className={styles.subtitle}>{period.title} · {rows.length} employees</p>
        </div>
        <details className={styles.downloads}>
          <summary className={styles.button}><Download size={16} aria-hidden="true" />Download report<ChevronDown size={14} aria-hidden="true" /></summary>
          <nav className={styles.menu} aria-label="Report downloads">
            <a href={`/portal/admin/timesheets/${batch.id}/report/xlsx`}><FileSpreadsheet size={16} aria-hidden="true" /><span>Excel workbook<small>Summary, payout, and penalty hours</small></span></a>
            <a href={`/portal/admin/timesheets/${batch.id}/report/pdf`} target="_blank" rel="noopener noreferrer"><FileText size={16} aria-hidden="true" /><span>PDF report<small>Opens in a new tab</small></span></a>
            <a href={`/portal/admin/timesheets/${batch.id}/report/csv`}><FileSpreadsheet size={16} aria-hidden="true" /><span>CSV spreadsheet</span></a>
          </nav>
        </details>
      </header>
      <BatchViews batchId={batch.id} count={batch.timesheets.length} active="payout" />

      <section className={styles.summary} aria-label="Pay period totals">
        <div className={styles.summaryTop}>
          <div>
            <p className={styles.label}>Total hours payable</p>
            <p className={styles.payable}>{number(totals.payable)} <span>hrs</span></p>
            <p className={styles.caption}>Work + premiums + recorded leave</p>
          </div>
          <div className={styles.summaryAside}>
            <span className={styles.status} data-settled={standing.settled}>
              {standing.settled ? <Check size={14} aria-hidden="true" /> : <CircleAlert size={14} aria-hidden="true" />}
              {standing.settled ? "Premiums settled" : "Provisional premiums"}
            </span>
            <p className={styles.caption}>{standing.settled ? `${standing.people} employees answered` : `${standing.waiting} of ${standing.people} awaiting answers`}</p>
          </div>
        </div>
        <dl className={styles.breakdown}>
          <Metric label="Hours worked" value={number(totals.paidHours)} />
          <Metric label="Miles driven" value={number(totals.miles)} unit="mi" />
          <Metric label="Premium hours" value={number(totals.premiumHours)} />
          <Metric label="PTO" value={number(totals.ptoHours)} />
          <Metric label="Sick pay" value={number(totals.sickHours)} />
        </dl>
        <div className={styles.mileage}>
          <span>Mileage is reimbursed separately from hours{!knownMiles && " · Mileage not supplied"}</span>
        </div>
      </section>

      {/* WHETHER THE PREMIUM COLUMN IS FINISHED CHANGING, AND WHICH WAY.
          THIS INVERTED ON 2026-08-11. It used to read "can rise and cannot
          fall": a break somebody said they missed put a premium back on. Now
          every fault is charged from the start and confirming one is what takes
          it off, so the total can only come DOWN. The warning is no longer that
          an employee gets shortchanged - it is that payroll budgets a figure
          that has not finished shrinking. */}
      {standing.settled ? (
        <details className={styles.explanation}><summary><Check size={16} aria-hidden="true" />Premium review complete<ChevronDown size={14} aria-hidden="true" /></summary><p>
          <strong>Final.</strong> All {standing.people} have answered what they were
          asked about their breaks. Nothing further can move the premium column,
          in either direction.
        </p></details>
      ) : (
        <details className={`${styles.explanation} ${styles.caution}`}><summary><CircleAlert size={16} aria-hidden="true" />Premiums may decrease by up to {fmt(standing.assumptions)} hours<ChevronDown size={14} aria-hidden="true" /></summary><p>
          <strong>Provisional.</strong> {standing.waiting} of {standing.people} have not
          answered yet. Every break the reports do not show is charged here, so up to{" "}
          <strong>{fmt(standing.assumptions)}</strong> premium hours come OFF if everyone
          still to answer confirms they took theirs. This total can fall and cannot
          rise.
        </p></details>
      )}

      {(disputed > 0 || unmatched > 0) && (
        <div className={styles.notes}>
          {disputed > 0 && (
            <div className={styles.warning}>
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
            <div className={styles.warning}>
              <strong>{unmatched}</strong> row
              {unmatched === 1 ? " is" : "s are"} not matched to an account. They
              are counted in the totals but named only as QSP printed them.
            </div>
          )}

        </div>
      )}

      <PayoutTable rows={rows} totals={totals} periodTitle={period.title} />

      {/* THE ONE LINE THAT KEEPS THE ZERO HONEST. The column reads 0.00 until a
          payroll report carrying `Miles Driven` is uploaded, and on a payroll
          document a zero somebody cannot account for is worse than a blank. So
          where no figure is known at all, the table says why underneath. */}
      {!knownMiles && (
        <p className={styles.footnote}>
          Miles driven reads 0.00 because the payroll report for this period was
          uploaded before QuickSolve added its mileage column. Upload the current
          report to fill it in.
        </p>
      )}
    </section>
  );
}

function Metric({ label, value, unit = "hrs" }) {
  return <div><dt>{label}</dt><dd>{value}<span> {unit}</span></dd></div>;
}

function preferredLabel(user) {
  if (!user) return null;
  const clean = (value) => String(value || "").trim().replace(/\s+/g, " ");
  const legal = clean(user.name);
  const preferredFirst = clean(user.preferredFirstName);
  const preferredLast = clean(user.preferredLastName);
  if (!preferredFirst && !preferredLast) return null;
  const full = clean(preferredName({ ...user, preferredFirstName: preferredFirst, preferredLastName: preferredLast }));
  if (full.toLocaleLowerCase() === legal.toLocaleLowerCase()) return null;
  const sameLast = !preferredLast || legal.toLocaleLowerCase().endsWith(` ${preferredLast.toLocaleLowerCase()}`);
  return sameLast ? preferredFirst || legal.split(" ")[0] : full;
}
