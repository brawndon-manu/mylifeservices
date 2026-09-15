"use client";

// RE-RUNNING THE ENGINE OVER A WHOLE PERIOD.
//
// Its sibling next door, ResetAnswersButton, deletes every answer on the batch
// and is dressed as the destructive control it is. This one deletes nothing:
// answers and overrides ride straight through, and the only thing that changes
// is what the current rules make of the same days. So it reads as an ordinary
// action rather than a warning.
//
// TWO STEPS ANYWAY, and for the same reason as the reset: it moves money across
// a whole period. The confirm names the premium hours the batch is carrying
// right now, read AT CLICK TIME rather than off the page render, so a tab left
// open all afternoon cannot promise a figure that stopped being true at lunch.
//
// AND IT SAYS WHAT MOVED. A recompute that reports "done" leaves somebody
// comparing two screens to find out whether anything happened. The result names
// the before and after, because a rule taking effect is exactly the thing
// nobody should have to go looking for.
import { useState, useTransition } from "react";
import { recomputeBatch, batchRecomputeImpact } from "../actions";

const hrs = (n) => `${(n || 0).toFixed(2)} hr${(n || 0) === 1 ? "" : "s"}`;
const sheets = (n) => `${n} sheet${n === 1 ? "" : "s"}`;

export default function RecomputeBatchButton({ batchId }) {
  const [impact, setImpact] = useState(null);
  const [checking, setChecking] = useState(false);
  const [done, setDone] = useState(null);
  const [pending, start] = useTransition();

  async function open() {
    setChecking(true);
    try {
      setImpact(await batchRecomputeImpact(batchId));
    } catch {
      setImpact({ sheets: null, frozen: 0, openItems: 0, restHours: null, mealHours: null });
    } finally {
      setChecking(false);
    }
  }

  if (done) {
    const restMoved = done.restAfter !== done.restBefore;
    const mealMoved = done.mealAfter !== done.mealBefore;
    return (
      <div className="rounded-lg bg-fill p-3 text-xs">
        <p className="text-sm font-semibold text-foreground">
          Recalculated {sheets(done.rebuilt)}.
        </p>
        <ul className="mt-1.5 space-y-0.5 text-muted">
          <li>
            Rest premium {hrs(done.restBefore)} to {hrs(done.restAfter)}
            {restMoved ? "" : ", unchanged"}.
          </li>
          <li>
            Meal premium {hrs(done.mealBefore)} to {hrs(done.mealAfter)}
            {mealMoved ? "" : ", unchanged"}.
          </li>
          {done.frozen > 0 && (
            <li>{sheets(done.frozen)} already signed, left alone.</li>
          )}
          {done.openItems > 0 && (
            <li>{sheets(done.openItems)} still have open items and were skipped.</li>
          )}
          {done.failed > 0 && (
            <li className="font-semibold text-foreground">
              {sheets(done.failed)} could not be rebuilt.
            </li>
          )}
        </ul>
      </div>
    );
  }

  if (!impact) {
    return (
      <button
        type="button"
        onClick={open}
        disabled={checking}
        className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-fill disabled:opacity-50"
      >
        {checking ? "Checking..." : "Recalculate every sheet"}
      </button>
    );
  }

  return (
    <div className="rounded-lg bg-fill p-3">
      <p className="text-sm font-semibold text-foreground">
        Recalculate every sheet on this batch?
      </p>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-muted">
        <li>
          Every sheet is worked out again under today&rsquo;s rules. Answers and
          adjustments are kept.
        </li>
        {impact.restHours != null && (
          <li>
            Carrying {hrs(impact.restHours)} rest premium and{" "}
            {hrs(impact.mealHours)} meal premium now. Both can move.
          </li>
        )}
        {impact.frozen > 0 && (
          <li>
            {sheets(impact.frozen)} already signed and will be left alone, so
            nobody&rsquo;s signed copy is rewritten.
          </li>
        )}
        {impact.openItems > 0 && (
          <li>
            {sheets(impact.openItems)} have open items and will be skipped. They
            work themselves out when those are resolved.
          </li>
        )}
      </ul>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await recomputeBatch(batchId);
              if (res?.ok) setDone(res);
              setImpact(null);
            })
          }
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          {pending ? "Recalculating..." : "Recalculate"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setImpact(null)}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-fill disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
