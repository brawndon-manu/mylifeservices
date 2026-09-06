"use client";

import { useId, useRef, useState } from "react";
import AuditMenu from "./AuditMenu";
import styles from "./audit.module.css";

const REPORTS = [
  { key: "workbook", title: "Audit workbook", format: "Excel", description: "All seven worksheets in one workbook." },
  { key: "client-report", title: "Client hours", format: "PDF", description: "Billable hours and monthly authorizations.", detailed: true },
  { key: "report", title: "Flagged shifts", format: "PDF", description: "Saved flags, reviewer notes and corrected hours.", detailed: true },
  { key: "client-calendar", title: "Client calendars", format: "PDF", description: "A calendar of services for each client." },
];

export default function AuditDownloads({ batchId, periodLabel, reportsPage = false }) {
  const [report, setReport] = useState(REPORTS[0]);
  const [detailed, setDetailed] = useState(false);
  const dialog = useRef(null);
  const titleId = useId();
  const open = (next, event) => {
    event.currentTarget.closest("details")?.removeAttribute("open");
    setReport(next);
    setDetailed(false);
    dialog.current.showModal();
  };
  const href = `/portal/admin/audit/${batchId}/${report.key}${report.detailed && detailed ? "?detailed=1" : ""}`;
  return <>
    {reportsPage ? <div className={styles.reportList}>
      {REPORTS.map((item) => <button type="button" key={item.key} onClick={(e) => open(item, e)}>
        <span className={styles.fileIcon}>{item.format === "Excel" ? "XLSX" : "PDF"}</span>
        <span><strong>{item.title}</strong><small>{item.description}</small></span><span aria-hidden="true">↓</span>
      </button>)}
    </div> : <AuditMenu label="Download">
      <p className={styles.menuHeading}>Entire period</p>
      {REPORTS.map((item) => <button type="button" key={item.key} onClick={(e) => open(item, e)}>{item.title}<small>{item.format}</small></button>)}
    </AuditMenu>}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} onClick={(e) => { if (e.target === e.currentTarget) dialog.current.close(); }}>
      <div className={styles.dialogBody}>
        <div className={styles.sectionHeading}><h2 id={titleId}>{report.title}</h2><button className={styles.close} type="button" aria-label="Close download options" onClick={() => dialog.current.close()}>×</button></div>
        <p>{report.description}</p>
        <div className={styles.scope}><strong>{periodLabel || "Entire period"}</strong><span>Includes the entire uploaded period. View filters do not limit this report.</span></div>
        {report.detailed && <fieldset className={styles.exportOptions}><legend>Include</legend>
          <label><input type="radio" name={titleId} checked={!detailed} onChange={() => setDetailed(false)} /> Summary</label>
          <label><input type="radio" name={titleId} checked={detailed} onChange={() => setDetailed(true)} /> Detailed shift records</label>
        </fieldset>}
        <div className={styles.dialogActions}>
          {report.format === "PDF" && <a className={styles.secondary} href={href} target="_blank" rel="noopener noreferrer">Preview PDF ↗</a>}
          <a className={styles.primary} href={href} download>Download {report.format === "Excel" ? "Excel" : "PDF"}</a>
        </div>
      </div>
    </dialog>
  </>;
}
