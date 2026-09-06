"use client";

import { useEffect, useRef } from "react";
import styles from "./audit.module.css";

export default function AuditMenu({ label, children }) {
  const menu = useRef(null);
  useEffect(() => {
    const close = (event) => {
      if (!menu.current?.contains(event.target)) menu.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return (
    <details ref={menu} className={styles.menu} onKeyDown={(e) => {
      if (e.key === "Escape") { menu.current.removeAttribute("open"); menu.current.querySelector("summary").focus(); }
    }}>
      <summary className={styles.secondary}>{label} <span aria-hidden="true">⌄</span></summary>
      <div className={styles.menuPanel}>{children}</div>
    </details>
  );
}
