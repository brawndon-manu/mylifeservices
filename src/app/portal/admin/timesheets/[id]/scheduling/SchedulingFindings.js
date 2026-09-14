"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ListFilter, Search } from "lucide-react";
import DayPeek from "../checks/DayPeek";
import styles from "../checks/DataChecks.module.css";
import local from "./Scheduling.module.css";

const PAGE_SIZE = 50;

export default function SchedulingFindings({ batchId, rows, groups, days, hasSchedule, hasClock }) {
  const [selected, setSelected] = useState(() => Object.fromEntries(groups.map((g) => [g.key, true])));
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const term = query.trim().toLocaleLowerCase();
  const filtered = rows.filter((row) => selected[row.kind]
    && (!term || `${row.who} ${row.date} ${row.description}`.toLocaleLowerCase().includes(term)));
  const shown = filtered.slice(0, limit);
  const byKind = Object.fromEntries(groups.map((g) => [g.key, g]));
  const filteredCounts = {};
  for (const row of filtered) filteredCounts[row.kind] = (filteredCounts[row.kind] || 0) + 1;

  function selectAll(value) {
    setSelected(Object.fromEntries(groups.map((g) => [g.key, value])));
    setLimit(PAGE_SIZE);
  }

  return (
    <div className={styles.workspace}>
      <aside className={styles.filters} aria-labelledby="scheduling-groups-title">
        <h2 id="scheduling-groups-title" className={styles.filterHeading}><ListFilter size={16} aria-hidden="true" /> Show groups</h2>
        <p className={styles.filterIntro}>Select the issues you want to review.</p>
        <div className={local.selectionActions}>
          <button type="button" onClick={() => selectAll(true)}>Select all</button>
          <button type="button" onClick={() => selectAll(false)}>Clear all</button>
        </div>
        <div className={styles.filterOptions}>
          {groups.map((group) => (
            <button key={group.key} type="button" className={styles.filterOption} aria-pressed={selected[group.key]} title={group.hint}
              onClick={() => { setSelected((s) => ({ ...s, [group.key]: !s[group.key] })); setLimit(PAGE_SIZE); }}>
              <span className={styles.selection} aria-hidden="true">{selected[group.key] && <Check size={12} strokeWidth={2.5} />}</span>
              <span>{group.label}</span>
              <span className={styles.filterCount}>{group.count}</span>
            </button>
          ))}
        </div>
        <details className={styles.filterHelp}>
          <summary>About these groups <ChevronDown size={14} aria-hidden="true" /></summary>
          <dl>{groups.map((g) => <div key={g.key}><dt>{g.label}</dt><dd>{g.hint}</dd></div>)}</dl>
        </details>
      </aside>
      <section className={styles.results} aria-labelledby="scheduling-results-title">
        <div className={styles.resultsHeading}>
          <h2 id="scheduling-results-title">Findings</h2>
          <p role="status">Showing {shown.length} of {filtered.length}{filtered.length !== rows.length && ` · ${rows.length} total`}</p>
        </div>
        <label className={local.search}>
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search scheduling findings</span>
          <input type="search" value={query} placeholder="Search employee, date or finding"
            onChange={(event) => { setQuery(event.target.value); setLimit(PAGE_SIZE); }} />
        </label>
        {shown.length === 0 ? (
          <div className={styles.empty}>
            <ListFilter size={22} aria-hidden="true" />
            <h3>{rows.length ? "No matching findings" : "No scheduling issues found"}</h3>
            <p>{rows.length ? "Select a group with findings or change your search." : "No issues were found in the schedule and clock data available for this period."}</p>
          </div>
        ) : (
          <div className={styles.findings}>
            {shown.map((row, index) => {
              const day = days[row.dayKey];
              const group = byKind[row.kind];
              const sourcePage = day.schedulePages[0];
              return (
                <Fragment key={row.id}>
                  {(index === 0 || shown[index - 1].kind !== row.kind) && (
                    <h3 className={styles.kindHeading}>{group.label}<span>{filteredCounts[row.kind]}</span></h3>
                  )}
                  <div className={styles.findingRow}>
                    <div className={styles.rowHeading}>
                      <p><span className="font-semibold">{row.who}</span><span className={styles.date}>{row.date}</span></p>
                    </div>
                    <p className={styles.findingLead}>{row.description}</p>
                    <p className={local.action}>{group.hint}</p>
                    {row.text && <p className={local.sourceBlock}>{row.text}</p>}
                    <DayPeek {...day.preview}>
                      <div className={local.clockInfo}>
                        <h4>Clock findings for this day</h4>
                        {!hasClock ? <p>No clock report is available for this period.</p>
                          : !day.clockMatched ? <p>No clock-report rows were matched to this employee.</p>
                            : day.clockIssues.length ? <ul>{day.clockIssues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>
                              : <p>No clock findings are stored for this date.</p>}
                        {hasClock && <Link href={`/portal/admin/timesheets/${batchId}/attendance`} className={styles.textLink}>View QSClock time and attendance →</Link>}
                      </div>
                    </DayPeek>
                    <div className={styles.rowFooter}>
                      <Link href={`/portal/admin/timesheets/${batchId}/person/${row.timesheetId}`} className={styles.textLink}>View their day by day →</Link>
                      {hasSchedule && <a href={`/portal/admin/timesheets/${batchId}/source?doc=schedule${sourcePage ? `#page=${sourcePage}` : ""}`} target="_blank" rel="noopener noreferrer" className={styles.textLink}>Open source schedule ↗</a>}
                    </div>
                  </div>
                </Fragment>
              );
            })}
          </div>
        )}
        {shown.length < filtered.length && (
          <div className={local.loadMore}>
            <button type="button" className={styles.button} onClick={() => setLimit((n) => n + PAGE_SIZE)}>Show {Math.min(PAGE_SIZE, filtered.length - shown.length)} more findings</button>
            <p>{filtered.length - shown.length} remaining</p>
          </div>
        )}
      </section>
    </div>
  );
}
