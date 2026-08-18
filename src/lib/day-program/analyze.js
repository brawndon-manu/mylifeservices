// The day program's QSP-first pipeline: the same engine the MLS timesheets run
// on, fed from the day program's three documents.
//
//   Simple Timesheet PDF     hours and punches. The payroll backbone - on 30 of
//                            218 days David's spreadsheet is LOWER than what
//                            QSP's own punches record, so hours come from here
//                            and never from the audit sheet.
//   Rest Periods Report .xls the systematic record of rest breaks, read by the
//                            same rests.js the MLS batches use.
//   David's audit xlsx       the only record of the 2nd breaks the program
//                            types into DSN summaries, plus the corrections.
//                            Confirmed times become rest evidence; everything
//                            else it says lands in faults for a person to read.
//
// EVERY DAY CARRIES onDutyMeal. Day program staff eat on the clock under the
// signed on-duty meal agreement, so the engine's unpaid-meal rules are exempt -
// see the block in parse.js. Rest rules run exactly as they do for MLS.

import { parseTimesheetPdf, analyzeTimesheet, analyzeDay } from "../timesheet/parse.js";
import { reviewSheet } from "../timesheet/anomalies.js";
import { restKey, restRowTimes, clockMin, serviceFit } from "../timesheet/rests.js";
import { dayProgramRestRows } from "./rest-xls.js";
import { restWindowsByDate } from "../timesheet/reanalyze.js";
import { parseSchedulePdf, compareToSchedule, scheduleBlocks } from "../timesheet/schedule.js";
import { storedDay, totalsFromDays } from "../timesheet/stored.js";
import { parseRestReport, clockLabel, resolveRange } from "./rest-report.js";

// A 2ND BREAK NAMED IN THE SHIFT'S OWN SCHEDULE NOTES.
//
// The day program has nowhere in QSP to log a second rest, so staff type it
// into the schedule notes - nine spellings of it across one fortnight:
// "Break #2 12:15-12:25", "Break#2", "BREAK2:", "Break # 2", "second break:",
// "2nd Break", "Break 2", "Break #212:50-1:00" (no space), "2nd break at".
// Mánu was hand-copying these into extra spreadsheet columns on 2026-08-17;
// this reads them off the export directly so nobody ever has to again.
//
// Only a range explicitly LABELLED as the second break is taken. The same
// notes carry Zoom meetings, drop-off addresses and sick notes, and none of
// those may become a break - which is also why "Break2: Unable due to..."
// yields nothing: a stated missed break stays a note.
const NOTE_LABEL = /(?:break\s*#?\s*2|2nd\s+break|second\s+break)\s*(?:at\s*)?[:\-]?\s*/i;
const NOTE_RANGE = /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*[-–—]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i;

function noteBreak(scheduleNotes) {
  const notes = String(scheduleNotes || "");
  const label = NOTE_LABEL.exec(notes);
  if (!label) return null;
  const after = notes.slice(label.index + label[0].length, label.index + label[0].length + 40);
  const range = NOTE_RANGE.exec(after);
  if (!range) return null;
  const r = resolveRange(range[1].trim(), range[2].trim());
  if (!r || r.minutes < 2 || r.minutes > 20) return null;
  return { out: r.from, in: r.to };
}

const r2 = (n) => Math.round((n || 0) * 100) / 100;

// QSP does not spell everyone the same way twice. The timesheet export says
// Patricia and Francisco; the rest report, the audit sheet and the emails
// sheet all say Yesenia and Frank. Keyed on restKey() of the TIMESHEET
// spelling, mapped to the spelling the other documents use.
const ALIASES = new Map([
  [restKey("Ramirez, Patricia"), restKey("Ramirez, Yesenia")],
  [restKey("Velasquez, Francisco"), restKey("Velasquez, Frank")],
]);

// exported for the render route, which has to find a person's rest report
// rows under the report's own spelling of their name.
export const aliasKey = (name) => {
  const k = restKey(name);
  return ALIASES.get(k) || k;
};

// "Rodriguez Ardila, Ivan" and "Ivan Rodriguez Ardila" are one person: compare
// on the sorted token set, same trick match.js uses.
const tokenKey = (name) =>
  String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");

// David's confirmed break cells, turned into the same window shape the rest
// report produces, so the engine treats a DSN-summary confirmation exactly
// like a checkbox row. Only cells that parsed to a plausible rest length are
// eligible - a 60-minute range is a typo, not evidence.
function auditWindows(auditPerson) {
  const byDate = new Map();
  if (!auditPerson) return byDate;
  for (const day of auditPerson.days || []) {
    for (const b of day.breaks || []) {
      if (!Number.isFinite(b.from) || !Number.isFinite(b.to)) continue;
      if (b.flag === "not-documented" || b.flag === "needs-review") continue;
      if (b.minutes < 2 || b.minutes > 20) continue;
      if (!byDate.has(day.date)) byDate.set(day.date, []);
      byDate.get(day.date).push({ out: b.from, in: b.to });
    }
  }
  return byDate;
}

// two windows describe the same break when they overlap at all - the audit
// sheet rounds ("12:50-1:00") what the report timestamps ("12:50 PM-1:00 PM"),
// so equality is the wrong test.
const overlaps = (a, b) => a.out < b.in && b.out < a.in;

export async function analyzeDayProgram({ timesheetBytes, restsBytes, auditBytes, scheduleBytes }) {
  const sheets = (await parseTimesheetPdf(timesheetBytes)).filter((s) => !s.empty);
  const restRows = dayProgramRestRows(restsBytes);
  // the Employee Schedules PDF, when one was uploaded: the second opinion on
  // shift shape, exactly the MLS cross-check. Schedule names print "Devin
  // Bass" while the timesheet prints "Bass, Devin", so the match runs on the
  // sorted token set like the audit match does.
  let schedByToken = new Map();
  if (scheduleBytes) {
    const sched = await parseSchedulePdf(scheduleBytes);
    const schedPeople = Array.isArray(sched) ? sched : sched?.people || [];
    schedByToken = new Map(schedPeople.map((p) => [tokenKey(p.employee || p.name), p]));
  }
  const audit = auditBytes ? parseRestReport(auditBytes) : { people: [], faults: [], from: null, through: null };

  // rest rows per person+date, under the alias-resolved key
  const restsFor = new Map();
  for (const row of restRows) {
    const k = aliasKey(row.name);
    if (!restsFor.has(k)) restsFor.set(k, []);
    restsFor.get(k).push(row);
  }

  const auditByToken = new Map(audit.people.map((p) => [tokenKey(p.name), p]));

  const people = [];
  for (const s of sheets) {
    const key = aliasKey(s.employee);
    const personRows = restsFor.get(key) || [];
    const windows = restWindowsByDate(personRows, { restRowTimes, clockMin, serviceFit });

    // the audit person, matched on token set ("Bass, Devin" vs "Devin Bass")
    const [last, first] = s.employee.split(",").map((x) => x.trim());
    const flipped = `${first || ""} ${last || ""}`;
    const auditPerson =
      auditByToken.get(tokenKey(flipped)) ||
      // the alias spelling, for Patricia and Francisco
      audit.people.find((p) => aliasKey(`${p.name.split(" ").pop()}, ${p.name.split(" ").slice(0, -1).join(" ")}`) === key) ||
      null;
    const confirmed = auditWindows(auditPerson);

    // the report's own per-date count, the same figure the MLS upload feeds as
    // `restRecorded`. counted rows only - a row the report itself refused is
    // not evidence of anything.
    const countedByDate = new Map();
    for (const row of personRows) {
      if (!row?.counted || !row?.date) continue;
      countedByDate.set(row.date, (countedByDate.get(row.date) || 0) + 1);
    }

    // the 2nd breaks this person's own schedule notes name, per date
    const noted = new Map();
    for (const row of personRows) {
      const nb = noteBreak(row.scheduleNotes);
      if (nb && row.date && !noted.has(row.date)) noted.set(row.date, nb);
    }

    // stitch the three sources per day: the report's windows, then any break
    // the shift's own schedule notes name, then any audit-confirmed one the
    // other two missed. `fit` is null on the added windows - nothing in a note
    // or David's sheet says where the shift sat, and the engine treats an
    // absent fit as "nothing to flag", which is the honest reading.
    const schedPerson =
      schedByToken.get(tokenKey(`${first || ""} ${last || ""}`)) ||
      // the alias spelling: the schedule says Yesenia and Frank where the
      // timesheet prints Patricia and Francisco
      schedByToken.get(tokenKey(aliasKey(s.employee))) ||
      null;
    const schedDay = new Map((schedPerson?.days || []).map((x) => [x.date, x]));

    const days = s.days.map((d) => {
      const sd = schedDay.get(d.date) || null;
      const own = windows.get(d.date) || [];
      const fromNote = [noted.get(d.date)]
        .filter(Boolean)
        .filter((w) => !own.some((o) => overlaps(o, w)))
        .map((w) => ({ ...w, fit: null, source: "note" }));
      const soFar = [...own, ...fromNote];
      const extra = (confirmed.get(d.date) || [])
        .filter((w) => !soFar.some((o) => overlaps(o, w)))
        .map((w) => ({ ...w, fit: null, source: "audit" }));
      const auditDay = (auditPerson?.days || []).find((x) => x.date === d.date) || null;
      return {
        ...d,
        onDutyMeal: true,
        // the schedule's second opinion, same fields the MLS upload attaches.
        // mealScheduled stays honest (the DP schedule rosters no meal blocks)
        // and is moot anyway under onDutyMeal.
        mealScheduled: sd ? (sd.entries || []).some((e) => e.meal) : null,
        scheduleBlocks: sd ? scheduleBlocks(sd.entries) : null,
        restTimes: soFar.length + extra.length ? [...soFar, ...extra] : null,
        // what the engine counts rests TAKEN from: the report's counted rows,
        // plus the 2nd break the shift's own notes name, plus the
        // audit-confirmed breaks neither of those saw. An added window only
        // reaches here filtered - explicitly labelled, readable times,
        // plausible length - so crediting it is the whole point of holding
        // the notes and David's sheet at all.
        restRecorded: (countedByDate.get(d.date) || 0) + fromNote.length + extra.length,
        // this flow always collects the rest report - the upload refuses to
        // run without it - so a day with nothing recorded is a real zero
        // rather than an unanswerable.
        restSourceAvailable: true,
        // the correction note rides along so the sheet can print it
        auditNote: auditDay?.correction || null,
      };
    });

    const analyzed = analyzeTimesheet({ ...s, days });
    const stored = analyzed.days.map((d) => ({
      ...storedDay(d),
      onDutyMeal: true,
      // how many of the day's counted rests came out of the schedule notes -
      // the sheet says so in Comments, the same way audit credits are named.
      noteRests: (days.find((x) => x.date === d.date)?.restTimes || []).filter((w) => w.source === "note").length,
      auditNote: days.find((x) => x.date === d.date)?.auditNote || null,
      // how many of the day's counted rests came off David's sheet rather than
      // the rest report - the sheet says so in Comments, because evidence that
      // exists only in a DSN summary is worth naming above a signature.
      auditRests: (days.find((x) => x.date === d.date)?.restTimes || []).filter((w) => w.source === "audit").length,
    }));

    const scheduleCheck = schedPerson
      ? compareToSchedule(analyzed.days, schedPerson.days, { toleranceHours: 1 })
      : null;

    people.push({
      sourceName: s.employee,
      // the same punch review every MLS sheet gets: reversed pairs, the
      // 10-plus-hour stretches that are almost always a wrong AM/PM. this fed
      // the checks screen empty for a day, which is why the batch page had no
      // "see what looks wrong" - the card only speaks when something is
      // flagged, and nothing was ever computed to flag.
      punchIssues: reviewSheet(analyzed.days, analyzeDay),
      scheduleCheck,
      schedulePages: schedPerson?.pages || [],
      payPeriod: s.payPeriod,
      days: stored,
      totals: totalsFromDays(stored),
      premiums: analyzed.premiums,
      partialWeekDates: analyzed.partialWeekDates || [],
      // QSP's own numbered notes for this person, straight off the export
      comments: s.comments || null,
      // which pages of the source PDF this person is on, same as MLS stores
      pages: s.pages || [],
      restName: personRows[0]?.name || null,
      // their own schedule notes, one entry per date, for the sheet's
      // Comments Details - Mánu 2026-08-18: "the bottom should have their
      // reasons they missed as well as their own scheduled notes for
      // reference". Newlines collapse so an address does not become four
      // comment lines.
      scheduleNotes: (() => {
        const seen = new Map();
        for (const row of personRows) {
          const note = String(row.scheduleNotes || "").replace(/\s*\n\s*/g, " / ").trim();
          if (!note || !row.date) continue;
          if (!seen.has(`${row.date}|${note}`)) seen.set(`${row.date}|${note}`, { date: row.date, note });
        }
        return [...seen.values()];
      })(),
      auditName: auditPerson?.name || null,
      faultCount: audit.faults.filter((f) => auditPerson && f.person === auditPerson.name).length,
    });
  }

  // audit people the PDF never mentions - a spelling nobody matched, or
  // somebody missing from the export entirely. surfaced rather than dropped.
  const covered = new Set(people.map((p) => p.auditName).filter(Boolean));
  const unmatchedAudit = audit.people.filter((p) => !covered.has(p.name)).map((p) => p.name);

  return {
    payPeriod: sheets[0]?.payPeriod || null,
    people,
    faults: audit.faults,
    unmatchedAudit,
    restRows,
    auditSpan: { from: audit.from, through: audit.through },
  };
}

export { clockLabel };
