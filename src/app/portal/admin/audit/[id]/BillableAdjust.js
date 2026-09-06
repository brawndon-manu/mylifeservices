"use client";

// THE ADJUSTMENT LIVES BEHIND A BUTTON - Mánu 2026-09-04: "i feel like i
// would get confused when i go to the flags and i see the times there if i
// didnt change it or not." Until the button is pressed no figure exists, the
// flag records nothing, and the reports keep saying CORRECTED BILLING TBD -
// untouched looks untouched.
//
// THE TIME IS THE ENTRY - Mánu 2026-09-06, in three steps: "the option to
// include the time when adjusting the billable hours"; "when i press 3 it
// auto goes to 3:00 PM etc. just how it is in the timesheets"; "remove the
// billable entry and the hr and min entry... whateer time we unput it
// should auto show the hr and minutes next the time entry of it." So the
// panel is the chips, a from and to time, and the figure those times make,
// shown right beside them. Both boxes run the timesheets' own
// parseLooseTime with his workday rule and normalise on blur or Enter; the
// review still stores minutes, exactly as before. The chips answer without
// times and empty the boxes so they never describe a figure they did not
// produce. Clear wipes the figure and collapses back to the button - a
// cleared adjustment is NOT a zero.
//
// Shared by the deck's flag panel and the card DecideBar, so the two places
// cannot drift. `value` is the parent's billable state: minutes as a string,
// "" meaning nothing recorded - exactly what the actions already send.
import { useState } from "react";
import { hrs } from "./figures";
import { minsWords } from "@/lib/timesheet/hours-label";
import { parseLooseTime, formatTimeDisplay } from "@/lib/loose-time";

export default function BillableAdjust({ billedMin, clockedMin, documentedMin, value, onChange }) {
  const [open, setOpen] = useState(value !== "" && value != null);
  const [tFrom, setTFrom] = useState({ text: "", hhmm: "" });
  const [tTo, setTTo] = useState({ text: "", hhmm: "" });
  const clearTimes = () => { setTFrom({ text: "", hhmm: "" }); setTTo({ text: "", hhmm: "" }); };

  const setAll = (min) => {
    if (min == null || !Number.isFinite(min)) {
      onChange("");
      return;
    }
    onChange(String(Math.max(0, Math.min(Math.round(min), 1440))));
  };
  // a time commits on blur or Enter, the timesheet way: loose entry
  // normalises to "03:00 PM", and once both ends read and run forward the
  // figure recomputes
  const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
  const commitTime = (side, text) => {
    const hhmm = parseLooseTime(text, { assumeWorkday: true });
    const next = hhmm ? { text: formatTimeDisplay(hhmm), hhmm } : { text, hhmm: "" };
    const f = side === "from" ? next : tFrom;
    const t = side === "to" ? next : tTo;
    if (side === "from") setTFrom(next);
    else setTTo(next);
    if (f.hhmm && t.hhmm) {
      const span = toMin(t.hhmm) - toMin(f.hhmm);
      if (span > 0) setAll(span);
    }
  };

  const min = value !== "" && value != null && Number.isFinite(Number(value)) ? Number(value) : null;
  const chip =
    "rounded-full border border-border-strong px-2.5 py-1 text-xs font-medium text-muted transition hover:border-brand hover:text-brand";
  const box =
    "rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-sm text-right text-foreground focus:border-brand focus:outline-none";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 rounded-md border border-amber-400 px-3 py-1.5 text-sm font-medium text-amber-700 transition hover:bg-amber-100/60 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/40"
      >
        Adjust the billable time
      </button>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        {clockedMin != null && (
          <button type="button" onClick={() => { clearTimes(); setAll(clockedMin); }} className={chip}>
            Clocked · {hrs(clockedMin)}
          </button>
        )}
        {documentedMin != null && documentedMin !== clockedMin && (
          <button type="button" onClick={() => { clearTimes(); setAll(documentedMin); }} className={chip}>
            Documented · {hrs(documentedMin)}
          </button>
        )}
        <button type="button" onClick={() => { clearTimes(); setAll(0); }} className={chip}>
          Nothing billable
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2.5">
        <span className="text-xs text-muted">Time</span>
        <input
          aria-label="billable from time"
          value={tFrom.text}
          onChange={(e) => setTFrom({ text: e.target.value, hhmm: "" })}
          onBlur={(e) => commitTime("from", e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
          placeholder="3:00 PM"
          className={`${box} w-24`}
        />
        <span className="text-xs text-muted">to</span>
        <input
          aria-label="billable to time"
          value={tTo.text}
          onChange={(e) => setTTo({ text: e.target.value, hhmm: "" })}
          onBlur={(e) => commitTime("to", e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
          placeholder="4:45 PM"
          className={`${box} w-24`}
        />
        {min != null && (
          <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
            {hrs(min)}
            {minsWords(min) ? ` (${minsWords(min)})` : ""}
            {billedMin != null && (
              <span className="font-normal text-muted"> · was billed {hrs(billedMin)}</span>
            )}
          </span>
        )}
        <button
          type="button"
          onClick={() => { setAll(null); clearTimes(); setOpen(false); }}
          className="text-xs font-medium text-muted underline underline-offset-4 hover:text-foreground"
        >
          Clear the adjustment
        </button>
      </div>
    </div>
  );
}
