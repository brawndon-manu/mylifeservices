"use client";

import { useState, useTransition } from "react";
import { classifyMiscTime, clearMiscClassification } from "../../../actions";

// WHAT THE MISC TIME ON THIS DAY ACTUALLY WAS.
//
// Mánu 2026-08-12: "that time is typically used for sick pay and pto. it can be
// used for work not with a client so we need to ask." The engine has already
// discounted it from the hours that decide whether a rest or a meal is owed, so
// this control is the only route by which it comes back.
//
// THREE ANSWERS, not four. The draft had "a ten I could not fit in my service
// hours" as a fourth, and it was cut: a block of ten minutes or less already
// counts as worked time without anybody being asked, so a block over ten minutes
// is by definition not a ten, and the option could only ever have appeared
// beside something it does not describe.
//
// A REVIEWER ANSWERING HERE MEANS THE EMPLOYEE IS NEVER ASKED. PTO is nothing
// they have to change in QSP, and asking somebody about their own sick day is
// not a question worth sending.
//
// This is an ADMIN surface, so it says what the answer costs. No employee screen
// names a premium or added time, and this is not one.
const LABELS = { pto: "PTO", sick: "Sick pay", worked: "hours worked" };

export default function MiscClassify({
  timesheetId,
  date,
  blocks = [],
  miscMin = 0,
  paidHours = 0,
  kind = null,
  by = null,
  at = null,
  wouldAdd = 0,
  restRequired = 0,
  mealRequired = false,
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState(null);

  const times = blocks.map((b) => `${b.from} to ${b.to}`).join(" and ");
  const hours = (Math.round((miscMin / 60) * 100) / 100).toFixed(2);
  const whole = Math.abs(miscMin / 60 - paidHours) < 0.01;

  const pick = (k) =>
    start(async () => {
      setError(null);
      const res = await classifyMiscTime(timesheetId, date, k);
      if (!res?.ok) setError(res?.error || "failed");
    });

  const undo = () =>
    start(async () => {
      setError(null);
      const res = await clearMiscClassification(timesheetId, date);
      if (!res?.ok) setError(res?.error || "failed");
    });

  if (kind) {
    const worked = kind === "worked";
    return (
      <div
        className={`mt-3 rounded-lg border p-3 ${
          worked
            ? "border-fuchsia-300 bg-fuchsia-50/60 dark:border-fuchsia-800/70 dark:bg-fuchsia-950/30"
            : "border-emerald-300 bg-emerald-50/60 dark:border-emerald-800/70 dark:bg-emerald-950/30"
        }`}
      >
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span
            className={`text-[11px] font-bold uppercase tracking-wide ${
              worked ? "text-fuchsia-700 dark:text-fuchsia-300" : "text-emerald-700 dark:text-emerald-400"
            }`}
          >
            Misc time recorded as {LABELS[kind]}
          </span>
          {by && (
            <span className="text-[11px] text-faint">
              by {by}
              {at && `, ${new Date(at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" })}`}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {times} · {hours} hours.{" "}
          {worked ? (
            <>
              Put back into the day, so it now owes {restRequired}{" "}
              {restRequired === 1 ? "rest period" : "rest periods"}
              {mealRequired && " and a meal"}.
            </>
          ) : (
            <>
              Nothing on the day moved, which is right: {LABELS[kind]} is not time
              worked, so it earns no rest period and no meal.
            </>
          )}
        </p>
        <button
          type="button"
          onClick={undo}
          disabled={pending}
          className="mt-2 rounded-md border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-muted disabled:opacity-50"
        >
          {pending ? "Working..." : "Change this"}
        </button>
        {error && <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">{errorText(error)}</p>}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-sky-300 bg-sky-50/60 p-3 dark:border-sky-800/70 dark:bg-sky-950/30">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[11px] font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300">
          Misc time, not counted as work
        </span>
        <span className="text-[11px] text-faint">nobody has said what this was</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        {times} · {hours} hours{whole ? ", which is the whole day" : ` of a ${paidHours.toFixed(2)} hour day`}.
        Time rostered as Misc does not count toward the hours that decide whether
        a rest period or a meal is owed, so this day is currently charged nothing
        for {whole ? "any of it" : "that part"}.
      </p>
      <p className="mt-2 text-xs font-semibold text-foreground">What was it?</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {["pto", "sick", "worked"].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => pick(k)}
            disabled={pending}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
              k === "worked"
                ? "border-fuchsia-400 bg-surface text-fuchsia-700 dark:border-fuchsia-700 dark:text-fuchsia-300"
                : "border-border-strong bg-surface-2 text-foreground"
            }`}
          >
            {k === "pto" ? "PTO" : k === "sick" ? "Sick pay" : "Hours worked"}
          </button>
        ))}
        {/* WHAT THE EXPENSIVE ANSWER COSTS, before it is clicked. Worked is the
            only answer on any surface that can put a premium ON, and a reviewer
            deciding it should be able to see that first. */}
        <span className="text-[11px] text-faint">
          {pending
            ? "Working..."
            : wouldAdd === 0
              ? "Hours worked puts the time back and would add nothing to this day."
              : `Hours worked puts the time back and would add ${wouldAdd} premium ${wouldAdd === 1 ? "hour" : "hours"} to this day.`}
        </span>
      </div>
      {error && <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">{errorText(error)}</p>}
    </div>
  );
}

function errorText(e) {
  if (e === "signed") return "This sheet is signed, so its figures cannot move.";
  if (e === "nomisc") return "This day has no Misc time stored. Recompute the batch first.";
  if (e === "noday") return "That day is not on this sheet.";
  return "That did not save. Try again.";
}
