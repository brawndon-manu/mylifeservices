// The questions one employee is asked before they can sign.
//
// ONE PLACE DECIDES WHAT A QUESTION IS. The page renders from this, the server
// action re-derives from this to check an answer it is handed, and the email
// describes the same list. A client cannot invent a question, and the page and
// the email cannot drift apart - that is the same reason `buildEmployeeChecks`
// is the single classifier for the "things to check" cards.
//
// WHICH WAY THE MONEY MOVES, after the 2026-08-11 flip.
//
// The sheet now arrives carrying EVERY fault the reports show, with its penalty
// and its minutes on it. So for every question about a BREAK PREMIUM or a POLICY
// ASSUMPTION - which is all but one of them, and 664 of the 678 hours - the
// direction is the same and it is the safe one:
//
//   yes   "I took it" / "I mis-tapped it" -> pay comes OFF
//   no    nothing changes; the sheet already says what they are saying
//   ---   silence changes nothing either, which is why these no longer block
//         signing. An employee who never opens the email keeps every hour.
//
// TWO KINDS DO NOT READ THAT WAY, and both are worth naming rather than
// pretending the rule is universal:
//
//   restOutsideScheduled  asks "was that the right time?", so YES agrees with
//                         the sheet and keeps the ten, and NO is the correction
//                         that takes the minutes off and asks when it really was
//   shortMealRest         a mechanical fix applied on its own, so declining it
//                         takes the credit back and can restore a premium - the
//                         only answer left that moves a figure UP
//
// The rule that actually holds across all of them: an answer that CONFIRMS the
// record never moves money, only a correction does, and silence keeps the pay.
//
// WHAT BLOCKS SIGNING is a separate question from which way money moves, and the
// line is not "is a premium involved". It is whether we CHANGED the document or
// could not READ it. See `MANDATORY_KINDS`.

import {
  restKey, restNameFor, isMealLengthRest, clockMin, serviceFit, FULL_REST_MIN, REST_LONG_MAX_MIN,
} from "./rests.js";
import { shortTime, rosteredMeal } from "./recorded-breaks.js";

const r2 = (n) => Math.round((n || 0) * 100) / 100;

// stable, and derived from the record rather than from position in a list, so
// an answer given before a rebuild still matches the question after one
// A GROUPED KIND IS ONE HABIT ANSWERED ONCE. April's eleven 7:00-7:10 entries
// are one decision, not eleven.
//
// `nothingDocumented` LEFT THIS SET on 2026-08-09 late. Mánu, looking at his own
// card: "what if only some of them are no? with the way we have it right now,
// all of them are no or all of them are yes." A day he worked through is not the
// same event as a day he took his ten and forgot to log it, and 432 day
// decisions across the batch were being forced through one switch.
//
// `restOutsideScheduled` LEFT IT on 2026-08-12, for the same reason and on the
// same objection. Mánu, on his own card again: "you have three dates under one
// card. It should just show the same thing with the yellow warning line and then
// the answers to choose from." One card carrying 07/28, 07/29 and 07/31 answers
// for all three at once, and the day-by-day view then has to pick one date to
// hang it on and tell the other two where it went. A ten logged after one day's
// shift is not the same event as a ten logged after another's.
const GROUPED = new Set([
  "shortMealRest",
]);
export const questionId = (q) =>
  GROUPED.has(q.kind) ? q.kind : `${q.kind}:${q.date}:${q.at || ""}`;

// ---------------------------------------------------------------------------
// WHICH QUESTIONS HAVE TO BE ANSWERED FIRST, because their answer changes what
// the others are even asking.
//
// Mánu 2026-08-11: "we should make it so we have to prioritize what is shown
// first, and not be able to show the other options until the one that will have
// a domino effect on the rest are answered first."
//
// A question that moves PAID HOURS moves the entitlement with it - see
// `reentitle` in parse.js. His own 07/28 sits at 6.17 and falls to 6.00 on one
// answer, and the six hour line decides both whether a meal is owed and whether
// one ten is owed or two. So the break questions for that day are asking about
// premiums that may be about to stop existing.
//
// Answering them in the wrong order is not corrupting - everything is re-derived
// from the pristine day on every reply - but it wastes somebody's time and shows
// them a question that then vanishes, which looks like the system changing its
// mind about their pay.
const MOVES_HOURS = new Set(["restOutsideScheduled"]);
export const movesHours = (kind) => MOVES_HOURS.has(kind);

// WHOSE ANSWER CHANGES WHAT ELSE GETS ASKED - which is a wider set than the one
// that moves hours, and the gate wants this one.
//
// Mánu 2026-08-12 on Dinley 08/07: "I don't understand why it says rest break
// one of two missing. she has both in. One of them is an AM/PM slip, so it
// should be counted as a break. That's why it has that rest time looks
// mis-entered."
//
// Both cards were about THE SAME TEN. Her 11:00 AM row is filed to 11:10 PM, so
// it is not counted, so the day reads one rest short - and the day being one
// rest short is what generates "one of two missing". The repair card asks
// whether she took that break; answering yes sets `restViolation: false`, the
// day leaves `restUndocumented`, and the second card stops existing. She was
// being asked twice about one break and charged for it in the meantime.
//
// Every kind here clears a violation the breaks question is generated from:
// `repair` and `restNoTimes` clear the rest one, `restIsMealLength` the meal.
// None of them moves an hour, which is why `MOVES_HOURS` did not catch them.
const CHANGES_WHAT_IS_ASKED = new Set([
  "restOutsideScheduled", "repair", "restNoTimes", "restIsMealLength",
]);
const gatesOthers = (kind) => CHANGES_WHAT_IS_ASKED.has(kind);

// the dates one question speaks for
const datesOf = (q) => q.dates || (q.date ? [q.date] : []);

// WHAT IS WAITING ON WHAT, and only where the dates actually overlap. A ten
// logged outside a shift on the 28th says nothing about the 16th, so locking
// every break question on the sheet would be a gate nobody could justify.
//
// Returns the ids of questions that cannot be answered yet, plus - for a
// question being CHANGED - which already-answered questions its answer would
// disturb.
export function dependencyGate(questions, corrections) {
  const rows = (corrections || []).filter(
    (c) => String(c.kind || "").startsWith("q_") && c.status !== "open",
  );
  const answered = (q) =>
    rows.some((c) => c.kind === `q_${q.kind}` && datesOf(q).includes(c.date));

  const movers = (questions || []).filter((q) => gatesOthers(q.kind));
  const openMoverDates = new Set(
    movers.filter((q) => !answered(q)).flatMap(datesOf),
  );

  const waiting = new Set();
  for (const q of questions || []) {
    if (gatesOthers(q.kind)) continue;
    if (datesOf(q).some((d) => openMoverDates.has(d))) waiting.add(q.id);
  }

  // for each mover, the answered questions on its dates - what a change would
  // reach. Empty means changing it disturbs nothing and needs no warning.
  const disturbs = {};
  for (const q of movers) {
    const mine = new Set(datesOf(q));
    disturbs[q.id] = (questions || [])
      .filter((x) => !gatesOthers(x.kind) && datesOf(x).some((d) => mine.has(d)) && answered(x))
      .map((x) => x.id);
  }
  return { waiting, disturbs };
}

/**
 * @param data       the sheet's stored `data` (days, scheduleCheck)
 * @param restRows   the batch's `restsByDate`
 * @param sourceName who this sheet belongs to, as the exports name them
 */
// minutes past midnight -> "1:15p", the only time format on the sheet
const clock = (min) => {
  const h24 = Math.floor(min / 60);
  const mm = min % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}${mm ? `:${String(mm).padStart(2, "0")}` : ""}${h24 < 12 ? "a" : "p"}`;
};

// THE SHIFTS A DAY WAS ACTUALLY WORKED IN, from the punches. Pairs, in order.
export function shiftsOf(day) {
  const p = (day?.punches || []).map((x) => x.min).filter((n) => Number.isFinite(n));
  const out = [];
  for (let i = 0; i + 1 < p.length; i += 2) if (p[i + 1] > p[i]) out.push({ from: p[i], to: p[i + 1] });
  return out;
}

// WHERE A REST PERIOD IS ALLOWED TO GO.
//
// Mánu 2026-08-11, on the schedule-gap suggestion this replaces: "they are not
// allowed to put their breaks into unscheduled time. It has to be assigned to a
// service. So it's showing that there's a gap and suggesting to put it in that
// gap goes against our policy ... instead of showing me where the gaps are, it
// should show me my ins and outs of each shift for the day."
//
// He is right and the old suggestion was self-defeating: the card ABOVE this one
// exists because a ten was logged outside a shift, and this one was proposing
// exactly that. 506 of the 597 tens in the batch had a gap offered to them.
//
// So the window is inside the WORK, and which part of it depends on which ten:
// the first belongs in the first four hours, the second in the last four. A time
// outside every shift is not a rest period this employer can accept, whatever
// the employee remembers - it is the thing the other question is about.
const FOUR_HOURS = 240;
export function restWindow(day, ordinal) {
  const shifts = shiftsOf(day);
  if (!shifts.length) return null;
  const start = shifts[0].from;
  const end = shifts[shifts.length - 1].to;
  const half = ordinal <= 1
    ? { from: start, to: Math.min(end, start + FOUR_HOURS) }
    : { from: Math.max(start, end - FOUR_HOURS), to: end };

  // NARROWED TO THE SHIFTS IT ACTUALLY OVERLAPS, and kept as SPANS rather than
  // flattened to one range. Mánu 2026-08-11: "fix the window to only show the
  // shift times."
  //
  // Uribe 07/31 works 8a-9:30a, 10a-12p and 1p-4p, so the last four hours run
  // 12p-4p and 12p-1p is unscheduled - quoting the raw half told him he could
  // put a ten at 12:30p, which the shift check then refuses.
  //
  // Flattening to first-start..last-end has the same fault one level down: his
  // 07/23 first ten would read "10a to 2p" across a 12p-12:15p hole. A break can
  // only go in a span, so the spans are what he is shown.
  const spans = shifts
    .map((s) => ({ from: Math.max(s.from, half.from), to: Math.min(s.to, half.to) }))
    .filter((s) => s.to - s.from >= FULL_REST_MIN);
  return spans.length ? spans : [half];
}

// is a chosen start inside one of the day's shifts, and inside its own window?
// A LUNCH GOES IN A GAP, WHICH IS THE OPPOSITE OF WHERE A TEN GOES.
//
// A rest period is paid and stays ON the clock, so it sits inside a shift. A
// meal is unpaid and OFF it, so the only place one can have happened is a gap
// between two shifts - the punch-out IS the record. That asymmetry is the whole
// reason these are two functions and not one.
//
// OFFERED, NEVER ASSUMED. Mánu 2026-08-12: "The engine should pick up the meal
// breaks if they're called meal breaks. We do not assume that those are meal
// breaks." So a gap of the right length is a candidate the employee can pick,
// not a lunch the sheet declares - and every qualifying gap is offered rather
// than only the longest, because "offer both gaps or let them choose their own
// as long as the time is 30 minutes of availability for lunch."
//
// THIRTY, not the 21 that `parse.js` uses to recognise a meal-shaped gap after
// the fact. Reading a 25 minute gap as somebody's short lunch is one thing;
// telling them they could have taken a lawful half hour in it is another.
export const MEAL_MIN_MINUTES = 30;

export function mealWindows(day, minMinutes = MEAL_MIN_MINUTES) {
  const shifts = shiftsOf(day);
  const out = [];
  for (let i = 1; i < shifts.length; i++) {
    const from = shifts[i - 1].to;
    const to = shifts[i].from;
    if (to - from >= minMinutes) out.push({ from, to });
  }
  return out;
}

// A typed time is accepted only where a full half hour actually fits. Uribe
// 08/02 has gaps of 30 and 225 minutes: the 30 holds a lunch exactly, the 225 is
// unscheduled unpaid time and holds one with room to spare. A day with no gap at
// all offers nothing, because a meal nobody clocked out for is a meal nobody
// could have taken.
// Shaped like `restTimeFits` - {ok, why} rather than a bare boolean - because a
// refusal has to be able to say which rule it broke.
export function mealTimeFits(day, startMin, minutes = MEAL_MIN_MINUTES) {
  const shifts = shiftsOf(day);
  if (!shifts.length) return { ok: true, why: null };   // nothing to judge it by
  if (startMin == null || !Number.isFinite(startMin)) return { ok: false, why: "notime" };
  const windows = mealWindows(day, minutes);
  if (!windows.length) return { ok: false, why: "nogap" };
  const fits = windows.some((w) => startMin >= w.from && startMin + minutes <= w.to);
  return fits ? { ok: true, why: null } : { ok: false, why: "window" };
}

export function restTimeFits(day, ordinal, startMin, minutes = FULL_REST_MIN) {
  const shifts = shiftsOf(day);
  if (!shifts.length) return { ok: true, why: null };   // nothing to judge it by
  const inShift = shifts.some((s) => startMin >= s.from && startMin + minutes <= s.to);
  if (!inShift) return { ok: false, why: "outside" };
  const spans = restWindow(day, ordinal) || [];
  const inWindow = spans.some((w) => startMin >= w.from && startMin + minutes <= w.to);
  return inWindow ? { ok: true, why: null } : { ok: false, why: "window" };
}

// WHAT A DAY NEEDS A TIME FOR, once somebody says they took their breaks.
//
// Mánu 2026-08-10: "we also need to add in the ability for them to pick the
// times if yes. so the new generated time sheet can reflect their answers" -
// and required, "because we need a record of this."
//
// A slot arrives PRE-FILLED only where a real time already exists: a meal the
// roster booked and nobody punched. Everything else is blank, because this
// question is by definition the days where nothing was recorded, and "for the
// ones that are missing entirely, they have to input those in, we cannot
// assume."
//
// THE TENS ALREADY ON RECORD ARE COUNTED AND SHOWN. A day owed two and holding
// one asks for the SECOND, and says so - Mánu 2026-08-11: "that one were
// entitled for two, so it should already show the second one." Asking "your
// ten" on a day that already has one reads as though we lost it.
function slotsFor(day, entry, wantMeal, wantRest, known = []) {
  const out = [];
  if (wantMeal) {
    const m = rosteredMeal(entry);
    // every gap a lawful half hour fits in, offered as something to pick. NOT
    // prefilled - a gap is where a lunch COULD have gone, and the whole point of
    // this question is that nothing recorded where it did.
    const windows = mealWindows(day);
    const asText = windows.map((w) => `${clock(w.from)}-${clock(w.to)}`);
    out.push({
      slot: "meal",
      kindOf: "meal",
      label: "Lunch started",
      minutes: MEAL_MIN_MINUTES,
      // the roster booked it, so it is a time and not a guess
      prefill: m ? clock(m.from) : null,
      source: m ? "schedule" : null,
      // the gaps themselves, so they can pick one or type their own
      options: windows.map((w) => clock(w.from)),
      windows: asText,
      hint: m
        ? "from your schedule - change it if that is not when you went"
        : asText.length
          ? `has to be a half hour inside ${asText.join(" or ")}`
          : "there is no gap in this day long enough to have taken one",
    });
  }
  if (wantRest) {
    const required = day?.restRequired ?? 1;
    const taken = day?.restTaken ?? 0;
    const owed = Math.max(1, required - taken);
    const shifts = shiftsOf(day).map((x) => `${clock(x.from)}-${clock(x.to)}`);
    const ordinalName = (n) =>
      required <= 1 ? "Your ten" : n === 1 ? "First ten" : n === 2 ? "Second ten" : `Ten #${n}`;

    for (let i = 0; i < owed; i++) {
      // the ones already on record come first, so a day holding one asks for #2
      const ordinal = taken + i + 1;
      const spans = restWindow(day, ordinal) || [];
      const asText = spans.map((x) => `${clock(x.from)}-${clock(x.to)}`);
      out.push({
        // POSITION IN THE OWED LIST, which is NOT the ordinal. A day owed two
        // and holding one asks for its SECOND ten in the FIRST owed slot, so
        // this reads `rest1` while the break it is asking about is number two.
        slot: `rest${i + 1}`,
        kindOf: "rest",
        // WHICH TEN THIS IS, carried rather than left to be inferred from the
        // slot name. The server checked `restTimeFits` against a number parsed
        // out of `rest1`, which put a second ten's answer through the FIRST
        // ten's window - so the card offered 1:30p-5:30p, somebody typed 5p, and
        // it came back "outside your shift" against a window of 10a-2p they had
        // never been shown. The label and the window here were already built
        // from this number; only the check was reading the other one.
        ordinal,
        label: ordinalName(ordinal),
        minutes: FULL_REST_MIN,
        // NEVER pre-filled and NEVER suggested. The schedule cannot roster a
        // rest period at all, and the gap it used to offer was unscheduled time
        // this employer does not accept a break in.
        prefill: null,
        source: null,
        suggest: null,
        // the shifts themselves, so they can pick a real time from their own day
        shifts,
        window: asText,
        // what is already on record for the day, and whether it is there
        // because they corrected it
        known: known.map((k) => ({ from: k.from, corrected: !!k.corrected })),
        hint: asText.length
          ? `has to be inside ${asText.join(" or ")}`
          : "no punches on this day to place it against",
      });
    }
  }
  return out;
}

export function buildQuestions(data, { restRows, sourceName } = {}) {
  if (!data) return [];
  const days = data.days || [];
  const dates = new Set(days.map((d) => d.date));
  const dayOf = (date) => days.find((d) => d.date === date) || null;
  // under the spelling the REST REPORT used, which is not always the timesheet's
  // - see `restNameFor`. Resolved here rather than at the five call sites, since
  // every one of them already hands over the `data` that holds the answer.
  const mineKey = restKey(restNameFor(sourceName, data));
  const mine = (restRows || []).filter(
    (r) => restKey(r.name) === mineKey && dates.has(r.date),
  );
  const out = [];

  // ---- ASK, THEN APPLY -----------------------------------------------------

  // 1. a rest entry one mis-picked field would explain. The oldest of the five
  //    and the only one that already had a card.
  // WHICH READING WINS WHEN A ROW HAS TWO. A MECHANICAL FIX BEATS A GUESS AT
  // INTENT, and Martinez 07/23 is why.
  //
  // I had this the other way round for an hour on 2026-08-10: his row flips to
  // 50 minutes on a day with no meal rostered, so a 50 minute lunch looked like
  // the simpler story. THE SERVICE COLUMN SETTLES IT. A rest cannot be logged
  // without a service to hang it on, and his is attached to the 1:40-4:10
  // Toleldo shift with BOTH times inside it. A lunch is not attached to a client
  // service, and his day is 5.92 hours so no meal is owed at all - it is already
  // waived. There is no missing lunch for it to be. Mánu 2026-08-11: "to me that
  // clearly shows it meant to be 3:50-4pm which inside toledo."
  //
  // So a row a single mis-picked field explains is a REPAIR - corrected, applied,
  // counted. The meal question is for a row nothing mechanical explains, on a day
  // that really is short its lunch.
  const mealReadingWins = (r) => {
    const d = dayOf(r.date);
    return !r.repair && isMealLengthRest(r) && !!d?.mealMissing;
  };

  // THE TENS ON RECORD FOR A DATE, with any correction already applied.
  //
  // A stated break carries `replaces`, the recorded row it supersedes, so a ten
  // the report logged at 12p and the employee has since placed at 11:50a shows
  // as 11:50a. Reading the raw row instead makes the card argue with an answer
  // given moments earlier.
  const knownRestsOn = (date) => {
    const d = dayOf(date);
    const stated = (d?.statedBreaks || []).filter((b) => b.kindOf !== "meal" && b.from);
    const supersedes = (r) =>
      stated.find((b) => b.replaces?.from === shortTime(r.out) && b.replaces?.to === shortTime(r.in));
    const rows = mine
      .filter((r) => r.date === date && r.counted && r.out)
      .map((r) => {
        const moved = supersedes(r);
        return moved
          ? { from: moved.from, to: moved.to, corrected: true }
          : { from: shortTime(r.out), to: shortTime(r.in), corrected: false };
      });
    // a stated ten that replaced nothing is one they told us about from scratch
    const extra = stated
      .filter((b) => !b.replaces)
      .map((b) => ({ from: b.from, to: b.to, corrected: true }));
    return [...rows, ...extra];
  };

  // WHAT CONFIRMING ACTUALLY TAKES OFF, and it is not always an hour.
  //
  // Under the flip every one of these arrives with its premium already on the
  // sheet, so "yes" is what removes one - but only where the day still owes it.
  // A blank rest row now COUNTS as a break taken (2026-08-11), which can clear
  // the violation before anybody is asked, and a hard-coded -1 would have
  // promised an hour off a day that was not carrying one. The card quotes this
  // figure to somebody about their own pay, so it has to be the real one.
  const takesOff = (date, kind) => {
    const d = dayOf(date);
    if (!d) return 0;
    return (kind === "meal" ? d.mealViolation === true : d.restViolation === true) ? -1 : 0;
  };

  for (const r of mine) {
    if (!r.repair || mealReadingWins(r)) continue;
    // `both` moves the whole row twelve hours - see `proposeRepair`. Reading it
    // as a single-field fix would leave the untouched end at its recorded value
    // and propose a break running from 11:00 AM to 11:10 PM.
    const both = r.repair.field === "both";
    const fixedOut = both ? r.repair.outTo : r.repair.field === "out" ? r.repair.to : r.out;
    const fixedIn = both ? r.repair.inTo : r.repair.field === "out" ? r.in : r.repair.to;
    out.push({
      kind: "repair",
      date: r.date,
      at: r.out || "",
      moves: takesOff(r.date, "rest"),
      // `minutes` is what it is being COUNTED as; `recordedMinutes` is what the
      // document literally says, which is the number worth putting in front of
      // somebody - twelve hours and ten minutes is its own argument.
      row: {
        out: r.out, in: r.in, derivation: r.derivation,
        minutes: r.repair.minutes, recordedMinutes: r.minutes,
      },
      proposed: { from: fixedOut, to: fixedIn },
      canGiveTime: true,
    });
  }

  // 2. a THIRTY minute entry in the rest report. Ten is a rest, thirty is a
  //    meal, and nothing we hold says which. Saying "meal" takes an hour off
  //    them, so it is asked rather than decided. Hernadez, two days - grouped
  //    into one card but answered per day, because each day is its own hour.
  //    ONLY ON A DAY THAT IS MISSING ITS MEAL. The length window widened on
  //    2026-08-10 from an exact thirty to 21-90, which reaches Hatt's sixty -
  //    and her lunch was rostered and taken at noon. Asking her "was that your
  //    meal?" has no answer behind it and no premium to move. The question
  //    exists because a meal is missing and something meal-shaped is sitting in
  //    the wrong report.
  // TIME ROSTERED AS MISC, OVER TEN MINUTES, WHICH THE DAY WAS NOT CHARGED FOR.
  //
  // Mánu 2026-08-12: "that time is typically used for sick pay and pto. it can
  // be used for work not with a client so we need to ask." The engine has
  // already discounted it - see MISC_COUNTS_UP_TO_MIN - so this question is the
  // only route by which it comes back, and the only one of these that can ADD a
  // premium rather than clear one.
  //
  // NOT ASKED once the answer is known. A reviewer can classify it first, on the
  // grounds that PTO is nothing the employee has to change in QSP and asking
  // them about their own sick day is not a question worth sending.
  for (const d of days) {
    if (!(d.miscBlocks || []).length) continue;
    if (d.miscKind || d.miscWorked) continue;
    out.push({
      kind: "miscTime",
      date: d.date,
      at: d.miscBlocks[0]?.from || "",
      // the only kind here that can put a premium ON. Everything else on this
      // page can only take one off, which is why `moves` is negative elsewhere.
      moves: 1,
      row: {
        blocks: d.miscBlocks.map((b) => ({ from: b.from, to: b.to, minutes: b.min })),
        minutes: d.miscMin || 0,
        hours: Math.round(((d.miscMin || 0) / 60) * 100) / 100,
      },
    });
  }

  for (const r of mine) {
    if (!mealReadingWins(r)) continue;
    const d = dayOf(r.date);
    out.push({
      kind: "restIsMealLength",
      date: r.date,
      at: r.out || "",
      moves: takesOff(r.date, "meal"),
      group: "restIsMealLength",
      row: {
        from: shortTime(r.reversed ? r.in : r.out),
        to: shortTime(r.reversed ? r.out : r.in),
        minutes: r.minutes,
        mealRostered: d?.mealViolation === false,
      },
    });
  }

  // 3. a rest recorded with neither end on it. We cannot tell when it was or
  //    whether it happened, and the day is currently paying a premium for it.
  //    THE BREAK COUNTS NOW; WHAT IS MISSING IS WHEN. Mánu 2026-08-10: "if its
  //    blank it should count as a break but needs to correction ... It's
  //    counted. It just needs the time it started."
  //
  //    So this no longer waits for the day to owe a premium - counting the row
  //    can be exactly what CLEARS the premium, and gating on the violation made
  //    the question vanish the moment it started doing its job. It is asked
  //    whenever a time is missing, and it asks for the start rather than a yes
  //    or no, because there is nothing to agree or disagree with.
  for (const r of mine) {
    if (r.repair || mealReadingWins(r)) continue;
    const missing = [
      String(r.out || "").trim() ? null : "out",
      String(r.in || "").trim() ? null : "in",
    ].filter(Boolean);
    if (!missing.length) continue;
    const d = dayOf(r.date);
    if (!d) continue;
    out.push({
      kind: "restNoTimes",
      date: r.date,
      at: "",
      moves: takesOff(r.date, "rest"),
      row: {
        taken: d.restTaken ?? 0,
        owed: d.restRequired ?? 0,
        hours: r2(d.paidHours),
        punches: (d.punches || []).map((p) => p.raw ?? p),
        // one ? per blank box, so the sheet can draw them where the time should be
        missing,
      },
      // ONE SLOT, THE START. If the OUT time survived we already know when it
      // began and it is offered back; a ten minute rest gives the other end.
      needs: [{
        slot: "rest1",
        kindOf: "rest",
        label: missing.length === 2 ? "Break started" : "Time it started",
        minutes: FULL_REST_MIN,
        prefill: null,
        source: null,
        suggest: String(r.out || "").trim() ? shortTime(r.out) : null,
        hint: missing.length === 2
          ? "neither end was recorded, so we need to know when it began"
          : `the ${missing[0] === "out" ? "start" : "end"} time is missing from the record`,
      }],
      canGiveTime: true,
    });
  }

  // 4. A BREAK TOO LONG TO BE A REST, ON A DAY WHOSE MEAL IS ACCOUNTED FOR.
  //    Hatt 07/20: sixty minutes logged 3:30-4:30 while she was clocked OUT
  //    between two shifts, with her lunch already rostered and taken at noon.
  //    It is not a lunch, it is not a rest, and until now she was asked nothing
  //    at all - the row was simply thrown away and she lost the rest credit.
  //
  //    Deliberately last and deliberately narrow: a row with a repair goes to
  //    the repair question, and a meal-shaped row on a day missing its meal goes
  //    to the meal question. This is what is left.
  for (const r of mine) {
    if (r.counted || r.repair || mealReadingWins(r)) continue;
    if (!(Number(r.minutes) > REST_LONG_MAX_MIN)) continue;
    const d = dayOf(r.date);
    if (!d) continue;
    const onClock = (d.punches || []).some((p, i, all) => {
      if (i % 2) return false;
      const a = p.min ?? null, z = all[i + 1]?.min ?? null;
      const s = clockMin(r.out), e = clockMin(r.in);
      return a != null && z != null && s != null && e != null && s >= a && e <= z;
    });
    // TWO LUNCHES ON ONE DAY, which is what this shape usually is. The row is
    // meal-length and the schedule already rosters a meal, so the day carries
    // two of them and the card has to say so rather than calling the second one
    // "not a break". Mánu 2026-08-12: "if they have 2 lunches then make it be
    // asked if its correct or if it accidentally added in or if one needs to be
    // removed."
    //
    // `mealScheduled` and not `mealMissing`: the first says a lunch was
    // ROSTERED, which is the other lunch. The second is false on a day that
    // needed no lunch at all, and a 5.92 hour day with one long entry is not two
    // lunches.
    const twoLunches = d.mealScheduled === true && isMealLengthRest(r);
    // WHEN THE OTHER LUNCH ACTUALLY WAS.
    //
    // `twoLunches` was a bare boolean, so the card could only say "your schedule
    // has a lunch that day" against "3:30p to 4:30p" - one side a time and the
    // other a sentence fragment, asking somebody to compare them. The rostered
    // times are already on the day's schedule row and were simply never carried.
    const rostered = twoLunches ? rosteredMeal(data.scheduleCheck?.byDate?.[r.date]) : null;
    out.push({
      kind: "restTooLongOffClock",
      date: r.date,
      at: r.out || "",
      moves: 0,
      movesOnDecline: 0,
      row: {
        from: shortTime(r.reversed ? r.in : r.out),
        to: shortTime(r.reversed ? r.out : r.in),
        minutes: r.minutes,
        onClock,
        twoLunches,
        rosteredFrom: rostered ? clock(rostered.from) : null,
        rosteredTo: rostered ? clock(rostered.to) : null,
        rosteredMinutes: rostered ? rostered.to - rostered.from : null,
        hours: r2(d.paidHours),
      },
      canGiveTime: true,
    });
  }

  // ---- APPLY, THEN ASK -----------------------------------------------------

  // 4. A TEN LOGGED OUTSIDE DOCUMENTED WORKING HOURS - before the rostered day,
  //    after it, hard against a service edge, or in an unpaid gap.
  //
  //    BUILT FROM THE REST ROWS, NOT FROM A FLAG ON THE DAY, and that is the
  //    whole reason it works. It read `d.restsOutsideScheduled` first, which
  //    `analyzeDay` sets at UPLOAD - and `rebuildSheetFor` never re-runs
  //    analyzeDay, so on every batch already in the database the flag is absent
  //    and the question could never appear. Aranda has two of these on screen,
  //    hatched, and was asked nothing about either. Mánu 2026-08-11: "why isnt
  //    aranda asked about the hazard colored tens?"
  //
  //    The report rows and the stored punches are enough to work it out, and
  //    both survive on every sheet - which is how `repair`, `restIsMealLength`
  //    and `restNoTimes` have always been built.
  //
  //    THREE OUTCOMES, his words: "she needs to get those hours added unless she
  //    confirms an earlier time in a service, or if she didnt take it at all."
  //
  //      took-then    the ten happened when the record says, off the clock, so
  //                   the minutes are PAID. The default, and what silence keeps.
  //      took-earlier it was really inside her shift - she gives the time, and
  //                   the minutes are not added because they were already paid
  //      not-taken    she never got it. No minutes, AND the rest stops counting
  //                   as taken, which can put a premium on the day.
  const offClockRows = [];
  for (const r of mine) {
    if (!r.counted || r.repair || mealReadingWins(r)) continue;
    const d = dayOf(r.date);
    if (!d) continue;
    const out = clockMin(r.out);
    const inn = clockMin(r.in);
    if (out == null || inn == null || inn <= out) continue;
    // inside a punch pair means they were on the clock for it, so it is already
    // paid and there is nothing to add and nothing to ask
    const punches = (d.punches || []).map((x) => x.min).filter((n) => Number.isFinite(n));
    let onClock = false;
    for (let i = 0; i + 1 < punches.length; i += 2) {
      if (out >= punches[i] && inn <= punches[i + 1]) { onClock = true; break; }
    }
    if (onClock) continue;
    offClockRows.push({ r, d, out, inn, minutes: inn - out });
  }

  // ONE CARD PER DATE. The arithmetic below is unchanged - it just runs over one
  // day's rows at a time instead of every day's at once, and the days are
  // disjoint so the totals still add up to what a single card produced.
  const offClockByDate = new Map();
  for (const x of offClockRows) {
    if (!offClockByDate.has(x.r.date)) offClockByDate.set(x.r.date, []);
    offClockByDate.get(x.r.date).push(x);
  }
  for (const [offClockDate, offClockRows] of offClockByDate) {
    const minutes = offClockRows.reduce((n, x) => n + x.minutes, 0);
    // HOW MANY OF THOSE MINUTES THE STORED DAY ALREADY PAYS. On a sheet built
    // since the flip that is all of them; on one built before it, only the rows
    // the old engine did not read as a mis-click. The patches below work from
    // this rather than assuming, so an answer lands the same figure on a batch
    // uploaded last week and one uploaded today.
    // `addedHours`, NOT `restsOffClockMin`. The two were the same number while
    // the engine paid these minutes on sight, and they came apart on 2026-08-12:
    // `restsOffClockMin` is what the report RECORDED and `addedHours` is what
    // the day actually GAINED. Reading the recorded figure on a sheet built
    // since the reversal said the day already paid all of it, so `moves` came
    // out at zero and the card promised nothing for the answer that adds them.
    //
    // It is also the right number in the floor cases, which the raw minutes
    // never were: `addedHours` is what QSP's printed floor actually let
    // through, so a day being floored up already reads zero here.
    const seenDays = new Set();
    let inPaidHours = 0;
    for (const { d } of offClockRows) {
      if (seenDays.has(d.date)) continue;
      seenDays.add(d.date);
      inPaidHours += d.addedHours || 0;
    }
    const detail = offClockRows.map(({ r, d, out, inn, minutes: m }) => {
      const fit = r.fit || serviceFit(r);
      const svcFrom = fit?.from ?? null;
      const svcTo = fit?.to ?? null;
      // where the assumption would put it: inside the service it was filed
      // under, at the edge it is sitting against
      const inside = svcFrom == null ? null
        : fit.where === "after" ? { from: svcTo - m, to: svcTo }
          : fit.where === "before" ? { from: svcFrom, to: svcFrom + m }
            : null;
      return {
        date: r.date,
        wasFrom: shortTime(r.out), wasTo: shortTime(r.in),
        minutes: m,
        where: fit?.where === "inside" ? "unpaid-gap" : (fit?.where || "unknown"),
        abuts: !!fit?.abuts,
        service: svcFrom != null ? `${clock(svcFrom)}-${clock(svcTo)}` : null,
        from: inside ? clock(inside.from) : null,
        to: inside ? clock(inside.to) : null,
        // whether losing this one would leave the day short a rest
        clearsARest: (d.restTaken ?? 0) <= (d.restRequired ?? 0),
      };
    });
    // one slot per row, so a corrected time lands on the day it belongs to
    const needs = detail.map((x, i) => ({
      slot: `outside${i + 1}`,
      kindOf: "rest",
      date: x.date,
      label: `${x.date} - when did you take it?`,
      minutes: x.minutes,
      prefill: null,
      source: null,
      // WHICH RECORDED ROW THIS ANSWER SUPERSEDES. Without it the sheet draws
      // both - the ten the report logged outside the shift AND the one they say
      // they actually took - so a corrected day shows two rests where there was
      // one. Carried through onto the stored answer so the renderer can drop it.
      replaces: { from: x.wasFrom, to: x.wasTo },
      suggest: x.from || null,
      hint: x.from
        ? `inside your ${x.service} shift that would be ${x.from}`
        : "no shift on this row to point at - you will have to remember",
    }));
    out.push({
      kind: "restOutsideScheduled",
      date: offClockDate,
      dates: [offClockDate],
      // THE DEFAULT NO LONGER PAYS THESE, so it is CONFIRMING that moves the
      // figure and declining that leaves it alone - the exact opposite of the
      // 2026-08-09 flip this replaces. Mánu 2026-08-12: "only add the time once
      // they confirm it was taken there."
      //
      // `inPaid` is what the STORED day already carries, which on a sheet built
      // before 2026-08-12 is all of these minutes and after it is none. The
      // patch works from that rather than assuming, so one answer lands the same
      // hours on a batch uploaded last week and one uploaded today.
      moves: r2(Math.max(0, minutes / 60 - inPaidHours)),
      movesOnDecline: -r2(inPaidHours),
      row: {
        minutes, days: 1, detail, inPaid: Math.round(inPaidHours * 60),
        // A REST LOGGED INSIDE THE ROSTERED LUNCH, which the card never said.
        //
        // `findings.js` has folded this into the same finding for ADMINS since
        // 2026-08-12 - "the lunch is WHY the rest was off the clock, so it
        // belongs in this sentence rather than in another card". That merge only
        // ever happened on our side. The employee's card says the ten was taken
        // after their shift and never mentions that it lands in their lunch, so
        // we tell ourselves one thing and them another about the same minutes.
        //
        // Day-level, like `restsInsideMeal` itself. It is read off the ROSTER
        // while `detail` is read off the punches, so the two can disagree about
        // how many - the wording says "one of these" rather than naming which.
        inLunch: Math.max(0, offClockRows.reduce(
          (n, x) => Math.max(n, x.d.restsInsideMeal || 0), 0,
        )),
      },
      needs,
      needsOn: "no",
      canGiveTime: true,
    });
  }

  // 5. a schedule block the roster calls a meal but which is only rest-length,
  //    credited as the person's rest period. Bucio's midnight ten, and five
  //    Devine days. Declining takes the credit back off, which on a day it
  //    cleared a violation puts the premium back.
  const shortMeal = days.filter((d) => (d.restsFromShortMeals || 0) > 0);
  if (shortMeal.length) {
    const restores = shortMeal.filter(
      (d) => (d.restTaken ?? 0) >= (d.restRequired ?? 0) && (d.restRequired ?? 0) > 0,
    ).length;
    out.push({
      kind: "shortMealRest",
      dates: shortMeal.map((d) => d.date),
      moves: 0,
      movesOnDecline: restores,
      row: { days: shortMeal.length, credited: shortMeal.reduce((n, d) => n + d.restsFromShortMeals, 0) },
    });
  }

  // 7. NOTHING DOCUMENTED AT ALL. Jessica Zermeno punched no break on any of
  //    her twelve days. Under the 2026-08-09 model this is not a finding against
  //    the company: staff map out their own schedules, policy requires them to
  //    enter the rest periods and the lunch the bands entitle them to, and they
  //    signed an acknowledgment saying they would. So we assume it was taken and
  //    charge nothing, and we ask.
  //
  //    IF SHE IGNORES THIS, THE ACKNOWLEDGMENT FORM IS THE ANSWER and no premium
  //    is owed. Answering "no" is what puts one back - and a day can owe two,
  //    one for the meal and one for the rests, per UPS v. Superior Court.
  //    ONE QUESTION PER DAY, not one for the lot. They still render as a single
  //    card - the page groups by kind - but each day is answered on its own,
  //    because each day is its own event and its own hour or two of somebody's
  //    money. Median is 9 days a person and the largest is 13.
  //
  //    THE DAY IS THE UNIT, not the break. A day short both a lunch and its
  //    rests is answered once and charges two hours. 238 of the 432 day
  //    decisions in this batch are that shape, so somebody who got their lunch
  //    and missed only the tens is paid for both - the company over-pays by an
  //    hour rather than under-pays, and they had to say "missed" to get there.
  //    Settled 2026-08-09 late; splitting it needs a second correction kind.
  // 8. A MEAL THAT WAS TAKEN, AND STARTED TOO LATE.
  //
  // The one violation the employee has never been asked about. `mealLate` days
  // are EXCLUDED from the question below - `d.mealViolation && !d.mealLate` -
  // because "did you take your lunch?" is the wrong question when the record
  // says they did. What is actually in doubt is whether the punched time is
  // right, and nothing asked it. 11 of these on the live batch, 13 in July, and
  // an employee has never seen one.
  //
  // The admin control has had both answers since the break answers shipped -
  // `answerOptionsFor({kind: "meal-late"})` returns "Confirm it really was that
  // late" and "The punched time is wrong". This is the same pair from the other
  // end, so the two write one row.
  //
  // WHICH WAY THE MONEY GOES, and it is the usual way round: confirming the
  // record moves nothing, and only a correction does. Saying it really was that
  // late agrees with the sheet, which already carries the premium. Saying the
  // punch is wrong says the meal was on time, and that is what takes it off.
  for (const d of days) {
    if (!d.mealViolation || !d.mealLate) continue;
    const meal = (d.breaks || []).find((b) => b.kind === "meal");
    out.push({
      kind: "mealLate",
      date: d.date,
      at: meal?.start?.raw || "",
      moves: 0,
      movesOnDecline: -1,
      row: {
        // how far into the day it began. "5 hours 30 minutes in" is a fact
        // somebody can check against their own memory; "mealLate" is not.
        lateMinutes: d.mealStartedAfterMin ?? null,
        from: meal?.start?.raw || null,
        to: meal?.end?.raw || null,
        minutes: meal?.min ?? null,
        hours: r2(d.paidHours),
      },
    });
  }

  const mealUndocumented = days.filter((d) => d.mealViolation && !d.mealLate);
  const restUndocumented = days.filter((d) => d.restViolation);
  if (mealUndocumented.length || restUndocumented.length) {
    const dates = [...new Set([
      ...mealUndocumented.map((d) => d.date),
      ...restUndocumented.map((d) => d.date),
    ])].sort();
    const byDate = data.scheduleCheck?.byDate || {};
    for (const date of dates) {
      const meal = mealUndocumented.some((d) => d.date === date);
      const rest = restUndocumented.some((d) => d.date === date);
      // THE BREAK IS THE UNIT NOW, NOT THE DAY. Mánu 2026-08-10: "there has to be
      // option for yes to some as well as no to others."
      //
      // The day was the unit until now, so a day short BOTH a lunch and its tens
      // was one all-or-nothing answer. Somebody who got their lunch and worked
      // through their tens had to claim both to be paid for either: two hours
      // where the truth was one. 238 of the 432 day-decisions in this batch are
      // that shape.
      //
      // Each part is its own question and its own correction row, so each is
      // worth exactly ONE hour on a decline, per UPS v. Superior Court's ceiling
      // of one meal and one rest premium a day. They still render as one card
      // per day - the page groups on `batch` - so this adds decisions, not cards.
      const parts = [];
      if (meal) parts.push("meal");
      if (rest) parts.push("rest");
      for (const part of parts) {
        out.push({
          kind: part === "meal" ? "nothingDocumentedMeal" : "nothingDocumentedRest",
          date,
          at: "",
          // the premium is on the sheet by construction here - this question
          // exists because the day carries the violation - so confirming always
          // takes exactly one hour off, and declining leaves it alone.
          moves: -1,
          movesOnDecline: 0,
          // ANSWERED TOGETHER, WRITTEN TOGETHER. The card sets every day, then
          // commits them in one call and rebuilds the sheet once - thirteen
          // confirm panels and thirteen rebuilds was the alternative.
          batch: "nothingDocumented",
          // ANSWERING "yes" IS NOT ENOUGH ON ITS OWN ANY MORE. Every slot here
          // has to carry a time before the card can be submitted, and the times
          // land on the sheet they then sign. Split per part, so saying "I took
          // my lunch" on a both-day now asks for one time and not three.
          // the tens already held for this date, so the slot can be named
          // "Second ten" and the known one shown beside it.
          //
          // AS CORRECTED, NOT AS RECORDED. If they have already told us a ten
          // was really taken at another time, that is the time on record now -
          // showing the original contradicts the answer they just gave two
          // cards up. Mánu 2026-08-11: "after answering above, this statement
          // needs to be changed cause it contradicts itself."
          needs: slotsFor(
            dayOf(date), byDate[date], part === "meal", part === "rest",
            knownRestsOn(date),
          ),
          row: {
            part,
            meal,
            rest,
            // how many decisions this DAY carries, so the card can show a day
            // once with its parts under it
            parts: parts.length,
            hours: r2((dayOf(date)?.paidHours) || 0),
            // the whole card's shape, carried on every question so the heading can
            // be written without the page re-deriving it
            days: dates.length,
            mealDays: mealUndocumented.length,
            restDays: restUndocumented.length,
          },
        });
      }
    }
  }

  // HOURS FIRST. The order questions are built in is the order the engine
  // happens to check them; the order they are ASKED in has to be the one that
  // does not waste somebody's time. A question whose answer re-derives the day
  // goes above the ones derived from it.
  const ordered = [
    ...out.filter((q) => movesHours(q.kind)),
    ...out.filter((q) => !movesHours(q.kind)),
  ];
  return ordered.map((q) => ({
    ...q, id: questionId(q), mandatory: isMandatory(q.kind), movesHours: movesHours(q.kind),
  }));
}

// ---------------------------------------------------------------------------
// WHAT STILL BLOCKS A SIGNATURE.
//
// Every question blocked signing until 2026-08-11, and that was right while
// silence meant NOT PAID: an unanswered question was an hour the employee might
// be owed and was not getting, so making them answer protected them. The flip
// turns that on its head. Silence now leaves every hour ON the sheet, so
// demanding an answer before somebody can sign is demanding they work through a
// card whose only possible outcome is less pay. Measured on the live batch:
// 664 of the 678 hours sit behind questions of exactly that shape.
//
// So only two things still block, and neither is about money:
//
//   WE CHANGED THE DOCUMENT   a punch we repaired. The sheet in front of them is
//                             not what their report said, and they should not
//                             sign that without being told.
//   WE COULD NOT READ IT      a rest entry with no times on it. Nobody can say
//                             what happened, so the record needs a person.
//
// Measured: 54 of 59 could sign straight away, 5 gated on 6 questions.
//
// A KIND NOT NAMED HERE DEFAULTS TO MANDATORY. The safe failure is asking too
// much - a new kind that quietly becomes optional is a discrepancy somebody
// signs past without ever seeing it, and that is worse than one extra card.
const OPTIONAL_KINDS = new Set([
  // the break premiums. Silence leaves the pay on.
  "nothingDocumented", "nothingDocumentedMeal", "nothingDocumentedRest",
  "restIsMealLength",
  // the two policy assumptions. Silence leaves the minutes on.
  "restOutsideScheduled",
  // a meal that WAS taken, just late. Silence leaves the premium on, exactly
  // like the others, so there is nothing here worth holding a signature for.
  "mealLate",
  // a correction that moves nothing either way, and one the employee can dispute
  // afterwards without a figure hanging on it
  "restTooLongOffClock", "shortMealRest",
]);

export const isMandatory = (kind) => !OPTIONAL_KINDS.has(kind);

// the questions somebody must settle before a sheet can be generated, and the
// ones they may simply ignore. Every surface that gates a signature reads this
// rather than counting questions, so the page, the popup and the server action
// cannot disagree about who is allowed to sign.
export function signingGate(questions, corrections) {
  const rows = (corrections || []).filter(
    (c) => String(c.kind || "").startsWith("q_") && c.status !== "open",
  );
  const answered = (q) =>
    rows.some((c) => c.kind === `q_${q.kind}` && (q.dates || [q.date]).includes(c.date));
  const all = questions || [];
  const required = all.filter((q) => q.mandatory ?? isMandatory(q.kind));
  const outstanding = required.filter((q) => !answered(q));
  const optionalOpen = all.filter((q) => !(q.mandatory ?? isMandatory(q.kind))).filter((q) => !answered(q));
  return {
    // A SHEET IS SIGNABLE AT ANY TIME. Mánu 2026-08-12.
    //
    // This used to be `outstanding.length === 0`, so an unanswered mandatory
    // question held the signature up and the page said so - "you cannot sign
    // until every day has an answer". The premise was that a question we could
    // not read had to be settled before anybody signed off on the figures.
    //
    // It does not survive the 2026-08-11 flip. Leaving a question alone now
    // keeps the pay ON: silence is the answer that costs the employee nothing,
    // and every card says so. Blocking the signature on silence therefore held
    // somebody's timesheet hostage to a question whose safe answer they had
    // already given by not touching it.
    //
    // `outstanding` is still counted and still returned - the questions are
    // still asked, and a surface that wants to say how many are open can - it
    // simply no longer decides who may sign. Nothing enforced this server-side,
    // so this is the whole of the gate.
    canSign: true,
    blocking: 0,
    // still open and still mandatory, for anything that wants to report it
    unanswered: outstanding.length,
    // what the reassurance popup counts. Ignoring these is the safe choice.
    optionalOpen: optionalOpen.length,
  };
}

// HOW FAR THROUGH THEIR QUESTIONS ONE PERSON IS.
//
// COUNTED PER QUESTION, NOT PER KIND, and that distinction is the whole reason
// this exists. Every screen used to do `new Set(corrections.map(c => c.kind)).size`
// against `buildQuestions(...).length`. That agrees only while every kind is a
// single question - it was already wrong for Hernadez, whose two thirty minute
// entries are two questions of one kind, so she would have read "waiting on 1 of
// 2" for ever after answering both. Splitting `nothingDocumented` per day makes
// it wrong for 53 of the 59.
//
// A GROUPED question owns several dates and one answer, so any answered date
// settles it. An ungrouped one owns exactly its own date.
export function answerProgress(questions, corrections) {
  const rows = (corrections || []).filter(
    (c) => String(c.kind || "").startsWith("q_") && c.status !== "open",
  );
  const hit = (q) =>
    rows.find(
      (c) => c.kind === `q_${q.kind}` && (q.dates || [q.date]).includes(c.date),
    ) || null;
  const seen = (questions || []).map(hit);
  return {
    asked: (questions || []).length,
    answered: seen.filter(Boolean).length,
    declined: seen.filter((c) => c?.status === "declined").length,
    // nothing left to ask this person, so nothing else can move their figure
    settled: seen.every(Boolean),
  };
}

// what one answer does to the day rows it covers, as an override patch.
// Returned per date so the caller can merge them; nothing here touches the
// database or knows what a Prisma client is.
export function patchesFor(question, choice, day) {
  const yes = choice === "yes";
  switch (question.kind) {
    // WHAT THE MISC TIME ACTUALLY WAS.
    //
    // Four answers, and only one of them moves a figure. "worked" puts the time
    // back into the stretch it sits in, which re-earns the rests and the meal
    // that stretch is owed, which can put a premium ON. The other three leave
    // the day exactly as the engine already had it and are recorded because
    // "PTO" and "sick pay" and "a ten I could not fit in my service hours" are
    // three different facts, not three spellings of "not work".
    //
    // THE ENTITLEMENT IS RECOMPUTED HERE, not left to a rebuild. `analyzeDay`
    // reads `miscWorked` at the top and never runs again on a stored batch, so
    // an answer that only set the flag would change nothing anybody could see.
    // Every field written here is on the `applyOverrides` whitelist - check it
    // before adding a fifth.
    case "miscTime": {
      // THREE ANSWERS, WHICH IS WHAT THE CARD CAN ACTUALLY SHOW. It was drafted
      // with four - the fourth being "a ten I could not fit in my service hours"
      // - and Mánu cut it to PTO, sick pay, worked hours. That is the better
      // shape as well as the buildable one: `MISC_COUNTS_UP_TO_MIN` already lets
      // a block of ten minutes or less through as worked time, so a block over
      // ten minutes is by definition not a ten, and the option could only ever
      // have appeared beside something it does not describe.
      //
      // `yes` and `no` are the card's own two, and `third.value` is "worked".
      // The reviewer path writes "pto" / "sick" / "worked" straight through
      // without a card, which is why both spellings are accepted here.
      const kind =
        choice === "yes" ? "pto"
          : choice === "no" ? "sick"
            : choice;
      // THE FLAG IS THE WHOLE ANSWER NOW, and that is a change of 2026-08-12.
      //
      // This used to work the entitlement out here and write four more fields,
      // for the reason the note above still gave: `analyzeDay` read `miscWorked`
      // at the top and never ran again on a stored batch, so an answer that only
      // set the flag would have changed nothing anybody could see.
      //
      // `rebuildSheetFor` re-runs the engine now, so that is no longer true, and
      // computing it here was not merely redundant - it was WRONG on 3 of the 33
      // real Misc days. `mealViolation` here was `mealRequired && mealScheduled
      // !== true`, which ignores the waiver, the late meal and the second meal
      // that the engine's own `mealViolation` folds in. Cain 07/30 came out
      // under-charged and Stafford 07/20 and 07/27 over-charged, and the patch
      // won, because `applyOverrides` writes after the re-analysis.
      //
      // The entitlement also came from `workGroupsFor(punches, [], ...)` with an
      // EMPTY block list, because this function cannot see `scheduleBlocks`. The
      // re-analysis can. So the answer records what the time WAS and the engine
      // decides what that costs, which is the only arrangement where one rule
      // has one implementation.
      return { miscKind: kind, miscWorked: kind === "worked" };
    }
    case "repair":
      // A CONFIRMED REPAIR IS A BREAK THAT HAPPENED, so it is counted as one.
      //
      // Mánu 2026-08-12 on Dinley 08/07: "she has both in. One of them is an
      // AM/PM slip, so it should be counted as a break."
      //
      // Clearing `restViolation` alone left the day reading `restTaken: 1` of 2
      // - so the sheet said one rest short while charging nothing for it, and
      // `reentitle` then recomputed the violation straight back from that count.
      // Counting the ten is what makes the day internally consistent: two of two
      // taken, no violation, and nothing left for the re-derivation to disagree
      // with.
      return yes
        ? { restViolation: false, restTaken: (day?.restTaken ?? 0) + 1 }
        : { restViolation: null };
    case "restIsMealLength":
      // "yes, that was my meal" - the day's meal was taken, so no meal premium
      return yes ? { mealViolation: false } : { mealViolation: null };
    case "restNoTimes":
      // "yes, I took it" - no rest premium owed for the day
      return yes ? { restViolation: false } : { restViolation: null };
    case "restOutsideScheduled": {
      // THREE OUTCOMES, and the figure is worked out as an ABSOLUTE rather than
      // a delta. Mánu 2026-08-11: "she needs to get those hours added unless she
      // confirms an earlier time in a service, or if she didnt take it at all."
      //
      // The stored day may or may not already pay these minutes - a sheet built
      // since the flip does, one built before it only pays the rows the old
      // engine did not read as a mis-click. Subtracting a delta would land on a
      // different figure depending on when the batch was uploaded, so the
      // question carries `inPaid` and the target is computed from it.
      const rows = (question.row?.detail || []).filter((x) => x.date === day?.date);
      const mins = rows.reduce((n, x) => n + (x.minutes || 0), 0);
      // exactly how many of these minutes the stored day already pays: all of
      // them on a sheet built since the flip, only the non-mis-click ones on a
      // sheet built before it
      // WHAT THE DAY WOULD PAY WITH NO ADDITION AT ALL, which is the only stable
      // thing to build an absolute on. This read `restsOffClockMin`, the
      // RECORDED minutes - true of what the day paid only while the engine paid
      // them on sight. Since 2026-08-12 it pays none of them by default, so
      // subtracting the recorded figure took off ten minutes that were never
      // there: confirming landed back where it started and declining went
      // BELOW the worked hours.
      //
      // `addedHours` is defined as `paidHours - withFloor(paidMin - offClock)`,
      // so this is exact under both policies and in the floor cases too.
      const base = (day?.paidHours || 0) - (day?.addedHours || 0);
      // the RECORDED off-clock minutes, which is a different number and still
      // the right one for the counters below - they describe what the report
      // holds, not what the day paid for it
      const already = day?.restsOffClockMin || 0;

      // "No, it was not a mistake - I took it then." Off the clock, so the
      // minutes become pay, AND `addedHours` has to be SET rather than left
      // alone: since 2026-08-12 the day adds nothing on its own, so it arrives
      // here at zero and the sheet's "added" line is drawn from it. Before the
      // reversal this branch could stay silent because the minutes were already
      // in both figures.
      //
      // The arithmetic is unchanged and deliberately absolute - `base` strips
      // whatever the stored day happened to pay - so this lands the same hours
      // on a sheet built before the reversal and one built after it.
      if (yes) {
        return {
          paidHours: r2(Math.max(0, base + mins / 60)),
          addedHours: r2(mins / 60),
        };
      }

      // THE MINUTES STOP BEING OFF-CLOCK TIME, and everything the sheet draws
      // from that has to follow. `restsOffClock*` is what stripes the cell and
      // `addedHours` is what prints "+0.17 added" beneath it - leave them and a
      // corrected day still declares minutes it is no longer paying.
      const offClock = {
        restsOffClock: Math.max(0, (day?.restsOffClock ?? 0) - rows.length),
        restsOffClockMin: Math.max(0, already - mins),
        addedHours: r2(Math.max(0, (day?.addedHours || 0) - mins / 60)),
      };

      // "I did not take it at all" - no minutes, AND the rest stops counting as
      // taken, which is what can put a premium on the day. Aranda 07/31 reads
      // 1 of 1 today; without this she says she never got her break and the
      // sheet carries on saying she did.
      if (choice === "notaken") {
        const taken = Math.max(0, (day?.restTaken ?? 0) - rows.length);
        return {
          paidHours: r2(Math.max(0, base)),
          ...offClock,
          restTaken: taken,
          restViolation: taken < (day?.restRequired ?? 0),
        };
      }

      // "I took it during a shift" - it was already paid as worked time, so
      // nothing is added and the break still counts, at the time they gave.
      return { paidHours: r2(Math.max(0, base)), ...offClock };
    }
    case "nothingDocumented":
      // "Yes, I took them" - they took them and did not write them down, so the
      // premium comes off. "No" agrees with what the day already says, so the
      // patch clears any override rather than adding one.
      //
      // ONLY WHAT THIS DAY WAS ACTUALLY ASKED ABOUT. A day can owe a rest under
      // this question AND carry a meal premium the SCHEDULE documented - a lunch
      // rostered and punched that began after the fifth hour. Clearing both
      // flags took that documented hour off too: Aranda answering "yes I took my
      // tens" on 07/29 and 07/30 dropped her from 19.00 to 0.00 when the honest
      // answer is 2.00. Found 2026-08-10 by rendering the round trip.
      return yes
        ? {
            mealViolation: question.row?.meal ? false : null,
            restViolation: question.row?.rest ? false : null,
          }
        : { mealViolation: null, restViolation: null };
    // THE SPLIT PAIR. Each touches ONLY its own flag, which is what lets two
    // answers on the same date merge instead of overwriting each other - the
    // rebuild in answerTimesheetQuestion drops nulls and spreads what is left,
    // so "took my lunch" and "missed my tens" land as one day with one premium.
    case "nothingDocumentedMeal":
      return yes ? { mealViolation: false } : { mealViolation: null };
    case "nothingDocumentedRest":
      return yes ? { restViolation: false } : { restViolation: null };
    case "shortMealRest": {
      // declining takes the credited rest back off. The count follows the
      // premium so the printed figure and the charge cannot disagree.
      if (yes) return { restTaken: null, restViolation: null };
      const taken = Math.max(0, (day?.restTaken ?? 0) - (day?.restsFromShortMeals || 0));
      return { restTaken: taken, restViolation: taken < (day?.restRequired ?? 0) };
    }
    case "mealLate":
      // "Yes, it really was that late" AGREES WITH THE RECORD, so nothing moves -
      // the sheet already carries the premium for it. "No, I went on time" says
      // the punch is what is wrong, and that is the correction: the meal was
      // taken inside the fifth hour, so the day owes nothing for it.
      //
      // `mealLate` is cleared alongside `mealViolation` rather than left behind.
      // The flag is what the SHEET prints beside the day and what the next
      // rebuild reads to decide the violation again - clearing one without the
      // other leaves a day charging nothing while still declaring the fault.
      return yes ? {} : { mealViolation: false, mealLate: false };
    case "restTooLongOffClock":
      // NEITHER ANSWER MOVES A FIGURE, and this case exists to say so out loud.
      // It was falling through to the default, which is indistinguishable from a
      // kind somebody forgot - and forgetting one is silent, because the default
      // patches nothing and nothing errors. Spelled out so "no case" can only
      // ever mean "nobody wrote one".
      return {};
    default:
      return {};
  }
}
