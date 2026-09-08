"use client";

import { createContext, useContext, useEffect, useState } from "react";

// THE SIMPLE / DETAILED SWITCH. Mánu 2026-08-11: "I feel like this may be too
// complicated. Maybe we can add a simple view option as well, for something
// they're more familiar with."
//
// Both arrangements ask the same questions through the same component and write
// the same answers - only the ORDER and the picture above them differ. Simple
// walks the pay period one day at a time on the rail; Detailed stacks every day
// top to bottom.
//
// THE TOGGLE RENDERS INSIDE THE VIEWS NOW, 2026-09-08 - it sits on the
// "Your days" heading row (his spacing note: two stacked rows read as a gap),
// so this component only holds the state and hands it down through context.
// ViewToggle reads it from wherever the heading row is.
const VIEWS = [
  { key: "simple", label: "Day by day" },
  { key: "detailed", label: "All questions" },
];
const STORE_KEY = "mls-timesheet-view";

// WHAT SOMEBODY SEES BEFORE THEY CHOOSE. Simple, because the reason it exists is
// that the other one is too much for the people being asked - there is no point
// defaulting to the view we are trying to move away from. One word to flip it.
const DEFAULT_VIEW = "simple";

const ViewCtx = createContext(null);

export function ViewToggle() {
  const ctx = useContext(ViewCtx);
  if (!ctx) return null;
  return (
    <span className="inline-flex flex-none gap-0.5 rounded-[9px] bg-fill p-[2.5px]">
      {VIEWS.map((v) => (
        <button
          key={v.key}
          type="button"
          onClick={() => ctx.pick(v.key)}
          aria-pressed={ctx.view === v.key}
          className={`rounded-[7px] px-3.5 py-1.5 text-[12.5px] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${
            ctx.view === v.key
              ? "bg-surface font-semibold text-foreground shadow-sm"
              : "font-medium text-muted hover:text-foreground"
          }`}
        >
          {v.label}
        </button>
      ))}
    </span>
  );
}

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

  // ONE TREE AT A TIME. Keeping both mounted and hiding one with CSS would
  // leave two copies of every question card holding two copies of a
  // half-finished answer, and the hidden one would still be in the tab
  // order. Switching loses an answer that was typed but not confirmed,
  // which is the right way round - an unsaved answer should not follow you
  // into a different arrangement of the same page.
  return (
    <ViewCtx.Provider value={{ view, pick }}>
      {view === "simple" ? simple : detailed}
    </ViewCtx.Provider>
  );
}
