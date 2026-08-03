"use client";

// one reported problem, with what the punches say for that day sitting right
// next to the claim. that context is the whole job: "I worked through my lunch"
// means something different on a day with a punched meal than on one without.
import { useState } from "react";
import { resolveCorrection } from "@/app/portal/admin/timesheets/actions";

const fmt = (n) => (Math.round((n || 0) * 100) / 100).toFixed(2);

export default function CorrectionRow({ correction: c, day }) {
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState("");

  async function decide(decision) {
    setBusy(decision);
    const fd = new FormData();
    if (note.trim()) fd.set("resolutionNote", note.trim());
    try {
      await resolveCorrection(c.id, decision, fd);
    } finally {
      setBusy(null);
    }
  }

  const settled = c.status !== "open";

  return (
    <li
      className={`rounded-lg border p-4 ${
        settled ? "border-border bg-surface-2" : "border-amber-300/60 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/20"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">
          {c.date || "This timesheet"} · {c.label}
        </p>
        {settled && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              c.status === "accepted"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                : "bg-surface text-muted"
            }`}
          >
            {c.status === "accepted" ? "Accepted" : "Declined"}
            {c.resolvedBy && ` by ${c.resolvedBy}`}
          </span>
        )}
      </div>

      {c.claimedHours != null && (
        <p className="mt-1 text-sm text-foreground">
          They say they worked{" "}
          <span className="font-semibold">{fmt(c.claimedHours)} hrs</span>.
        </p>
      )}
      {c.note && <p className="mt-1 text-sm italic text-muted">&ldquo;{c.note}&rdquo;</p>}

      {day && (
        <p className="mt-2 text-xs text-muted">
          What the punches say: {fmt(day.paidHours)} hrs ·{" "}
          {day.mealCount > 0 ? "meal punched" : "no meal punched"} ·{" "}
          {day.restCount}/{day.restRequired} rest breaks
          {day.mealViolation && " · meal premium currently owed"}
          {day.restViolation && " · rest premium currently owed"}
        </p>
      )}

      {!settled && (
        <>
          <p className="mt-3 rounded-md bg-surface px-3 py-2 text-xs font-medium text-foreground">
            If you accept: {c.effect}
          </p>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note for the record (optional)"
            maxLength={1000}
            className="mt-3 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => decide("accepted")}
              disabled={!!busy}
              className="rounded-lg bg-brand-dark px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy === "accepted" ? "Accepting..." : "Accept"}
            </button>
            <button
              type="button"
              onClick={() => decide("declined")}
              disabled={!!busy}
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-surface disabled:opacity-50"
            >
              {busy === "declined" ? "Declining..." : "Decline"}
            </button>
          </div>
        </>
      )}

      {settled && c.resolutionNote && (
        <p className="mt-2 text-xs text-muted">Note: {c.resolutionNote}</p>
      )}
    </li>
  );
}
