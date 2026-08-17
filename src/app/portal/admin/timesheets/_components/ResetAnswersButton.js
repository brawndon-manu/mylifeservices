"use client";

// PUTTING THE WHOLE BATCH BACK TO THE DAY IT WAS UPLOADED.
//
// Mánu 2026-08-12: "I need to reset all button." Testing the answer flow means
// answering as somebody and then needing the question back.
//
// TWO STEPS, AND THE SECOND ONE COUNTS WHAT IT IS ABOUT TO DESTROY. This is the
// most destructive control in the tool: it deletes every answer anybody on this
// batch has given, and with them every signature, because a rebuild un-signs
// deliberately. On the live batch that is somebody's attestation gone and no way
// back. A button that does that should not be one click from a page people open
// to read.

// THE SECOND STEP COUNTS FROM THE DATABASE, NOT FROM THE PAGE RENDER.
//
// `answers` and `signed` arrive as props worked out when the page was built, so
// a confirm opened on a tab left sitting all afternoon promised to delete the
// answers that existed that afternoon. On a batch two reviewers are working, or
// one where the employee is answering in their own tab, the number is wrong at
// the one moment somebody is deciding whether to press it - which is the moment
// it has to be right. `batchResetImpact` re-reads it at click time, through the
// action's own clauses. The props still choose the button's WORDS, because that
// is a label rather than a promise.
import { useState, useTransition } from "react";
import { resetBatchAnswers, batchResetImpact } from "../actions";

export default function ResetAnswersButton({ batchId, answers = 0, signed = 0 }) {
  const [impact, setImpact] = useState(null);
  const [checking, setChecking] = useState(false);
  const [done, setDone] = useState(null);
  const [pending, start] = useTransition();

  async function open() {
    setChecking(true);
    try {
      setImpact(await batchResetImpact(batchId));
    } catch {
      // the counts are the only thing that failed, so fall back to what the
      // page knew rather than refusing to open the confirm at all
      setImpact({ answers, signed, sheets: null });
    } finally {
      setChecking(false);
    }
  }

  // ALWAYS RENDERED, EVEN WITH NOTHING TO DELETE. It hid itself on a batch with
  // no answers yet, which is precisely the batch somebody is about to start
  // testing on - Mánu 2026-08-12, on a freshly uploaded one: "I don't see the
  // test button."
  //
  // And it is not a no-op there either: a reset rebuilds every sheet from
  // `daysOriginal`, so it also repairs a sheet whose stored days drifted from
  // what the engine would produce today. Dinley 08/07 was exactly that - her
  // answer was recorded and then computed away, and the stored row kept the
  // wrong figure until something rebuilt it.

  if (done) {
    return (
      <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
        Reset {done.answers} answer{done.answers === 1 ? "" : "s"} across{" "}
        {done.rebuilt} sheet{done.rebuilt === 1 ? "" : "s"}
        {done.failed ? `, ${done.failed} could not be rebuilt` : ""}.
      </span>
    );
  }

  if (!impact) {
    return (
      <button
        type="button"
        onClick={open}
        disabled={checking}
        className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/30"
      >
        {checking
          ? "Checking…"
          : answers > 0
            ? "Undo every answer"
            : "Put back to as uploaded"}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 dark:border-rose-900/60 dark:bg-rose-950/30">
      <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">
        {impact.answers > 0
          ? `Delete ${impact.answers} answer${impact.answers === 1 ? "" : "s"} on this batch?`
          : "Rebuild every sheet on this batch?"}
      </p>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-rose-800 dark:text-rose-300">
        <li>Every sheet goes back to the figures the upload produced.</li>
        {impact.signed > 0 && (
          <li>
            <b>
              {impact.signed} signed sheet{impact.signed === 1 ? "" : "s"} will lose{" "}
              {impact.signed === 1 ? "its signature" : "their signatures"}
            </b>{" "}
            &mdash; a rebuild un-signs, because the signed copy quotes figures
            that are about to change.
          </li>
        )}
        <li>The uploaded documents and the name matches are untouched.</li>
      </ul>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await resetBatchAnswers(batchId);
              if (res?.ok) setDone(res);
              setImpact(null);
            })
          }
          className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-800 disabled:opacity-60"
        >
          {pending ? "Resetting…" : "Yes, reset everything"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setImpact(null)}
          className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-800 transition hover:bg-rose-100 disabled:opacity-60 dark:border-rose-900/60 dark:text-rose-300 dark:hover:bg-rose-950/50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
