"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// SEEN. The QuickSolve edit itself is the office's to make - the review
// corrections email carries that instruction when the sheet is signed.
//
// The backwards entry is the one item on the page with nothing to answer. The
// engine already reads it the right way round and already counts the break, so
// there is no question - and the only thing missing was any way to say it had
// been seen.
//
// Without that the row sat there for ever and the panel at the top could never
// tick it off, which made a sheet with two of them impossible to finish looking
// at even when everything else was done.
//
// NOT A SAVE OF ANY FIGURE. Nothing on the timesheet moves either way. It
// records that somebody has seen it, and it comes straight back on the next
// upload if the export still holds the times the wrong way round.
export default function AcknowledgeFix({ token, date, min, done, submitAction }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState(null);

  const press = (undo) =>
    start(async () => {
      setErr(null);
      const res = await submitAction({ token, date, min, undo });
      if (!res?.ok) setErr(res?.error || "failed");
      else router.refresh();
    });

  if (done) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          Acknowledged.
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => press(true)}
          className="rounded-md border border-border-strong px-2.5 py-1 text-xs font-semibold text-muted transition hover:border-brand hover:text-brand disabled:opacity-50"
        >
          {pending ? "Working…" : "Undo"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => press(false)}
        className="rounded-lg border border-amber-400 bg-surface px-3 py-1.5 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/40"
      >
        {pending ? "Saving…" : "I have seen this"}
      </button>
      {err && (
        <p className="mt-1 text-xs text-rose-700 dark:text-rose-400">
          {err === "signed"
            ? "This timesheet is signed, so nothing on it can change."
            : err === "superseded"
              ? "A newer upload has replaced this one. Open that one instead."
              : "That did not save. Try again."}
        </p>
      )}
    </div>
  );
}
