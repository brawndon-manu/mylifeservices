import { ArrowRight, Check, ChevronDown, ClipboardCheck, Download, FileText } from "lucide-react";
import styles from "./EmployeeCard.module.css";

const fmt = (n) => (Math.round((n || 0) * 100) / 100).toFixed(2);

export function TimesheetReviewButton({ token }) {
  if (!token) return null;
  return <a className={styles.primary} href={`/t/${token}?preview=1`} target="_blank" rel="noopener noreferrer"><ClipboardCheck size={16} aria-hidden="true" />Timesheet review</a>;
}

export function EmployeeHours({ row }) {
  const difference = Math.round((row.paidHours - row.rawHours) * 100) / 100;
  const pay = row.pay;
  const included = [pay.includedPto > 0 && `${fmt(pay.includedPto)} PTO hours`, pay.includedSick > 0 && `${fmt(pay.includedSick)} sick-pay hours`].filter(Boolean);
  return <div className={styles.hours}>
    <dl className={styles.compare}>
      <div><dt>QSP hours</dt><dd>{fmt(row.rawHours)}</dd></div>
      <div className={styles.arrow}><ArrowRight size={17} aria-label="compared with" /></div>
      <div><dt>Our hours</dt><dd className={styles.number}>{fmt(row.paidHours)}</dd></div>
    </dl>
    <p className={styles.difference}>{difference === 0 ? <><Check size={14} aria-hidden="true" />Hours match</> : `${fmt(Math.abs(difference))} hrs ${difference > 0 ? "added" : "removed"}`}</p>
    {included.length > 0 && <p className={styles.note}>Includes {included.join(" and ")}<br />{fmt(pay.worked)} hours worked</p>}
    {(row.otHours > 0 || row.doubleHours > 0) && <p className={styles.note}>{[row.otHours > 0 && `OT ${fmt(row.otHours)}`, row.doubleHours > 0 && `DT ${fmt(row.doubleHours)}`].filter(Boolean).join(" · ")}</p>}
  </div>;
}

export function EmployeePayDetails({ pay }) {
  const line = (kind, label, value) => <div className={styles.payRow} key={kind}><span><i className={`${styles.dot} ${styles[kind]}`} aria-hidden="true" />{label}</span><strong>{fmt(value)} <small>hrs</small></strong></div>;
  return <section className={styles.pay} aria-label="Pay details">
    <h3 className={styles.payTitle}>Pay details <span>Hours</span></h3>
    <div className={styles.payGroups}>
      <div><p className={styles.paySub}>Projected premiums</p>{line("meal", "Meal premiums", pay.meal)}{pay.rest > 0 && line("rest", "Rest premiums", pay.rest)}</div>
      <div><p className={styles.paySub}>Recorded leave</p>{line("pto", "PTO", pay.pto)}{line("sick", "Sick pay", pay.sick)}</div>
    </div>
  </section>;
}

export function EmployeeDownloads({ row, batchId, hasSource, hasSchedule }) {
  const base = `/portal/admin/timesheets/sheet/${row.id}/download`;
  const settled = row.approvedAt || row.signedAt;
  const links = [];
  if (row.hasPdf) {
    if (settled) links.push([base, row.approvedAt ? "Approved (final)" : "Final - signed"]);
    links.push([`${base}?basis=projected${settled ? "&original=1" : ""}`, `projected ${fmt(row.premiumProjected)}`]);
  }
  if (row.previewToken) links.push([`/t/${row.previewToken}/pdf`, "Generated timesheet (PDF)"]);
  const source = (doc, pages) => `/portal/admin/timesheets/${batchId}/source?doc=${doc}${pages?.[0] ? `#page=${pages[0]}` : ""}`;
  if (hasSource) links.push([source("timesheet", row.docs?.sourcePages), "QSP timesheet (PDF)"]);
  if (hasSchedule) links.push([source("schedule", row.docs?.schedulePages), "QSP schedule (PDF)"]);
  if (!links.length) return null;
  return <details className={styles.downloads} onKeyDown={(event) => {
    if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
  }}>
    <summary className={styles.button}><Download size={16} aria-hidden="true" />Downloads<ChevronDown size={14} aria-hidden="true" /></summary>
    <div className={styles.downloadMenu}>{links.map(([href, label]) => <a key={href} href={href} target="_blank" rel="noopener noreferrer" onClick={(event) => { event.currentTarget.closest("details").open = false; }}><FileText size={15} aria-hidden="true" />{label}</a>)}</div>
  </details>;
}
