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
  "restOutsideScheduled", "shortMealRest",
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
    const fixedOut = r.repair.field === "out" ? r.repair.to : r.out;
    const fixedIn = r.repair.field === "out" ? r.in : r.repair.to;
    out.push({
      kind: "repair",
      date: r.date,
      at: r.out || "",
      moves: takesOff(r.date, "rest"),
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

  // 4. A TEN LOGGED OUTSIDE DOCUMENTED WORKING HOURS - before the rostered day,
  //    after it, hard against a service edge, or in an unpaid gap. One question
  //    since 2026-08-11, where there were three separate readings of the same
  //    event and one of them asked nothing at all.
  //
  //    ONE card for the lot: April Martinez has eleven identical 7:00-7:10 rows
  //    and eleven cards would be unusable. It is one habit, not eleven decisions.
  //
  //    THE MINUTES ARE PAID UNTIL THEY SAY THE TIME WAS WRONG. Mánu 2026-08-11:
  //    "they'll get that additional ten minutes if it is [correct] ... They also
  //    gotta input the time if it was wrong, so the new generated time sheet can
  //    be corrected."
  //
  //    SO THE POLARITY IS THE OTHER WAY ROUND FROM THE BREAK QUESTIONS, and that
  //    is deliberate rather than an oversight. Everywhere else "yes I took it"
  //    removes a premium. Here the question is "was that the right time?", so
  //    YES agrees with the sheet and keeps the ten, and NO is the correction that
  //    takes it off. The rule that actually holds across all of them is: an
  //    answer that CONFIRMS the record never moves money, and only a correction
  //    does. Silence keeps the pay either way.
  const outside = days.filter((d) => (d.restsOutsideScheduled || 0) > 0);
  if (outside.length) {
    const minutes = outside.reduce((n, d) => n + (d.restsOutsideScheduledMin || 0), 0);
    const detail = outside.flatMap((d) =>
      (d.restsOutsideScheduledDetail || []).map((x) => ({ date: d.date, ...x })));
    // one slot per row, so a corrected time lands on the day it belongs to
    // rather than being applied to all eleven of April's at once
    const needs = detail.map((x, i) => ({
      slot: `outside${i + 1}`,
      kindOf: "rest",
      date: x.date,
      label: `${x.date} - when did you actually take it?`,
      minutes: x.minutes,
      prefill: null,
      source: null,
      // where the service says it should have been, offered as one tap. Only
      // where the report gave us a shift to put it in.
      suggest: x.from || null,
      hint: x.from
        ? `your ${x.service} shift that day - tapping this puts it at ${x.from}`
        : "we have no shift on this row to point at, so you will have to remember",
    }));
    out.push({
      kind: "restOutsideScheduled",
      dates: outside.map((d) => d.date),
      // confirming the record changes nothing; correcting it takes the time off
      moves: 0,
      movesOnDecline: -r2(minutes / 60),
      row: { minutes, days: outside.length, detail },
      // asked only when they say the time was wrong
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

  return out.map((q) => ({ ...q, id: questionId(q), mandatory: isMandatory(q.kind) }));
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
    // nothing left that has to be settled, so they may sign
    canSign: outstanding.length === 0,
    blocking: outstanding.length,
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
    case "repair":
      // unchanged behaviour: yes clears the rest violation for the day
      return yes ? { restViolation: false } : { restViolation: null };
    case "restIsMealLength":
      // "yes, that was my meal" - the day's meal was taken, so no meal premium
      return yes ? { mealViolation: false } : { mealViolation: null };
    case "restNoTimes":
      // "yes, I took it" - no rest premium owed for the day
      return yes ? { restViolation: false } : { restViolation: null };
    case "restOutsideScheduled":
      // THE OTHER WAY ROUND FROM THE REST OF THEM, on purpose. This asks "was
      // that the right time?", so confirming keeps the ten where it is and
      // DECLINING is the correction that takes the minutes back off. Mánu
      // 2026-08-11: "they'll get that additional ten minutes if it is [correct]
      // ... they also gotta input the time if it was wrong."
      return yes
        ? { paidHours: null }
        : { paidHours: r2(Math.max(0, (day?.paidHours || 0) - (day?.restsOutsideScheduledMin || 0) / 60)) };
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
