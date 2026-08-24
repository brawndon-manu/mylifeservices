"use client";

// THE MID-PERIOD BOX, same shape as the MLS upload's. Client component only so
// the date range can reveal itself when the box is ticked - everything real
// happens in the action.
import { useState } from "react";

export default function PartialPick() {
  const [partial, setPartial] = useState(false);
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/25">
      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          name="partial"
          checked={partial}
          onChange={(e) => setPartial(e.target.checked)}
          className="mt-0.5 h-4 w-4 flex-none accent-amber-600"
        />
        <span className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">
          <span className="font-semibold">Partial pay period.</span>{" "}
          The period hasn&apos;t ended: keep only the days worked so far and
          drop the rest.
          The batch is marked partial, any workweek cut off part-way has
          provisional overtime, and the next upload of the period folds this one
          under it.
        </span>
      </label>

      {/* THE RANGE HAS TO BE TYPED. QSP returns the whole pay period whatever
          range it was asked for, so the file cannot say what was wanted and
          the only record of it is this. */}
      {partial && (
        <div className="mt-3 border-t border-amber-300 pt-3 dark:border-amber-800">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-medium text-amber-900 dark:text-amber-200">
              <span className="block">Keep days from</span>
              <input
                type="date"
                name="partialFrom"
                className="mt-1 rounded border border-amber-400 bg-surface px-2 py-1 font-mono text-xs text-foreground dark:border-amber-700"
              />
            </label>
            <label className="text-xs font-medium text-amber-900 dark:text-amber-200">
              <span className="block">to</span>
              <input
                type="date"
                name="partialTo"
                className="mt-1 rounded border border-amber-400 bg-surface px-2 py-1 font-mono text-xs text-foreground dark:border-amber-700"
              />
            </label>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
            Leave either blank for no limit at that end. Days after today are
            always dropped whatever you pick here - QSP prints shifts nobody has
            worked yet exactly like real ones.
          </p>
        </div>
      )}
    </div>
  );
}
