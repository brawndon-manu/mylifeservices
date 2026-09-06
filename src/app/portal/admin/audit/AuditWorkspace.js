"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  SquareStack, Plus, ListChecks, PanelTop, Users, UserRound,
  FileQuestion, FileX, FileDown,
} from "lucide-react";
import styles from "./audit.module.css";

// THE PORTAL'S APPEARANCE GOVERNS THIS WORKSPACE. The accessibility menu at
// the bottom right sets .dark / .night on <html>, restored by the no-flash
// script like every other page; the module's :global(.dark) blocks restate
// the workspace palette for each. The workspace used to carry its own
// appearance button and storage, which meant the audit could disagree with
// the rest of the portal - one control now.
export default function AuditWorkspace({ children, page = "home", view = "shifts", onView, hasLost = false, canUpload = true, periodLabel = null }) {
  // THE SIDEBAR FOLDS AWAY - Mánu 2026-09-06, pointing at the same button in
  // Claude: room for the cards when the nav is not needed. The choice sticks
  // per browser; on a phone the nav is already a slim strip and stays put,
  // which also keeps it reachable there since the topbar hides on phones.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("audit-sidebar") === "collapsed"); } catch { /* default open */ }
  }, []);
  const toggleSidebar = () =>
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem("audit-sidebar", next ? "collapsed" : "open"); } catch { /* not remembered */ }
      return next;
    });
  // Lucide outline icons throughout - Mánu 2026-09-06 sent the mockups and
  // the mapping table; the ticks, dots and calendar tiles stay text and CSS
  const views = [
    ["shifts", "Shifts", ListChecks], ["focus", "Focused review", PanelTop], ["employee", "Employees", Users],
    ["client", "Clients", UserRound], ["orphans", "Unmatched notes", FileQuestion],
    ...(hasLost ? [["lost", "Disappeared shifts", FileX]] : []), ["reports", "Reports", FileDown],
  ];
  return (
    <section className={styles.workspace} data-collapsed={collapsed ? "true" : "false"}>
      <aside className={styles.sidebar}>
        <Link href="/portal/admin" className={styles.back}>‹ Admin</Link>
        <p className={styles.brand}>Audit</p>
        <nav aria-label="Audit navigation">
          <Link href="/portal/admin/audit" aria-current={page === "home" ? "page" : undefined}><SquareStack size={15} aria-hidden="true" /> Audit home</Link>
          {canUpload && <Link href="/portal/admin/audit/new" aria-current={page === "new" ? "page" : undefined}><Plus size={15} aria-hidden="true" /> New audit copy</Link>}
          {onView && <>
            <p className={styles.navLabel}>{periodLabel || "This period"}</p>
            {views.map(([key, label, Icon]) => <button key={key} type="button" aria-current={view === key ? "page" : undefined} onClick={() => onView(key)}><Icon size={15} aria-hidden="true" /> {label}</button>)}
          </>}
        </nav>
        <p className={styles.sidebarNote}>Compare the records.<br />Review each shift.</p>
      </aside>
      <div className={styles.main}>
        <div className={styles.topbar}>
          <span className={styles.topbarLead}>
            <button
              type="button"
              className={styles.collapse}
              onClick={toggleSidebar}
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Show the sidebar" : "Hide the sidebar"}
              title={collapsed ? "Show the sidebar" : "Hide the sidebar"}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <rect x="1.5" y="2.5" width="13" height="11" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
                <line x1="6.2" y1="2.5" x2="6.2" y2="13.5" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            </button>
            <span>My Life Services <span className={styles.slash} aria-hidden="true">/</span> Audit</span>
          </span>
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </section>
  );
}
