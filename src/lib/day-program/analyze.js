// The day program's QSP-first pipeline: the same engine the MLS timesheets run
// on, fed from the day program's own exports.
//
//   Simple Timesheet PDF     hours and punches. The payroll backbone - on 30 of
//                            218 days the hand-kept spreadsheet was LOWER than
//                            what QSP's own punches record, so hours come from
//                            here and from nothing else.
//   Rest Periods Report .xls the systematic record of rest breaks, read by the
//                            same rests.js the MLS batches use - and the source
//                            of the 2nd breaks too, which `noteBreak` below
//                            reads out of the schedule notes staff already type.
//   Mileage Tracking .xls    miles for the period. Optional, and its absence is
//                            recorded as null rather than as nobody driving.
//
// THE REST BREAK AUDIT XLSX IS GONE, 2026-08-22. It was built once, by hand, to
// carry the 2nd breaks that only existed inside DSN summaries; `noteBreak` found
// 70 of those across 08/01-08/15 with nothing it should have caught left over,
// so the document it existed to supply is now supplied by the export itself.
//
// EVERY DAY CARRIES onDutyMeal. Day program staff eat on the clock under the
// signed on-duty meal agreement, so the engine's unpaid-meal rules are exempt -
// see the block in parse.js. Rest rules run exactly as they do for MLS.

import { parseTimesheetPdf, analyzeTimesheet, analyzeDay } from "../timesheet/parse.js";
import { futureDates, trimDays } from "../timesheet/partial.js";
import { reviewSheet } from "../timesheet/anomalies.js";
import { restKey, restRowTimes, clockMin, serviceFit } from "../timesheet/rests.js";
import { dayProgramRestRows } from "./rest-xls.js";
import { restWindowsByDate } from "../timesheet/reanalyze.js";
import { parseSchedulePdf, compareToSchedule, scheduleBlocks } from "../timesheet/schedule.js";
import { storedDay, totalsFromDays } from "../timesheet/stored.js";
// clockLabel and resolveRange only: `parseRestReport` in that file read the
// retired audit xlsx and nothing calls it now. The time helpers beside it are
// what `noteBreak` and the rest-xls reader still run on.
import { clockLabel, resolveRange } from "./rest-report.js";
import { parseMileageReport, anyMilesDriven } from "./mileage.js";

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
// "Break taken:" JOINED 2026-09-02, off the 08/16-08/31 batch: 30 rows wrote
// the second ten that way - "Break taken: 10:00-10:10am" - and none of them
// were read, so four people's documented tens sat uncounted (Rodriguez
// Ardila alone had nine). It does not declare itself second the way the
// spellings above do, and it does not need to: the stitch downstream drops
// any noted window that overlaps the ten the report already recorded, so a
// "Break taken" note that merely restates the recorded break credits nothing
// - measured, exactly one of the 28 readable rows was that duplicate.
const NOTE_LABEL = /(?:break\s*#?\s*2|2nd\s+break|second\s+break|break\s+taken)\s*(?:at\s*)?[:\-]?\s*/i;
const NOTE_RANGE = /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*[-–—]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i;

export function noteBreak(scheduleNotes) {
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
// Patricia and Francisco; the rest report and the emails sheet say Yesenia and
// Frank. Keyed on restKey() of the TIMESHEET
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

// two windows describe the same break when they overlap at all - a note rounds
// ("12:50-1:00") what the report timestamps ("12:50 PM-1:00 PM"), so equality
// is the wrong test.
const overlaps = (a, b) => a.out < b.in && b.out < a.in;

export async function analyzeDayProgram({
  timesheetBytes, restsBytes, scheduleBytes, mileageBytes,
  // MID-PERIOD UPLOADS, same contract as the MLS side. Null refuses a file
  // holding days nobody has worked yet; { from, to } (either end optional)
  // keeps the window and drops the rest. The day program runs these several
  // times a day right through the period - Mánu 2026-08-24: "we upload a few
  // times a day every day until the end of the pay period so we can address
  // people with issues as they come up."
  partial = null,
}) {
  let sheets = (await parseTimesheetPdf(timesheetBytes)).filter((s) => !s.empty);

  // ONE DEFINITION OF "FUTURE", the same futureDates/trimDays pair the MLS
  // upload runs - see ../timesheet/partial.js for why the guard and the trim
  // must be the same comparison. QSP prints scheduled shifts exactly like
  // worked ones, so a mid-period export is part record and part forecast, and
  // without the partial option it is refused whole rather than becoming sheets
  // that ask people to sign for shifts they have not worked.
  const future = futureDates(sheets);
  let partialResult = null;
  if (future.size && !partial) {
    const sample = [...future].sort().slice(0, 3).join(", ");
    const e = new Error(
      `${future.size} dated after today (${sample}). Wait until the pay period has ended, ` +
        `or tick "partial pay period" to drop them and keep what has been worked.`,
    );
    e.code = "future";
    throw e;
  }
  if (partial) {
    const trimmed = trimDays(sheets, { from: partial.from, to: partial.to });
    sheets = trimmed.sheets;
    partialResult = {
      dropped: trimmed.dropped,
      from: trimmed.from,
      through: trimmed.through,
      clamped: trimmed.clamped,
    };
  }
  const restRows = dayProgramRestRows(restsBytes);
  // the Employee Schedules PDF, when one was uploaded: the second opinion on
  // shift shape, exactly the MLS cross-check. Schedule names print "Devin
  // Bass" while the timesheet prints "Bass, Devin", so the match runs on the
  // sorted token set rather than on the spelling.
  let schedByToken = new Map();
  if (scheduleBytes) {
    const sched = await parseSchedulePdf(scheduleBytes);
    const schedPeople = Array.isArray(sched) ? sched : sched?.people || [];
    schedByToken = new Map(schedPeople.map((p) => [tokenKey(p.employee || p.name), p]));
  }

  // the Employee Mileage Tracking Report, when one was uploaded. Null - not an
  // empty map - when it was not, because `qspMiles: null` is what tells the
  // sheet to print no mileage line and the attestation to drop its mileage
  // clause. An empty map would say "we asked and everybody drove nothing".
  const mileage = mileageBytes ? parseMileageReport(mileageBytes) : null;

  // rest rows per person+date, under the alias-resolved key
  const restsFor = new Map();
  for (const row of restRows) {
    const k = aliasKey(row.name);
    if (!restsFor.has(k)) restsFor.set(k, []);
    restsFor.get(k).push(row);
  }

  const people = [];
  for (const s of sheets) {
    const key = aliasKey(s.employee);
    const personRows = restsFor.get(key) || [];
    const windows = restWindowsByDate(personRows, { restRowTimes, clockMin, serviceFit });


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

    // stitch the two sources per day: the report's own windows, then any break
    // the shift's schedule notes name that they did not already cover. `fit` is
    // null on a noted window - nothing in a note says where the shift sat, and
    // the engine treats an absent fit as "nothing to flag", which is honest.
    // the schedule prints "Devin Bass" where the timesheet prints "Bass, Devin"
    const [last, first] = s.employee.split(",").map((x) => x.trim());
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
      return {
        ...d,
        onDutyMeal: true,
        // the schedule's second opinion, same fields the MLS upload attaches.
        // mealScheduled stays honest (the DP schedule rosters no meal blocks)
        // and is moot anyway under onDutyMeal.
        mealScheduled: sd ? (sd.entries || []).some((e) => e.meal) : null,
        scheduleBlocks: sd ? scheduleBlocks(sd.entries) : null,
        restTimes: soFar.length ? soFar : null,
        // what the engine counts rests TAKEN from: the report's counted rows,
        // plus the 2nd break the shift's own notes name. A noted window only
        // reaches here filtered - explicitly labelled, readable times,
        // plausible length - so crediting it is the whole point of reading
        // the notes at all.
        restRecorded: (countedByDate.get(d.date) || 0) + fromNote.length,
        // this flow always collects the rest report - the upload refuses to
        // run without it - so a day with nothing recorded is a real zero
        // rather than an unanswerable.
        restSourceAvailable: true,
      };
    });

    const analyzed = analyzeTimesheet({ ...s, days });
    const stored = analyzed.days.map((d) => ({
      ...storedDay(d),
      onDutyMeal: true,
      // how many of the day's counted rests came out of the schedule notes
      // rather than the report's own columns - the sheet says so in Comments,
      // because evidence read out of a free-text note is worth naming above a
      // signature.
      noteRests: (days.find((x) => x.date === d.date)?.restTimes || []).filter((w) => w.source === "note").length,
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
      // MILES DRIVEN THIS PERIOD, off the mileage export.
      //
      // Null when no mileage report was uploaded - the sheet prints no mileage
      // line and attests to nothing. 0 when a report WAS uploaded and holds no
      // row for them, which is a real "drove nowhere" and prints as 0.00: the
      // report covers the whole day program, so a person missing from it drove
      // nothing. `unmatchedMileage` below catches the other reading - a name in
      // the report that no timesheet claims, which is how a spelling mismatch
      // would otherwise turn into a silent zero.
      miles: mileage ? (mileage.get(key)?.miles ?? 0) : null,
      // carried, never multiplied: QSP prints 0.00 here whenever no per-mile
      // rate is configured, and it was 0.00 on every row of the first pull.
      mileageReimbursement: mileage ? (mileage.get(key)?.reimbursement ?? 0) : null,
      mileageName: mileage ? (mileage.get(key)?.name ?? null) : null,
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
    });
  }

  // a name in the mileage report that no timesheet claims means somebody's
  // miles were
  // read and then dropped, and the person they belong to gets a sheet saying
  // 0.00 that they are asked to attest to. Named rather than swallowed.
  const claimed = new Set(people.map((p) => p.mileageName).filter(Boolean));
  const unmatchedMileage = mileage
    ? [...mileage.values()].filter((m) => !claimed.has(m.name)).map((m) => m.name)
    : [];

  return {
    partial: partialResult,
    payPeriod: sheets[0]?.payPeriod || null,
    people,
    restRows,
    // whether a mileage report was read at all, whether anybody in it drove
    // anything, and who it named that nobody claimed. The upload refuses on the
    // middle one: an all-zero file is far likelier to be the wrong export than
    // a fortnight in which no day program staff drove at all.
    mileage: mileage
      ? { people: mileage.size, anyMiles: anyMilesDriven(mileage), unmatched: unmatchedMileage }
      : null,
  };
}

export { clockLabel };
