"use client";

// the employee's side of a correction. they build up a list of what's wrong -
// usually one day, sometimes a few - and send it in one go, so payroll gets a
// single message rather than an email per item.
//
// which options show for a day depends on what the punches actually say. there
// is no point offering "I did take my lunch, it just isn't punched" on a day
// that already has a punched lunch; the honest option there is the opposite
// one. filtering it this way is also what stops people picking the option that
// happens to pay more without noticing it doesn't describe their day.
import { useState } from "react";
import { CORRECTION_KINDS } from "@/lib/timesheet/corrections";
// the same loose reading the question cards use, so "331" means 3:31 here too
import { parseLooseTime, formatTimeDisplay } from "@/lib/loose-time";

function kindsForDay(day) {
  if (!day) return ["other"];
  const out = ["hours"];
  if (day.mealCount > 0) out.push("meal_missed");
  // "it isn't punched" only fits a day with no meal at all. a late meal was
  // punched, so the honest claim there is that the punch time is wrong.
  if (day.mealLate) out.push("meal_ontime");
  else if (day.mealViolation) out.push("meal_taken");
  if (day.restCount > 0) out.push("rest_missed");
  if (day.restViolation) out.push("rest_taken");
  out.push("day_extra", "other");
  return out;
}

const fmt = (n) => (Math.round((n || 0) * 100) / 100).toFixed(2);

export default function ReportProblem({ token, days, submitAction }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [date, setDate] = useState(days[0]?.date || "");
  const [kind, setKind] = useState("hours");
  const [hours, setHours] = useState("");
  const [times, setTimes] = useState([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const NEW_DAY = "__new__";
  const NO_DAY = "__sheet__";

  const day = days.find((d) => d.date === date) || null;
  const available =
    date === NEW_DAY ? ["day_missing"] : date === NO_DAY ? ["other"] : kindsForDay(day);
  const activeKind = available.includes(kind) ? kind : available[0];
  const meta = CORRECTION_KINDS[activeKind];

  // AN UNPUNCHED BREAK NEEDS ITS TIME. One box for a lunch; for rests, one per
  // ten the punches are short (capped at the two a day can owe). The email the
  // office works from prints exactly these times.
  const timeSlots = !meta?.asksTimes
    ? 0
    : meta.asksTimes === "meal"
      ? 1
      : Math.min(2, Math.max(1, (day?.restRequired || 0) - (day?.restCount || 0)));
  // "HH:MM" on a readable time, null otherwise - parseLooseTime says "" for
  // unreadable, and "" slips straight through a `== null` check
  const timeMin = (i) => parseLooseTime(times[i] || "", { assumeWorkday: true }) || null;

  function add() {
    setError(null);
    if (meta?.asksHours && !hours) {
      setError("Let us know how many hours, so payroll knows what to check.");
      return;
    }
    if (timeSlots > 0) {
      for (let i = 0; i < timeSlots; i += 1) {
        if (timeMin(i) == null) {
          setError("Enter the time it started.");
          return;
        }
      }
    }
    if (meta?.needsNote && !note.trim()) {
      setError("Tell us briefly what's wrong.");
      return;
    }
    if (date === NEW_DAY && !note.trim()) {
      setError("Tell us which date you worked.");
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        date: date === NO_DAY || date === NEW_DAY ? null : date,
        kind: activeKind,
        claimedHours: meta?.asksHours && hours ? Number(hours) : null,
        // raw as typed; the server reads them the same way the box did
        times: timeSlots > 0 ? times.slice(0, timeSlots) : null,
        note: note.trim() || null,
      },
    ]);
    setHours("");
    setTimes([]);
    setNote("");
  }

  async function send() {
    setError(null);
    const payload = items.length ? items : null;
    if (!payload) {
      setError("Add what's wrong first.");
      return;
    }
    setBusy(true);
    try {
      const res = await submitAction({ token, items: payload });
      if (res?.ok) setDone(true);
      else setError(messageFor(res));
    } catch {
      setError("Something went wrong sending that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mt-6 rounded-xl border border-amber-300/60 bg-amber-50 p-5 dark:border-amber-900/50 dark:bg-amber-950/30">
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Thanks - payroll has been told.
        </p>
        <p className="mt-1 text-sm text-amber-800 dark:text-amber-200/80">
          Don&apos;t sign this one. Someone will look at what you reported and
          send you a corrected timesheet to sign.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="mt-8 border-t border-border pt-6">
        <p className="text-sm text-muted">
          Do these hours look right to you?
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 text-sm font-semibold text-brand-dark underline underline-offset-4 hover:opacity-80"
        >
          Something doesn&apos;t look right
        </button>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-xl border border-border bg-surface-2 p-5">
      <h2 className="text-base font-semibold text-foreground">
        Tell payroll what&apos;s wrong
      </h2>
      <p className="mt-1 text-sm text-muted">
        Add anything that doesn&apos;t match what you actually worked.{" "}
        <span className="font-semibold text-foreground">
          You can report more than one day
        </span>{" "}
        - add each one, then send them together. Nothing changes until someone
        reviews it, and you&apos;ll get a corrected timesheet to sign.
      </p>

      {items.length > 0 && (
        <>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">
          Ready to send ({items.length})
        </p>
        <ul className="mt-2 space-y-2">
          {items.map((it, i) => (
            <li
              key={i}
              className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2"
            >
              <span className="text-sm text-foreground">
                <span className="font-semibold">{it.date || "This timesheet"}</span>
                {" - "}
                {CORRECTION_KINDS[it.kind]?.label}
                {it.claimedHours != null && ` (${fmt(it.claimedHours)} hrs)`}
                {(it.times || []).some((t) => parseLooseTime(t || "", { assumeWorkday: true })) &&
                  ` (at ${it.times
                    .map((t) => parseLooseTime(t || "", { assumeWorkday: true }))
                    .filter(Boolean)
                    .map((m) => formatTimeDisplay(m))
                    .join(" and ")})`}
                {it.note && (
                  <span className="block text-xs text-muted">{it.note}</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => setItems((p) => p.filter((_, j) => j !== i))}
                className="shrink-0 text-xs font-semibold text-muted underline hover:text-foreground"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        </>
      )}

      <div className="mt-4 grid gap-4">
        <label className="grid gap-1">
          <span className="text-sm font-semibold text-foreground">Which day?</span>
          <select
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
          >
            {days.map((d) => (
              <option key={d.date} value={d.date}>
                {d.date} - {fmt(d.paidHours)} hrs
              </option>
            ))}
            <option value={NEW_DAY}>A day that isn&apos;t listed</option>
            <option value={NO_DAY}>Not about one specific day</option>
          </select>
        </label>

        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold text-foreground">
            What&apos;s wrong?
          </legend>
          {available.map((k) => (
            <label
              key={k}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
                activeKind === k
                  ? "border-brand-dark bg-surface"
                  : "border-border bg-surface"
              }`}
            >
              <input
                type="radio"
                name="kind"
                value={k}
                checked={activeKind === k}
                onChange={() => setKind(k)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">
                  {CORRECTION_KINDS[k].label}
                </span>
                <span className="block text-xs text-muted">
                  {CORRECTION_KINDS[k].help}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        {timeSlots > 0 && (
          <div className="grid gap-2">
            <span className="text-sm font-semibold text-foreground">
              {meta.asksTimes === "meal"
                ? "What time did your lunch start?"
                : timeSlots === 1
                  ? "What time did your rest break start?"
                  : "What time did each rest break start?"}
            </span>
            {Array.from({ length: timeSlots }, (_, i) => {
              const raw = times[i] || "";
              const mins = timeMin(i);
              return (
                <div key={i} className="flex flex-wrap items-center gap-2.5">
                  {timeSlots > 1 && (
                    <span className="w-14 text-sm text-muted">{i === 0 ? "First" : "Second"}</span>
                  )}
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={raw}
                    onChange={(e) =>
                      setTimes((t) => {
                        const next = [...t];
                        next[i] = e.target.value;
                        return next;
                      })
                    }
                    placeholder="e.g. 331 for 3:31"
                    className={`w-36 rounded-lg border bg-surface px-3 py-2 text-sm text-foreground ${
                      mins != null ? "border-emerald-500" : raw.trim() ? "border-rose-500" : "border-border"
                    }`}
                  />
                  {mins != null && (
                    <span className="text-sm text-muted">
                      reads as <b className="text-foreground">{formatTimeDisplay(mins)}</b>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {meta?.asksHours && (
          <label className="grid gap-1">
            <span className="text-sm font-semibold text-foreground">
              {meta.hint}
            </span>
            {day && (
              <span className="text-xs text-muted">
                This timesheet currently says{" "}
                <span className="font-semibold text-foreground">
                  {fmt(day.paidHours)} hrs
                </span>{" "}
                for {day.date}.
              </span>
            )}
            {meta.hoursHelp && (
              <span className="text-xs text-muted">{meta.hoursHelp}</span>
            )}
            {/* spinner arrows are killed site-wide in globals.css */}
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              max="24"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="e.g. 8.5"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            />
          </label>
        )}

        <label className="grid gap-1">
          <span className="text-sm font-semibold text-foreground">
            Anything else about it?{" "}
            {!meta?.needsNote && date !== NEW_DAY && (
              <span className="font-normal text-muted">(optional)</span>
            )}
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={
              date === NEW_DAY
                ? "Which date did you work?"
                : "Anything that helps payroll check it"
            }
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
        </label>
      </div>

      {error && (
        <p className="mt-3 text-sm font-semibold text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={add}
          className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-surface"
        >
          {items.length ? "Add another" : "Add this"}
        </button>
        <button
          type="button"
          onClick={send}
          disabled={busy || !items.length}
          className="rounded-lg bg-brand-dark px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy
            ? "Sending..."
            : items.length
              ? `Send ${items.length} to payroll`
              : "Send to payroll"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-muted underline hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function messageFor(res) {
  switch (res?.error) {
    case "already":
      return "This timesheet has already been signed, so it can't be changed here. Reply to the email that brought you here.";
    case "reported":
      return "You've already reported something on this timesheet - payroll is looking at it.";
    case "empty":
      return "Add what's wrong first.";
    case "badtime":
      // where and what, quoted back - a bare verdict points at nothing
      return `${res?.at?.date ? `${res.at.date}: ` : ""}the time${res?.given ? ` "${res.given}"` : ""} doesn't line up with the punches for that day.`;
    default:
      return "Something went wrong sending that. Please try again.";
  }
}
