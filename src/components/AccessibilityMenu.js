"use client";

// accessibility menu (rendered as a fixed corner button site-wide). controls:
//   - Appearance: Light / Dim / Night theme
//   - Text size: Default / Large / Larger
//   - toggles: reduce motion, underline links, readable font, line spacing,
//     larger cursor, high contrast
// each control toggles a class / data-attr on <html> and persists to
// localStorage; the no-flash script in the root layout restores them on load.
// NOTE: the toggles persist + flip now; the visual CSS behavior for the
// text-size / motion / font / etc. options gets wired up in a later pass.
import { useEffect, useRef, useState } from "react";

const THEMES = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dim", label: "Dim", Icon: MoonIcon },
  { value: "night", label: "Night", Icon: NightIcon },
];

const TEXT_SIZES = [
  { value: "default", label: "Default", size: "text-xs" },
  { value: "large", label: "Large", size: "text-sm" },
  { value: "larger", label: "Larger", size: "text-base" },
];

// each toggle is a class on <html>; the localStorage key is the class name.
const TOGGLES = [
  { cls: "a11y-reduce-motion", label: "Reduce motion", Icon: MotionIcon },
  { cls: "a11y-underline-links", label: "Underline links", Icon: UnderlineIcon },
  { cls: "a11y-readable-font", label: "Readable font", Icon: FontIcon },
  { cls: "a11y-line-spacing", label: "More line spacing", Icon: SpacingIcon },
  { cls: "a11y-large-cursor", label: "Larger cursor", Icon: CursorIcon },
  { cls: "a11y-high-contrast", label: "High contrast", Icon: ContrastIcon },
];

export default function AccessibilityMenu({ align = "right", openUp = false, variant = "inline" }) {
  const [open, setOpen] = useState(false);
  const [theme, setThemeState] = useState("light");
  const [textSize, setTextSizeState] = useState("default");
  const [active, setActive] = useState({}); // { [cls]: true }
  const ref = useRef(null);

  // sync initial state from whatever the no-flash script set on <html>.
  useEffect(() => {
    const el = document.documentElement;
    setThemeState(
      el.classList.contains("night") ? "night" : el.classList.contains("dark") ? "dim" : "light",
    );
    setTextSizeState(el.dataset.textsize || "default");
    const a = {};
    for (const t of TOGGLES) a[t.cls] = el.classList.contains(t.cls);
    setActive(a);
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

  function save(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* ignore (private mode etc.) */
    }
  }

  function setTheme(t) {
    setThemeState(t);
    const c = document.documentElement.classList;
    c.toggle("dark", t === "dim" || t === "night");
    c.toggle("night", t === "night");
    save("theme", t);
  }

  function setTextSize(s) {
    setTextSizeState(s);
    const el = document.documentElement;
    if (s === "default") {
      delete el.dataset.textsize;
      save("a11y-textsize", null);
    } else {
      el.dataset.textsize = s;
      save("a11y-textsize", s);
    }
  }

  function toggle(cls) {
    const next = !active[cls];
    setActive((a) => ({ ...a, [cls]: next }));
    document.documentElement.classList.toggle(cls, next);
    save(cls, next ? "1" : null);
  }

  function resetAll() {
    setTextSize("default");
    for (const t of TOGGLES) {
      setActive((a) => ({ ...a, [t.cls]: false }));
      document.documentElement.classList.remove(t.cls);
      save(t.cls, null);
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
          className={`absolute z-50 max-h-[80vh] w-64 overflow-y-auto rounded-xl border border-border bg-surface p-3 shadow-lg ${
            openUp ? "bottom-full mb-2" : "top-full mt-2"
          } ${align === "right" ? "right-0" : "left-0"}`}
        >
          <SectionLabel>Appearance</SectionLabel>
          <div className="flex gap-1.5">
            {THEMES.map(({ value, label, Icon }) => (
              <SegButton key={value} active={theme === value} onClick={() => setTheme(value)}>
                <Icon className="h-4 w-4" />
                {label}
              </SegButton>
            ))}
          </div>

          <Divider />
          <SectionLabel>Text size</SectionLabel>
          <div className="flex gap-1.5">
            {TEXT_SIZES.map(({ value, label, size }) => (
              <SegButton key={value} active={textSize === value} onClick={() => setTextSize(value)}>
                <span className={`font-semibold ${size}`}>A</span>
                {label}
              </SegButton>
            ))}
          </div>

          <Divider />
          <div className="space-y-0.5">
            {TOGGLES.map(({ cls, label, Icon }) => (
              <button
                key={cls}
                type="button"
                role="menuitemcheckbox"
                aria-checked={!!active[cls]}
                onClick={() => toggle(cls)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm text-foreground transition hover:bg-surface-2"
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted" />
                  {label}
                </span>
                <Switch on={!!active[cls]} />
              </button>
            ))}
          </div>

          <Divider />
          <button
            type="button"
            onClick={resetAll}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-muted transition hover:bg-surface-2"
          >
            <ResetIcon className="h-3.5 w-3.5" />
            Reset all
          </button>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">{children}</p>
  );
}

function Divider() {
  return <div className="my-2.5 h-px bg-border" />;
}

function SegButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition ${
        active
          ? "border-brand-light bg-surface-2 text-foreground"
          : "border-border text-muted hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}

function Switch({ on }) {
  return (
    <span
      aria-hidden
      className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${
        on ? "bg-brand-light" : "bg-border-strong"
      }`}
    >
      <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : ""}`} />
    </span>
  );
}

/* --- icons --- */
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
function NightIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="7.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
function MotionIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M5 12l3-3M5 12l3 3M19 12l-3-3M19 12l-3 3" />
    </svg>
  );
}
function UnderlineIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14" />
    </svg>
  );
}
function FontIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 18l4-11 4 11M5.5 14h5M14 18l3-8 3 8M14.8 15.5h4.4" />
    </svg>
  );
}
function SpacingIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}
function CursorIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 3l7 17 2.5-6.5L21 11z" />
    </svg>
  );
}
function ContrastIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
    </svg>
  );
}
function ResetIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4v6h6M20 20v-6h-6" />
      <path d="M20 10a8 8 0 0 0-14.3-3.4L4 8M4 14a8 8 0 0 0 14.3 3.4L20 16" />
    </svg>
  );
}
