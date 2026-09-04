"use client";

// PRESENT / ABSENT WITHOUT THE PAGE RELOAD - Mánu 2026-09-04: "its so damn
// slow." These were two <form> posts that revalidated and redirected the
// whole announcement page per click. Now the mark lands in local state the
// instant it is pressed and the light write catches up underneath - the same
// shape the attendance board uses. Pressing the active mark clears it.
import { createContext, useContext, useState, useTransition } from "react";
import { markAttendance } from "../actions";

const BTN =
  "rounded-md border px-2 py-0.5 text-[11px] font-semibold transition";

// THE COUNT LINE MOVES WITH THE CLICKS - Mánu 2026-09-04: "why does it say 6
// present when ive clicked them all but one." The header was server text from
// page load; it only ever looked live because every click used to reload the
// page. Each session's block now shares this context: buttons report their
// delta, the counts component adds it to the server-rendered starting point.
const RollCtx = createContext(null);

export function RollCallProvider({ children }) {
  const [d, setD] = useState({ p: 0, a: 0 });
  const adjust = (prev, next) =>
    setD((v) => ({
      p: v.p - (prev === "present" ? 1 : 0) + (next === "present" ? 1 : 0),
      a: v.a - (prev === "absent" ? 1 : 0) + (next === "absent" ? 1 : 0),
    }));
  return <RollCtx.Provider value={{ d, adjust }}>{children}</RollCtx.Provider>;
}

export function RollCallCounts({ going, present, absent }) {
  const ctx = useContext(RollCtx);
  const p = present + (ctx?.d.p || 0);
  const a = absent + (ctx?.d.a || 0);
  return (
    <>
      {going} going
      {p || a ? ` · ${p} present · ${a} absent` : ""}
    </>
  );
}

export default function RollCallButtons({ postId, userId, optionId = null, attended = null }) {
  const [att, setAtt] = useState(attended);
  const ctx = useContext(RollCtx);
  const [, start] = useTransition();
  const press = (status) => {
    const next = att === status ? "" : status;
    ctx?.adjust(att, next || null);
    setAtt(next || null);
    start(async () => {
      try { await markAttendance(postId, userId, next, optionId); } catch {}
    });
  };
  return (
    <>
      <button
        type="button"
        onClick={() => press("present")}
        className={`${BTN} ${
          att === "present"
            ? "border-green-500 bg-green-500 text-white"
            : "border-border-strong text-muted hover:border-green-500 hover:text-green-600"
        }`}
      >
        Present
      </button>
      <button
        type="button"
        onClick={() => press("absent")}
        className={`${BTN} ${
          att === "absent"
            ? "border-rose-500 bg-rose-500 text-white"
            : "border-border-strong text-muted hover:border-rose-500 hover:text-rose-600"
        }`}
      >
        Absent
      </button>
    </>
  );
}

// ONE COLUMN OR TWO, THE READER'S CALL - Mánu 2026-09-04: "give me the option
// to have one or 2 columns." The choice drives a CSS variable the session
// grids read, and it sticks in this browser like the board's view pick does.
export function RosterColumns({ children }) {
  const [cols, setCols] = useState(2);
  const [loaded, setLoaded] = useState(false);
  if (!loaded && typeof window !== "undefined") {
    try {
      const saved = window.localStorage.getItem("meeting-roster-cols");
      if (saved === "1" || saved === "2") setCols(Number(saved));
    } catch {}
    setLoaded(true);
  }
  const pick = (n) => {
    setCols(n);
    try { window.localStorage.setItem("meeting-roster-cols", String(n)); } catch {}
  };
  const chip = (n, label) => (
    <button
      type="button"
      onClick={() => pick(n)}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
        cols === n ? "bg-brand-light text-white" : "text-muted hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div style={{ "--roster-cols": cols }}>
      <div className="mt-2 hidden justify-end sm:flex">
        <span className="inline-flex rounded-lg border border-border bg-surface p-0.5">
          {chip(1, "1 column")}
          {chip(2, "2 columns")}
        </span>
      </div>
      {children}
    </div>
  );
}
