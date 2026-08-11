// The questions one employee is asked before they can sign.
//
// ONE PLACE DECIDES WHAT A QUESTION IS. The page renders from this, the server
// action re-derives from this to check an answer it is handed, and the email
// describes the same list. A client cannot invent a question, and the page and
// the email cannot drift apart - that is the same reason `buildEmployeeChecks`
// is the single classifier for the "things to check" cards.
//
// EVERY ONE OF THESE BLOCKS SIGNING. Mánu 2026-08-09: "they should only be able
// to sign it if they confirm the choices since we assumed best case scenarios
// for least premium hours and hours overall owed." The engine has already taken
// the cheapest reading in each case, so the reading does not stand until the
// person whose pay it is says so.
//
// TWO SHAPES OF QUESTION, and the difference is which way the money moves:
//
//   ASK-THEN-APPLY   nothing has changed yet. Confirming REMOVES a premium.
//                    repair, restIsMealLength, restNoTimes.
//   APPLY-THEN-ASK   the engine already corrected it and the sheet arrives
//                    changed. Confirming changes nothing; DECLINING puts the
//                    money back. restOutsideShift, shortMealRest.
//
// The second shape is why declining has to rebuild the sheet.

import {
  restKey, isMealLengthRest, clockMin, FULL_REST_MIN, REST_LONG_MAX_MIN,
} from "./rests.js";
import { shortTime, scheduleGaps, rosteredMeal } from "./recorded-breaks.js";

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
const GROUPED = new Set([
  "restOutsideShift", "shortMealRest", "restSnappedToShift",
]);
export const questionId = (q) =>
  GROUPED.has(q.kind) ? q.kind : `${q.kind}:${q.date}:${q.at || ""}`;

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

// WHAT A DAY NEEDS A TIME FOR, once somebody says they took their breaks.
//
// Mánu 2026-08-10: "we also need to add in the ability for them to pick the
// times if yes. so the new generated time sheet can reflect their answers" -
// and required, "because we need a record of this."
//
// A slot arrives PRE-FILLED only where a real time already exists: a meal the
// roster booked and nobody punched. 20 of 855 across this batch. Everything
// else is blank, because this question is by definition the days where nothing
// was recorded, and "for the ones that are missing entirely, they have to input
// those in, we cannot assume."
//
// A schedule GAP is offered beside an empty box as a one-tap suggestion, not a
// value. 506 of the 597 tens have one. Tapping it is the employee choosing a
// time; the slot records which of the three it was so the sheet can say.
function slotsFor(day, entry, wantMeal, wantRest) {
  const out = [];
  if (wantMeal) {
    const m = rosteredMeal(entry);
    out.push({
      slot: "meal",
      kindOf: "meal",
      label: "Lunch started",
      minutes: 30,
      // the roster booked it, so it is a time and not a guess
      prefill: m ? clock(m.from) : null,
      source: m ? "schedule" : null,
      hint: m ? "from your schedule - change it if that is not when you went" : null,
    });
  }
  if (wantRest) {
    const gaps = scheduleGaps(entry);
    const owed = Math.max(1, (day?.restRequired ?? 1) - (day?.restTaken ?? 0));
    for (let i = 0; i < owed; i++) {
      const g = gaps[i] || null;
      out.push({
        slot: `rest${i + 1}`,
        kindOf: "rest",
        label: owed === 1 ? "Your ten" : i === 0 ? "First ten" : i === 1 ? "Second ten" : `Ten #${i + 1}`,
        minutes: 10,
        // NEVER pre-filled. The schedule cannot roster a rest period at all.
        prefill: null,
        source: null,
        suggest: g ? clock(g.from) : null,
        hint: g
          ? `your schedule has a gap ${clock(g.from)}-${clock(g.to)}`
          : "no gap on your schedule to point at - you will have to remember",
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
  const mine = (restRows || []).filter(
    (r) => restKey(r.name) === restKey(sourceName || "") && dates.has(r.date),
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

  for (const r of mine) {
    if (!r.repair || mealReadingWins(r)) continue;
    const fixedOut = r.repair.field === "out" ? r.repair.to : r.out;
    const fixedIn = r.repair.field === "out" ? r.in : r.repair.to;
    out.push({
      kind: "repair",
      date: r.date,
      at: r.out || "",
      moves: -1,
      row: { out: r.out, in: r.in, derivation: r.derivation, minutes: r.repair.minutes },
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
  for (const r of mine) {
    if (!mealReadingWins(r)) continue;
    const d = dayOf(r.date);
    out.push({
      kind: "restIsMealLength",
      date: r.date,
      at: r.out || "",
      moves: -1,
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
      moves: -1,
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
        hours: r2(d.paidHours),
      },
      canGiveTime: true,
    });
  }

  // ---- APPLY, THEN ASK -----------------------------------------------------

  // 4. rests recorded entirely outside the rostered day, read as a MISCLICK and
  //    NOT paid. April Martinez, eleven days of 7:00-7:10 against an 8:00 start.
  //    ONE card for all of them: eleven identical cards would be unusable, and
  //    it is one habit, not eleven decisions.
  //
  //    DECLINING PUTS THE MINUTES BACK. If she really did take a break at 7:00
  //    before clocking in, those minutes were worked off the clock and are owed.
  const misclicked = days.filter((d) => (d.restsMisclicked || 0) > 0);
  if (misclicked.length) {
    const minutes = misclicked.reduce((n, d) => n + (d.restsMisclickedMin || 0), 0);
    out.push({
      kind: "restOutsideShift",
      dates: misclicked.map((d) => d.date),
      moves: 0,          // confirming changes nothing; declining ADDS
      movesOnDecline: r2(minutes / 60),
      row: { minutes, days: misclicked.length },
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

  // 6. a rest clocked the instant a shift ended, moved back inside the shift.
  //    Mánu's own three at 12:00-12:10 against a shift ending at 12:00, plus
  //    Aranda, Jones and Lazo. DECLINING pays the minutes back and flags the
  //    entry: "i would be granted the 0.17 minutes to my pay and any premium as
  //    a result if the conditions are met".
  const snapped = days.filter((d) => (d.restsSnapped || 0) > 0);
  if (snapped.length) {
    const minutes = snapped.reduce((n, d) => n + (d.restsSnappedMin || 0), 0);
    const detail = snapped.flatMap((d) =>
      (d.restsSnappedDetail || []).map((x) => ({ date: d.date, ...x })));
    out.push({
      kind: "restSnappedToShift",
      dates: snapped.map((d) => d.date),
      moves: 0,
      movesOnDecline: r2(minutes / 60),
      row: { minutes, days: snapped.length, detail },
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
          moves: 0,
          movesOnDecline: 1,
          // ANSWERED TOGETHER, WRITTEN TOGETHER. The card sets every day, then
          // commits them in one call and rebuilds the sheet once - thirteen
          // confirm panels and thirteen rebuilds was the alternative.
          batch: "nothingDocumented",
          // ANSWERING "yes" IS NOT ENOUGH ON ITS OWN ANY MORE. Every slot here
          // has to carry a time before the card can be submitted, and the times
          // land on the sheet they then sign. Split per part, so saying "I took
          // my lunch" on a both-day now asks for one time and not three.
          needs: slotsFor(dayOf(date), byDate[date], part === "meal", part === "rest"),
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

  return out.map((q) => ({ ...q, id: questionId(q) }));
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
    case "repair":
      // unchanged behaviour: yes clears the rest violation for the day
      return yes ? { restViolation: false } : { restViolation: null };
    case "restIsMealLength":
      // "yes, that was my meal" - the day's meal was taken, so no meal premium
      return yes ? { mealViolation: false } : { mealViolation: null };
    case "restNoTimes":
      // "yes, I took it" - no rest premium owed for the day
      return yes ? { restViolation: false } : { restViolation: null };
    case "restOutsideShift":
      // confirming leaves our correction alone. Declining says the entry was
      // right and the break really was taken off the clock, so the minutes are
      // owed after all and go back on the day.
      return yes
        ? { paidHours: null }
        : { paidHours: r2((day?.paidHours || 0) + (day?.restsMisclickedMin || 0) / 60) };
    case "nothingDocumented":
      // "Yes, that is correct" - they took them and did not write them down, so
      // nothing is owed. "No" puts the premium back on the day, which is what
      // the violation flags already say, so the patch clears any override
      // rather than adding one.
      //
      // ONLY WHAT THIS DAY WAS ACTUALLY ASKED ABOUT. A day can owe a rest under
      // this question AND carry a meal premium the SCHEDULE documented - a lunch
      // rostered and punched that began after the fifth hour. Clearing both
      // flags took that documented hour off too: Aranda answering "yes I took my
      // tens" on 07/29 and 07/30 dropped her from 19.00 to 0.00 when the honest
      // answer is 2.00. Found 2026-08-10 by rendering the round trip; it dates
      // from when this was one grouped question.
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
    case "restSnappedToShift":
      // confirming leaves the move alone. Declining says they really did take it
      // after clocking out, so the minutes are owed and go back on - and the
      // entry gets flagged for payroll as a mis-entered ten.
      return yes
        ? { paidHours: null }
        : { paidHours: r2((day?.paidHours || 0) + (day?.restsSnappedMin || 0) / 60) };
    case "shortMealRest": {
      // declining takes the credited rest back off. The count follows the
      // premium so the printed figure and the charge cannot disagree.
      if (yes) return { restTaken: null, restViolation: null };
      const taken = Math.max(0, (day?.restTaken ?? 0) - (day?.restsFromShortMeals || 0));
      return { restTaken: taken, restViolation: taken < (day?.restRequired ?? 0) };
    }
    default:
      return {};
  }
}
