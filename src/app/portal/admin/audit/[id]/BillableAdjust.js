"use client";

// THE ADJUSTMENT LIVES BEHIND A BUTTON - Mánu 2026-09-04: "i feel like i
// would get confused when i go to the flags and i see the times there if i
// didnt change it or not." Until the button is pressed no figure exists, the
// flag records nothing, and the reports keep saying CORRECTED BILLING TBD -
// untouched looks untouched.
//
// Once open, the two sides of one figure: decimal hours and hr + min.
// Typing in either side rewrites the other; minutes clamp to 0-59 and the
// whole figure to a day, the same cap the server enforces. The chips fill
// both sides from the figures already on the card. Clear wipes the figure
// and collapses back to the button - a cleared adjustment is NOT a zero.
//
// Shared by the deck's flag panel and the card DecideBar, so the two places
// cannot drift. `value` is the parent's billable state: minutes as a string,
// "" meaning nothing recorded - exactly what the actions already send.
import { useState } from "react";
import { hrs } from "./figures";
import { minsWords } from "@/lib/timesheet/hours-label";

export default function BillableAdjust({ billedMin, clockedMin, documentedMin, value, onChange }) {
  const [open, setOpen] = useState(value !== "" && value != null);
  const [dec, setDec] = useState("");
  const [hh, setHh] = useState("");
  const [mm, setMm] = useState("");

  const setAll = (min) => {
    if (min == null || !Number.isFinite(min)) {
      setDec(""); setHh(""); setMm("");
      onChange("");
      return;
    }
    const m = Math.max(0, Math.min(Math.round(min), 1440));
    setDec((m / 60).toFixed(2));
    setHh(String(Math.floor(m / 60)));
    setMm(String(m % 60));
    onChange(String(m));
  };
  const fromDec = (t) => {
    setDec(t);
    const v = parseFloat(t);
    if (t.trim() === "" || !Number.isFinite(v) || v < 0) { setHh(""); setMm(""); onChange(""); return; }
    const m = Math.min(Math.round(v * 60), 1440);
    setHh(String(Math.floor(m / 60)));
    setMm(String(m % 60));
    onChange(String(m));
  };
  const fromParts = (h, m) => {
    setHh(h); setMm(m);
    if (h.trim() === "" && m.trim() === "") { setDec(""); onChange(""); return; }
    let hn = parseInt(h, 10);
    let mn = parseInt(m, 10);
    if (!Number.isFinite(hn) || hn < 0) hn = 0;
    if (!Number.isFinite(mn) || mn < 0) mn = 0;
    if (mn > 59) { mn = 59; setMm("59"); }
    const total = Math.min(hn * 60 + mn, 1440);
    setDec((total / 60).toFixed(2));
    onChange(String(total));
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
          <button type="button" onClick={() => setAll(clockedMin)} className={chip}>
            Clocked · {hrs(clockedMin)}
          </button>
        )}
        {documentedMin != null && documentedMin !== clockedMin && (
          <button type="button" onClick={() => setAll(documentedMin)} className={chip}>
            Documented · {hrs(documentedMin)}
          </button>
        )}
        <button type="button" onClick={() => setAll(0)} className={chip}>
          Nothing billable
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2.5">
        <label className="text-xs text-muted" htmlFor="billable-dec">Billable</label>
        <input
          id="billable-dec"
          inputMode="decimal"
          value={dec}
          onChange={(e) => fromDec(e.target.value)}
          placeholder={billedMin != null ? (billedMin / 60).toFixed(2) : "0.00"}
          className={`${box} w-20`}
        />
        <span className="text-xs text-muted">h</span>
        <span className="text-sm text-faint">=</span>
        <input
          aria-label="hours"
          inputMode="numeric"
          value={hh}
          onChange={(e) => fromParts(e.target.value, mm)}
          className={`${box} w-14`}
        />
        <span className="text-xs text-muted">hr</span>
        <input
          aria-label="minutes"
          inputMode="numeric"
          value={mm}
          onChange={(e) => fromParts(hh, e.target.value)}
          className={`${box} w-14`}
        />
        <span className="text-xs text-muted">min</span>
        <button
          type="button"
          onClick={() => { setAll(null); setOpen(false); }}
          className="text-xs font-medium text-muted underline underline-offset-4 hover:text-foreground"
        >
          Clear the adjustment
        </button>
      </div>
      {min != null && (
        <p className="mt-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
          Billable set {hrs(min)}
          {minsWords(min) ? ` (${minsWords(min)})` : ""}
          {billedMin != null && (
            <span className="font-normal text-muted"> · was billed {hrs(billedMin)}</span>
          )}
        </p>
      )}
    </div>
  );
}
