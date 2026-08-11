"use client";

import { useEffect, useState } from "react";

// THE SIMPLE / DETAILED SWITCH. Mánu 2026-08-11: "I feel like this may be too
// complicated. Maybe we can add a simple view option as well, for something
// they're more familiar with."
//
// Both arrangements ask the same questions through the same component and write
// the same answers - only the ORDER and the picture above them differ. Simple
// walks the pay period day by day with the day drawn on a time axis; Detailed is
// what has been here all along, one card per kind of question.
const VIEWS = [
  { key: "simple", label: "Day by day" },
  { key: "detailed", label: "All questions" },
];
const STORE_KEY = "mls-timesheet-view";

// WHAT SOMEBODY SEES BEFORE THEY CHOOSE. Simple, because the reason it exists is
// that the other one is too much for the people being asked - there is no point
// defaulting to the view we are trying to move away from. One word to flip it.
const DEFAULT_VIEW = "simple";

export default function TimesheetViews({ simple, detailed }) {
  const [view, setView] = useState(DEFAULT_VIEW);
  // read after mount, not during render: the server has already sent
  // DEFAULT_VIEW and localStorage does not exist there.
  useEffect(() => {
    const saved = window.localStorage.getItem(STORE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved && VIEWS.some((v) => v.key === saved)) setView(saved);
  }, []);

  const pick = (k) => {
    setView(k);
    try {
      window.localStorage.setItem(STORE_KEY, k);
    } catch {}
  };

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="text-xs text-faint">View</span>
        <span className="inline-flex rounded-lg border border-border bg-surface p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => pick(v.key)}
              aria-pressed={view === v.key}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                view === v.key
                  ? "bg-brand text-white"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {v.label}
            </button>
          ))}
        </span>
      </div>
      {/* ONE TREE AT A TIME. Keeping both mounted and hiding one with CSS would
          leave two copies of every question card holding two copies of a
          half-finished answer, and the hidden one would still be in the tab
          order. Switching loses an answer that was typed but not confirmed,
          which is the right way round - an unsaved answer should not follow you
          into a different arrangement of the same page. */}
      {view === "simple" ? simple : detailed}
    </>
  );
}
