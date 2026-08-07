"use client";

// The three counters at the top of the checks screen, doubling as the filter.
//
// They used to be "Staff affected 24 of 59", "Days needing a decision 3 of 55"
// and "Days flagged against the schedule 2" - three different units, so they
// could not filter one list, and "affected" merged a thing that needs doing
// with a thing that explicitly never needs doing. Everything is days now.
//
// The rows themselves are rendered on the server and handed in as children, so
// nothing here needs to know what a punch is - and Evidence keeps its import of
// the timesheet engine well away from the browser bundle. This component only
// decides which children to show.
import { Children, useState } from "react";

export const GROUPS = [
  {
    key: "decide",
    label: "Needs you to decide",
    hint: "No repair holds up and nothing else settles it. These get worked out by hand.",
  },
  {
    key: "unworked",
    label: "Scheduled but never worked",
    hint: "The schedule has the day and the timesheet has no hours, so it pays nothing. Ask whether they worked it.",
  },
  {
    key: "anomaly",
    label: "Anomalies",
    hint: "The figures are right and the day still does not make sense. Nothing to fix here, but somebody should know.",
  },
  {
    key: "settled",
    label: "Settled, no action",
    hint: "Resolved by a repair or by the schedule, or context that never moves a figure. Here to audit, not to act on.",
  },
];

// full literal strings - tailwind can't see a class it has to assemble
const TONE = {
  decide: {
    on: "border-2 border-rose-400 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40",
    num: "text-rose-600 dark:text-rose-400",
  },
  unworked: {
    on: "border-2 border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40",
    num: "text-amber-600 dark:text-amber-400",
  },
  // violet is new to the codebase. Tailwind v4 only compiles classes it finds in
  // SOURCE, so these literals ARE the thing that makes the colour exist - it
  // came out with a plain white border in the mock for exactly that reason.
  anomaly: {
    on: "border-2 border-violet-400 bg-violet-50 dark:border-violet-700 dark:bg-violet-950/40",
    num: "text-violet-600 dark:text-violet-400",
  },
  settled: {
    on: "border-2 border-emerald-400 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40",
    num: "text-emerald-600 dark:text-emerald-400",
  },
};

export default function ChecksFilter({ counts, groups, notes = [], children }) {
  // The two that need a person are on; the rest are one click away.
  //
  // Unless there is nothing to decide at all, which is a real state and used to
  // open on an empty dashed box reading "Nothing selected" over "Showing 0 of
  // 17". A screen whose own headline says "0 of these need a person" should not
  // then make you click something before it will show you anything. When both
  // actionable groups are empty it falls through to the next thing that exists:
  // anomalies first, and only then the settled pile.
  const nothingToDo = !counts.decide && !counts.unworked;
  const [on, setOn] = useState({
    decide: true,
    unworked: true,
    anomaly: nothingToDo,
    settled: nothingToDo && !counts.anomaly,
  });

  const kids = Children.toArray(children);
  const shown = kids.filter((_, i) => on[groups[i]]);
  const total = kids.length;

  return (
    <>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {GROUPS.map((g) => {
          const active = on[g.key];
          return (
            <button
              key={g.key}
              type="button"
              aria-pressed={active}
              onClick={() => setOn((s) => ({ ...s, [g.key]: !s[g.key] }))}
              className={`rounded-xl p-4 text-left transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                active
                  ? `${TONE[g.key].on} p-[calc(1rem-1px)]`
                  : "border border-border bg-surface opacity-60"
              }`}
            >
              <span
                className={`block text-3xl font-bold tabular-nums leading-none ${
                  active ? TONE[g.key].num : "text-faint"
                }`}
              >
                {counts[g.key]}
              </span>
              <span className="mt-1 block text-sm font-bold text-foreground">
                {g.label}
              </span>
              <span className="mt-1 block text-xs leading-snug text-muted">
                {g.hint}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-faint">
        Click a box to show or hide that group. Showing {shown.length} of {total}.
      </p>

      {/* Findings that belong to the PERIOD or to a person across it, so there
          is no day for them to be a row of. They ride with the anomalies group
          because that is what they are, but they are kept visually apart from
          the day list and each carries its own unit - the mistake this screen
          was rebuilt to fix was three counters in three different units
          pretending to be comparable. */}
      {on.anomaly && notes.length > 0 && (
        <div className="mt-5 rounded-xl border border-violet-300 bg-violet-50 p-4 dark:border-violet-900/60 dark:bg-violet-950/20">
          <p className="text-sm font-bold text-foreground">Not about one day</p>
          <p className="mt-1 text-xs text-muted">
            These are about the period, or about a person across it, so they have no row in the
            list below.
          </p>
          <ul className="mt-1">
            {notes.map((n) => (
              <li key={n.head} className="mt-3 flex gap-3">
                <span className="w-14 shrink-0 text-right text-lg font-bold leading-tight tabular-nums text-violet-600 dark:text-violet-400">
                  {n.n}
                  <span className="block text-[10px] font-normal uppercase tracking-wide text-faint">
                    {n.unit}
                  </span>
                </span>
                <span className="text-xs leading-relaxed text-muted">
                  <span className="block text-sm font-semibold text-foreground">{n.head}</span>
                  {n.why}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-border p-8 text-center text-sm text-faint">
          Nothing selected. Click a box above to show a group.
        </p>
      ) : (
        <div className="mt-5 space-y-3">{shown}</div>
      )}
    </>
  );
}
