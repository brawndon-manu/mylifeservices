"use client";

// THE DAY-PROGRAM REVIEW'S TIME-OFF QUESTION. The schedule has no row for a
// day somebody was off, so the person signing is asked directly: was there PTO
// or sick time this period, and if so which days and how much. The answer is a
// claim that goes to the office with the review - nothing here writes the PTO
// record, and no figure on the sheet moves. See time-off.js for the rules and
// the answer action for what the server accepts.
//
// Day is a select of the period's dates rather than a free date field, the
// same shape ReportProblem's "Which day?" uses on this page - a day outside
// the period cannot be picked, so it cannot need refusing.
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  TIME_OFF_TYPES,
  fmtTimeOffHours,
  timeOffTotals,
  checkTimeOffEntries,
  timeOffProblem,
} from "@/lib/timesheet/time-off";

const label = (kind) => TIME_OFF_TYPES[kind] || "PTO";
const sentenceWord = (kind) => (kind === "sick" ? "sick time" : "PTO");
const hoursPhrase = (e) =>
  `${fmtTimeOffHours(e.hours)} ${Number(e.hours) === 1 ? "hour" : "hours"} of ${sentenceWord(e.kind)}`;

export default function TimeOffCard({ token, days, answer, signed, submitAction, period = null }) {
  const router = useRouter();
  // `answer` is the stored row or null: { choice, timeOff: [{date, kind, hours}] }
  const saved = answer?.choice || null;
  const savedEntries = Array.isArray(answer?.timeOff) ? answer.timeOff : [];

  const [editing, setEditing] = useState(false);
  const [entries, setEntries] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const blank = () => ({ date: days[0] || "", kind: "pto", hours: "" });

  const startYes = () => {
    setError(null);
    setEntries(savedEntries.length
      ? savedEntries.map((e) => ({ ...e, hours: String(e.hours) }))
      : [blank()]);
    setEditing(true);
  };

  const setEntry = (i, patch) => {
    setError(null);
    setEntries((prev) => prev.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  };

  async function send(choice, list) {
    setError(null);
    if (choice === "yes") {
      // THE SERVER'S OWN CHECK, so the screen refuses exactly what the action
      // would refuse and names the same day. The period comes in as a prop
      // because the rule is "inside this pay period" and the card cannot know
      // that from its day list alone.
      const check = checkTimeOffEntries(
        list.map((e) => ({ date: e.date, kind: e.kind, hours: Number(e.hours) })),
        period?.from,
        period?.to,
      );
      if (!check.ok) {
        setError(timeOffProblem(check));
        return;
      }
    }
    setBusy(true);
    try {
      const res = await submitAction({
        token,
        choice,
        entries: choice === "yes"
          ? list.map((e) => ({ date: e.date, kind: e.kind, hours: Number(e.hours) }))
          : null,
      });
      if (res?.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError(messageFor(res?.error, res));
      }
    } catch {
      setError("Something went wrong saving that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // AFTER SIGNING THE ANSWER IS PART OF THE SIGNED RECORD, read-only here.
  const readOnly = !!signed;

  return (
    <div className="mt-5 rounded-xl bg-surface px-5 py-4 shadow-sm night:ring-1 night:ring-border">
      <p className="text-base font-semibold text-foreground">
        Was there PTO or sick time in this pay period that is not on your schedule?
      </p>

      {!editing && saved === "yes" && (
        <>
          <ul className="mt-3 divide-y divide-sep">
            {savedEntries.map((e) => (
              <li
                key={e.date}
                className="flex items-baseline justify-between gap-3 py-2.5 text-sm"
              >
                <span className="text-foreground">
                  {e.date} <span className="text-muted">{label(e.kind)}</span>
                </span>
                <span className="tabular-nums text-muted">{hoursPhrase(e)}</span>
              </li>
            ))}
          </ul>
          <Totals entries={savedEntries} />
          <p className="mt-4 border-l-2 border-accent/60 pl-3 text-[12.5px] leading-relaxed text-muted">
            <span className="font-medium text-foreground">
              With payroll, not added to your pay yet.
            </span>
            <br />
            Once payroll records it, PTO and sick pay appear under their own
            categories on your timesheet.
          </p>
        </>
      )}
      {!editing && saved === "no" && (
        <p className="mt-3 text-sm text-muted">You said there was none.</p>
      )}

      {!editing && !readOnly && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {saved ? (
            <button
              type="button"
              onClick={startYes}
              className="rounded-[9px] bg-fill px-3.5 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-fill-2"
            >
              Change this
            </button>
          ) : (
            /* TWO PLAIN BUTTONS, Mánu's call 2026-09-08. A segment shell was
               tried and dropped: No sends the answer straight away and Yes
               opens the editor, so neither is a selection and no segment could
               ever show as picked. */
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => send("no", [])}
                className="rounded-[9px] bg-fill px-5 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-fill-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
              >
                No
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={startYes}
                className="rounded-[9px] bg-fill px-5 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-fill-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
              >
                Yes
              </button>
            </>
          )}
        </div>
      )}

      {editing && (
        <div className="mt-4 grid gap-3">
          {entries.map((e, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_1fr_auto] items-end gap-x-2 gap-y-3 border-b border-sep pb-4 last:border-0 last:pb-0 sm:grid-cols-[1.1fr_1fr_5.5rem_auto] sm:gap-3"
            >
              <label className="col-span-3 grid gap-1 sm:col-span-1">
                <span className="text-[12.5px] font-medium text-foreground">Day</span>
                <select
                  value={e.date}
                  disabled={busy}
                  onChange={(ev) => setEntry(i, { date: ev.target.value })}
                  className="rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-faint focus:outline-2 focus:-outline-offset-1 focus:outline-brand"
                >
                  {days.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-[12.5px] font-medium text-foreground">Type</span>
                <select
                  value={e.kind}
                  disabled={busy}
                  onChange={(ev) => setEntry(i, { kind: ev.target.value })}
                  className="rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-faint focus:outline-2 focus:-outline-offset-1 focus:outline-brand"
                >
                  {Object.entries(TIME_OFF_TYPES).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-[12.5px] font-medium text-foreground">Hours</span>
                {/* spinner arrows are killed site-wide in globals.css */}
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  max="24"
                  value={e.hours}
                  disabled={busy}
                  onChange={(ev) => setEntry(i, { hours: ev.target.value })}
                  className="w-full text-right tabular-nums rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-faint focus:outline-2 focus:-outline-offset-1 focus:outline-brand"
                />
              </label>
              <button
                type="button"
                disabled={busy || entries.length === 1}
                onClick={() => setEntries((prev) => prev.filter((_, j) => j !== i))}
                aria-label={`Remove day ${i + 1}`}
                className="mb-1 inline-flex h-9 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-fill disabled:opacity-40"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}

          <div>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEntries((prev) => [...prev, blank()])}
              className="inline-flex min-h-[44px] items-center gap-2 rounded text-[13px] font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-40"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add another day
            </button>
          </div>

          {/* PTO AND SICK PAY COUNT SEPARATELY. They are different categories
              on the timesheet and in the payroll report, so one combined figure
              would be a total nobody can act on. Work hours are named here too
              because the point of the card is that reporting leave does not
              move them. */}
          <Totals entries={entries} />

          {error && (
            <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy || !entries.length}
              onClick={() => send("yes", entries)}
              className="rounded-[9px] bg-brand px-4 py-2 text-[13.5px] font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-50"
            >
              {busy ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => send("no", [])}
              className="rounded-[9px] bg-fill px-4 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-fill-2 disabled:opacity-50"
            >
              No
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => { setEditing(false); setError(null); }}
              className="text-sm text-muted underline hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-muted">
        Days entered here are sent to the office with your review.
      </p>
    </div>
  );
}

function Totals({ entries }) {
  const t = timeOffTotals(
    (entries || []).map((e) => ({ kind: e.kind, hours: Number(e.hours) })),
  );
  const row = (name, value, quiet = false) => (
    <div className="flex items-baseline justify-between gap-4">
      <span className={quiet ? "text-muted" : "text-foreground"}>{name}</span>
      <span className={`tabular-nums ${quiet ? "text-muted" : "font-medium text-foreground"}`}>
        {value}
      </span>
    </div>
  );
  return (
    <div className="mt-4 grid gap-2 rounded-[10px] bg-fill px-4 py-4 text-[13px]">
      {row("PTO", `${fmtTimeOffHours(t.pto)} hrs`)}
      {row("Sick pay", `${fmtTimeOffHours(t.sick)} hrs`)}
      <div className="mt-1 border-t border-sep pt-2">
        {row("Work hours", "Unchanged", true)}
      </div>
    </div>
  );
}

function messageFor(code, res) {
  // the action names the row it refused; say the same words the screen would
  if (code === "entry") return timeOffProblem({ code: res?.code, at: res?.at });
  switch (code) {
    case "already":
      return "This timesheet has already been signed, so it can't be changed here.";
    case "reported":
      return "You've already reported something on this timesheet - payroll is looking at it.";
    case "preview":
      return "Preview only - nothing was saved.";
    case "empty":
      return "Each day needs its hours, up to 24.";
    default:
      return "Something went wrong saving that. Please try again.";
  }
}
