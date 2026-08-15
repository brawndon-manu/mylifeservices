"use client";

// THE BREAK REASON, IN EVERY SENTENCE AND EVERY SHAPE.
//
// `TimesheetBreakAnswer` is at zero rows, so none of this has ever rendered
// against real data. The rows below are fabricated and the component is the
// real one, so what is on screen is what an employee would be shown.
//
// FIVE SENTENCES, NOT ONE WITH A NOUN SWAPPED IN. `employeeQuestion` writes a
// missed lunch, a single missed ten, neither of two, one of two taken and a
// late meal differently, and it got three of those wrong until the counts were
// wired into it. Seeing them side by side is the only way to check the wording.
//
// THREE SHAPES PER ROW. "write" when nobody gathered a reason, "confirm" when
// somebody took one on a call and it is read back - and inside a confirm card,
// pressing "No, that is not what I said" opens the third. That last one is
// client state inside BreakReason, so it is reached by pressing rather than by
// picking it here.
import { useState } from "react";
import BreakReason from "@/app/t/[token]/BreakReason";

export default function BreakStage({ asks }) {
  const [saved, setSaved] = useState({});
  const [nonce, setNonce] = useState(0);

  // the real component calls this and then `router.refresh()`. Nothing is
  // written, and what would have been written is shown under the card.
  const pretend = async ({ findingKey, agree, text }) => {
    if (!agree && !String(text || "").trim()) return { ok: false, error: "empty" };
    setSaved((s) => ({ ...s, [findingKey]: { agree, text: text || null } }));
    return { ok: true };
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {asks.map((row) => (
        <div key={row.ask.findingKey} className="rounded-xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">{row.label}</p>
            <p className="font-mono text-[11px] text-faint">
              {row.ask.kind} · {row.ask.takenCount ?? 0} of {row.ask.missingCount ?? 1}
            </p>
          </div>
          <p className="mt-0.5 text-xs text-muted">{row.note}</p>

          <BreakReason
            key={`${row.ask.findingKey}-${nonce}`}
            token="tests-fixture"
            ask={row.ask}
            submitAction={pretend}
          />

          {saved[row.ask.findingKey] && (
            <div className="mt-3 rounded-lg border border-dashed border-border-strong bg-surface-2 p-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-faint">
                What it would have written
              </p>
              <p className="mt-1.5 font-mono text-xs text-foreground">
                confirmedAt: <b className="text-emerald-700 dark:text-emerald-400">now</b>
              </p>
              <p className="mt-1 font-mono text-xs text-foreground">
                confirmedText:{" "}
                {saved[row.ask.findingKey].agree && !saved[row.ask.findingKey].text ? (
                  <span className="text-muted">
                    ours, unchanged - &ldquo;{row.ask.reason}&rdquo;
                  </span>
                ) : (
                  <span className="text-muted">
                    &ldquo;{saved[row.ask.findingKey].text}&rdquo;
                  </span>
                )}
              </p>
              {!saved[row.ask.findingKey].agree && row.ask.reason && (
                <p className="mt-1.5 text-xs text-muted">
                  Ours is kept as well as theirs. Both print at the bottom of the sheet, so the
                  document shows that the record moved rather than only the version that survived.
                </p>
              )}
            </div>
          )}
        </div>
      ))}

      <div className="lg:col-span-2">
        <button
          type="button"
          onClick={() => { setSaved({}); setNonce((n) => n + 1); }}
          className="rounded-lg border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
        >
          Reset every card
        </button>
      </div>
    </div>
  );
}
