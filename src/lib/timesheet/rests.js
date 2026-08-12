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
export const REST_LONG_MAX_MIN = 15;
// A California meal period is thirty unpaid minutes, and the engine reads a
// punched gap of 21 to 90 minutes as one. The same window applies here: an entry
// in the REST report that is as long as a meal is worth asking about, whatever
// the exact figure.
//
// WIDENED FROM EXACTLY 30 on 2026-08-10. Mánu, looking at Hernadez and Hatt:
// "if their ten minute break ... is the same length as a meal aka thirty
// minutes, then it needs to be questioned whether that was meant to be a meal
// break. if they are missing a meal break that day." An exact-30 test caught
// Hernadez's two and would have missed Martinez's 50 next to it - and a 45
// minute row on the next batch.
const MEAL_LENGTH_MIN_MIN = 21;
const MEAL_LENGTH_MAX_MIN = 90;

// A rest row as long as a meal. Two on 07/16-07/31 were exactly 30, both
// Hernadez, on days with no meal rostered at all: 07/25 2p-2:30p and 07/26
// 12:30p-1p. Martinez 07/23 is 50 and the same species.
//
// Mánu 2026-08-09: draw these as a meal, striped, and say in the footnote what
// the adjustment does - but do NOT decide it. Counting them as meals taken would
// REMOVE the meal premium those days currently owe, and that is a person's call,
// not a threshold's.
//
// THE DAY HAS TO BE MISSING A MEAL for this to mean anything, and that test
// lives in questions.js where the day is in scope. Hatt 07/20 is 60 minutes and
// had her lunch rostered and taken, so the length alone would have asked her a
// question with no answer behind it.
//
// Read off the stored row rather than off `kind`, so it works on the batch
// already in the database instead of needing a re-upload to take effect.
// A ROW A SINGLE MIS-PICKED FIELD EXPLAINS IS NOT THIS. Restored 2026-08-11
// after Martinez: his 50 minutes read as meal-length, so the sheet drew it as a
// lunch - and with the reversed flag correctly gone, it drew "3:50p-3p", a meal
// ending before it began. A mechanical fix beats a guess at intent, and the
// repair question already covers the row.
// DOES THIS ROW STAND AS A REST BREAK TAKEN?
//
// Read off the STORED row, so a change to the rule reaches batches already in
// the database instead of needing them re-uploaded - the same reason
// `isMealLengthRest` is written this way.
//
// A ROW THAT EXISTS IS A BREAK THAT HAPPENED. That is the whole rule now, and
// LENGTH HAS NOTHING TO DO WITH IT. Mánu 2026-08-12: "if they show up in the
// Rest period Report, for a certain day, for a certain shift, they took it. even
// if there is no time, they took it. They just didn't document it. If the time
// is ten years, they took it. There was just a mistake in typing. if they took
// it for two minutes. It's a mistake. and can be fixed, but count it. breaks
// under 10 minutes are no longer going to be treated as not taken."
//
// It arrived in three steps over one afternoon and they all pointed the same
// way: first a repair the shift confirms, then any repair at all, then this.
// Each time the thing being defended was a length - a two minute row, a twelve
// hour row - and a length is a typing mistake, not an absence. Somebody stood in
// the break room; a dropdown got the time wrong.
//
// A rest is PAID and on the clock, so counting one moves no hours. All it does
// is stop the day owing a premium for a break it can see was taken.
//
// WHAT THIS STILL CANNOT DO is invent a break on a day the report holds nothing
// for. Ford has five premium days and three rest rows; only one is a mis-click.
// Removing a premium takes money OFF somebody, so a missing row stays missing.
export function countsAsTaken(row) {
  if (!row) return false;
  if (row.counted === true) return true;
  // THE ONE EXCEPTION, and it is not about length. A meal-length row on a day
  // with no rostered lunch is being read as the LUNCH - drawn blue and striped,
  // asked about as a meal. Counting it as a rest as well would let one entry
  // clear two different violations, which is the same break paid for twice.
  if (isMealLengthRest(row)) return false;
  return true;
}

export function isMealLengthRest(row) {
  const mins = Number(row?.minutes);
  return !!row
    && !row.counted
    && !row.repair
    && Number.isFinite(mins)
    && mins >= MEAL_LENGTH_MIN_MIN
    && mins <= MEAL_LENGTH_MAX_MIN;
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
// THE SERVICE IS THE TIE-BREAKER, added 2026-08-11. A rest is logged against a
// shift and belongs inside it, so a candidate fix that lands the break INSIDE
// its own service is better than one that does not - and where several are
// plausible, "first in the list wins" was picking by accident.
//
// Martinez 07/23 is the case: out 3:50 PM, in 3:00 PM, on the 1:40-4:10 Toleldo
// service. Rolling the IN hour forward gives 3:50-4:00, inside the service. That
// is the answer, and now it is chosen because it fits rather than because it was
// listed third. The hour-roll on OUT is also absent from the list entirely,
// which is its own gap - a mistake on that field simply gets no proposal.
function proposeRepair(out, back, shift = null) {
  const tries = [
    ["in", -720, "the IN time was picked as PM"],
    ["in", 720, "the IN time was picked as AM"],
    ["in", 60, "the IN hour was rolled back an hour"],
    ["in", -60, "the IN hour was rolled forward an hour"],
    ["out", 720, "the OUT time was picked as AM"],
    ["out", -720, "the OUT time was picked as PM"],
  ];
  const found = [];
  for (const [field, delta, why] of tries) {
    const o = field === "out" ? out + delta : out;
    const i = field === "in" ? back + delta : back;
    if (o < 0 || i < 0 || o > 1439 || i > 1439) continue;
    const mins = i - o;
    if (mins < FULL_REST_MIN || mins > REST_LONG_MAX_MIN) continue;
    found.push({
      field,
      from: hhmm(field === "out" ? out : back),
      to: hhmm(field === "out" ? o : i),
      minutes: mins,
      why,
      // does this land the break inside the shift it was filed against?
      fits: shift?.from != null && shift?.to != null
        ? o >= shift.from && i <= shift.to
        : null,
    });
  }
  // A WHOLE-ROW AM/PM SWAP, where BOTH times were picked on the wrong side.
  //
  // Paulin 08/07: a rest of 11:00 PM to 11:10 PM filed against a 10:00 AM to
  // 12:00 PM shift. Mánu 2026-08-12: "I thought the engine auto fixed issues
  // like this. that's an am/pm swap." It did not, and the reason is that every
  // try above moves ONE field, which breaks the length - so a row whose length
  // is already a perfect ten was never offered a repair at all. It sailed
  // through as a counted rest sitting twelve hours from its own service.
  //
  // GATED HARD, because a both-field shift preserves the length and would
  // otherwise "explain" every well-formed row on the sheet. It is only offered
  // when the row does NOT sit inside its own service and the shifted version
  // DOES - which is the whole evidence that a swap happened. Aranda 07/16 (a
  // 3:00 PM rest on a 1:00-2:30 PM shift, really worked 2:30-5:00) shifts to
  // 3:00 AM, fits nothing, and is correctly left alone.
  const inShift = (o, i) =>
    shift?.from != null && shift?.to != null && o >= shift.from && i <= shift.to;
  if (!inShift(out, back)) {
    for (const [delta, why] of [
      [-720, "both times were picked as PM"],
      [720, "both times were picked as AM"],
    ]) {
      const o = out + delta;
      const i = back + delta;
      if (o < 0 || i < 0 || o > 1439 || i > 1439) continue;
      const mins = i - o;
      if (mins < FULL_REST_MIN || mins > REST_LONG_MAX_MIN) continue;
      if (!inShift(o, i)) continue;
      found.push({
        field: "both",
        // both ends move, so the pair is quoted rather than one field
        from: `${hhmm(out)} to ${hhmm(back)}`,
        to: `${hhmm(o)} to ${hhmm(i)}`,
        // and carried separately, so a consumer can place the block without
        // parsing the sentence back apart
        outTo: hhmm(o),
        inTo: hhmm(i),
        minutes: mins,
        why,
        fits: true,
      });
    }
  }

  if (!found.length) return null;
  return found.find((f) => f.fits === true) || found[0];
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
  // A BREAK WITH NO TIMES ON IT IS STILL A BREAK SOMEBODY TOOK. Mánu 2026-08-10:
  // "if its blank it should count as a break but needs to correction ... if both
  // missing then 2 ? then they need to correct it."
  //
  // Somebody opened the break screen and logged it; the times are what did not
  // survive. Treating that as no break at all charged Flores a rest premium for
  // a break the report says she took. It counts, and the missing fields come
  // back as `missing` so the sheet can draw a ? where the time should be and the
  // question can insist on it.
  if (out == null || back == null) {
    const missing = [out == null ? "out" : null, back == null ? "in" : null].filter(Boolean);
    return {
      ...base,
      counted: true,
      minutes: null,
      kind: "no-times",
      missing,
      // nothing to pay for minutes nobody recorded - the count is the claim,
      // the time is what is being asked for
      needsTimes: true,
    };
  }

  const raw = back - out;
  const reversed = raw < 0;
  const minutes = reversed ? -raw : raw;

  // A ROW IS ONLY BACKWARDS IF NOTHING SIMPLER EXPLAINS IT. `reversed` is decided
  // from `in < out` alone, before anything has asked whether ONE mis-picked field
  // accounts for the row - and the sheet draws from `reversed`.
  //
  // Martinez 07/23 is the case. Recorded out 3:50 PM, in 3:00 PM, attached to the
  // 1:40-4:10 Toleldo service. Read as backwards it becomes 3:00-3:50, fifty
  // minutes, and the sheet prints that. But the OUT is right and the IN has an
  // hour rolled off it: 3:50-4:00, a ten minute rest sitting inside the service
  // it was logged against. Mánu 2026-08-11: "to me that clearly shows it meant to
  // be 3:50-4pm which inside toledo."
  //
  // So where a repair exists, it is the better reading and the row is not
  // reversed. The flip stands only when nothing else explains the order.
  const shift = {
    from: clockMin(row["Shift Start Time"]),
    to: clockMin(row["Shift End Time"]),
  };
  const repairIfBad = proposeRepair(out, back, shift);
  const trulyReversed = reversed && !repairIfBad;

  // A REPAIR THE SHIFT CONFIRMS IS APPLIED, NOT MERELY OFFERED.
  //
  // Mánu 2026-08-12 on Dinley 08/07: "The engine and the projection engine
  // should always count that as a break taken even if it extends way fucking
  // longer than a ten should be. What the engine should also do is assume the
  // correction. Change it. Change it in the time sheet. And just to have them
  // sign off, we ask it anyway even though we already know the answer. It's
  // rhetorical."
  //
  // Her row reads 11:00 AM to 11:10 PM - twelve hours and ten minutes, which is
  // not a rest period and not a shift either. One field explains it: the IN was
  // picked as PM. Corrected it is 11:00-11:10 AM, ten minutes, sitting inside
  // the 9:30-12:30 service it was filed against. Treating that as "no break" was
  // charging somebody a premium over a dropdown.
  //
  // ANY row at all, whatever it says - see `countsAsTaken`. A repair, where one
  // exists, is what the row is COUNTED as and where it is drawn; without one the
  // row still counts and still gets asked about.
  //
  // The row keeps its RECORDED minutes so the question can still show what the
  // document says, and carries `countedMinutes` for what it is being counted as.
  // The question is still asked - see `buildQuestions`, which generates it from
  // `repair` and not from `counted` - because a swapped AM/PM is exactly the
  // thing worth having somebody look at, even when we are confident.
  if (repairIfBad) {
    return {
      ...base,
      reversed: false,
      counted: true,
      minutes,
      countedMinutes: repairIfBad.minutes,
      kind: "repaired",
      repair: repairIfBad,
    };
  }

  // TOO SHORT AND TOO LONG BOTH COUNT NOW, and keep their kind so the sheet can
  // still mark them and the question can still ask. `countedMinutes` is ten: a
  // two minute row is a ten minute break somebody mistyped, and crediting two
  // would be inventing a shortfall out of the same typo.
  if (minutes < FULL_REST_MIN) {
    return {
      ...base, reversed: trulyReversed, counted: true, minutes,
      countedMinutes: FULL_REST_MIN, kind: "short", repair: repairIfBad,
    };
  }
  if (minutes > REST_LONG_MAX_MIN) {
    // EXCEPT A MEAL-LENGTH ROW, which is being read as the LUNCH rather than as
    // a rest - drawn blue and striped, asked about as a meal. Counting it here
    // as well would let one entry clear two different violations. Same exception
    // `countsAsTaken` makes, and it has to be made in both or they disagree
    // about the same row.
    const mealShaped =
      !repairIfBad && minutes >= MEAL_LENGTH_MIN_MIN && minutes <= MEAL_LENGTH_MAX_MIN;
    return {
      ...base, reversed: trulyReversed, counted: !mealShaped, minutes,
      ...(mealShaped ? {} : { countedMinutes: FULL_REST_MIN }),
      kind: "too-long", repair: repairIfBad,
    };
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
//
// THREE OF THESE STILL SAID A ROW DID NOT COUNT, which stopped being true on
// 2026-08-12 when `countsAsTaken` became "any row at all, whatever it says".
// They render directly under the card `describeRestRow` writes, so the checks
// screen was printing "It still counts as a 10 minute break taken" and, one line
// below it, "it does not count until somebody confirms what it was" - about the
// same row. `short` and `no-times` were the same contradiction. This map also
// feeds the EMPLOYEE's own page, so the wrong half was going to the person whose
// premium turns on it.
const REST_KIND_NOTE = {
  "reversed-repaired": "The out and in times were entered the wrong way round. Read as a normal rest break.",
  repaired: "One time was picked wrong. Corrected and counted as a rest break, and still worth confirming.",
  "over-ten": `Longer than the ten minutes a paid rest period allows. It still counts and owes nothing, but ${REST_LONG_MAX_MIN} minutes is one and a half times the entitlement.`,
  short: `Shorter than the ten minutes California requires. It still counts as a break taken and is credited as the full ${FULL_REST_MIN} - a short row is a mistyped time, not a short break.`,
  "too-long": `Too long to be a rest period, and no single mis-picked field explains it. It still counts as a ${FULL_REST_MIN} minute break taken: the length is a typing mistake, not an absence.`,
  "no-times": "No out or in time was recorded. The break still counts as taken - it is the times that did not survive, not the break.",
};

// The note for a row, which `kind` alone cannot always give. A "too-long" row
// is counted unless it is the length of a MEAL, in which case it is being read
// as the lunch instead and counting it as a rest as well would let one entry
// clear two violations. Same exception `countsAsTaken` makes, made here too so
// the sentence and the arithmetic cannot disagree.
export function restKindNote(row) {
  if (!row) return null;
  if (row.kind === "too-long" && !countsAsTaken(row)) {
    return "The length of a meal rather than a rest period, so it does not count as a rest taken. Whether it was the lunch is a question for a person.";
  }
  return REST_KIND_NOTE[row.kind] || null;
}

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
  // MEASURED ON THE CORRECTED TIME, or a row we have already explained gets
  // reported as a second, different fault. Espinoza 08/05 is a 4:00 AM rest the
  // classifier repairs to 4:00 PM precisely BECAUSE that lands inside the
  // 3:40-5:10 PM shift it names - and this then called it filed against the
  // wrong shift, on the strength of the time the repair exists to discard. The
  // row is not misfiled; one field was mis-picked, and that card already exists.
  //
  // A row still outside its own shift AFTER the repair is a real misfile and
  // still reported. Callers pass the classified row for this to see anything;
  // a raw one has no repair on it and reads exactly as it did before.
  const t = restRowTimes(row);
  const restOut = clockMin(t.from);
  const restIn = clockMin(t.to);
  if (shiftOut == null || shiftIn == null || restOut == null || restIn == null) return false;
  // still backwards once resolved - malformed, and the rest reader handles it
  if (restIn <= restOut) return false;
  return restOut < shiftOut || restIn > shiftIn;
}

// WHERE A REST SITS RELATIVE TO THE SERVICE IT WAS LOGGED AGAINST.
//
// Mánu 2026-08-11 explaining how the system actually works: "rest periods are
// tied to a service. theres no way to document them without having a service to
// add it to." So every rest has an owning shift, and its natural home is inside
// that shift's window. Where it is not, the row was entered wrong - which is a
// different claim from the break not happening.
//
// Measured on 07/16-07/31: 309 of 350 sit inside their own service, 40 do not,
// and 37 of those 40 are entirely before it or entirely after it rather than
// overlapping an edge. The boundary cases are the interesting ones:
//
//   Uribe 07/28, 07/29, 07/31   rest 12:00-12:10, service 10:00-12:00 Rincon
//                               the break starts exactly as the service ends
//   Hatt 07/20                  rest 3:30-4:30, service 4:30-9:30 Flores
//                               the mirror: ends exactly as the service starts
//
// "abuts" is what makes those two the same species and separates them from a
// rest logged hours away from its shift.
// THE STORED ROW ONLY EVER CARRIED THE SERVICE AS A SENTENCE. `allRestRows` has
// written `shift: "1:00 PM to 2:30 PM"` since the beginning and only started
// carrying `shiftFrom`/`shiftTo` on 2026-08-11, so every batch already in the
// database - including the live one - has the service window and no field to
// read it out of. Splitting the sentence is what lets this rule work on a sheet
// that was uploaded before the rule existed, instead of only on the next upload.
const splitShift = (s) => {
  const m = /^(.+?)\s+to\s+(.+)$/.exec(String(s || "").trim());
  return m ? { from: m[1], to: m[2] } : { from: null, to: null };
};

// WHAT A REST ROW ACTUALLY SAYS, once the two things we already know about it
// are applied: a repair replaces the field it names, and a row with no repair
// but recorded backwards is read the other way round.
//
// This expression existed in THREE places - `drawnRest`, `recordedBreaksFor`,
// and nowhere at all in the engine, which is the bug. The window builder that
// feeds `analyzeDay` read `row.out`/`row.in` raw, so Espinoza 08/05 - a 4:00 AM
// row the engine itself had already corrected to 4:00 PM, `fits: true`, sitting
// inside his 3:40-5:10 PM shift - was measured against the uncorrected time and
// came back `restsOutsideShift: 1`. The sheet drew the break inside his shift
// while the cards beside it said it was outside one, about the same ten minutes.
//
// Reversed rows were the same story: 15 of them across the two live batches
// reach the engine with out AFTER in, so every on-the-clock test they meet is
// asking whether a negative-length break fits inside a segment.
//
// Takes a RAW report row or a stored one - the keys differ and both are read -
// so the classifier can use it before a repair exists and the engine after.
export function restRowTimes(row) {
  const rawOut = row?.["Rest Period Time Out"] ?? row?.out ?? null;
  const rawIn = row?.["Rest Period Time In"] ?? row?.in ?? null;
  const rep = row?.repair;
  if (rep) {
    if (rep.field === "both") return { from: rep.outTo, to: rep.inTo };
    if (rep.field === "out") return { from: rep.to, to: rawIn };
    return { from: rawOut, to: rep.to };
  }
  if (row?.reversed) return { from: rawIn, to: rawOut };
  return { from: rawOut, to: rawIn };
}

export function serviceFit(row) {
  const said = splitShift(row?.shift);
  const sO = clockMin(row?.["Shift Start Time"] ?? row?.shiftFrom ?? said.from);
  const sI = clockMin(row?.["Shift End Time"] ?? row?.shiftTo ?? said.to);
  // the times the row MEANS, not the ones it holds - a repaired row is filed
  // against the shift its correction lands in, which is the whole reason the
  // repair was believed in the first place (`fits: true`).
  const t = restRowTimes(row);
  const a = clockMin(t.from);
  const b = clockMin(t.to);
  if (sO == null || sI == null || a == null || b == null) return { where: "unknown" };
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  // the service window travels with the verdict. A rule that moves a break to
  // where it should have been needs the edge it is moving to, and re-reading the
  // row for it is how the two end up disagreeing about which shift they meant.
  const svc = { from: sO, to: sI };
  if (lo >= sO && hi <= sI) return { where: "inside", ...svc };
  if (hi <= sO) return { where: "before", abuts: hi === sO, gapMin: sO - hi, ...svc };
  if (lo >= sI) return { where: "after", abuts: lo === sI, gapMin: lo - sI, ...svc };
  return { where: "straddles", ...svc };
}

export function restKey(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// THE SPELLING THE REST PERIODS REPORT USED FOR THIS PERSON, which is not always
// the spelling on their timesheet.
//
// QSP prints one person under two names across its own exports. Ruth Delgado
// Pineda's Simple Timesheet says "Delgado Pineda, Ruth" and her Rest Periods
// Report says "Delgado Pineda, Angel" - her preferred name. The engine already
// bridges that at upload through her portal account (see identity.js), so her
// stored day carries the rest and her premium is right.
//
// Every DISPLAY path then matched rest rows on the raw timesheet name and found
// nothing. Her SIGNED SHEET printed an empty Breaks column while the engine had
// counted the break and charged her no premium - a document contradicting
// itself - and her own timesheet page and the checks screen drew no rest at all.
//
// The answer was already stored. `lookupAcross` returns the spelling it matched
// through and upload writes it to `readAs.rests`, so nothing has to be
// re-uploaded and no screen has to do fuzzy matching of its own. One place
// computes it at upload, one function reads it back, every display asks here.
//
// Falls back to the timesheet's own name, which is the right answer for the 117
// of 119 sheets QSP spells consistently and for any batch stored before the
// `readAs` block existed.
export function restNameFor(sourceName, data) {
  return data?.premiumSupport?.readAs?.rests?.name || sourceName || "";
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
    if (countsAsTaken(c)) { day.taken++; p.taken++; if (c.reversed) { day.repaired++; p.repaired++; } }
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
    const offOwnShift = restOffOwnShift({ ...r, repair: c.repair, reversed: c.reversed });

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
      // THE SERVICE ITSELF, carried rather than summarised. A rest cannot be
      // logged without one, so this is the shift it was MEANT to sit in - the
      // strongest thing the report says about where a break belongs, and until
      // 2026-08-11 the engine threw all of it away and reasoned from punch gaps
      // instead. `restOffOwnShift` had existed and been tested since the start
      // and was called from nowhing but its own test.
      shiftFrom: String(r["Shift Start Time"] ?? "").trim() || null,
      shiftTo: String(r["Shift End Time"] ?? "").trim() || null,
      client: String(r["Client Name"] ?? "").trim() || null,
      serviceType: String(r["Service Type"] ?? "").trim() || null,
      scheduleNotes: String(r["Schedule Notes"] ?? "").trim() || null,
      // inside | before | after | straddles | unknown, and whether it sits hard
      // against the edge. Uribe's three and Hatt's 07/20 are the same mistake at
      // opposite ends of a shift, which only this makes visible.
      // computed from the CLASSIFIED row, so a repair the classifier just found
      // is the reading the fit is measured on. Passing the raw row filed every
      // repaired break against the shift its uncorrected time missed.
      fit: serviceFit({ ...r, repair: c.repair, reversed: c.reversed }),
      // the printed column, kept only so a reader can match our row to theirs.
      // it is rounded - never decide anything from it. `derivation` shows the
      // arithmetic ("-0.83 hr x 60 = -50 min") so nobody has to trust the jump.
      printedHours: c.printedHours,
      derivation: c.derivation,
      minutes: c.minutes,
      reversed: c.reversed,
      counted: c.counted,
      kind: c.kind,
      note: restKindNote(c),
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
