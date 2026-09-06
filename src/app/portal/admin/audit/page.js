import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp, canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { monthLabelOf } from "@/lib/timesheet/budget-capture";
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
      notesName: true, serviceNotesName: true, createdAt: true,
      serviceNotes: { select: { noteCount: true, pdfCount: true, serviceCount: true } },
      uploadedBy: { select: { name: true, preferredFirstName: true, preferredLastName: true } },
    },
  });

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
      <div className={styles.sectionHeading}><h2>Pay periods</h2><span>{batches.length} {batches.length === 1 ? "period" : "periods"}</span></div>
      {batches.length === 0 ? <div className={styles.empty}><p>No audit periods yet.</p><p className={styles.subtitle}>Upload the timesheet, schedule, clock and service note exports to begin.</p></div> : <ul className={styles.periodList}>
        {batches.map((b) => {
          const [month, day] = (b.periodFrom || "").split("/");
          const monthName = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][Number(month) - 1] || "—";
          return <li key={b.id}><Link href={`/portal/admin/audit/${b.id}`} className={styles.periodRow}>
            <span className={styles.calendar} aria-hidden="true"><small>{monthName}</small><strong>{Number(day) || "—"}</strong></span>
            <span><span className={styles.periodTitle}>{b.periodFrom} to {b.periodTo}</span>
              <span className={styles.periodMeta}>{b.serviceNotes?.noteCount || 0} notes
                {b.serviceNotes?.pdfCount && b.serviceNotes?.serviceCount ? ` · ${b.serviceNotes.pdfCount} PDF, ${b.serviceNotes.serviceCount} XLS` : b.serviceNotes?.serviceCount ? " · XLS only" : b.serviceNotes ? " · PDF only" : " · no service notes uploaded"}
                {b.uploadedBy ? ` · ${preferredName(b.uploadedBy)}` : ""}{b.createdAt ? ` · uploaded ${mdy(b.createdAt)}` : ""}
              </span>
            </span><span className={styles.periodArrow} aria-hidden="true">›</span>
          </Link></li>;
        })}
      </ul>}
      <section className={styles.authorizations} aria-label="Monthly authorizations">
        <div className={styles.sectionHeading}><h2>Monthly authorizations</h2><BudgetManager months={months} /></div>
        <p className={styles.subtitle}>Client allowances from the monthly Budget Capture Report.</p>
        {months.length ? months.map((m) => <div className={styles.budgetRow} key={m.key}><strong>{m.label}</strong><span>{m.count} clients</span></div>) : <p className={styles.resultCount}>No monthly authorizations on file.</p>}
      </section>
    </AuditWorkspace>
  );
}
