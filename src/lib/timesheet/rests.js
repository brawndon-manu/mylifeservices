// The QSP Rest Periods Report: one row per shift, with the rest break taken
// during it.
//
// This decides whether a rest break happened. Until now that was inferred from
// gaps between punches, which is a guess - a ten minute gap might be a break, or
// travel between two clients, or a punch artefact. QSP records the break itself,
// so where this report covers someone it is simply a better answer.
//
// It changes WHETHER A BREAK WAS TAKEN. It never changes hours. Paid time still
// comes from the timesheet punches, because the timesheet is the document staff
// sign and the one everything else is reconciled against.
//
// Measured on 07/16-07/31: using this instead of punch gaps moves 38 days onto a
// rest premium and 1 day off one, about +50 premium hours. It runs in the
// direction of paying people more, which is the direction to be wrong in.

import { readXlsTable } from "../xls.js";
import { normalizeDate } from "./clock.js";

// California requires a NET TEN MINUTES. That is the whole rule, and everything
// below is about reading QSP's record of it honestly.
export const FULL_REST_MIN = 10;
// How far over ten a break can run and still just be a rest break. Above this
// it is a meal or a typo, not a rest. 15 because it is the other standard rest
// length, so 11-15 reads as a real break somebody rounded up.
//
// NOTHING in the 07/16-07/31 report lands between 11 and 29 minutes - every
// genuine break is exactly 10 - so this threshold is a guard for future periods
// rather than a judgement about this one. Move the number here and nowhere else.
const REST_LONG_MAX_MIN = 15;
// A California meal period is thirty unpaid minutes. Not a rest rule, so it is
// not part of the bands above - it is here only to recognise an entry that is
// the LENGTH of a meal sitting in the rest report.
const MEAL_LENGTH_MIN = 30;

// A rest row that is exactly a meal long and has no single mis-picked field to
// explain it. Two on 07/16-07/31, both Hernadez, on days with no meal rostered
// at all: 07/25 2p-2:30p and 07/26 12:30p-1p.
//
// Mánu 2026-08-09: draw these as a meal, striped, and say in the footnote what
// the adjustment does - but do NOT decide it. Counting them as meals taken would
// REMOVE the meal premium those days currently owe, and that is a person's call,
// not a threshold's.
//
// Read off the stored row rather than off `kind`, so it works on the batch
// already in the database instead of needing a re-upload to take effect.
export function isMealLengthRest(row) {
  return !!row
    && !row.counted
    && !row.repair
    && Number(row.minutes) === MEAL_LENGTH_MIN;
}

// DO NOT DECIDE ANYTHING FROM `Total Rest Time`. It is rounded to two decimals,
// so a real 7:00->7:10 break prints as either 0.17 (10.2 min) or 0.16 (9.6 min)
// depending on the row: 271 rows round up and 61 round down on this period. Any
// "under ten minutes" test read off that column marks those 61 breaks deficient
// and invents premiums out of rounding. The OUT and IN times are exact, so the
// length is computed from them and the column is only ever a fallback.
const MIN_REST_HOURS = 0.05;
const MAX_REST_HOURS = 0.5;

// Kept because it is still a fair test of whether the PRINTED total is
// plausible. It is no longer what decides whether a break was taken.
export function isSaneRest(totalRestTime) {
  const t = Number(totalRestTime);
  return Number.isFinite(t) && t > MIN_REST_HOURS && t < MAX_REST_HOURS;
}

// "3:50 PM" -> minutes past midnight. null when it cannot be read.
export function clockMin(s) {
  const m = /^(\d{1,2}):(\d{2})\s*([AP])M?$/i.exec(String(s ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]) % 12;
  const min = Number(m[2]);
  if (h > 11 || min > 59) return null;
  return (/^p$/i.test(m[3]) ? h + 12 : h) * 60 + min;
}

const hhmm = (m) => {
  const h = Math.floor(((m % 1440) + 1440) % 1440 / 60);
  return `${h % 12 || 12}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

// Is there a SINGLE mis-picked field that turns this into a rest break?
//
// Only single-field, off-by-one-hour or AM/PM slips are proposed, because those
// are the shapes a dropdown produces. Nothing here is applied - it is a
// suggestion for a person to accept, and the employee sees it on the sheet they
// sign before it counts against them.
//
//   Jose Martinez 07/23   3:50 PM -> 3:00 PM   IN hour rolled back: 4:00 PM
//   Rotter 07/27         11:20 AM -> 11:30 PM  IN picked PM: 11:30 AM
//   Romero-Alba 07/30    10:10 AM -> 10:20 PM  IN picked PM: 10:20 AM
//
// Hatt 07/20 (3:30 PM -> 4:30 PM) gets NO proposal: no single field fixes it,
// so it stays owed and stays a question for a person. That is the point of
// only proposing what is unambiguous.
function proposeRepair(out, back) {
  const tries = [
    ["in", -720, "the IN time was picked as PM"],
    ["in", 720, "the IN time was picked as AM"],
    ["in", 60, "the IN hour was rolled back an hour"],
    ["in", -60, "the IN hour was rolled forward an hour"],
    ["out", 720, "the OUT time was picked as AM"],
    ["out", -720, "the OUT time was picked as PM"],
  ];
  for (const [field, delta, why] of tries) {
    const o = field === "out" ? out + delta : out;
    const i = field === "in" ? back + delta : back;
    if (o < 0 || i < 0 || o > 1439 || i > 1439) continue;
    const mins = i - o;
    if (mins < FULL_REST_MIN || mins > REST_LONG_MAX_MIN) continue;
    return {
      field,
      from: hhmm(field === "out" ? out : back),
      to: hhmm(field === "out" ? o : i),
      minutes: mins,
      why,
    };
  }
  return null;
}

// What one row of the report actually is.
//
//   counted     - does this stand as a rest break taken?
//   minutes     - the length in minutes, after flipping a reversed row
//   reversed    - out and in were typed into each other's boxes
//   kind        - null for an ordinary ten minutes; otherwise why it is worth
//                 a person's attention, whether or not it counted
//   repair      - a single mis-picked field that would explain it, or null
//   derivation  - the printed column turned into minutes, shown so a reader can
//                 follow how -0.83 became -50 min rather than taking it on trust
//
// REVERSED IS A MODIFIER, NOT A VERDICT. Flipping a backwards row is the
// repair; what happens next is decided by the flipped LENGTH, exactly as it
// would be for a row that was the right way round. So there is no separate
// "backwards and therefore rejected" case - Jose Martinez 07/23 flips to 50
// minutes and is rejected for being 50 minutes, which is the reason worth
// telling someone.
export function classifyRest(row) {
  const printed = Number(row["Total Rest Time"]);
  const derivation = Number.isFinite(printed)
    ? `${printed} hr x 60 = ${Math.round(printed * 60)} min`
    : null;
  const base = { reversed: false, repair: null, derivation, printedHours: Number.isFinite(printed) ? printed : null };

  const out = clockMin(row["Rest Period Time Out"]);
  const back = clockMin(row["Rest Period Time In"]);
  if (out == null || back == null) {
    return { ...base, counted: false, minutes: null, kind: "no-times" };
  }

  const raw = back - out;
  const reversed = raw < 0;
  const minutes = reversed ? -raw : raw;

  if (minutes < FULL_REST_MIN) {
    return { ...base, reversed, counted: false, minutes, kind: "short", repair: proposeRepair(out, back) };
  }
  if (minutes > REST_LONG_MAX_MIN) {
    return { ...base, reversed, counted: false, minutes, kind: "too-long", repair: proposeRepair(out, back) };
  }

  return {
    ...base,
    reversed,
    counted: true,
    minutes,
    // over ten still counts and owes nothing, but it is surfaced: fifteen
    // minutes is one and a half times the paid rest anyone is entitled to, and
    // a habit of it is worth a conversation rather than a premium.
    kind: reversed ? "reversed-repaired" : minutes > FULL_REST_MIN ? "over-ten" : null,
  };
}

// Why a row is being shown, in words, for the screen and the signed sheet.
export const REST_KIND_NOTE = {
  "reversed-repaired": "The out and in times were entered the wrong way round. Read as a normal rest break.",
  "over-ten": `Longer than the ten minutes a paid rest period allows. It still counts and owes nothing, but ${REST_LONG_MAX_MIN} minutes is one and a half times the entitlement.`,
  short: "Shorter than the ten minutes California requires, so it does not count as a rest period taken.",
  "too-long": "Too long to be a rest period. Most likely a mis-picked time, and it does not count until somebody confirms what it was.",
  "no-times": "No out or in time was recorded, so nothing can say a break was taken.",
};

// Does this rest actually fall inside the shift the report filed it under?
//
// Often not, and it does NOT mean the break did not happen. Aranda 07/16 has a
// rest at 3:00-3:10 PM hung on a shift of 1:00-2:30 PM; she was working
// 2:30-5:00 that afternoon, so the break was real, paid, and counts. The ROW is
// what is wrong. 40 rows in 07/16-07/31 are like this and 12 of them are that
// exact shape.
//
// Whether a rest COUNTS is decided by the punches, never by this. This only
// says the report filed it against the wrong shift, which is worth someone
// fixing at source.
export function restOffOwnShift(row) {
  const shiftOut = clockMin(row?.["Shift Start Time"]);
  const shiftIn = clockMin(row?.["Shift End Time"]);
  const restOut = clockMin(row?.["Rest Period Time Out"]);
  const restIn = clockMin(row?.["Rest Period Time In"]);
  if (shiftOut == null || shiftIn == null || restOut == null || restIn == null) return false;
  // a reversed rest is malformed, and the rest reader already handles it
  if (restIn <= restOut) return false;
  return restOut < shiftOut || restIn > shiftIn;
}

export function restKey(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

const REQUIRED = ["Employee Name", "Start Date", "Total Rest Time"];

// Is this row a rest row at all?
//
// A workbook somebody had hand-worked their own timesheet in was uploaded as
// the Rest Periods Report on 2026-08-08, and it carried 14 pasted TIMESHEET
// lines: date, in, out, in, out, hours. Excel hands the date over as a serial,
// so they surfaced on the checks screen as fourteen people called "46219"
// through "46234" - which is 07/16/26 through 07/31/26.
//
// `parseRestReport` had always skipped them, because it needs a name AND a
// date. `allRestRows` had no guard at all, and THAT difference is the entire
// defect: the figures were right the whole time and the screen was not. One
// guard, exported, used by both, so the two cannot drift apart again.
export function isRestRow(r) {
  const name = String(r["Employee Name"] ?? "").trim();
  if (!name) return false;
  // a bare number is a date serial or an id. never a person.
  if (/^\d+(\.\d+)?$/.test(name)) return false;
  return !!normalizeDate(r["Start Date"]);
}

// -> Map(restKey -> { name, byDate: {date: {taken, malformed}}, taken, malformed })
export function parseRestReport(bytes) {
  const { headers, rows } = readXlsTable(bytes);
  const missing = REQUIRED.filter((h) => !headers.includes(h));
  if (missing.length) {
    throw new Error(`that doesn't look like the QSP Rest Periods Report (no ${missing.join(", ")})`);
  }

  const people = new Map();
  for (const r of rows) {
    if (!isRestRow(r)) continue;
    const name = r["Employee Name"];
    const date = normalizeDate(r["Start Date"]);
    const key = restKey(name);
    let p = people.get(key);
    if (!p) {
      p = { name: String(name).trim(), byDate: {}, taken: 0, malformed: 0, repaired: 0 };
      people.set(key, p);
    }
    const c = classifyRest(r);
    if (!p.byDate[date]) p.byDate[date] = { taken: 0, malformed: 0, repaired: 0, kinds: [] };
    const day = p.byDate[date];
    if (c.counted) { day.taken++; p.taken++; if (c.reversed) { day.repaired++; p.repaired++; } }
    else { day.malformed++; p.malformed++; }
    if (c.kind) day.kinds.push(c.kind);
  }
  return people;
}

// EVERY row of the report, classified, with the times it actually holds.
//
// The signed sheet colours only what the two reports recorded - a punch gap is
// not evidence of a break - so it needs the recorded TIMES, not just a count.
// 204 of the 226 days carrying a rest have no punch gap to colour at all,
// because a properly taken rest is paid and stays on the clock.
export function allRestRows(bytes) {
  const { rows } = readXlsTable(bytes);
  const out = [];
  for (const r of rows) {
    // same guard parseRestReport uses. a row that is not a rest row must not
    // reach the checks screen as a person, however harmless it is to the total.
    if (!isRestRow(r)) continue;
    const c = classifyRest(r);
    // The shift the report hung this rest on. Worth carrying because the two
    // often disagree: Aranda 07/16 has a rest at 3:00-3:10 PM attached to a
    // shift of 1:00-2:30 PM. She was working 2:30-5:00 that afternoon, so the
    // break was real and paid and counts - the ROW is what is wrong, not the
    // break. 40 rows in the period are like this and 12 of them are that shape.
    const shiftOut = clockMin(r["Shift Start Time"]);
    const shiftIn = clockMin(r["Shift End Time"]);
    const offOwnShift = restOffOwnShift(r);

    out.push({
      name: String(r["Employee Name"] || "").trim(),
      date: normalizeDate(r["Start Date"]),
      out: String(r["Rest Period Time Out"] ?? "").trim(),
      in: String(r["Rest Period Time In"] ?? "").trim(),
      // the shift as the report filed it, and whether the rest actually falls
      // inside it. Whether the rest COUNTS is a separate question answered by
      // the punches, not by this.
      shift: shiftOut != null && shiftIn != null
        ? `${String(r["Shift Start Time"]).trim()} to ${String(r["Shift End Time"]).trim()}`
        : null,
      offOwnShift,
      // the printed column, kept only so a reader can match our row to theirs.
      // it is rounded - never decide anything from it. `derivation` shows the
      // arithmetic ("-0.83 hr x 60 = -50 min") so nobody has to trust the jump.
      printedHours: c.printedHours,
      derivation: c.derivation,
      minutes: c.minutes,
      reversed: c.reversed,
      counted: c.counted,
      kind: c.kind,
      note: REST_KIND_NOTE[c.kind] || null,
      // a single mis-picked field that would explain it. NOT applied.
      repair: c.repair,
    });
  }
  return out;
}

// The subset worth a person's attention, for the checks screen. Each one is a
// real data-entry mistake somebody can go and fix in QSP, and a 12-hour "rest
// break" is alarming enough that people should see it rather than trust that we
// quietly handled it. Includes rows that DID count - a repaired backwards row
// and a break that ran long are both fine for payroll and still worth watching -
// so each row carries `counted` rather than the list meaning "rejected".
export function attentionRows(bytes) {
  return allRestRows(bytes).filter((r) => r.kind);
}

// only the rows that did NOT count.
export function malformedRows(bytes) {
  return attentionRows(bytes).filter((r) => !r.counted);
}
