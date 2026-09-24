"use client";

import { useId, useRef, useState } from "react";
import { Table2, FileChartColumn, Flag, CalendarDays, FileSignature, Download } from "lucide-react";
import AuditMenu from "./AuditMenu";
import styles from "./audit.module.css";

// each report wears its own Lucide icon - his mockup mapping, 2026-09-06
const REPORTS = [
  { key: "workbook", title: "Audit workbook", format: "Excel", Icon: Table2, description: "All seven worksheets in one workbook." },
  { key: "client-report", title: "Client hours", format: "PDF", Icon: FileChartColumn, description: "Billable hours and monthly authorizations.", detailed: true },
  { key: "report", title: "Flagged shifts", format: "PDF", Icon: Flag, description: "Saved flags, reviewer notes and corrected hours.", detailed: true, byType: true },
  { key: "client-calendar", title: "Client calendars", format: "PDF", Icon: CalendarDays, description: "A calendar of services for each client." },
  { key: "addenda", title: "Clock addenda", format: "PDF", Icon: FileSignature, description: "Every addendum on this period: what changed, who signed, who approved." },
];

// `flagTypes` is the period's flags counted by what they're for ({ total,
// groups: [{ group, label, types: [{ key, label, count }] }] }, flag-types.js),
// so the flagged report can go out for one kind of flag alone
export default function AuditDownloads({ batchId, periodLabel, reportsPage = false, flagTypes = null }) {
  const [report, setReport] = useState(REPORTS[0]);
  const [detailed, setDetailed] = useState(false);
  const [which, setWhich] = useState("all");
  const [picked, setPicked] = useState(() => new Set());
  const dialog = useRef(null);
  const titleId = useId();
  const open = (next, event) => {
    event.currentTarget.closest("details")?.removeAttribute("open");
    setReport(next);
    setDetailed(false);
    setWhich("all");
    setPicked(new Set());
    dialog.current.showModal();
  };
  const tick = (key) => {
    setWhich("only");
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const byType = report.byType && flagTypes?.groups?.length > 0;
  const onlySome = byType && which === "only";
  // "only these" with nothing ticked would be every flag under another name
  const blocked = onlySome && picked.size === 0;
  const query = [
    report.detailed && detailed ? "detailed=1" : null,
    onlySome && picked.size ? `types=${[...picked].join(",")}` : null,
  ].filter(Boolean);
  const href = `/portal/admin/audit/${batchId}/${report.key}${query.length ? `?${query.join("&")}` : ""}`;
  return <>
    {reportsPage ? <div className={styles.reportList}>
      {REPORTS.map((item) => <button type="button" key={item.key} onClick={(e) => open(item, e)}>
        <span className={styles.fileIcon}><item.Icon size={19} aria-hidden="true" /></span>
        <span><strong>{item.title}</strong><small>{item.description}</small></span><Download size={15} aria-hidden="true" />
      </button>)}
    </div> : <AuditMenu label={<><Download size={14} aria-hidden="true" /> Download</>}>
      <p className={styles.menuHeading}>Entire period</p>
      {REPORTS.map((item) => <button type="button" key={item.key} onClick={(e) => open(item, e)}><span className={styles.menuLead}><item.Icon size={14} aria-hidden="true" /> {item.title}</span><small>{item.format}</small></button>)}
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
        {byType && <fieldset className={styles.exportOptions}><legend>Flags</legend>
          <label><input type="radio" name={`${titleId}-which`} checked={which === "all"} onChange={() => setWhich("all")} /> Every flag · {flagTypes.total}</label>
          <label><input type="radio" name={`${titleId}-which`} checked={which === "only"} onChange={() => setWhich("only")} /> Only these</label>
          <div className={styles.flagTypes} role="group" aria-label="Which flags">
            {flagTypes.groups.map((g) => <div key={g.group}>
              <p className={styles.flagGroup}>{g.label}</p>
              {g.types.map((t) => <label key={t.key} className={styles.flagType}>
                <span><input type="checkbox" checked={picked.has(t.key)} onChange={() => tick(t.key)} /> {t.label}</span>
                <small>{t.count}</small>
              </label>)}
            </div>)}
          </div>
          <p className={styles.flagHint}>{blocked ? "Tick at least one kind of flag." : "The report says which flags it holds. A flag of two kinds is in both."}</p>
        </fieldset>}
        <div className={styles.dialogActions}>
          {report.format === "PDF" && (blocked
            ? <span className={styles.secondary} aria-disabled="true">Preview PDF ↗</span>
            : <a className={styles.secondary} href={href} target="_blank" rel="noopener noreferrer">Preview PDF ↗</a>)}
          {blocked
            ? <span className={styles.primary} aria-disabled="true"><Download size={14} aria-hidden="true" /> Download PDF</span>
            : <a className={styles.primary} href={href} download><Download size={14} aria-hidden="true" /> Download {report.format === "Excel" ? "Excel" : "PDF"}</a>}
        </div>
      </div>
    </dialog>
  </>;
}
