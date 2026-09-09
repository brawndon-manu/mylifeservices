"use client";

import { useEffect, useState } from "react";

// the Settings page's Appearance + Text size + Reading options, in the
// grouped-rows dress. same storage contract as the toolbar pill and the
// public site's accessibility menu: "theme" in localStorage (absence =
// System, follow the OS), data-textsize + a11y-* classes on <html> with
// keys the root layout's no-flash script restores. the pill and this
// control keep each other current over the "mls-theme" window event.
const THEMES = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dim", label: "Dim" },
  { value: "night", label: "Night" },
];

const SIZES = [
  { value: "default", label: "Default" },
  { value: "large", label: "Large" },
  { value: "larger", label: "Larger" },
];

const TOGGLES = [
  { cls: "a11y-reduce-motion", label: "Reduce motion" },
  { cls: "a11y-underline-links", label: "Underline links" },
  { cls: "a11y-readable-font", label: "Readable font" },
  { cls: "a11y-line-spacing", label: "More line spacing" },
  { cls: "a11y-large-cursor", label: "Larger cursor" },
  { cls: "a11y-high-contrast", label: "High contrast" },
];

function applyTheme(choice) {
  const c = document.documentElement.classList;
  let t = choice;
  if (t === "system") {
    t = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dim" : "light";
  }
  c.toggle("dark", t === "dim" || t === "night");
  c.toggle("night", t === "night");
}

function save(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode etc. */
  }
}

export default function AppearanceSettings() {
  const [theme, setTheme] = useState("system");
  const [size, setSize] = useState("default");
  const [active, setActive] = useState({});

  useEffect(() => {
    const el = document.documentElement;
    try {
      setTheme(localStorage.getItem("theme") || "system");
    } catch {
      /* ignore */
    }
    setSize(el.dataset.textsize || "default");
    const a = {};
    for (const t of TOGGLES) a[t.cls] = el.classList.contains(t.cls);
    setActive(a);
    const onTheme = (e) => setTheme(e.detail);
    window.addEventListener("mls-theme", onTheme);
    return () => window.removeEventListener("mls-theme", onTheme);
  }, []);

  function pickTheme(t) {
    setTheme(t);
    save("theme", t === "system" ? null : t);
    applyTheme(t);
    window.dispatchEvent(new CustomEvent("mls-theme", { detail: t }));
  }

  function pickSize(s) {
    setSize(s);
    const el = document.documentElement;
    if (s === "default") {
      delete el.dataset.textsize;
      save("a11y-textsize", null);
    } else {
      el.dataset.textsize = s;
      save("a11y-textsize", s);
    }
  }

  function flip(cls) {
    const next = !active[cls];
    setActive((a) => ({ ...a, [cls]: next }));
    document.documentElement.classList.toggle(cls, next);
    save(cls, next ? "1" : null);
  }

  function resetAll() {
    pickSize("default");
    for (const t of TOGGLES) {
      document.documentElement.classList.remove(t.cls);
      save(t.cls, null);
    }
    setActive({});
  }

  return (
    <>
      <h2 className="mt-7 text-[17px] font-semibold tracking-tight text-foreground">Appearance</h2>
      <Segmented options={THEMES} value={theme} onPick={pickTheme} label="Appearance" />

      <div className="mt-4 text-[13px] font-medium text-muted">Text size</div>
      <Segmented options={SIZES} value={size} onPick={pickSize} label="Text size" />

      <h2 className="mt-7 text-[17px] font-semibold tracking-tight text-foreground">
        Reading options
      </h2>
      <p className="mt-0.5 text-[12.5px] text-faint">
        Saved in this browser, applied to the whole site.
      </p>
      <div className="mt-1">
        {TOGGLES.map(({ cls, label }) => (
          <div
            key={cls}
            className="flex items-center justify-between gap-4 border-b border-sep py-3 last:border-0"
          >
            <span className="text-sm font-medium text-foreground">{label}</span>
            <button
              type="button"
              role="switch"
              aria-checked={!!active[cls]}
              aria-label={label}
              onClick={() => flip(cls)}
              className={`relative h-[23px] w-[38px] flex-none rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                active[cls] ? "bg-emerald-500" : "bg-fill-2"
              }`}
            >
              <span
                aria-hidden="true"
                className={`absolute left-0.5 top-0.5 block h-[19px] w-[19px] rounded-full bg-white shadow transition-transform ${
                  active[cls] ? "translate-x-[15px]" : ""
                }`}
              />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={resetAll}
        className="mt-3 rounded-lg px-2 py-1.5 text-[12.5px] font-medium text-muted transition-colors hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        Reset all
      </button>
    </>
  );
}

function Segmented({ options, value, onPick, label }) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="mt-2 flex gap-0.5 rounded-[9px] bg-fill p-[2.5px]"
    >
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(o.value)}
            className={`flex-1 rounded-[7px] py-1.5 text-[12.5px] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${
              on ? "seg-on font-semibold text-foreground" : "font-medium text-muted"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
