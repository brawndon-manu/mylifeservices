"use client";

// rebuilding the sheet throws away the old signature - it's a different
// document now - so it asks first and says exactly what that means.
import { useState } from "react";
import { recomputeTimesheet } from "@/app/portal/admin/timesheets/actions";

export default function RecomputeButton({ timesheetId, accepted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function run() {
    // "Nothing was accepted, so the figures won't change" was true until
    // 2026-08-12, when a rebuild started re-running the engine. A batch uploaded
    // before a rule landed now moves the moment it is rebuilt, with no
    // correction involved, so a dialog promising otherwise would be lying at the
    // one moment somebody is deciding whether to press it.
    const ok = window.confirm(
      accepted > 0
        ? "Rebuild this timesheet with the accepted corrections applied?\n\nThe figures are recalculated, a new PDF is generated, and it goes back to unsent so you can send it for signature again. Any signature already on it is cleared."
        : "Rebuild this timesheet?\n\nNo correction is waiting, but rebuilding re-runs the engine over their stored days, so any rule that landed after this batch was uploaded reaches them now. Their premium hours can change. It goes back to unsent, and any signature on it is cleared.",
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await recomputeTimesheet(timesheetId);
      if (!res?.ok) setError(messageFor(res?.error));
    } catch {
      setError("Something went wrong rebuilding that sheet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="rounded-lg bg-brand-dark px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Rebuilding..." : "Rebuild this timesheet"}
        </button>
        <span className="text-sm text-muted">
          {accepted > 0
            ? `${accepted} correction${accepted === 1 ? "" : "s"} accepted - the figures will change.`
            : "Nothing accepted, so the figures stay as they are."}
        </span>
      </div>
      {error && (
        <p className="mt-2 text-sm font-semibold text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
}

function messageFor(code) {
  switch (code) {
    case "openitems":
      return "There are still items waiting on a decision.";
    case "nodetail":
      return "This batch predates corrections, so there's no punch detail to rebuild from. Re-upload the period.";
    case "render":
      return "The PDF couldn't be regenerated. Nothing was changed.";
    default:
      return "Something went wrong rebuilding that sheet.";
  }
}
