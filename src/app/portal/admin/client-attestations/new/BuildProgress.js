"use client";

// WHAT THE UPLOAD IS DOING, WHILE IT DOES IT.
//
// Mánu 2026-09-12, looking at a 240-client month stopped on "Building the
// forms...": "its stuck here". It was not. It had most of a minute left, and
// the screen had no way to tell him apart from one that had died - which is
// the same thing the timesheet upload's panel was built to fix.
//
// Its own panel rather than that one: that component hardcodes its poll URL,
// says "Generating corrected timesheets" and tickers premium hours, none of
// which is true here. The STORE is shared, which is the part worth sharing.
//
// Nothing here is invented. The count is a real count of forms drawn, the
// names are the clients they were drawn for, and if the poll returns nothing
// it says so rather than animating something to look busy.
import { useEffect, useState } from "react";
import { CLIENT_SCHEDULE_STAGES } from "@/lib/timesheet-stages";

const POLL_MS = 1000;

// "about half a minute" is measured, not guessed: a real 240-client September
// run on 2026-09-12 read 9 forms at 0:05, 41 at 0:09, 145 at 0:18 and landed
// around 0:30. If the export grows a lot, re-measure rather than re-word.

function mmss(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export default function BuildProgress({ uploadId, seconds = 0 }) {
  const [state, setState] = useState(null);

  useEffect(() => {
    if (!uploadId) return undefined;
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/portal/admin/client-attestations/new/progress?id=${uploadId}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const next = await res.json();
        if (alive) setState(next);
      } catch {
        // a dropped poll is not worth saying anything about; the next one is
        // a second away and the upload is unaffected either way
      }
    };
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [uploadId]);

  const stage = state?.stage || null;
  const done = state?.done ?? 0;
  const total = state?.total ?? null;
  const label =
    CLIENT_SCHEDULE_STAGES.find((s) => s.key === stage)?.label || "Starting";
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : null;

  return (
    <div className="mt-8 rounded-xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-sm tabular-nums text-muted">{mmss(seconds)}</p>
      </div>

      {/* THE COUNT IS THE SCREEN. It is the one thing that answers "how much
          longer", so it gets the size and everything else arranges under it. */}
      <p className="mt-3 text-2xl font-semibold tabular-nums text-foreground">
        {total ? `${done} of ${total} forms` : done ? `${done} forms` : "—"}
      </p>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full bg-brand-light transition-[width] duration-500"
          style={{ width: pct == null ? "0%" : `${pct}%` }}
        />
      </div>

      {state?.recent?.length > 0 && (
        <ul className="mt-4 space-y-1 text-xs text-muted">
          {state.recent.map((r, i) => (
            <li key={`${r.name}-${i}`} className={r.failed ? "text-rose-600 dark:text-rose-400" : undefined}>
              {r.name}
              {r.failed ? " · no form drawn" : ""}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs leading-relaxed text-muted">
        {state === null
          ? "Waiting for the first count."
          : "A full month is a few hundred forms, each drawn and stored one at a time, and takes about half a minute. Leave the tab open."}
      </p>
    </div>
  );
}
