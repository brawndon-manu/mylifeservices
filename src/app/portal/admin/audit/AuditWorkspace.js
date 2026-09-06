"use client";

import Link from "next/link";
import styles from "./audit.module.css";

// THE PORTAL'S APPEARANCE GOVERNS THIS WORKSPACE. The accessibility menu at
// the bottom right sets .dark / .night on <html>, restored by the no-flash
// script like every other page; the module's :global(.dark) blocks restate
// the workspace palette for each. The workspace used to carry its own
// appearance button and storage, which meant the audit could disagree with
// the rest of the portal - one control now.
export default function AuditWorkspace({ children, page = "home", view = "shifts", onView, hasLost = false, canUpload = true }) {
  const views = [
    ["shifts", "Shifts"], ["focus", "Focused review"], ["employee", "Employees"],
    ["client", "Clients"], ["orphans", "Unmatched notes"],
    ...(hasLost ? [["lost", "Disappeared shifts"]] : []), ["reports", "Reports"],
  ];
  return (
    <section className={styles.workspace}>
      <aside className={styles.sidebar}>
        <Link href="/portal/admin" className={styles.back}>‹ Admin</Link>
        <p className={styles.brand}>Audit</p>
        <nav aria-label="Audit navigation">
          <Link href="/portal/admin/audit" aria-current={page === "home" ? "page" : undefined}>Audit home</Link>
          {canUpload && <Link href="/portal/admin/audit/new" aria-current={page === "new" ? "page" : undefined}>New audit copy</Link>}
          {onView && <>
            <p className={styles.navLabel}>This period</p>
            {views.map(([key, label]) => <button key={key} type="button" aria-current={view === key ? "page" : undefined} onClick={() => onView(key)}>{label}</button>)}
          </>}
        </nav>
        <p className={styles.sidebarNote}>Compare the records.<br />Review each shift.</p>
      </aside>
      <div className={styles.main}>
        <div className={styles.topbar}>
          <span>My Life Services <span aria-hidden="true">/</span> Audit</span>
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </section>
  );
}
