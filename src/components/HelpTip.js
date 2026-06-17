"use client";

// little "?" bubble that reveals a short explanation on hover (desktop) and
// tap/click (touch). hover handlers sit on the wrapper so moving onto the
// popover keeps it open.
import { useState } from "react";

export default function HelpTip({ label, children }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label || "More info"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-4 w-4 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 transition hover:bg-sky-300"
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-6 z-30 block w-72 rounded-md border border-border bg-surface p-3 text-left text-xs font-normal not-italic leading-relaxed text-muted shadow-lg"
        >
          {children}
        </span>
      )}
    </span>
  );
}
