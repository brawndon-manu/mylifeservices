"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";

// header dropdown that behaves like a real menu: opens on click, and
// closes when you click outside it, hit Escape, open a different
// dropdown (that's just an outside-click on this one), or navigate to a
// new page. native <details> didnt do any of that, so this is a small
// client component instead.
//
// props:
//   - label:           the trigger text
//   - align:           "left" | "right" (which edge the panel hangs off)
//   - triggerClassName: extra classes for the trigger button
//   - children:        the menu items (Link elements)
export default function NavDropdown({
  label,
  align = "left",
  triggerClassName = "",
  children,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const pathname = usePathname();

  // close whenever the route changes (e.g. user clicked a menu link)
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // close on outside click + Escape, only while open
  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className={`flex cursor-pointer items-center gap-1 rounded px-1 py-1 transition hover:text-brand-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${triggerClassName}`}
      >
        {label}
        <svg
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 8l4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute top-full z-50 mt-2 w-52 rounded-md border border-border bg-surface p-1 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
