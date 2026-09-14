"use client";

// A WHOLE RUN GOES OR NONE OF IT DOES. A certificate is one of a batch printed
// from one template at one place, so deleting a single row would leave a record
// that says a run happened and cannot show it. Behind a confirm because the
// files go with it.
import { useState } from "react";

export default function DeleteBatch({ batchId, title, count, action }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="mt-8 text-xs font-semibold text-muted underline underline-offset-4 hover:text-rose-600"
      >
        Delete this run
      </button>
    );
  }

  return (
    <div className="mt-8 rounded-xl border border-rose-300 bg-rose-50 p-4 dark:border-rose-500/40 dark:bg-rose-950/25">
      <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">
        Delete {count} {count === 1 ? "certificate" : "certificates"} for {title}?
      </p>
      <p className="mt-1 text-sm text-rose-800 dark:text-rose-300">
        The record of who was issued one goes with them. There is no undo.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => { setBusy(true); action(batchId); }}
          className="rounded-md bg-rose-600 px-3.5 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Deleting…" : "Delete the run"}
        </button>
        <button
          type="button"
          onClick={() => setAsking(false)}
          className="rounded-md border border-border-strong px-3.5 py-1.5 text-sm font-medium text-muted"
        >
          Keep it
        </button>
      </div>
    </div>
  );
}
