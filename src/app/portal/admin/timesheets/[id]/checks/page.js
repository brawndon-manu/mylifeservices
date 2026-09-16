import Link from "next/link";
import { ArrowUpRight, CalendarDays, ChevronDown, ChevronRight, FileText, Info, Users } from "lucide-react";
import { batchPeriodLabels } from "@/lib/timesheet/batch-overview";
import styles from "./DataChecks.module.css";
import BatchViews from "../../_components/BatchViews";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { anomalyLabel, ANOMALY_KINDS } from "@/lib/timesheet/anomalies";
import { violationsFor, VIOLATION_KINDS } from "@/lib/timesheet/violations";
import { buildFindings, kindOf } from "@/lib/timesheet/findings";
import { markKeyOf, marksByKey, batchReach } from "@/lib/timesheet/mark-key";
import { notesByKey, noteKeyOf, canHoldNote } from "@/lib/timesheet/check-notes";
import BackLink from "@/components/BackLink";
import CorrectDay from "./CorrectDay";
import DayPeek from "./DayPeek";
import FlagButton from "./FlagButton";
import CheckNote from "./CheckNote";
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

  // WHAT SOMEBODY WORKED OUT ABOUT A FINDING, one note per row - see
  // check-notes.js. BY THE PERIOD, for the same reason the marks are: this
  // period is uploaded again several times a day while corrections go back into
  // QuickSolve, and a note keyed on the upload dies with it.
  const checkNotes = notesByKey(await prisma.timesheetCheckNote.findMany({
    where: { program: batch.program, periodFrom: batch.periodFrom, periodTo: batch.periodTo },
    select: { personKey: true, findingKey: true, body: true, lastEditedByName: true, updatedAt: true },
  }));

  // formatted here, in Pacific, for the same reason every other timestamp on
  // these screens is: two people share this list, so "3:40pm" has to be one
  // time rather than whatever the reading browser thinks it is.
  const noteFor = (e) => {
    if (!canHoldNote(e)) return null;
    const n = checkNotes.get(noteKeyOf(e));
    if (!n) return null;
    return {
      body: n.body,
      by: n.lastEditedByName,
      when: n.updatedAt.toLocaleString("en-US", {
        timeZone: "America/Los_Angeles", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit",
      }),
    };
  };

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

  const period = batchPeriodLabels(batch.periodFrom, batch.periodTo);

  return (
    <section className={styles.page}>
      <BackLink href={`/portal/admin/timesheets/${batch.id}`}>Back to pay period</BackLink>
      <header className={styles.header}>
        <div>
          <p className={styles.period}>{period.eyebrow} · {batch.program === "DP" ? "Day program" : "ILS"}</p>
          <h1>Data checks</h1>
          <p className={styles.subtitle}>{period.title}</p>
        </div>
        <Link href={`/portal/admin/timesheets/${batch.id}/people`} className={styles.button}>
          <Users size={16} aria-hidden="true" /> View all employees
        </Link>
      </header>
      <BatchViews batchId={batch.id} count={batch.timesheets.length} active="checks" />
      <div className={styles.overview}>
        <div className={styles.reviewSummary}>
          <span className={styles.reviewCount}>{needsPerson}</span>
          <div><p>Need a person to review</p><span>The remaining findings are here to audit.</span></div>
        </div>
        <details className={styles.about}>
          <summary><Info size={16} aria-hidden="true" /> About these checks <ChevronDown size={14} aria-hidden="true" /></summary>
          <p>
            Nothing here has changed anybody&apos;s hours. The engine reproduces what
            QSP exported to the hundredth of an hour, so nothing below is an
            arithmetic fault: either the source data disagrees with itself, or it
            agrees and records a break somebody did not get.
            {entries.length === 0 && " Nothing was flagged in this batch."}
          </p>
        </details>
      </div>

      {/* WHAT THE REST BREAK AUDIT FLAGGED - day program batches only. The
          audit xlsx is hand-maintained and it shows; these are its rows read
          back with everything the reader could not make sense of. Fixes
          happen in the spreadsheet, then the period is uploaded again. */}
      {(batch.dpAudit?.faults?.length || 0) > 0 && (
        <details className={styles.contextPanel}>
          <summary className={styles.contextSummary}>
            <CalendarDays size={18} aria-hidden="true" />
            What the rest break audit flagged
            <span className={styles.count}>
              {batch.dpAudit.faults.length}
            </span>
            <ChevronDown size={16} className={styles.chevron} aria-hidden="true" />
          </summary>
          <p className={styles.contextCopy}>
            Rows the audit spreadsheet marked or the reader could not make sense
            of. They print on the sheets exactly as the file shows them; the fix
            is in the spreadsheet itself, then upload the period again.
          </p>
          <ul className="mt-4 space-y-1.5">
            {batch.dpAudit.faults.map((f, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-border/60 pt-1.5 text-sm first:border-0 first:pt-0">
                <span className="min-w-0 font-medium text-foreground sm:min-w-52">{f.person}</span>
                <span className="font-mono text-xs text-muted">{f.date}</span>
                <span className="text-muted">{f.detail}</span>
                {f.text && <span className="font-mono text-xs text-faint">[{f.text}]</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {!anySchedule && (
        <div className={styles.warning}>
          No schedule export was uploaded with this batch, so the hours could only
          be checked against themselves. A punch typed into the wrong box is
          invisible that way - especially when two of them cancel out and leave a
          total that looks perfectly normal. Upload the period again with the
          Employee Schedules PDF to get the second check.
        </div>
      )}

      {entries.length === 0 ? (
        <p className={styles.empty}>
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
            // Keep violations grouped by person, with their affected days
            // available inline through the same lazy preview as other groups.
            e.kind === "violation" ? (
              <div
                key={e.rowKey}
                className={styles.personRow}
              >
                <div className={styles.rowHeading}>
                  <p className="text-sm font-semibold text-foreground">{e.who}</p>
                  <p className={styles.findingValue} data-group={e.d.group}>{e.d.head}</p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {e.v.kinds.map((k) => (
                    <span
                      key={k}
                      className={styles.kindTag}
                    >
                      {VIOLATION_KINDS[k].label}
                    </span>
                  ))}
                  <Link href={`/portal/admin/timesheets/${batch.id}/person/${e.timesheetId}`} className={styles.personLink}>
                    View their day by day <ChevronRight size={14} aria-hidden="true" />
                  </Link>
                </div>
                <DayPeek days={e.v.flagged.map(({ day, list }) => ({
                  ...(dayViews.get(`${e.timesheetId}|${day.date}`) || { day: { date: day.date } }),
                  summary: list.map((v) => VIOLATION_KINDS[v.kind].label).join(" · "),
                  bookedMeal: list.some((v) => ["meal-in-shift", "meal-movable", "meal-short"].includes(v.kind)),
                }))} />
                {canHoldNote(e) && (
                  <CheckNote
                    batchId={batch.id}
                    personKey={e.personKey}
                    findingKey={e.findingKey}
                    note={noteFor(e)}
                  />
                )}
              </div>
            ) : (
            <div
              key={e.rowKey}
              className={styles.findingRow}
              data-group={e.d.group}
            >
              <div className={styles.rowHeading}>
                <p className="text-sm">
                  <span className="font-semibold text-foreground">{e.who}</span>
                  <span className={styles.date}>{e.date}</span>
                </p>
                <p className={styles.findingValue} data-group={e.d.group}>{e.d.head}</p>
              </div>

              <p className={styles.findingLead}>{e.d.lead}</p>

              {/* the day this row is about, drawn the way the employee's own
                  sheet draws it. Every row here names a person and a date and
                  the picture is what the sentence is describing. */}
              <DayPeek {...(dayViews.get(`${e.timesheetId}|${e.date}`) || { day: { date: e.date } })} />

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
                  violation row likewise uses a separate link for its preview.
                  A rest report row that matched NO timesheet has no person to
                  open - the report can name somebody the export never did - so
                  the link is conditional rather than pointing at /person/null. */}
              <div className={styles.rowActions}>
                {e.timesheetId ? (
                  <Link
                    href={`/portal/admin/timesheets/${batch.id}/person/${e.timesheetId}`}
                    className={styles.textLink}
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
                <span className={styles.markActions}>
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

              <details className={styles.documents}>
                <summary>
                  <FileText size={15} aria-hidden="true" />
                  What the documents say
                  <ChevronDown size={14} className={styles.chevron} aria-hidden="true" />
                </summary>
                <div className={styles.documentBody}>
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

              <div className={styles.rowFooter}>
                {/* a rest-report name that matched no timesheet has no sheet to
                    open. say which name did not match rather than linking to
                    /sheet/null/download. */}
                {e.timesheetId ? (
                  <a
                    href={`/portal/admin/timesheets/sheet/${e.timesheetId}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.textLink}
                  >
                    Open their sheet <ArrowUpRight size={14} aria-hidden="true" />
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

              {/* LAST IN THE ROW. The finding and its evidence are the record;
                  the mark and the note are what we have done about it. A row
                  that matched nobody has no person to key a note on and gets
                  none - see check-notes.js. */}
              {canHoldNote(e) && (
                <CheckNote
                  batchId={batch.id}
                  personKey={e.personKey}
                  findingKey={e.findingKey}
                  note={noteFor(e)}
                />
              )}
            </div>
            ),
          )}
        </ChecksFilter>
      )}

      <div className={styles.footer}>
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
