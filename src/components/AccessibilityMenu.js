"use client";

// accessibility menu in the header / portal nav. holds the dark-mode toggle
// for now, and is built to grow (font size, reduce motion, underline links,
// etc.). theme is applied by toggling a `.dark` class on <html> and saved to
// localStorage; the no-flash script in the root layout restores it on load.
import { useEffect, useRef, useState } from "react";

export default function AccessibilityMenu({ align = "right", openUp = false, variant = "inline" }) {
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const ref = useRef(null);

  // sync initial state from whatever the no-flash script set on <html>.
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  // close on outside click + Escape while open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggleDark() {
    const next = !dark;
    setDark(next);
    const el = document.documentElement;
    if (next) el.classList.add("dark");
    else el.classList.remove("dark");
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* ignore (private mode etc.) */
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Accessibility options"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={
          variant === "fab"
            ? "flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-muted shadow-lg transition hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            : "flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted transition hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        }
      >
        <AccessIcon className="h-5 w-5" />
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute z-50 w-60 rounded-xl border border-border bg-surface p-2 shadow-lg ${
            openUp ? "bottom-full mb-2" : "top-full mt-2"
          } ${align === "right" ? "right-0" : "left-0"}`}
        >
          <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-faint">
            Accessibility
          </p>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={dark}
            onClick={toggleDark}
            className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm text-foreground transition hover:bg-surface-2"
          >
            <span className="flex items-center gap-2">
              {dark ? <MoonIcon className="h-4 w-4" /> : <SunIcon className="h-4 w-4" />}
              Dark mode
            </span>
            <span
              aria-hidden
              className={`flex h-5 w-9 items-center rounded-full p-0.5 transition ${
                dark ? "bg-brand-light" : "bg-border-strong"
              }`}
            >
              <span
                className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  dark ? "translate-x-4" : ""
                }`}
              />
            </span>
          </button>
          {/* more accessibility options land here later (font size, reduce
              motion, underline links, dyslexia-friendly font). */}
        </div>
      )}
    </div>
  );
}

function AccessIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="7.3" r="1.1" fill="currentColor" stroke="none" />
      <path d="M5.8 9.5c1.9.9 4 1.4 6.2 1.4s4.3-.5 6.2-1.4" />
      <path d="M12 10.9V15m0 0l-2.4 4.1M12 15l2.4 4.1" />
    </svg>
  );
}

function SunIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8z" />
    </svg>
  );
}
