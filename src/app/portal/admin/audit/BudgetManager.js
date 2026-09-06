"use client";

import { useId, useRef } from "react";
import { uploadBudgetCapture, deleteBudgetMonth } from "./actions";
import styles from "./audit.module.css";

export default function BudgetManager({ months }) {
  const dialog = useRef(null);
  const titleId = useId();
  return <>
    <button type="button" className={styles.secondary} onClick={() => dialog.current.showModal()}>Manage authorizations</button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId}>
      <div className={styles.dialogBody}>
        <div className={styles.sectionHeading}><h2 id={titleId}>Monthly authorizations</h2><button type="button" className={styles.close} aria-label="Close authorizations" onClick={() => dialog.current.close()}>×</button></div>
        <p>Upload the QSP Budget Capture Report for one calendar month. Uploading the same month replaces its authorized hours.</p>
        <form action={uploadBudgetCapture} className={styles.budgetForm}>
          <label htmlFor="budget-file">Budget Capture Report (.xls)</label>
          <input id="budget-file" name="file" type="file" accept=".xls,application/vnd.ms-excel" required />
          <button type="submit" className={styles.primary}>Upload report</button>
        </form>
        {months.map((month) => <div key={month.key} className={styles.budgetRow}>
          <span><strong>{month.label}</strong><small>{month.count} clients</small></span>
          <form action={deleteBudgetMonth} onSubmit={(e) => { if (!window.confirm(`Remove authorized hours for ${month.label}?`)) e.preventDefault(); }}>
            <input type="hidden" name="monthKey" value={month.key} />
            <button type="submit" className={styles.dangerText}>Remove</button>
          </form>
        </div>)}
      </div>
    </dialog>
  </>;
}
