// WHETHER THIS PERIOD IS STILL COMING IN, at a glance.
//
// The light only blinks on LIVE. A pulse that never stops is a pulse nobody
// reads, and the whole value of it is that it means "more data is coming, do
// not treat this as the answer yet".
//
// Tailwind v4 compiles what it can SEE, so every class here is a full literal
// string off `BATCH_STATES` rather than built from the state key. The violations
// group once shipped with a plain white border for exactly that reason.
import {
  batchState, periodDays, signatureState, versionState,
} from "@/lib/timesheet/batch-state";

// WHICH UPLOAD THIS IS, and nothing else. Split off the state pill 2026-08-17:
// supersession and where-the-period-has-got-to are two facts, and one pill could
// only ever say whichever won, so a replaced upload lost its lifecycle entirely.
export function VersionBadge({ newerInPeriod = false, size = "md" }) {
  const v = versionState(newerInPeriod);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 font-bold tracking-wide ${v.pill} ${
        size === "sm" ? "text-[10px]" : "text-[11px]"
      }`}
      title={
        v.key === "superseded"
          ? "A later upload of this same pay period exists. That one is the live copy."
          : "This is the newest upload of this pay period, and the one being worked."
      }
    >
      {v.label}
    </span>
  );
}

// OUT FOR SIGNATURE, AND HOW MUCH OF IT IS BACK.
//
// The only thing on any of these screens that blinks. Renders nothing at all
// until something has actually been sent, so it cannot sit there claiming a
// period is live before anybody has been asked.
export function SignatureBadge({ sent = 0, signed = 0, size = "md" }) {
  const s = signatureState(sent, signed);
  if (!s) return null;
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 font-bold tracking-wide ${s.pill} ${
        size === "sm" ? "text-[10px]" : "text-[11px]"
      }`}
      title={
        s.key === "all-signed"
          ? `All ${s.sent} of the timesheets sent have been signed.`
          : `${s.sent} timesheet${s.sent === 1 ? "" : "s"} out for signature, ${s.signed} back. This page updates as they come in.`
      }
    >
      <span className="relative flex h-2 w-2">
        {s.pulses && (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 ${s.dot}`} />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${s.dot}`} />
      </span>
      {s.label}
      <span className="font-medium opacity-80">{s.detail}</span>
    </span>
  );
}

// NOT GIVEN `newerInPeriod` ANY MORE, on purpose. This pill is the lifecycle
// alone now; VersionBadge above carries supersession. Callers still pass the
// flag to `batchState` for the LOGIC - Send all, the read-only banner, the
// explanation panel - and none of that changed.
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
      {/* the dot stays, the blink does not - see the note on `pulses` in
          BATCH_STATES. Nothing on this pill animates any more; the signature
          badge is the only light on the page. */}
      <span className="relative flex h-2 w-2">
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
