"use client";

// deleting a pay period is not recoverable, so the confirm names exactly what
// goes - especially signatures, which are somebody else's attestation and not
// ours to throw away casually. the counts are read from the server at click
// time rather than passed in stale.
//
// the dialog is a site-styled modal matching ConfirmButton, not the native
// window.confirm(): the native one cannot be styled, buries the signature
// warning in a wall of plain text, and puts OK where the eye expects Cancel.
// ConfirmButton itself is not reusable here because it works by submitting a
// surrounding <form>, and this button has no form - it has to await the impact
// counts first and then call the action directly.
//
// PORTALED to <body> for the same reason ConfirmButton is: an ancestor with a
// transform becomes the containing block for a position:fixed child, which
// traps the dialog inside the card.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { deleteBatch, batchDeletionImpact } from "../actions";

export default function DeleteBatchButton({ batchId, period }) {
  const [busy, setBusy] = useState(false);
  const [impact, setImpact] = useState(null);
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
    try {
      setImpact(await batchDeletionImpact(batchId));
    } finally {
      // has to clear on the SUCCESS path too, not just the catch - the dialog
      // opens with busy still true otherwise, so its confirm button renders
      // disabled and reads "Deleting…" before anyone has agreed to anything.
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      await deleteBatch(batchId);
    } catch {
      // a redirect throws by design in a server action; anything else and the
      // dialog simply comes back
      setBusy(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={open}
        disabled={busy}
        className="rounded-md border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/30"
      >
        {busy && !impact ? "Checking…" : "Delete this pay period"}
      </button>

      {impact &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
            onClick={close}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-period-title"
              className="w-full max-w-md rounded-2xl border border-border-strong bg-surface p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="delete-period-title" className="text-lg font-semibold text-foreground">
                Delete the {period} pay period?
              </h3>

              <ul className="mt-3 space-y-1.5 text-sm text-muted">
                <li>
                  <b className="font-semibold text-foreground">
                    {impact.sheets} timesheet{impact.sheets === 1 ? "" : "s"}
                  </b>{" "}
                  will be removed.
                </li>
                {impact.sent > 0 && (
                  <li>{impact.sent} had already been emailed to staff.</li>
                )}
                {impact.approved > 0 && <li>{impact.approved} had management sign-off.</li>}
              </ul>

              {/* a signature is the employee's own attestation. it is the one
                  thing here that cannot be regenerated from the export, so it
                  gets its own box rather than a line in the list. */}
              {impact.signed > 0 && (
                <p className="mt-3 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm font-medium text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                  {impact.signed} {impact.signed === 1 ? "has" : "have"} been signed by the
                  employee. Those signatures are destroyed and cannot be recovered.
                </p>
              )}

              <p className="mt-3 text-sm font-semibold text-foreground">This cannot be undone.</p>

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
                  className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-rose-700 disabled:opacity-60"
                >
                  {busy ? "Deleting…" : "Delete the pay period"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
