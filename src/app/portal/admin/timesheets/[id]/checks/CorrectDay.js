"use client";

// correcting a day by hand. deliberately not a one-click "accept the schedule"
// button: both figures are shown, the TIMESHEET's value is pre-filled, and the
// number has to be confirmed before it moves. the point of this screen is a
// human deciding which record is right, and a button that agrees for you defeats
// it.
import { useState } from "react";
import { overrideDayHours, clearDayOverride } from "@/app/portal/admin/timesheets/actions";

const f2 = (n) => (n == null ? "-" : (Math.round(n * 100) / 100).toFixed(2));

export default function CorrectDay({ timesheetId, date, timesheet, schedule, existing }) {
  const [open, setOpen] = useState(false);
  // pre-filled from the TIMESHEET, not the schedule.
  //
  // It used to seed the schedule's figure, which quietly made the schedule the
  // default answer - and the schedule is not the record we go by. People work
  // different hours than they were scheduled all the time. The page-break bug
  // showed the cost: accepting the prefill on Rotter's 07/28 would have written
  // 5.00 over a correct 8.00. Changing a day should take a deliberate edit.
  const [hours, setHours] = useState(timesheet != null ? String(timesheet) : "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  async function save() {
    setError(null);
    if (!hours.trim()) {
      setError("Enter the number of hours this day should be.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("date", date);
      fd.set("hours", hours.trim());
      if (note.trim()) fd.set("note", note.trim());
      const res = await overrideDayHours(timesheetId, fd);
      if (res?.ok) setDone(true);
      else setError(messageFor(res?.error));
    } catch {
      setError("Couldn't save that correction.");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      await clearDayOverride(timesheetId, date);
      setDone(false);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  if (existing) {
    return (
      <div className="mt-2 rounded-md border border-emerald-300/60 bg-emerald-50 p-2 text-xs dark:border-emerald-900/50 dark:bg-emerald-950/30">
        <p className="font-semibold text-emerald-900 dark:text-emerald-200">
          Corrected to {f2(existing.paidHours)} hrs
          {existing._was != null && ` (was ${f2(existing._was)})`}
        </p>
        <p className="text-emerald-800 dark:text-emerald-200/80">
          by {existing._by}
          {existing._at && ` on ${new Date(existing._at).toLocaleDateString("en-US")}`}
          {existing._note && ` - "${existing._note}"`}
        </p>
        <p className="mt-1 text-emerald-800 dark:text-emerald-200/80">
          Takes effect when you rebuild this sheet.
        </p>
        <button
          type="button"
          onClick={clear}
          disabled={busy}
          className="mt-1 font-semibold text-emerald-900 underline disabled:opacity-50 dark:text-emerald-200"
        >
          Undo this correction
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
        Saved. Rebuild the sheet to apply it.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-xs font-semibold text-brand underline underline-offset-4 hover:text-brand-dark"
      >
        Correct this day
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-md border border-border bg-surface p-3">
      <p className="text-xs text-muted">
        Timesheet says <span className="font-semibold text-foreground">{f2(timesheet)}</span>
        {schedule != null && (
          <>
            {" · "}schedule says{" "}
            <span className="font-semibold text-foreground">{f2(schedule)}</span>
          </>
        )}
        . Which is right?
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-foreground">Hours for {date}</span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            max="24"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="w-28 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="grid flex-1 gap-1">
          <span className="text-xs font-semibold text-foreground">
            Why <span className="font-normal text-muted">(goes on the record)</span>
          </span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. rest break entered with the wrong AM/PM"
            className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm text-foreground"
          />
        </label>
      </div>
      {error && (
        <p className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>
      )}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-md bg-brand-dark px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save correction"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted underline hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function messageFor(code) {
  switch (code) {
    case "signed":
      return "This sheet has already been signed - correcting it now would change a document somebody has attested to.";
    case "badhours":
      return "That needs to be a number of hours between 0 and 24.";
    case "noday":
      return "That date isn't on this timesheet.";
    default:
      return "Couldn't save that correction.";
  }
}
