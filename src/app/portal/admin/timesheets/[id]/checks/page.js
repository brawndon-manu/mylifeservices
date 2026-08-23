import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { anomalyLabel, ANOMALY_KINDS } from "@/lib/timesheet/anomalies";
import { violationsFor, VIOLATION_KINDS } from "@/lib/timesheet/violations";
import { buildFindings, kindOf } from "@/lib/timesheet/findings";
import { complianceFor, complianceCounts, COMPLIANCE_KINDS, CAP_MINUTES } from "@/lib/timesheet/compliance";
import { preferredName } from "@/lib/contacts";
import { markKeyOf, marksByKey, batchReach } from "@/lib/timesheet/mark-key";
import BackLink from "@/components/BackLink";
import CorrectDay from "./CorrectDay";
import DayPeek from "./DayPeek";
import FlagButton from "./FlagButton";
import CheckStatusChip from "@/components/CheckStatusChip";
import Evidence from "./Evidence";
import ChecksFilter from "./ChecksFilter";
import RecomputeButton from "../corrections/RecomputeButton";

export const metadata = { title: "Data checks", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const f2 = (n) => (n == null ? "-" : (Math.round(n * 100) / 100).toFixed(2));

// Two client bookings that overlap in time are not a punch error. QSP writes
// them as one run of punches, so the second booking's start lands before the
// first one's end. The engine calls any space between two work segments a break,
// so it computes that one as minus thirty minutes - which is arithmetic, not a
// break anybody took.
//
// On 07/16-07/31 EVERY punch issue in the batch was this - 17 of 17 - and every
// one of them offered a "repair" that cut hours, 23.59 in total. Delgado Pineda
// 07/19 proposed 7.28 down to 1.38 on a day the schedule confirms at 7.28.
// None was applied, because a repair has to be confirmed by the schedule first,
// but they were being shown as though they had been.
// The row builder, the three describe* functions and billedOver used to live
// here. They moved to `findings.js` unchanged, so the person page can show the
// same findings this screen does instead of violations only.

// TASKS.md #69 was asking for.
function batchNotes(sheets) {
  const out = [];

  // 1. people the Rest Periods Report never mentions. Under the rule that a
  // break only counts if something recorded it, every qualifying day of theirs
  // owes a premium. It is the single biggest assumption in the period's total
  // and it is the one David will ask about, so it does not get to stay implicit.
  //
  // COUNTED BY `violationsFor`, NOT BY A LOOP OF ITS OWN. This used to test
  // `d.restViolation && d.restSource === "none"` inline, which became the SECOND
  // place that predicate was written the moment violations.js started testing it
  // too. Both said 30 and would have gone on agreeing right up until somebody
  // changed the rest rule in one of them - the exact shape of every bug found on
  // 2026-08-11. The panel's wording is unchanged; only who does the counting is.
  //
  // `noReport` is per DAY, one per day at most, which is what this note has
  // always meant by its number.
  let noSourceDays = 0;
  const noSourcePeople = new Set();
  for (const t of sheets) {
    const { noReport } = violationsFor(t.data);
    if (!noReport) continue;
    noSourceDays += noReport;
    noSourcePeople.add(t.sourceName);
  }
  if (noSourceDays) {
    out.push({
      n: String(noSourceDays),
      unit: noSourceDays === 1 ? "hour" : "hours",
      head: `${noSourcePeople.size} ${noSourcePeople.size === 1 ? "person is" : "people are"} not in the Rest Periods Report at all`,
      why: "Nothing recorded a break for them, so every qualifying day is charged a rest premium. One flag would move all of it either way, so it is a decision rather than a defect.",
    });
  }

  // 2. our regular/overtime split against QSP's own printed overtime. The TOTAL
  // agrees in every case - this is only about which side of the line the hours
  // fall, which is what #67 has been stuck on.
  const otOff = [];
  for (const t of sheets) {
    const printedOt = (t.data?.days || []).reduce((n, d) => n + (d.printed?.overtime || 0), 0);
    if (Math.abs(printedOt - (t.otHours ?? 0)) > 0.03) {
      otOff.push({ name: t.sourceName, ours: t.otHours ?? 0, qsp: printedOt });
    }
  }
  if (otOff.length) {
    const gap = otOff.reduce((n, x) => n + Math.abs(x.qsp - x.ours), 0);
    out.push({
      n: gap.toFixed(2),
      unit: "hours",
      head: `${otOff.length} ${otOff.length === 1 ? "person's" : "people's"} overtime split disagrees with what QSP printed`,
      why:
        otOff
          .map((x) => `${x.name.split(",")[0]} ${f2(x.ours)} against ${f2(x.qsp)}`)
          .join(", ") + ". The total hours agree in every case; only the split between regular and overtime differs.",
    });
  }

  // 3. a person QSP spells differently across its own exports. Applied, and said
  // out loud - a 50% link must never read as a fact.
  const aliases = [];
  for (const t of sheets) {
    for (const [report, v] of Object.entries(t.data?.premiumSupport?.readAs || {})) {
      if (v && !v.exact) aliases.push(`${t.sourceName} reads "${v.name}" on the ${report}`);
    }
  }
  if (aliases.length) {
    out.push({
      n: String(aliases.length),
      unit: aliases.length === 1 ? "name" : "names",
      head: "A name is spelled differently across the exports",
      why: `${aliases.join("; ")}. Matched on the portal account rather than by comparing the exports to each other, applied, and shown rather than silently substituted.`,
    });
  }

  return out;
}


export default async function ChecksPage({ params }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");

  const { id } = await params;
  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    include: {
      timesheets: {
        orderBy: { sourceName: "asc" },
        include: {
          user: { select: { name: true, preferredFirstName: true, preferredLastName: true } },
        },
      },
    },
  });
  if (!batch) notFound();

  // THE RED MARKS SOMEBODY HAS ALREADY PUT ON THIS BATCH, by row. A working
  // marker between reviewers - it moves no figure and never reaches an employee.
  const flags = (
    // BY THE PERIOD, NOT THE BATCH. Two uploads of one fortnight are one
    // period, so a mark made on Wednesday's export is still the answer on
    // Thursday's. Scoped to the batch, 70 marks went invisible the morning the
    // 08/12 export landed.
    marksByKey(await prisma.timesheetCheckFlag.findMany({
      where: { program: batch.program, periodFrom: batch.periodFrom, periodTo: batch.periodTo },
      // `status` is what the chip reads. Left off the select it comes back
      // undefined, the chip renders as unset, and every mark on the batch
      // silently looks like nobody has started - which is the same trap
      // `restsUrl` sprang three times yesterday. `personKey`/`findingKey` are
      // the same trap one layer down: without them every mark keys to "-|-".
      select: {
        rowKey: true, status: true, via: true, flaggedName: true, flaggedImage: true,
        personKey: true, findingKey: true, coveredThrough: true, updatedAt: true,
      },
    }))
  );

  // HOW FAR THIS SCREEN'S DATA GOES. Stamped on any mark set from here, so
  // "contacted" records what was actually in front of the reviewer rather
  // than implying they saw days that are not in the export yet.
  const reach = batchReach(batch);

  const { entries, dayViews, anySchedule } = buildFindings(batch);

  // What each row is ABOUT, so the list can be grouped by it. The anomaly pile
  // went from 21 to 69 in a day as the rest-timing work landed, and a flat list
  // that long stops being something anybody reads - six kinds of finding
  // interleaved by surname is a wall, not a screen.

  const ORDER = { decide: 0, unworked: 1, violation: 2, anomaly: 3, settled: 4 };
  entries.sort(
    (a, b) =>
      ORDER[a.d.group] - ORDER[b.d.group] ||
      kindOf(a).order - kindOf(b).order ||
      a.who.localeCompare(b.who) ||
      String(a.date).localeCompare(String(b.date)),
  );

  const counts = { decide: 0, unworked: 0, violation: 0, anomaly: 0, settled: 0 };
  for (const e of entries) counts[e.d.group]++;
  // violations need a person more than anything else here does - somebody has to
  // ask whether the break happened - so they belong in this total
  const needsPerson = counts.decide + counts.unworked + counts.violation;

  // every scheduling finding in this period, worst first, with the person on it.
  // Read per sheet through the same `complianceFor` the patterns page and the
  // person cards ask, so the three cannot disagree about what one is.
  const scheduling = (() => {
    const rows = [];
    for (const ts of batch.timesheets) {
      const who = ts.user ? preferredName(ts.user) : ts.sourceName;
      for (const f of complianceFor(ts.data)) rows.push({ ...f, who });
    }
    rows.sort((a, b) => b.minutes - a.minutes || String(a.who).localeCompare(String(b.who)));
    const counts = complianceCounts(rows);

    // GROUPED BY KIND, AND CAPPED, 2026-08-22. The first upload carrying a clock
    // export took this panel from 54 rows to 458, and a flat 458 is the wall
    // this screen already learned about once: "six kinds of finding interleaved
    // by surname is a wall, not a screen". 123 missed clock-ins listed one per
    // shift tell you nothing that "123, and here are the worst" does not.
    //
    // The cap is stated, never silent. A list that quietly stops at twelve reads
    // as a complete list of twelve.
    const SHOWN_PER_KIND = 12;
    const groups = [];
    for (const kind of Object.keys(COMPLIANCE_KINDS)) {
      const mine = rows.filter((r) => r.kind === kind);
      if (!mine.length) continue;
      groups.push({
        kind,
        total: mine.length,
        shown: mine.slice(0, SHOWN_PER_KIND),
        more: Math.max(0, mine.length - SHOWN_PER_KIND),
      });
    }

    return {
      rows,
      groups,
      total: rows.length,
      overCap: counts["booking-over-cap"] || 0,
      overlap: counts["blocks-overlap"] || 0,
    };
  })();

  const notes = batchNotes(batch.timesheets);

  // the recompute prompt belongs to a SHEET, not a day, so it rides on the
  // first row that sheet contributes rather than repeating on every one
  const recomputeShown = new Set();
  for (const e of entries) {
    if (Object.keys(e.overrides).length > 0 && !e.signed && !recomputeShown.has(e.timesheetId)) {
      recomputeShown.add(e.timesheetId);
      e.showRecompute = true;
    }
  }

  return (
    <section className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
      <BackLink href={`/portal/admin/timesheets/${batch.id}`}>Back to the batch</BackLink>

      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Data checks
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {batch.periodFrom} to {batch.periodTo}
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
        {/* This used to end "so everything below is a problem in the source data
            rather than in the arithmetic", which stopped being true the moment
            violations landed: on a missing lunch the source data is correct and
            the rule is what was broken. The sentence described the whole page,
            so adding a group to the page meant rewriting it. */}
        Nothing here has changed anybody&apos;s hours. The engine reproduces what
        QSP exported to the hundredth of an hour, so nothing below is an
        arithmetic fault: either the source data disagrees with itself, or it
        agrees and records a break somebody did not get.{" "}
        {entries.length === 0 ? (
          "Nothing was flagged in this batch."
        ) : (
          <>
            <span className="font-semibold text-foreground">
              {needsPerson} of these need a person.
            </span>{" "}
            The rest are here so you can audit them.
          </>
        )}
      </p>

      {/* EVERYBODY, not just the people with a finding. This list is the ones
          something is wrong with, so on the August batch 14 of 60 appear on no
          screen at all and there was no way to reach one of them from here. */}
      <Link
        href={`/portal/admin/timesheets/${batch.id}/people`}
        className="card-lift mt-5 inline-block rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-brand shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        View all employees
      </Link>

      {/* WHAT THE REST BREAK AUDIT FLAGGED - day program batches only. The
          audit xlsx is hand-maintained and it shows; these are its rows read
          back with everything the reader could not make sense of. Fixes
          happen in the spreadsheet, then the period is uploaded again. */}
      {(batch.dpAudit?.faults?.length || 0) > 0 && (
        <details className="mt-6 rounded-xl border border-border bg-surface p-5">
          <summary className="cursor-pointer list-none text-base font-semibold tracking-tight text-foreground">
            <span className="mr-1.5 inline-block text-[10px] text-faint">&#9656;</span>
            What the rest break audit flagged
            <span className="ml-2 rounded-full border border-border-strong bg-surface-2 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-muted">
              {batch.dpAudit.faults.length}
            </span>
          </summary>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Rows the audit spreadsheet marked or the reader could not make sense
            of. They print on the sheets exactly as the file shows them; the fix
            is in the spreadsheet itself, then upload the period again.
          </p>
          <ul className="mt-4 space-y-1.5">
            {batch.dpAudit.faults.map((f, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-border/60 pt-1.5 text-sm first:border-0 first:pt-0">
                <span className="min-w-[13rem] font-medium text-foreground">{f.person}</span>
                <span className="font-mono text-xs text-muted">{f.date}</span>
                <span className="text-muted">{f.detail}</span>
                {f.text && <span className="font-mono text-xs text-faint">[{f.text}]</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* HOW THE SCHEDULE WAS BUILT, for this period.
          Deliberately NOT folded into the findings list above. Every row there
          is a day somebody has to decide about - confirm the break, correct the
          punch, mark them contacted - and carries the control to do it. These
          have no such answer: the booking was already rostered and worked, so
          nobody can resolve one from this screen, and dropping unanswerable
          rows into a list of questions is how the anomaly pile stopped being
          readable. The fix is in QuickSolve before the next period is built,
          and the trend lives on Repeat patterns. */}
      {scheduling.total > 0 && (
        <details className="mt-6 rounded-xl border border-sky-300 bg-sky-50/60 p-5 dark:border-sky-800/70 dark:bg-sky-950/30">
          <summary className="cursor-pointer list-none text-base font-semibold tracking-tight text-foreground">
            <span className="mr-1.5 inline-block text-[10px] text-faint">&#9656;</span>
            Scheduling to stop
            <span className="ml-2 rounded-full border border-sky-300 bg-sky-100 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-sky-900 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-200">
              {scheduling.total}
            </span>
          </summary>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Nobody is owed anything for these and none of them reaches a sheet
            anyone signs. They are rules broken by how the schedule was{" "}
            <em>built</em>, before the shift was worked, so the fix is in
            QuickSolve rather than here.{" "}
            {scheduling.overCap > 0 && (
              <>
                <strong>{scheduling.overCap}</strong>{" "}
                {scheduling.overCap === 1 ? "booking runs" : "bookings run"} past{" "}
                {CAP_MINUTES / 60} hours.{" "}
              </>
            )}
            {scheduling.overlap > 0 && (
              <>
                <strong>{scheduling.overlap}</strong>{" "}
                {scheduling.overlap === 1 ? "day has" : "days have"} blocks over
                each other, and every overlapping minute bills twice.
              </>
            )}
          </p>
          {scheduling.groups.map((g) => (
            <div key={g.kind} className="mt-5">
              <p className="text-sm font-semibold text-foreground">
                {COMPLIANCE_KINDS[g.kind].label}
                <span className="ml-2 rounded-full border border-sky-300 bg-sky-100 px-2 py-0.5 font-mono text-[11px] text-sky-900 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-200">
                  {g.total}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-muted">{COMPLIANCE_KINDS[g.kind].action}</p>
              <ul className="mt-2 space-y-1.5">
                {g.shown.map((f, i) => (
                  <li
                    key={`${f.who}-${f.date}-${f.kind}-${i}`}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-border/60 pt-1.5 text-sm first:border-0 first:pt-0"
                  >
                    <span className="min-w-[13rem] font-medium text-foreground">{f.who}</span>
                    <span className="font-mono text-xs text-muted">{f.date}</span>
                    <span className="text-muted">{COMPLIANCE_KINDS[f.kind].describe(f)}</span>
                  </li>
                ))}
              </ul>
              {/* said out loud rather than silently truncated */}
              {g.more > 0 && (
                <p className="mt-1.5 text-xs text-muted">
                  and {g.more} more - the whole picture, per person and across
                  periods, is on{" "}
                  <Link
                    href={`/portal/admin/timesheets/patterns?program=${batch.program}`}
                    className="font-medium text-brand hover:underline"
                  >
                    Repeat patterns
                  </Link>
                  .
                </p>
              )}
            </div>
          ))}
        </details>
      )}

      {!anySchedule && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          No schedule export was uploaded with this batch, so the hours could only
          be checked against themselves. A punch typed into the wrong box is
          invisible that way - especially when two of them cancel out and leave a
          total that looks perfectly normal. Upload the period again with the
          Employee Schedules PDF to get the second check.
        </div>
      )}

      {entries.length === 0 ? (
        <p className="mt-10 rounded-xl border border-emerald-300/60 bg-emerald-50 p-6 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
          Nothing looks wrong in this batch. Every punch pair runs forwards, no
          stretch on the clock is impossibly long, and
          {anySchedule
            ? " every day agrees with the schedule."
            : " no schedule was provided to compare against."}
        </p>
      ) : (
        <ChecksFilter
          counts={counts}
          groups={entries.map((e) => e.d.group)}
          kinds={entries.map((e) => kindOf(e).label)}
          notes={notes}
        >
          {entries.map((e) =>
            // A PERSON ROW, NOT A DAY ROW. It carries no lead, no day picture
            // and no evidence panel, because all three are on their own page -
            // repeating them here is what made the per-day version 118 cards
            // long. What it needs is the name, what kinds they have, and a way
            // in. The flag stays, keyed on the person, so "I have called them"
            // is recordable without a schema change.
            e.kind === "violation" ? (
              <Link
                key={e.rowKey}
                href={`/portal/admin/timesheets/${batch.id}/person/${e.timesheetId}`}
                className="block rounded-lg border border-border bg-surface p-4 border-l-4 border-l-fuchsia-500 transition hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-brand-light)]"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-sm font-semibold text-foreground">{e.who}</p>
                  <p className={`text-sm font-semibold ${e.d.tone}`}>{e.d.head}</p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {e.v.kinds.map((k) => (
                    <span
                      key={k}
                      className="rounded-full border border-fuchsia-300 bg-fuchsia-50 px-2 py-0.5 text-[11px] font-medium text-fuchsia-700 dark:border-fuchsia-900/60 dark:bg-fuchsia-950/40 dark:text-fuchsia-300"
                    >
                      {VIOLATION_KINDS[k].label}
                    </span>
                  ))}
                  <span className="ml-auto text-xs font-semibold text-brand">
                    View their day by day →
                  </span>
                </div>
              </Link>
            ) : (
            <div
              key={e.rowKey}
              className={`rounded-lg border border-border bg-surface p-4 border-l-4 ${
                e.d.group === "decide"
                  ? "border-l-rose-500"
                  : e.d.group === "unworked"
                    ? "border-l-amber-500"
                    : "border-l-emerald-600/70"
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-sm">
                  <span className="font-semibold text-foreground">{e.who}</span>
                  <span className="ml-2 text-xs text-faint">{e.date}</span>
                </p>
                <p className={`text-sm font-semibold ${e.d.tone}`}>{e.d.head}</p>
              </div>

              <p className="mt-1.5 text-sm leading-relaxed text-muted">{e.d.lead}</p>

              {/* the day this row is about, drawn the way the employee's own
                  sheet draws it. Every row here names a person and a date and
                  the picture is what the sentence is describing. */}
              <DayPeek {...(dayViews.get(`${e.timesheetId}|${e.date}`) || {})} />

              {/* A WAY THROUGH TO THE PERSON, on every row and not only the
                  violation ones.
                  Mánu's list had "View their schedule on every card, not just
                  violation rows" and this was the last thing on it. Until now an
                  anomaly, a punch or a rest row was a dead end: you could read
                  the finding and had no way to reach the person it is about,
                  which is backwards on a screen whose whole job is to start a
                  conversation with them.
                  NOT A WRAPPING LINK. This card holds a flag button and two
                  expandable panels, and nesting those inside an anchor makes
                  them unreachable by keyboard and unpredictable by mouse. The
                  violation row can wrap because it holds nothing but text.
                  A rest report row that matched NO timesheet has no person to
                  open - the report can name somebody the export never did - so
                  the link is conditional rather than pointing at /person/null. */}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                {e.timesheetId ? (
                  <Link
                    href={`/portal/admin/timesheets/${batch.id}/person/${e.timesheetId}`}
                    className="text-xs font-semibold text-brand underline underline-offset-4"
                  >
                    View their day by day →
                  </Link>
                ) : (
                  <span className="text-xs text-faint">
                    This row came from the Rest Periods Report and matched nobody on the timesheet.
                  </span>
                )}
                {/* the state as a label, then the way to change it. They used
                    to be one control and split on 2026-08-13, so that marking
                    somebody a second time has somewhere to happen. */}
                <span className="flex items-center gap-2">
                  <CheckStatusChip flag={flags.get(markKeyOf(e)) || null} reach={reach} />
                  <FlagButton
                    batchId={batch.id}
                    rowKey={e.rowKey}
                    personKey={e.personKey}
                    findingKey={e.findingKey}
                    coveredThrough={reach}
                    flag={flags.get(markKeyOf(e)) || null}
                  />
                </span>
              </div>

              <details className="group mt-2">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-brand">
                  <span aria-hidden="true" className="transition-transform group-open:rotate-90">
                    ▶
                  </span>
                  What the documents say
                </summary>
                <div className="mt-2 rounded-md border border-border bg-surface-2 p-3">
                  {/* the raw punches and what the schedule booked, for both
                      kinds - an overlap row still has to show its evidence, and
                      it is the same evidence */}
                  {(e.kind === "punch" || e.kind === "overlap") && (
                    <>
                      {e.p.anomalies.map((a, j) => (
                        <p key={j} className="mb-1 text-xs leading-relaxed text-muted">
                          <span className="font-semibold text-foreground">
                            {anomalyLabel(a.kind)}:
                          </span>{" "}
                          {a.shown} - {a.note}
                          <span className="block italic">{ANOMALY_KINDS[a.kind]?.why}</span>
                        </p>
                      ))}
                      <p className="mt-2 font-mono text-xs text-muted">
                        QSP has: {e.p.shownPunches.join("  ")}
                      </p>
                      {/* No "Likely" on a day the schedule explains as two
                          overlapping bookings. The suggester only knows three
                          shapes, and on this day it fires the reversed-break
                          rule - which assumes the four times are ONE shift with
                          a break in the middle. They are not: they are two jobs
                          that overlap. Delgado Pineda 07/19 came out as 7.28 ->
                          1.38, deleting 5.90 paid hours on a day the schedule
                          independently confirms at 7.28. It was never applied,
                          because a repair has to be schedule-confirmed first -
                          but printing it in the affirmative colour directly
                          under a headline that says "It is not" tells the
                          reader to believe something the row has just denied. */}
                      {e.p.suggestion && !e.overlapping && (
                        <p className="font-mono text-xs text-emerald-700 dark:text-emerald-400">
                          Likely: {e.p.suggestion.punches.join("  ")}
                        </p>
                      )}
                    </>
                  )}
                  {/* a rest row comes from a spreadsheet, not from punches, so
                      the punch/schedule panel has nothing to say about it and
                      would render "no punches were read for this day" - true,
                      and about the wrong document entirely. */}
                  {e.kind === "rest" ? (
                    <>
                      <p className="font-mono text-xs text-foreground">
                        QSP has: out {e.r.out || "(blank)"} · in {e.r.in || "(blank)"} · total{" "}
                        {e.r.printedHours}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {/* the printed column is rounded to two decimals, so the
                            jump from it to minutes is shown rather than asserted */}
                        {e.r.derivation}
                        {e.r.reversed && " · out is after in, so the row runs backwards"}
                      </p>
                      {e.r.repair && (
                        <p className="mt-1 font-mono text-xs text-emerald-700 dark:text-emerald-400">
                          Likely: {e.r.repair.field === "both" ? "both times" : e.r.repair.field === "out" ? "out" : "in"} {e.r.repair.from} →{" "}
                          {e.r.repair.to} = {e.r.repair.minutes} min
                        </p>
                      )}
                      <p className="mt-2 text-xs italic text-muted">{e.r.note}</p>
                      <a
                        href={`/portal/admin/timesheets/${batch.id}/source?doc=rests`}
                        className="mt-2 inline-block text-xs font-medium text-brand hover:text-brand-dark"
                      >
                        Download the Rest Periods Report →
                      </a>
                    </>
                  ) : (
                    <Evidence
                      batchId={batch.id}
                      timesheetId={e.timesheetId}
                      date={e.date}
                      day={e.dayByDate[e.date] || null}
                      shifts={e.byDate[e.date]?.shifts}
                      schedulePages={e.byDate[e.date]?.pages}
                      hasSource={!!batch.sourceUrl}
                      hasSchedule={!!batch.scheduleUrl}
                    />
                  )}
                </div>
              </details>

              {/* correcting is offered per day against the figure that day
                  actually holds, never as a blanket "trust the schedule" - that
                  is what would have turned a page-break bug into an offer to
                  overwrite a correct 8.00 */}
              {e.kind === "flag" &&
                !e.signed &&
                e.f.timesheet != null &&
                e.dayHours[e.date] != null && (
                  <CorrectDay
                    timesheetId={e.timesheetId}
                    date={e.date}
                    timesheet={e.f.timesheet}
                    schedule={e.f.schedule}
                    existing={e.overrides[e.date] || null}
                  />
                )}

              <div className="mt-2 flex flex-wrap items-center gap-4">
                {/* a rest-report name that matched no timesheet has no sheet to
                    open. say which name did not match rather than linking to
                    /sheet/null/download. */}
                {e.timesheetId ? (
                  <a
                    href={`/portal/admin/timesheets/sheet/${e.timesheetId}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-brand hover:text-brand-dark"
                  >
                    Open their sheet →
                  </a>
                ) : (
                  <span className="text-xs text-amber-700 dark:text-amber-400">
                    No timesheet in this batch matches &ldquo;{e.r?.name}&rdquo;
                  </span>
                )}
                {e.showRecompute && (
                  <RecomputeButton
                    timesheetId={e.timesheetId}
                    accepted={Object.keys(e.overrides).length}
                  />
                )}
              </div>
            </div>
            ),
          )}
        </ChecksFilter>
      )}

      <div className="mt-8 rounded-lg border border-border bg-surface-2 p-4 text-sm text-muted">
        <p className="font-semibold text-foreground">Fixing these</p>
        <p className="mt-1">
          Correct the entries in QSP, then upload the period again. Nothing on
          this page edits QSP, and nothing here is applied to the figures on its
          own - a suggestion is only ever shown next to what QSP actually holds.
        </p>
        <p className="mt-2">
          <Link
            href={`/portal/admin/timesheets/${batch.id}/corrections`}
            className="font-semibold text-brand underline underline-offset-4"
          >
            Problems reported by staff
          </Link>{" "}
          are tracked separately.
        </p>
      </div>
    </section>
  );
}
