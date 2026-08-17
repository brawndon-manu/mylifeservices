"use client";

// UNDOING ONE DAY, WHEREVER THAT DAY IS SHOWN.
//
// This was the green box inside `CorrectDay`, and it could only ever be reached
// from a Data checks row of kind `flag` - a day where the schedule page and the
// timesheet disagree about the hours. Measured 2026-08-17: July has 0 such days
// across 59 sheets and August has 1, on a person carrying no override, so the
// box had never rendered anywhere in the database and the fix behind it had
// never been seen on screen.
//
// The day it belongs on is any day carrying an override, and most of those come
// from an ANSWER rather than from a hand correction - which is exactly the case
// the undo was fixed for. So it is its own component, used from both places.
//
// NOT ON MISC-CLASSIFY DAYS. `MiscClassify` has its own undo for those, right
// beside the classification it is about, and two undo buttons on one day is
// worse than the one that was missing.
//
// TWO STEPS NOW, WHERE THE OLD BOX FIRED ON ONE CLICK. It deletes that date's
// answers as of 2026-08-16, not just the patch they produced, and a control
// that removes somebody's answer on a single click should say how many first.
// The count is read WHEN THE CONFIRM OPENS, like the three reset controls.
import { useState, useTransition } from "react";
import { clearDayOverride, dayUndoImpact } from "../actions";
import { companyDate } from "@/lib/company-time";

const f2 = (n) => (n == null ? "-" : (Math.round(n * 100) / 100).toFixed(2));

export default function UndoDay({ timesheetId, date, ov, onDone }) {
  const [impact, setImpact] = useState(null);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState(null);
  const [pending, start] = useTransition();

  // THE THREE SHAPES AN OVERRIDE COMES IN, and only one of them is a number.
  // A hand correction from Data checks stores `_was` as the day's old hours; a
  // misc classification stores it as the OBJECT of flags it replaced. Running
  // the second through `f2` prints "-" beside a real figure, which is why this
  // asks what `_was` actually is rather than trusting the field to exist.
  const was = typeof ov?._was === "number" ? ov._was : null;
  const hours = typeof ov?.paidHours === "number" ? ov.paidHours : null;
  const byHand = !!ov?._by;

  async function open() {
    setChecking(true);
    setErr(null);
    try {
      setImpact(await dayUndoImpact(timesheetId, date));
    } catch {
      setImpact({ answers: null });
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="mt-2 rounded-md border border-emerald-300/60 bg-emerald-50 p-2 text-xs dark:border-emerald-900/50 dark:bg-emerald-950/30">
      {/* the heading `CorrectDay` already used, kept word for word where it
          still applies. A day whose override came from an answer has no hours
          on the patch at all, so it says what it has instead of printing a
          dash where a figure belongs. */}
      <p className="font-semibold text-emerald-900 dark:text-emerald-200">
        {hours != null
          ? `Corrected to ${f2(hours)} hrs${was != null ? ` (was ${f2(was)})` : ""}`
          : "This day carries an answer"}
      </p>
      {byHand && (
        <p className="text-emerald-800 dark:text-emerald-200/80">
          by {ov._by}
          {ov._at && ` on ${companyDate(ov._at, { month: "numeric", day: "numeric", year: "numeric" })}`}
          {ov._note && ` - "${ov._note}"`}
        </p>
      )}
      {/* KEPT FROM THE OLD BOX, AND NOW ONLY WHERE IT IS TRUE. A correction
          typed into Data checks is STORED and not applied - `overrideDayHours`
          writes the override and stops - so that one waits for a rebuild. An
          override that came from an answer was applied as the answer landed,
          and telling somebody it is still pending would be wrong. */}
      {ov?._source === "data-check" && (
        <p className="mt-1 text-emerald-800 dark:text-emerald-200/80">
          Takes effect when you rebuild this sheet.
        </p>
      )}

      {!impact ? (
        <>
          <button
            type="button"
            onClick={open}
            disabled={checking}
            className="mt-1 font-semibold text-emerald-900 underline disabled:opacity-50 dark:text-emerald-200"
          >
            {checking ? "Checking…" : "Undo this correction"}
          </button>
          {err && (
            <p className="mt-1 font-semibold text-rose-700 dark:text-rose-400">
              Could not undo that day: {err}
            </p>
          )}
        </>
      ) : (
        <div className="mt-1.5 border-t border-emerald-300/60 pt-1.5 dark:border-emerald-900/50">
          {/* WHAT THE OLD ONE-CLICK VERSION NEVER SAID. Undoing a day has
              deleted that date's answers since 2026-08-16; before that it
              removed the patch alone and the patch came back on the next
              rebuild. Both halves are stated because the second is the
              surprising one. */}
          <p className="font-semibold text-emerald-900 dark:text-emerald-200">
            {impact.answers > 0
              ? `Undo this day and delete ${impact.answers} answer${impact.answers === 1 ? "" : "s"} on it?`
              : "Put this day back to the figures the upload produced?"}
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-emerald-800 dark:text-emerald-300">
            <li>The day goes back to the figures the upload produced.</li>
            {impact.answers > 0 && (
              <li>
                The answer goes with the correction it produced. Left on record it
                would rebuild the same correction next time anything recomputed.
              </li>
            )}
            <li>No other day on this sheet is touched.</li>
          </ul>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await clearDayOverride(timesheetId, date);
                  setImpact(null);
                  if (res?.ok) onDone?.();
                  else setErr(res?.error || "failed");
                })
              }
              className="rounded-md bg-emerald-700 px-2.5 py-1 font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
            >
              {pending ? "Undoing…" : "Yes, undo this day"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setImpact(null)}
              className="font-medium text-emerald-900 underline disabled:opacity-60 dark:text-emerald-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
