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
import { Check, ChevronDown, ListFilter } from "lucide-react";
import styles from "./DataChecks.module.css";

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
    key: "violation",
    label: "Violations to raise",
    // counted in PEOPLE, and the label says so. The others count days, and the
    // reason the old counters were torn out was three units pretending to be
    // comparable - so this one names its unit rather than leaving it implied.
    // People because the row IS a person: you have one conversation with
    // somebody about all five of their days, not five conversations.
    hint: "A break the rules required and the record says they did not get. One person per row, with every day of theirs behind it.",
  },
  {
    key: "anomaly",
    label: "Anomalies",
    hint: "The record disagrees with itself and the figures still come out right. Repaired here or worth fixing at source, but no rule was broken.",
  },
  {
    key: "settled",
    label: "Settled, no action",
    hint: "Resolved by a repair or by the schedule, or context that never moves a figure. Here to audit, not to act on.",
  },
];

export default function ChecksFilter({ counts, groups, kinds = [], notes = [], children }) {
  // The two that need a person are on; the rest are one click away.
  //
  // Unless there is nothing to decide at all, which is a real state and used to
  // open on an empty dashed box reading "Nothing selected" over "Showing 0 of
  // 17". A screen whose own headline says "0 of these need a person" should not
  // then make you click something before it will show you anything. When both
  // actionable groups are empty it falls through to the next thing that exists:
  // anomalies first, and only then the settled pile.
  // Violations join the two that open by default: they are the group somebody
  // has to act on, and the screen exists so two people can work down them.
  const nothingToDo = !counts.decide && !counts.unworked && !counts.violation;
  const [on, setOn] = useState({
    decide: true,
    unworked: true,
    violation: true,
    anomaly: nothingToDo,
    settled: nothingToDo && !counts.anomaly,
  });

  const kids = Children.toArray(children);
  const visible = kids.map((_, i) => i).filter((i) => on[groups[i]]);
  const shown = visible.map((i) => kids[i]);
  const total = kids.length;

  // Rows arrive already sorted by kind, so a heading goes in wherever the kind
  // changes. It carries its own count because "13 rests taken late" is a
  // different sort of thing from "3 punch pairs that do not read", and a single
  // running total of 69 says neither.
  // Keyed by GROUP and kind together, not by kind alone. The same kind appears
  // in two groups - a rest report row that needs a decision and one that is
  // only an anomaly are the same kind of finding with different urgency - so
  // keying on the label alone both collided in React and printed the same count
  // under two headings that held different rows.
  const perKind = {};
  for (const i of visible) {
    const key = `${groups[i]}|${kinds[i]}`;
    perKind[key] = (perKind[key] || 0) + 1;
  }
  const withHeadings = [];
  let lastKey = null;
  for (const i of visible) {
    const k = kinds[i];
    const key = `${groups[i]}|${k}`;
    if (k && key !== lastKey) {
      withHeadings.push(
        <h3
          key={`kind-${key}`}
          className={styles.kindHeading}
        >
          {k}
          <span className="text-[11px] font-semibold normal-case tracking-normal tabular-nums">
            {perKind[key]}
          </span>
        </h3>,
      );
      lastKey = key;
    }
    withHeadings.push(kids[i]);
  }

  return (
    <div className={styles.workspace}>
      <aside className={styles.filters} aria-labelledby="check-groups-title">
        <h2 id="check-groups-title" className={styles.filterHeading}>
          <ListFilter size={16} aria-hidden="true" /> Show groups
        </h2>
        <p className={styles.filterIntro}>Select the groups you want to review.</p>
        <div className={styles.filterOptions}>
          {GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              aria-pressed={on[g.key]}
              title={g.hint}
              onClick={() => setOn((s) => ({ ...s, [g.key]: !s[g.key] }))}
              className={styles.filterOption}
            >
              <span className={styles.selection} aria-hidden="true">
                {on[g.key] && <Check size={12} strokeWidth={2.5} />}
              </span>
              <span>{g.label}</span>
              <span className={styles.filterCount}>{counts[g.key]}</span>
            </button>
          ))}
        </div>
        <details className={styles.filterHelp}>
          <summary>About these groups <ChevronDown size={14} aria-hidden="true" /></summary>
          <dl>
            {GROUPS.map((g) => (
              <div key={g.key}><dt>{g.label}</dt><dd>{g.hint}</dd></div>
            ))}
          </dl>
        </details>
      </aside>

      <section className={styles.results} aria-labelledby="check-results-title">
        <div className={styles.resultsHeading}>
          <h2 id="check-results-title">Findings</h2>
          <p role="status" aria-live="polite">Showing {shown.length} of {total}</p>
        </div>

        {/* Period-level notes still follow the anomalies filter. */}
        {on.anomaly && notes.length > 0 && (
          <section className={styles.periodNotes} aria-labelledby="period-notes-title">
            <h3 id="period-notes-title">Not about one day</h3>
            <p>These are about the period, or about a person across it, so they have no row in the list below.</p>
            <ul>
              {notes.map((n) => (
                <li key={n.head}>
                  <span className={styles.noteValue}>{n.n}<small>{n.unit}</small></span>
                  <div><h4>{n.head}</h4><p>{n.why}</p></div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {shown.length === 0 ? (
          <div className={styles.empty}>
            <ListFilter size={22} aria-hidden="true" />
            <h3>No findings to show</h3>
            <p>Select a group with findings to show it here.</p>
          </div>
        ) : (
          <div className={styles.findings}>{withHeadings}</div>
        )}
      </section>
    </div>
  );
}
