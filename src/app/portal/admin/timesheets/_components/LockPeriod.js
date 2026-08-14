"use client";

// THE ONE QUESTION THE PORTAL CANNOT ANSWER FOR ITSELF.
//
// The export reaching the last day of the period is a precondition, not an
// answer. The schedule locks around 8pm on that day and nothing in any of the
// four reports records it, so somebody has to say so - and until they do, Send
// all stays shut.
//
// Deliberately NOT auto-answered from the clock. An upload at 7:45pm and one at
// 8:15pm look identical from here and only one of them is safe.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBatchLocked } from "../actions";

export default function LockPeriod({ batchId, locked, lockedByName, lockedAt, covered }) {
  const [pending, start] = useTransition();
  const [reopening, setReopening] = useState(false);
  const [err, setErr] = useState(null);
  const router = useRouter();

  const write = (next) =>
    start(async () => {
      setErr(null);
      const res = await setBatchLocked(batchId, next);
      if (res?.ok) { setReopening(false); router.refresh(); }
      else setErr(res?.error || "failed");
    });

  if (locked) {
    return (
      <div className="mt-3 border-t border-border pt-3">
        <p className="text-sm text-muted">
          Marked final{lockedByName ? <> by <b className="text-foreground">{lockedByName}</b></> : null}
          {lockedAt ? <> · {lockedAt}</> : null}.
        </p>
        {!reopening ? (
          <button
            type="button"
            onClick={() => setReopening(true)}
            className="mt-2 text-xs font-semibold text-brand"
          >
            Reopen it
          </button>
        ) : (
          <div className="mt-2">
            <p className="text-sm text-foreground">
              Reopen the period? Send all closes again until somebody marks it final.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => write(false)}
                className="rounded-lg border border-border-strong px-3 py-1.5 text-sm font-semibold transition hover:bg-surface-2 disabled:opacity-60"
              >
                {pending ? "Reopening…" : "Yes, reopen it"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setReopening(false)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition hover:text-foreground disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {err && <p className="mt-1.5 text-xs text-rose-700 dark:text-rose-400">Could not change it: {err}</p>}
      </div>
    );
  }

  // NOT OFFERED WHILE DAYS ARE STILL MISSING. Marking a half-uploaded period
  // final is a thing somebody would only ever do by accident, and it opens Send
  // all on data that is three days short.
  if (!covered) {
    return (
      <p className="mt-3 border-t border-border pt-3 text-sm text-muted">
        The rest of the period has to be uploaded before this can be marked final.
      </p>
    );
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="text-sm font-semibold text-foreground">
        Is this upload final? Has the schedule been locked?
      </p>
      <p className="mt-1 text-xs text-muted">
        Nothing in the exports says whether a schedule is locked, so this is the one
        thing the portal has to be told. Send all stays shut until it is.
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => write(true)}
          className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          {pending ? "Saving…" : "Yes, the schedule is locked"}
        </button>
        <span className="text-sm text-muted">Not yet — leave it open.</span>
      </div>
      {err && <p className="mt-1.5 text-xs text-rose-700 dark:text-rose-400">Could not save it: {err}</p>}
    </div>
  );
}
