"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// ONE DAY FOR ONE PERSON. Shows what they worked and what is recorded as time
// off, and takes an edit in place.
//
// The box holds HOURS, not a toggle, because a PTO day is not always a whole
// one - 4 hours on a half day and 2.77 on a part day are both real entries from
// the first period this recorded. Clearing it removes the row, which is why the
// action treats an empty or zero value as a delete rather than storing a
// nought-hour day off.
export default function PtoCell({ action, program, periodFrom, periodTo, personKey, date, worked, pto, back }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [val, setVal] = useState(pto == null ? "" : String(pto));

  const save = async () => {
    setBusy(true);
    const fd = new FormData();
    for (const [k, v] of Object.entries({ program, periodFrom, periodTo, personKey, date, hours: val, back })) {
      fd.set(k, v ?? "");
    }
    await action(fd);
    setBusy(false);
    setOpen(false);
    router.refresh();
  };

  // WORKED TIME WINS THE CELL. A day somebody was actually on shift is the
  // fact that matters most at a glance, and PTO on the same day is unusual
  // enough that it should look unusual rather than blend in.
  const tone = worked
    ? "border-border bg-surface-2 text-foreground"
    : pto
      ? "border-sky-400/70 bg-sky-500/10 text-sky-800 dark:text-sky-300"
      : "border-border/60 bg-transparent text-faint";

  if (open) {
    return (
      <div className="rounded-md border border-brand bg-surface p-1">
        <input
          autoFocus
          type="text"
          inputMode="decimal"
          value={val}
          disabled={busy}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") { setVal(pto == null ? "" : String(pto)); setOpen(false); }
          }}
          placeholder="hrs"
          className="w-full bg-transparent text-center text-xs text-foreground outline-none"
        />
        <div className="mt-1 flex gap-1">
          <button type="button" onClick={save} disabled={busy}
            className="flex-1 rounded bg-brand px-1 py-0.5 text-[10px] font-semibold text-white disabled:opacity-50">
            {busy ? "…" : "Save"}
          </button>
          <button type="button" onClick={() => { setVal(pto == null ? "" : String(pto)); setOpen(false); }}
            disabled={busy}
            className="rounded border border-border-strong px-1 py-0.5 text-[10px] text-muted">
            ×
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      title={`${date} - click to record time off`}
      className={`h-full w-full rounded-md border px-1 py-1.5 text-center text-xs transition hover:border-brand ${tone}`}
    >
      {worked ? <span className="font-semibold">{worked}</span> : null}
      {pto ? (
        <span className={worked ? "ml-1 text-[10px] font-medium" : "font-semibold"}>
          {worked ? `+${pto} PTO` : `${pto} PTO`}
        </span>
      ) : null}
      {!worked && !pto ? <span className="text-[10px]">·</span> : null}
    </button>
  );
}
