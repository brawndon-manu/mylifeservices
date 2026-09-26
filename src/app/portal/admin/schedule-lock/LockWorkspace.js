"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { SquareStack, Plus, ListChecks, CalendarCheck } from "lucide-react";
import styles from "../audit/audit.module.css";

// the folded sidebar, remembered per browser under the audit's own key so the
// two workspaces fold together. Read as an outside store: the server always
// draws it open, and the browser's answer arrives without an effect.
const KEY = "audit-sidebar";
const listeners = new Set();
function subscribe(cb) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => { listeners.delete(cb); window.removeEventListener("storage", cb); };
}
function folded() {
  try { return localStorage.getItem(KEY) === "collapsed"; } catch { return false; }
}

// THE AUDIT'S WORKSPACE, WORN BY THE SCHEDULE LOCK. Same module, same frame,
// same folding sidebar - the two are read side by side and should feel like
// one tool. Its own component only because the nav and the names differ.
export default function LockWorkspace({ children, page = "home", periodLabel = null }) {
  const collapsed = useSyncExternalStore(subscribe, folded, () => false);
  const toggleSidebar = () => {
    try { localStorage.setItem(KEY, collapsed ? "open" : "collapsed"); } catch { /* not remembered */ }
    for (const l of listeners) l();
  };
  return (
    <section className={styles.workspace} data-collapsed={collapsed ? "true" : "false"}>
      <aside className={styles.sidebar}>
        <Link href="/portal/admin" className={styles.back}>‹ Admin</Link>
        <p className={styles.brand}>Schedule lock</p>
        <nav aria-label="Schedule lock navigation">
          <Link href="/portal/admin/schedule-lock" aria-current={page === "home" ? "page" : undefined}><SquareStack size={15} aria-hidden="true" /> Schedule lock home</Link>
          <Link href="/portal/admin/schedule-lock/new" aria-current={page === "new" ? "page" : undefined}><Plus size={15} aria-hidden="true" /> New upload</Link>
          {periodLabel && <>
            <p className={styles.navLabel}>{periodLabel}</p>
            {page === "lock"
              ? <button type="button" aria-current="page"><CalendarCheck size={15} aria-hidden="true" /> Locked schedule</button>
              : <button type="button" aria-current="page"><ListChecks size={15} aria-hidden="true" /> Changes</button>}
          </>}
        </nav>
        <p className={styles.sidebarNote}>Lock the days.<br />Decide every change.</p>
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
            <span>My Life Services <span className={styles.slash} aria-hidden="true">/</span> Schedule lock</span>
          </span>
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </section>
  );
}
