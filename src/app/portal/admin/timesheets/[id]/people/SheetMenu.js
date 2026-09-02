"use client";

// THE THREE-DOT MENU ON A PERSON'S CARD - the office's own controls for one
// sheet, out of the employee's sight. Two things live here today: the signing
// hold and the mileage removal; the next per-sheet control gets a row here
// rather than another button on the card.
//
// Plain calls, not transitions, per the roster-picker rule: every press marks
// itself the moment it lands and the server catches up underneath. The page
// itself re-reads through the batch's version poller, which both actions bump.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  holdTimesheetSigning, releaseTimesheetSigning,
  removeTimesheetMileage, restoreTimesheetMileage,
} from "../../actions";

const f2 = (n) => (Math.round((n || 0) * 100) / 100).toFixed(2);

// the refusals this menu can actually receive, in words. Anything unnamed
// gets the generic line rather than a code.
const WORDS = {
  openitems: "Resolve their open report first.",
  nomiles: "No mileage on this sheet.",
  already: "Already done. Reload to see it.",
  superseded: "A newer upload holds this period.",
};

export default function SheetMenu({ timesheetId, held, miles, milesRemoved, signed }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);
  const router = useRouter();
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const run = async (key, fn, { confirm, prompt: promptText } = {}) => {
    let reason;
    if (promptText) {
      reason = window.prompt(promptText, "");
      if (reason === null) return;
    }
    if (confirm && !window.confirm(confirm)) return;
    setBusy(key);
    setMessage(null);
    try {
      const res = await fn(reason);
      if (!res?.ok) setMessage(WORDS[res?.error] || "That did not save. Reload and try again.");
      else {
        setOpen(false);
        router.refresh();
      }
    } catch {
      setMessage("That did not save. Reload and try again.");
    }
    setBusy(null);
  };

  const item =
    "block w-full rounded-md px-3 py-2 text-left text-xs font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-60";

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        aria-label="Sheet options"
        aria-expanded={open}
        onClick={() => { setOpen((v) => !v); setMessage(null); }}
        className="rounded-md border border-border bg-surface px-2 py-1 text-sm font-bold leading-none text-muted shadow-sm transition hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        &#8942;
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-60 rounded-lg border border-border bg-surface p-1 shadow-lg">
          {held ? (
            <button
              type="button"
              disabled={busy === "hold"}
              onClick={() => run("hold", () => releaseTimesheetSigning({ timesheetId }))}
              className={item}
            >
              {busy === "hold" ? "Releasing..." : "Release the signing hold"}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy === "hold"}
              onClick={() =>
                run("hold", (reason) => holdTimesheetSigning({ timesheetId, reason }), {
                  prompt: "Note for the hold. Only the office sees it. Leave blank to skip.",
                })}
              className={item}
            >
              {busy === "hold" ? "Holding..." : "Hold signing"}
            </button>
          )}
          {miles != null && (
            <button
              type="button"
              disabled={busy === "miles"}
              onClick={() =>
                run("miles", () => removeTimesheetMileage({ timesheetId }), {
                  confirm:
                    `Remove the ${f2(miles)} miles from this sheet?`
                    + (signed ? " Their signature comes off and the sheet goes back out to be signed again." : ""),
                })}
              className={item}
            >
              {busy === "miles" ? "Removing..." : `Remove mileage (${f2(miles)} mi)`}
            </button>
          )}
          {miles == null && milesRemoved != null && (
            <button
              type="button"
              disabled={busy === "miles"}
              onClick={() =>
                run("miles", () => restoreTimesheetMileage({ timesheetId }), {
                  confirm:
                    `Put the ${f2(milesRemoved)} miles back on this sheet?`
                    + (signed ? " Their signature comes off and the sheet goes back out to be signed again." : ""),
                })}
              className={item}
            >
              {busy === "miles" ? "Restoring..." : `Restore mileage (${f2(milesRemoved)} mi)`}
            </button>
          )}
          {message && (
            <p className="px-3 py-2 text-xs font-medium text-rose-700 dark:text-rose-400">{message}</p>
          )}
        </div>
      )}
    </div>
  );
}
