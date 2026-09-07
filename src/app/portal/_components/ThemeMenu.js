"use client";

import { useEffect, useRef, useState } from "react";
import { SunMoon, Sun, Moon, MoonStar, Check } from "lucide-react";

// the toolbar's appearance pill. same storage contract as the accessibility
// controls and the root layout's no-flash script: localStorage "theme" holds
// light / dim / night, and NO stored value means follow the OS - which is
// what System is. picking System removes the key and applies whatever the
// OS prefers right now; while it is active an OS flip re-applies live.
const CHOICES = [
  { value: "system", label: "System", Icon: SunMoon },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dim", label: "Dim", Icon: Moon },
  { value: "night", label: "Night", Icon: MoonStar },
];

function apply(choice) {
  const c = document.documentElement.classList;
  let t = choice;
  if (t === "system") {
    t = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dim" : "light";
  }
  c.toggle("dark", t === "dim" || t === "night");
  c.toggle("night", t === "night");
}

export default function ThemeMenu() {
  const [choice, setChoice] = useState("system");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // read the stored choice once mounted (the no-flash script already applied
  // it, so this only settles the label).
  useEffect(() => {
    try {
      setChoice(localStorage.getItem("theme") || "system");
    } catch {
      /* private mode etc. */
    }
  }, []);

  // while on System, follow the OS live.
  useEffect(() => {
    if (choice !== "system" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(value) {
    setChoice(value);
    setOpen(false);
    try {
      if (value === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", value);
    } catch {
      /* ignore */
    }
    apply(value);
  }

  const current = CHOICES.find((c) => c.value === choice) ?? CHOICES[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={`Appearance: ${current.label}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg bg-fill px-2.5 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-fill-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
      >
        <current.Icon size={15} strokeWidth={1.7} aria-hidden="true" className="text-muted" />
        {current.label}
      </button>
      {open && (
        <div
          role="menu"
          className="nav-pop absolute right-0 top-full z-50 mt-1.5 w-36 rounded-xl border border-sep bg-surface p-1 shadow-lg"
        >
          {CHOICES.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={choice === value}
              onClick={() => pick(value)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-fill"
            >
              <Icon size={15} strokeWidth={1.7} aria-hidden="true" className="text-muted" />
              <span className="flex-1 text-left">{label}</span>
              {choice === value && <Check size={14} aria-hidden="true" className="text-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
