import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp, canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { monthLabelOf } from "@/lib/timesheet/budget-capture";
import { ChevronRight } from "lucide-react";
import AuditWorkspace from "./AuditWorkspace";
import BudgetManager from "./BudgetManager";
import styles from "./audit.module.css";

export const metadata = { title: "Audit", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const BUDGET_ERRORS = {
  nofile: "Pick the Budget Capture Report file first.",
  notitle:
    "That file doesn't carry the Budget Capture Report title line, so its month can't be read.",
  crossmonth:
    "That report spans more than one calendar month. Authorized hours are monthly - export it for one month.",
  empty: "No client rows with authorized hours were found in that file.",
  unreadable: "That file couldn't be read as a QSP .xls export.",
};

// 09/04/26 - the same date shape every list on the admin side speaks
const mdy = (dt) => {
  const d = new Date(dt);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
};

// 09/06/26 · 7:52 AM - a superseded copy is one of several that day, so its
// row leads with when it landed
const mdyTime = (dt) => {
  const d = new Date(dt);
  let h = d.getHours();
  const half = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${mdy(dt)} · ${h}:${String(d.getMinutes()).padStart(2, "0")} ${half}`;
};

export default async function AuditPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) redirect("/portal");
  const sp = await searchParams;
  const budgetSaved =
    typeof sp?.budget === "string" && /^\d{4}-\d{2}$/.test(sp.budget)
      ? { month: monthLabelOf(sp.budget), clients: Number(sp.clients) || 0, skipped: Number(sp.skipped) || 0 }
      : null;
  const budgetError = sp?.budgeterr ? BUDGET_ERRORS[sp.budgeterr] || "Something went wrong." : null;

  // which months already have authorized hours on file
  const budgetMonths = await prisma.clientAuthorization.groupBy({
    by: ["monthKey"],
    _count: true,
    _max: { createdAt: true },
    orderBy: { monthKey: "desc" },
  });

  // A PAY PERIOD, NOT AN UPLOAD OF ITS OWN, 2026-08-27. Mánu: "i want to be
  // able to upload all of this info just to the timesheets page ... i also want
  // to do it by timesheet pay period." The service notes arrive with every
  // other export now, so this lists the periods that have them.
  //
  // SELECTED WITHOUT `notes`. That column holds every note of the period -
  // about a megabyte for a fortnight - and a list of a year of them would pull
  // twenty-six megabytes to print twenty-six dates. The schema says so beside
  // the field.
  const batches = await prisma.timesheetBatch.findMany({
    // a period appears here through its payroll upload's service notes, or as
    // an audit copy - fresh exports uploaded for this page alone, superseding
    // nothing on the payroll side
    where: {
      program: "MLS",
      OR: [{ serviceNotes: { isNot: null } }, { auditOnly: true }],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, periodFrom: true, periodTo: true, auditOnly: true,
      notesName: true, serviceNotesName: true, createdAt: true, partialThrough: true,
      auditShiftCount: true, auditNewCount: true, auditFreshCount: true,
      serviceNotes: { select: { noteCount: true, pdfCount: true, serviceCount: true } },
      uploadedBy: { select: { name: true, preferredFirstName: true, preferredLastName: true } },
    },
  });

  // ONE WORKING COPY PER MONTH, THE REST FOLDED - the daily upload rhythm
  // lands thirty copies a month, so the list groups by the month the copies
  // supersede within. The newest audit copy of a month is the current one;
  // every earlier copy is superseded, frozen, still openable, and shows how
  // many of its shifts carry stars.
  const starCounts = Object.fromEntries(
    (await prisma.auditShiftStar.groupBy({ by: ["batchId"], _count: { _all: true } }))
      .map((s) => [s.batchId, s._count._all]),
  );
  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const monthGroups = [];
  const groupByKey = new Map();
  for (const b of batches) {
    const m = /^(\d{2})\/\d{2}\/(\d{2})$/.exec(b.periodFrom || "");
    const key = m ? `20${m[2]}-${m[1]}` : "unknown";
    let g = groupByKey.get(key);
    if (!g) {
      g = {
        key,
        label: m ? `${MONTH_NAMES[Number(m[1]) - 1] || m[1]} 20${m[2]}` : "Other uploads",
        audit: [],
        payroll: [],
      };
      groupByKey.set(key, g);
      monthGroups.push(g);
    }
    (b.auditOnly ? g.audit : g.payroll).push(b);
  }

  const months = budgetMonths.map((m) => ({ key: m.monthKey, label: monthLabelOf(m.monthKey), count: m._count }));
  const canUpload = canManageTimesheets(user?.role);
  return (
    <AuditWorkspace canUpload={canUpload}>
      <header className={styles.heading}>
        <div><h1>Audit</h1><p className={styles.subtitle}>A clearer view of every shift.</p></div>
        {canUpload && <Link href="/portal/admin/audit/new" className={styles.primary}>New audit copy</Link>}
      </header>
      {budgetError && <p role="alert" className={styles.notice}>{budgetError}</p>}
      {budgetSaved && <p role="status" className={styles.notice}>Authorized hours saved for {budgetSaved.month}: {budgetSaved.clients} clients.{budgetSaved.skipped > 0 && ` ${budgetSaved.skipped} rows had no readable hours.`}</p>}
      {batches.length === 0 ? <>
        <div className={styles.sectionHeading}><h2>Pay periods</h2><span>0 periods</span></div>
        <div className={styles.empty}><p>No audit periods yet.</p><p className={styles.subtitle}>Upload the timesheet, schedule, clock and service note exports to begin.</p></div>
      </> : monthGroups.map((g) => {
        const current = g.audit[0] || null;
        const earlier = g.audit.slice(1);
        const uploads = g.audit.length + g.payroll.length;
        const row = (b, isCurrent) => {
          const [month, day, yy] = (b.periodFrom || "").split("/");
          const monthName = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][Number(month) - 1] || "—";
          // AN AUDIT COPY IS A MONTH, NOT A PAY PERIOD - Mánu 2026-09-08, off
          // the daily rhythm: "it should show the month instead of the
          // timeframe of a timesheet... I want it to show the timeframe of
          // data we have collected." So the title names the month and the
          // tile carries the days the copy actually reaches - periodFrom
          // through the trim date, or the period's end once the month is
          // over. Payroll uploads keep the pay-period reading; a fortnight
          // is exactly what they are.
          const thruDay = Number(((b.partialThrough || b.periodTo) || "").split("/")[1]) || null;
          const fromDay = Number(day) || null;
          return <Link href={`/portal/admin/audit/${b.id}`} className={styles.periodRow}>
            {b.auditOnly ? (
              <span className={`${styles.calendar} ${styles.calendarData}`} aria-hidden="true">
                <small>{monthName}</small>
                <strong>{fromDay && thruDay ? (fromDay === thruDay ? thruDay : `${fromDay}–${thruDay}`) : "—"}</strong>
                <span>20{yy}</span>
              </span>
            ) : (
              <span className={styles.calendar} aria-hidden="true"><small>{monthName}</small><strong>{Number(day) || "—"}</strong></span>
            )}
            <span><span className={styles.periodTitle}>{b.auditOnly ? g.label : `${b.periodFrom} to ${b.periodTo}`}
              {isCurrent && <span className={styles.statusChip} data-tone="current">● Current copy</span>}
            </span>
              {/* an audit copy's line answers his three questions in order:
                  the exact days the data spans, how many shifts it holds and
                  how many arrived on already-collected days, and when it was
                  uploaded to the minute - Mánu 2026-09-09 */}
              {b.auditOnly && b.auditShiftCount != null ? (
                <span className={styles.periodMeta}>
                  {b.periodFrom} to {b.partialThrough || b.periodTo} · {b.auditShiftCount} shifts
                  {b.auditFreshCount ? ` · ${b.auditFreshCount} first collected` : ""}
                  {b.auditNewCount ? ` · ${b.auditNewCount} added late` : ""}
                  {b.createdAt ? ` · uploaded ${mdyTime(b.createdAt)}` : ""}
                  {b.uploadedBy ? ` · ${preferredName(b.uploadedBy)}` : ""}
                </span>
              ) : (
                <span className={styles.periodMeta}>{b.partialThrough ? `Through ${b.partialThrough} · ` : ""}{b.serviceNotes?.noteCount || 0} notes
                  {b.serviceNotes?.pdfCount && b.serviceNotes?.serviceCount ? ` · ${b.serviceNotes.pdfCount} PDF, ${b.serviceNotes.serviceCount} XLS` : b.serviceNotes?.serviceCount ? " · XLS only" : b.serviceNotes ? " · PDF only" : " · no service notes uploaded"}
                  {b.uploadedBy ? ` · ${preferredName(b.uploadedBy)}` : ""}{b.createdAt ? ` · uploaded ${mdy(b.createdAt)}` : ""}
                </span>
              )}
            </span><span className={styles.periodArrow} aria-hidden="true">›</span>
          </Link>;
        };
        return <section key={g.key}>
          <div className={styles.sectionHeading}><h2>{g.label}</h2><span>{uploads} {uploads === 1 ? "upload" : "uploads"}</span></div>
          <ul className={styles.periodList}>
            {current && <li key={current.id}>{row(current, true)}</li>}
            {g.payroll.map((b) => <li key={b.id}>{row(b, false)}</li>)}
          </ul>
          {earlier.length > 0 && <details className={styles.fold}>
            <summary><ChevronRight size={13} aria-hidden="true" /> Earlier uploads ({earlier.length}) · Superseded</summary>
            {earlier.map((b) => <Link key={b.id} href={`/portal/admin/audit/${b.id}`} className={styles.oldRow}>
              <span className={styles.oldWhen}>{mdyTime(b.createdAt)}</span>
              {/* the days of shifts the copy held, not just where it stopped -
                  Mánu 2026-09-08: "needs to show the timeframes of shifts
                  given, as well as the upload date and time"; shifts, not
                  notes, since 2026-09-09 */}
              <span>{b.periodFrom} to {b.partialThrough || b.periodTo}{b.auditShiftCount != null ? ` · ${b.auditShiftCount} shifts` : ` · ${b.serviceNotes?.noteCount || 0} notes`}{b.auditFreshCount ? ` · ${b.auditFreshCount} first collected` : ""}{b.auditNewCount ? ` · ${b.auditNewCount} added late` : ""}</span>
              <span className={styles.statusChip}>Superseded</span>
              {starCounts[b.id] ? <span className={styles.starCount}>★ {starCounts[b.id]} starred</span> : null}
            </Link>)}
          </details>}
        </section>;
      })}
      <section className={styles.authorizations} aria-label="Monthly authorizations">
        <div className={styles.sectionHeading}><h2>Monthly authorizations</h2><BudgetManager months={months} /></div>
        <p className={styles.subtitle}>Client allowances from the monthly Budget Capture Report.</p>
        {months.length ? months.map((m) => <div className={styles.budgetRow} key={m.key}><strong>{m.label}</strong><span>{m.count} clients</span></div>) : <p className={styles.resultCount}>No monthly authorizations on file.</p>}
      </section>
    </AuditWorkspace>
  );
}
