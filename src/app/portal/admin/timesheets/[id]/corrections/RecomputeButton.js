"use client";

// rebuilding the sheet throws away the old signature - it's a different
// document now - so it asks first and says exactly what that means.
//
// A REAL DIALOG, NOT `window.confirm`. Two things forced it. The native box
// cannot be styled, so the sentence about the signature arrived as the fourth
// line of a wall of plain text with OK sitting where the eye expects Cancel -
// the same argument `DeleteBatchButton` makes at the top of its own file. And
// it cannot show anything read at click time, which is the other half of this:
//
// THE COUNTS ARE READ WHEN THE DIALOG OPENS. `accepted` used to be a prop, and
// the day-by-day page passed `accepted={0}` unconditionally - so a sheet with
// three accepted corrections was shown the sentence for a sheet with none. The
// corrections screen counted honestly but counted at page render, which goes
// stale on a tab left open. `timesheetRecomputeImpact` asks at click time.
//
// PORTALED to <body>, same reason as `DeleteBatchButton`: an ancestor with a
// transform becomes the containing block for a position:fixed child and traps
// the dialog inside the card.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  recomputeTimesheet,
  timesheetRecomputeImpact,
} from "@/app/portal/admin/timesheets/actions";

// `accepted` STAYS A PROP as well as being re-read, and the two are not the
// same job. The prop drives the sentence sitting VISIBLE beside the button,
// which is body text somebody reads before deciding to click - per Mánu, that
// explanation stays on the page rather than moving behind the control. The
// re-read drives the dialog, which has to be right about the sheet as it is at
// the moment of pressing.
export default function RecomputeButton({ timesheetId, accepted = 0 }) {
  const [busy, setBusy] = useState(false);
  const [impact, setImpact] = useState(null);
  const [error, setError] = useState(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!impact) return;
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [impact]);

  function close() {
    setImpact(null);
    setBusy(false);
    triggerRef.current?.focus();
  }

  async function open() {
    setBusy(true);
    setError(null);
    try {
      setImpact(await timesheetRecomputeImpact(timesheetId));
    } catch {
      setError("Could not read what this would do. Nothing was changed.");
    } finally {
      // has to clear on the SUCCESS path too, or the dialog opens with its
      // confirm button already disabled and reading "Recalculating..."
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await recomputeTimesheet(timesheetId);
      if (!res?.ok) setError(messageFor(res?.error));
    } catch {
      setError("Something went wrong rebuilding that sheet.");
    } finally {
      setBusy(false);
      setImpact(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          ref={triggerRef}
          type="button"
          onClick={open}
          disabled={busy}
          className="rounded-lg bg-brand-dark px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy && !impact ? "Checking..." : "Recalculate this timesheet"}
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

      {impact &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
            onClick={close}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="recompute-title"
              className="w-full max-w-md rounded-2xl border border-border-strong bg-surface p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* THE TWO SENTENCES ARE THE ONES THAT WERE IN THE NATIVE BOX,
                  moved word for word. "Nothing was accepted, so the figures
                  won't change" was true until 2026-08-12, when a rebuild
                  started re-running the engine. A batch uploaded before a rule
                  landed now moves the moment it is rebuilt, with no correction
                  involved, so a dialog promising otherwise would be lying at
                  the one moment somebody is deciding whether to press it. */}
              <h3 id="recompute-title" className="text-lg font-semibold text-foreground">
                {impact.accepted > 0
                  ? "Recalculate this timesheet with the accepted corrections applied?"
                  : "Recalculate this timesheet?"}
              </h3>
              <p className="mt-2 text-sm text-muted">
                {impact.accepted > 0
                  ? "Every answer is kept and re-applied. The figures are recalculated, a new PDF is generated, and it goes back to unsent so you can send it for signature again. Any signature already on it is cleared."
                  : "Every answer is kept and re-applied. The engine re-runs over their stored days, so any rule added since this batch was uploaded reaches them now. Their premium hours can change. The sheet goes back to unsent and any signature on it is cleared."}
              </p>

              {/* NO COUNT LINES YET. `timesheetRecomputeImpact` reads the
                  answers kept, the corrections accepted and the items still
                  open when this dialog opens, and three sentences saying so
                  were written and pulled back out on 2026-08-16: they are new
                  words on a screen whose wording is decided deliberately, and
                  they are waiting on a look. The reader is wired and picking
                  the sentence above; the counts are one block from being said. */}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-muted transition hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirm}
                  disabled={busy}
                  className="rounded-lg bg-brand-dark px-4 py-2 text-sm font-bold text-white transition hover:bg-brand disabled:opacity-60"
                >
                  {busy ? "Recalculating..." : "Recalculate this timesheet"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
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
