"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import styles from "./audit.module.css";

const APPEARANCES = ["System", "Light", "Dark"];
const storageKey = "audit-appearance";
let fallbackAppearance = "System";
function subscribe(callback) {
  window.addEventListener("storage", callback);
  window.addEventListener("audit-appearance", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("audit-appearance", callback);
  };
}
function readAppearance() {
  try {
    const saved = localStorage.getItem(storageKey);
    return APPEARANCES.includes(saved) ? saved : "System";
  } catch { return fallbackAppearance; }
}

export default function AuditWorkspace({ children, page = "home", view = "shifts", onView, hasLost = false, canUpload = true }) {
  const appearance = useSyncExternalStore(subscribe, readAppearance, () => "System");
  const cycle = () => {
    const next = APPEARANCES[(APPEARANCES.indexOf(appearance) + 1) % APPEARANCES.length];
    fallbackAppearance = next;
    try { localStorage.setItem(storageKey, next); } catch { /* Keep cycling when storage is unavailable. */ }
    window.dispatchEvent(new Event("audit-appearance"));
  };
  const views = [
    ["shifts", "Shifts"], ["focus", "Focused review"], ["employee", "Employees"],
    ["client", "Clients"], ["orphans", "Unmatched notes"],
    ...(hasLost ? [["lost", "Disappeared shifts"]] : []), ["reports", "Reports"],
  ];
  return (
    <section className={styles.workspace} style={{ colorScheme: appearance === "System" ? "light dark" : appearance.toLowerCase() }} data-appearance={appearance.toLowerCase()}>
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
          <button type="button" className={styles.appearance} onClick={cycle} title="Cycle between System, Light and Dark">◐ <span>Appearance: {appearance}</span></button>
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </section>
  );
}
