"use client";

// What the upload is doing, while it does it.
//
// The action can't talk back to the page, so it writes its progress to redis and
// this polls for it. Before, the whole minute was one spinner and one line of
// copy, which meant a stall and normal progress looked exactly the same.
//
// The count is the screen on purpose. You are stuck here for about a minute with
// nothing to do, so the one number that answers "how much longer" gets the
// middle of it and everything else arranges around that.
//
// Nothing here is invented. The count is a real count of sheets written, the
// names are the people they were written for, and if the poll returns nothing it
// says so rather than animating a bar to look busy.
import { useEffect, useState } from "react";
import { STAGES } from "@/lib/timesheet-stages";
import SourceFiles from "./SourceFiles";

const POLL_MS = 1000;

// the ring
const R = 82;
const C = 2 * Math.PI * R;

function mmss(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export default function UploadProgress({ uploadId, seconds = 0, files }) {
  const [state, setState] = useState(null);
  const [reachedPoll, setReachedPoll] = useState(false);
  // what the polling itself is doing. shown in one muted line at the bottom:
  // when this panel misbehaves the first question is always "is it even being
  // told anything", and without this there is no way to answer it from the
  // screen. Cheap to keep, and it makes the panel able to explain itself.
  const [diag, setDiag] = useState({ polls: 0, status: null, err: null });

  useEffect(() => {
    if (!uploadId) return;

    // `cancelled` is scoped to THIS run of the effect, deliberately not a ref.
    // Strict Mode mounts, tears down, and mounts again in development, and a ref
    // survives that - so a ref set by the first teardown was still set on the
    // second mount and the loop would poll exactly once.
    let cancelled = false;
    let timer;

    async function tick() {
      try {
        const res = await fetch(`/portal/admin/timesheets/new/progress?id=${uploadId}`, {
          cache: "no-store",
        });
        const json = res.ok ? await res.json() : null;
        if (!cancelled) {
          setDiag((d) => ({ polls: d.polls + 1, status: res.status, err: null }));
          if (res.ok) {
            setReachedPoll(true);
            if (json?.stage) setState(json);
          }
        }
      } catch (e) {
        // a dropped poll is not worth stopping for - the next one is a second
        // away - but it IS worth showing, since a poll that never lands is
        // indistinguishable from an upload that never progresses
        if (!cancelled) {
          setDiag((d) => ({ ...d, polls: d.polls + 1, err: String(e?.message || e).slice(0, 60) }));
        }
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    }

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [uploadId]);

  const stageIdx = state ? STAGES.findIndex((s) => s.key === state.stage) : -1;
  const total = state?.total || null;
  const done = state?.done || 0;
  const generating = state?.stage === "generating" && total;
  const pct = generating ? Math.min(1, done / total) : 0;
  const period = state?.period;

  return (
    <div className="mt-6 rounded-2xl border border-border bg-surface p-6 sm:p-7">
      <SourceFiles files={files} />

      {/* ---------------- the ring ---------------- */}
      <div className={`text-center ${files?.length ? "mt-7" : ""}`}>
        <div className="relative mx-auto h-[186px] w-[186px]">
          <svg width="186" height="186" viewBox="0 0 186 186" className="-rotate-90">
            <circle cx="93" cy="93" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="12" />
            <circle
              cx="93"
              cy="93"
              r={R}
              fill="none"
              stroke="url(#ringGrad)"
              strokeWidth="12"
              strokeLinecap="round"
              // during generating this is a true fraction of sheets written.
              // before that there is nothing honest to measure, so it holds a
              // short arc and turns instead of inventing a percentage.
              strokeDasharray={generating ? C : `${C * 0.16} ${C}`}
              strokeDashoffset={generating ? C * (1 - pct) : 0}
              className={generating ? "transition-[stroke-dashoffset] duration-700" : "motion-safe:animate-spin"}
              style={generating ? undefined : { transformOrigin: "93px 93px", animationDuration: "2.4s" }}
            />
            <defs>
              <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="var(--color-brand)" />
                <stop offset="1" stopColor="var(--color-brand-light)" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 grid place-content-center">
            {generating ? (
              <>
                <p className="text-[52px] font-bold leading-none tabular-nums text-foreground" aria-live="polite">
                  {done}
                </p>
                <p className="mt-1.5 text-center text-xs text-muted">of {total}</p>
              </>
            ) : (
              <p className="max-w-[124px] text-center text-[13px] leading-snug text-muted">
                {STAGES[stageIdx]?.label || "Reading the export"}
              </p>
            )}
          </div>
        </div>

        <p className="mt-5 text-[17px] font-semibold text-foreground">
          {generating ? "Generating corrected timesheets" : "Reading your four exports"}
        </p>
        <p className="mt-0.5 text-[12.5px] text-muted">
          {period?.from ? `${period.from} to ${period.to} · ` : ""}
          nothing is emailed by this step
        </p>
        <p className="mt-3 text-[11px] tabular-nums text-faint">
          {mmss(seconds)} elapsed
          {seconds < 150 ? " · usually about a minute" : ""}
        </p>
      </div>

      {/* ---------------- who just finished ---------------- */}
      {state?.recent?.length > 0 && (
        <div className="mt-6 border-t border-border pt-4">
          <p className="mb-2 text-[10px] uppercase tracking-widest text-faint">Just finished</p>
          <ul>
            {state.recent.map((r, i) => (
              <li
                key={`${r.name}-${i}`}
                className={`mb-1.5 flex items-baseline gap-2 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs ${
                  ["opacity-100", "opacity-60", "opacity-40", "opacity-20"][i] || "opacity-20"
                }`}
              >
                <span aria-hidden="true" className={r.failed ? "text-rose-500" : "text-emerald-500"}>
                  {r.failed ? "!" : "✓"}
                </span>
                <span className="truncate font-semibold text-foreground">{r.name}</span>
                <span className="ml-auto shrink-0 tabular-nums text-[11.5px] text-muted">
                  {r.failed ? "no PDF" : `${r.hours.toFixed(2)} hrs`}
                  {!r.failed && r.premium > 0 && ` · ${r.premium.toFixed(2)} premium`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---------------- the steps, while there is no count ---------------- */}
      {!generating && (
        <div className="mt-6 border-t border-border pt-4">
          <p className="mb-2 text-[10px] uppercase tracking-widest text-faint">Steps</p>
          <ol className="space-y-1">
            {STAGES.filter((s) => s.key !== "done").map((s, i) => {
              const past = stageIdx > i;
              const now = stageIdx === i;
              return (
                <li key={s.key} className="flex items-center gap-2 text-xs">
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 flex-none rounded-full ${
                      past ? "bg-emerald-500" : now ? "bg-brand-light" : "bg-border-strong"
                    }`}
                  />
                  <span className={now ? "font-semibold text-foreground" : past ? "text-muted" : "text-faint"}>
                    {s.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <p className="mt-5 text-center text-[11.5px] text-faint">
        Keep this tab open. Closing it won&apos;t lose the work, but you&apos;ll stop seeing it.
      </p>

      {/* honest about the one case where there is nothing to report */}
      {reachedPoll && !state && seconds > 8 && (
        <p className="mt-3 text-center text-xs text-muted">
          Still working. No progress is coming back, which usually means the
          progress store is unreachable - the upload itself is unaffected and
          will finish on its own.
        </p>
      )}
      {seconds > 180 && (
        <p className="mt-3 text-center text-xs text-amber-700 dark:text-amber-400">
          This is longer than a full pay period normally takes. Leave the tab open
          a little longer before assuming it has failed.
        </p>
      )}

      {/* one line saying whether the panel is being told anything at all */}
      <p className="mt-2 text-center font-mono text-[10.5px] text-faint/70">
        {diag.polls} polls
        {diag.status != null && ` · HTTP ${diag.status}`}
        {state?.stage && ` · ${state.stage}`}
        {state?.done != null && state?.total ? ` ${state.done}/${state.total}` : ""}
        {diag.err && ` · ${diag.err}`}
        {!uploadId && " · no upload id, progress off"}
      </p>
    </div>
  );
}
