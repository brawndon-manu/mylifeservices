// WHETHER THIS PERIOD IS STILL COMING IN, at a glance.
//
// The light only blinks on LIVE. A pulse that never stops is a pulse nobody
// reads, and the whole value of it is that it means "more data is coming, do
// not treat this as the answer yet".
//
// Tailwind v4 compiles what it can SEE, so every class here is a full literal
// string off `BATCH_STATES` rather than built from the state key. The violations
// group once shipped with a plain white border for exactly that reason.
import { batchState, periodDays } from "@/lib/timesheet/batch-state";

export default function LiveBadge({ batch, size = "md" }) {
  const s = batchState(batch);
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 font-bold tracking-wide ${s.pill} ${
        size === "sm" ? "text-[10px]" : "text-[11px]"
      }`}
      title={
        s.key === "live"
          ? `The export reaches ${s.reach}. The period runs to ${batch.periodTo}.`
          : s.key === "final"
            ? `Marked final${s.lockedByName ? ` by ${s.lockedByName}` : ""}.`
            : "The whole period is in. Nobody has said the schedule is locked."
      }
    >
      <span className="relative flex h-2 w-2">
        {/* the ring, not the dot, is what animates - a dot that fades looks
            broken and a ring reads as a broadcast light */}
        {s.pulses && (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 ${s.dot}`} />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${s.dot}`} />
      </span>
      {s.label}
    </span>
  );
}

// EVERY DAY OF THE PERIOD, AND WHETHER IT IS IN.
//
// "3 days still to come" is a number somebody has to trust. This is the same
// fact in a form they can check, which matters on the one screen where the
// answer decides whether sixty people get emailed.
export function PeriodStrip({ batch }) {
  const days = periodDays(batch);
  if (!days.length) return null;
  const missing = days.filter((d) => !d.covered).length;
  return (
    <div className="mt-3">
      <div className="flex gap-[3px]">
        {days.map((d) => (
          <div
            key={d.day}
            title={
              d.covered
                ? `${d.day} - covered by the export${d.weekend ? " (weekend)" : ""}`
                : `${d.day} - not in the export yet`
            }
            // A COVERED WEEKEND IS COVERED. This drew them in grey, which was
            // indistinguishable from the not-yet-uploaded days, so the strip
            // showed gaps on the 1st, 2nd, 8th and 9th that do not exist - and
            // it read as "days you uploaded on" rather than "days the data
            // covers". Same fill for every covered day; the weekend is said in
            // the number's weight and in the tooltip, where it cannot be
            // mistaken for missing.
            className={`relative h-5 flex-1 rounded-[3px] text-[9px] font-mono ${
              d.covered
                ? "bg-sky-100 text-slate-700 dark:bg-sky-950/50 dark:text-sky-200"
                : "border border-dashed border-border-strong bg-surface-2 text-faint"
            }`}
          >
            <span
              className={`absolute inset-0 flex items-center justify-center ${
                d.covered && d.weekend ? "opacity-45" : ""
              }`}
            >
              {d.day}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-faint">
        {missing
          ? `blue = the export covers this day · dashed = not in the export yet (${missing} to come)`
          : "the export covers every day of the period"}
      </p>
    </div>
  );
}
