"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import styles from "./PortalNavigation.module.css";

const NavigationContext = createContext(null);

export default function PortalNavigation({ children }) {
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState(null);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const open = openOn !== null && openOn === pathname;

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector("button")?.focus();
    const dismiss = (event) => {
      if (event.type === "keydown") {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        event.preventDefault();
        setOpenOn(null);
        triggerRef.current?.focus();
      } else if (!panelRef.current?.contains(event.target) && !event.target.closest("[data-portal-navigation-toggle]")) {
        setOpenOn(null);
      }
    };
    document.addEventListener("keydown", dismiss);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("focusin", dismiss);
    return () => {
      document.removeEventListener("keydown", dismiss);
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("focusin", dismiss);
    };
  }, [open]);

  return (
    <NavigationContext.Provider value={{ open, panelRef, triggerRef, setOpenOn, pathname }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function PortalNavigationToggle({ collapse = false }) {
  const { open, triggerRef, setOpenOn, pathname } = useContext(NavigationContext);
  const Icon = collapse ? PanelLeftClose : PanelLeft;
  return (
    <button
      type="button"
      data-portal-navigation-toggle=""
      aria-label={open ? "Collapse navigation" : "Open navigation"}
      aria-expanded={open}
      aria-controls="portal-navigation"
      className={styles.toggle}
      onClick={(event) => {
        if (!collapse) triggerRef.current = event.currentTarget;
        setOpenOn(open ? null : pathname);
        if (collapse) triggerRef.current?.focus();
      }}
    >
      <Icon size={20} strokeWidth={1.7} aria-hidden="true" />
    </button>
  );
}

export function PortalNavigationOverlay({ children }) {
  const { open, panelRef, setOpenOn } = useContext(NavigationContext);
  return (
    <div className={styles.anchor}>
      <aside
        ref={panelRef}
        id="portal-navigation"
        hidden={!open}
        className={`portal-chrome-tone ${styles.panel}`}
        onClick={(event) => {
          if (event.target.closest("a")) setOpenOn(null);
        }}
      >
        {children}
      </aside>
    </div>
  );
}
