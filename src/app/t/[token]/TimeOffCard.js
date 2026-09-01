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
import { TIME_OFF_TYPES, fmtTimeOffHours } from "@/lib/timesheet/time-off";

const label = (kind) => TIME_OFF_TYPES[kind] || "PTO";
const sentenceWord = (kind) => (kind === "sick" ? "sick time" : "PTO");
const hoursPhrase = (e) =>
  `${fmtTimeOffHours(e.hours)} ${Number(e.hours) === 1 ? "hour" : "hours"} of ${sentenceWord(e.kind)}`;

export default function TimeOffCard({ token, days, answer, signed, submitAction }) {
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
      for (const e of list) {
        const n = Number(e.hours);
        if (!e.date || !Number.isFinite(n) || n <= 0 || n > 24) {
          setError("Each day needs its hours, up to 24.");
          return;
        }
      }
      const dates = list.map((e) => e.date);
      if (new Set(dates).size !== dates.length) {
        setError("A day is listed twice.");
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
        setError(messageFor(res?.error));
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
    <div className="mt-5 rounded-xl border border-border bg-surface-2 p-5">
      <p className="text-base font-semibold text-foreground">
        Was there PTO or sick time in this pay period that is not on your schedule?
      </p>

      {!editing && saved === "yes" && (
        <ul className="mt-3 space-y-1">
          {savedEntries.map((e) => (
            <li key={e.date} className="text-sm text-muted">
              <span className="font-semibold text-foreground">{e.date}</span>
              {" - "}
              {hoursPhrase(e)}
            </li>
          ))}
        </ul>
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
              className="rounded-lg border border-border-strong bg-surface-2 px-3 py-1.5 text-sm font-semibold text-foreground transition hover:border-brand hover:text-brand"
            >
              Change this
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => send("no", [])}
                className="rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-foreground transition hover:border-brand hover:text-brand disabled:opacity-50"
              >
                No
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={startYes}
                className="rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-foreground transition hover:border-brand hover:text-brand disabled:opacity-50"
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
            <div key={i} className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3">
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-muted">Day</span>
                <select
                  value={e.date}
                  disabled={busy}
                  onChange={(ev) => setEntry(i, { date: ev.target.value })}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                >
                  {days.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-muted">Type</span>
                <select
                  value={e.kind}
                  disabled={busy}
                  onChange={(ev) => setEntry(i, { kind: ev.target.value })}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                >
                  {Object.entries(TIME_OFF_TYPES).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-muted">Hours</span>
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
                  placeholder="e.g. 8"
                  className="w-24 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                />
              </label>
              {entries.length > 1 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setEntries((prev) => prev.filter((_, j) => j !== i))}
                  className="pb-2 text-xs font-semibold text-muted underline hover:text-foreground"
                >
                  Remove
                </button>
              )}
            </div>
          ))}

          <div>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEntries((prev) => [...prev, blank()])}
              className="text-sm font-semibold text-brand-dark underline underline-offset-4 hover:opacity-80"
            >
              + Add another day
            </button>
          </div>

          {error && (
            <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy || !entries.length}
              onClick={() => send("yes", entries)}
              className="rounded-lg bg-brand-dark px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => send("no", [])}
              className="rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-foreground transition hover:border-brand hover:text-brand disabled:opacity-50"
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

function messageFor(code) {
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
