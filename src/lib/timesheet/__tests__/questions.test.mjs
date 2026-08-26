// The questions an employee is asked before signing, and what each answer does
// to the figures.
//
// The point of this file is the SHAPE of each question, and above all WHICH WAY
// THE MONEY MOVES. That reversed on 2026-08-11: the sheet now arrives carrying
// every fault with its penalty, so "yes I took it" is what takes pay OFF and
// "no" agrees with what the sheet already says. Getting this backwards would
// quietly hand somebody less than they are owed, which is why the direction is
// asserted rather than just the arithmetic.
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildQuestions, patchesFor, answerProgress, dependencyGate, restWindow, restTimeFits, shiftsOf,
  questionId,
} from "../questions.js";

const day = (over = {}) => ({
  date: "07/20/26", paidHours: 8.17, restTaken: 2, restRequired: 2,
  restViolation: false, mealViolation: false, punches: ["8a", "5p"], ...over,
});

// ---------------------------------------------------------------- April's shape

// A ten the report records while they were NOT clocked in. Built from the rest
// rows and the stored punches, never from a flag `analyzeDay` sets at upload -
// that flag is absent on every batch already in the database, so the question
// could never appear on one. Aranda had two of these on screen and was asked
// nothing about either.
const offClockRow = (date, out, inn, shift) => ({
  name: "Martinez, April", date, out, in: inn, minutes: 10, counted: true, shift,
});
const punchedDay = (over = {}) => day({
  punches: [{ min: 8 * 60 }, { min: 17 * 60 }], restTaken: 1, restRequired: 2, ...over,
});

test("a ten recorded off the clock is asked about, from the rows and the punches", () => {
  const days = [punchedDay({ date: "07/16/26" }), punchedDay({ date: "07/17/26" })];
  const restRows = [
    offClockRow("07/16/26", "7:00 AM", "7:10 AM", "8:00 AM to 11:00 AM"),
    offClockRow("07/17/26", "7:00 AM", "7:10 AM", "8:00 AM to 11:00 AM"),
  ];
  const qs = buildQuestions({ days }, { restRows, sourceName: "Martinez, April" });
  const outside = qs.filter((q) => q.kind === "restOutsideScheduled");

  // ONE CARD PER DATE since 2026-08-12. A ten logged after the 16th's shift is a
  // different event from one logged after the 17th's, and the day-by-day view
  // has to be able to put each on its own day rather than hang both on the first
  // and tell the second where it went.
  assert.equal(outside.length, 2, "one card per date");
  assert.deepEqual(outside.map((q) => q.date), ["07/16/26", "07/17/26"]);
  assert.deepEqual(outside[0].dates, ["07/16/26"]);
  assert.equal(outside[0].row.days, 1);
  // the minutes SPLIT rather than sum - 10 each, where one card carried 20
  assert.equal(outside[0].row.minutes, 10);
  assert.equal(outside[1].row.minutes, 10);
  assert.equal(outside[0].row.detail[0].where, "before", "before the shift it was filed under");
  assert.equal(outside[0].row.detail[0].from, "8a", "and inside it would start at 8a");
  // and each carries its own id, or one answer would settle the other
  assert.notEqual(questionId(outside[0]), questionId(outside[1]));

  // THE ONE THAT MUST NOT FIRE: the same ten while clocked in is already paid,
  // so there is nothing to add and nothing to ask.
  const onClock = buildQuestions(
    { days: [punchedDay({ date: "07/16/26" })] },
    { restRows: [offClockRow("07/16/26", "10:00 AM", "10:10 AM", "8:00 AM to 11:00 AM")], sourceName: "Martinez, April" },
  );
  assert.equal(onClock.filter((q) => q.kind === "restOutsideScheduled").length, 0);
});

test("the three outcomes land three different figures", () => {
  // Mánu 2026-08-11: "she needs to get those hours added unless she confirms an
  // earlier time in a service, or if she didnt take it at all."
  const q = {
    kind: "restOutsideScheduled",
    row: { detail: [{ date: "07/31/26", minutes: 10 }] },
  };
  // a sheet built BEFORE the flip: the ten was withheld, so paidHours is 5.00
  // and `restsOffClockMin` is 0. Aranda 07/31 exactly.
  const old = day({ date: "07/31/26", paidHours: 5, restsOffClockMin: 0, restTaken: 1, restRequired: 1 });
  assert.equal(patchesFor(q, "yes", old).paidHours, 5.17, "took it then - the minutes are pay");
  assert.equal(patchesFor(q, "no", old).paidHours, 5, "took it earlier - already paid as worked time");

  const never = patchesFor(q, "notaken", old);
  assert.equal(never.paidHours, 5, "never took it - no minutes");
  assert.equal(never.restTaken, 0, "and it stops counting as a break she had");
  assert.equal(never.restViolation, true, "which is what puts the premium on");

  // THE SAME ANSWERS ON A SHEET BUILT BETWEEN THE TWO FLIPS, where the ten was
  // paid on sight. A delta would have landed 5.34 here; an absolute lands 5.17.
  //
  // `addedHours` is what says the day PAID them - a real stored day always has
  // it, and the patch reads it rather than `restsOffClockMin`, which only says
  // the report recorded them.
  const flipped = day({
    date: "07/31/26", paidHours: 5.17, restsOffClockMin: 10, addedHours: 0.17,
    restTaken: 1, restRequired: 1,
  });
  assert.equal(patchesFor(q, "yes", flipped).paidHours, 5.17, "unchanged, whichever batch it came from");
  assert.equal(patchesFor(q, "no", flipped).paidHours, 5);
  assert.equal(patchesFor(q, "notaken", flipped).paidHours, 5);

  // AND ON A SHEET BUILT SINCE 2026-08-12, where the minutes are recorded and
  // NOT paid. This is the case the patch got wrong for a few hours: it read
  // `restsOffClockMin` as "what the day already pays", so `base` came out ten
  // minutes under the worked hours - confirming added nothing and declining
  // took off time that was never there.
  const now = day({
    date: "07/31/26", paidHours: 5, restsOffClockMin: 10, addedHours: 0,
    restTaken: 1, restRequired: 1,
  });
  assert.equal(patchesFor(q, "yes", now).paidHours, 5.17, "confirming is what ADDS them now");
  assert.equal(patchesFor(q, "yes", now).addedHours, 0.17, "and the sheet declares them");
  assert.equal(patchesFor(q, "no", now).paidHours, 5, "declining leaves the day alone");
  assert.equal(patchesFor(q, "notaken", now).paidHours, 5);
});

test("a ten in an unpaid schedule gap is asked about like any other", () => {
  // Mánu 2026-08-11: the gap case had no question at all before this.
  const days = [day({
    date: "07/28/26", restTaken: 1, restRequired: 2,
    punches: [{ min: 8 * 60 }, { min: 12 * 60 }, { min: 14 * 60 }, { min: 16 * 60 }],
  })];
  const restRows = [offClockRow("07/28/26", "1:00 PM", "1:10 PM", "8:00 AM to 12:00 PM")];
  const q = buildQuestions({ days }, { restRows, sourceName: "Martinez, April" })
    .find((x) => x.kind === "restOutsideScheduled");
  assert.ok(q, "the gap between two punched shifts still raises it");
  assert.equal(q.row.minutes, 10);
  assert.equal(q.needsOn, "no", "the time is asked for on the correction, not the confirmation");
  assert.equal(q.needs.length, 1, "one slot per row");
  assert.equal(q.needs[0].date, "07/28/26");
});


// -------------------------------------------------------------- Bucio / Devine

test("a credited short meal block is one question, and declining restores the premium", () => {
  const days = [
    day({ date: "07/29/26", restsFromShortMeals: 2, restTaken: 2, restRequired: 2, restViolation: false }),
  ];
  const qs = buildQuestions({ days }, { restRows: [], sourceName: "Devine, Jennifer" });
  const short = qs.find((q) => q.kind === "shortMealRest");
  assert.ok(short, "asked");
  assert.equal(short.movesOnDecline, 1, "Devine 07/29 is the one hour this ruling costs");

  const declined = patchesFor({ kind: "shortMealRest" }, "no", days[0]);
  assert.equal(declined.restTaken, 0, "both credits come off");
  assert.equal(declined.restViolation, true, "so the premium goes back on");

  // THE OPPOSITE: Bucio, where the credit never cleared anything, so declining
  // moves no money. Without this the assertion above is just measuring that a
  // patch exists.
  const bucio = day({ restsFromShortMeals: 1, restTaken: 1, restRequired: 2, restViolation: true });
  const bq = buildQuestions({ days: [bucio] }, { restRows: [], sourceName: "Bucio, Mary" });
  assert.equal(bq.find((q) => q.kind === "shortMealRest").movesOnDecline, 0, "no premium to restore");
});

// ------------------------------------------------------------------- Hernadez

test("two thirty minute entries are two questions, so each hour is answered on its own", () => {
  const restRows = ["07/25/26", "07/26/26"].map((date) => ({
    name: "Hernadez, Joseph", date, out: "2:00 PM", in: "2:30 PM",
    minutes: 30, counted: false,
  }));
  // the meal question now also requires the DAY to be missing its meal, which
  // is exactly Hernadez's shape: nothing rostered, something meal-length logged
  const days = ["07/25/26", "07/26/26"].map((date) => day({ date, mealViolation: true, mealMissing: true }));
  const qs = buildQuestions({ days }, { restRows, sourceName: "Hernadez, Joseph" });

  const meals = qs.filter((q) => q.kind === "restIsMealLength");
  assert.equal(meals.length, 2, "grouped into one card by the component, answered per day");
  assert.equal(meals[0].group, "restIsMealLength");
  assert.equal(meals[0].moves, -1);
  assert.notEqual(meals[0].id, meals[1].id, "or one answer would resolve both days");

  assert.deepEqual(patchesFor(meals[0], "yes", days[0]), { mealViolation: false });
  assert.deepEqual(patchesFor(meals[0], "no", days[0]), { mealViolation: null });
});

// --------------------------------------------------------------------- Flores

test("a rest with no times COUNTS, and is asked for its start time", () => {
  const restRows = [{ name: "Flores, Esmeralda", date: "07/29/26", out: "", in: "", minutes: 0 }];
  const owing = day({ date: "07/29/26", restTaken: 0, restRequired: 1, restViolation: true, paidHours: 5.02 });
  const qs = buildQuestions({ days: [owing] }, { restRows, sourceName: "Flores, Esmeralda" });
  const noTimes = qs.find((q) => q.kind === "restNoTimes");
  assert.ok(noTimes, "asked");
  assert.equal(noTimes.canGiveTime, true, "she can tell us when instead");
  assert.deepEqual(patchesFor(noTimes, "yes", owing), { restViolation: false });

  // IT IS ASKED EVEN ONCE THE PREMIUM IS GONE, and that reversal is the point.
  // Mánu 2026-08-10: a blank row still counts as a break taken, so counting it
  // can be exactly what CLEARS the premium - and gating the question on the
  // violation made it vanish the moment it started doing its job. What is
  // missing is the time, and the time is still missing.
  const settled = day({ date: "07/29/26", restTaken: 1, restRequired: 1, restViolation: false });
  const after = buildQuestions({ days: [settled] }, { restRows, sourceName: "Flores, Esmeralda" });
  assert.ok(after.find((q) => q.kind === "restNoTimes"), "still asked, because the time is still blank");

  // it asks for ONE thing: when it started. Both boxes blank is two ? on the
  // sheet but one answer, since a ten minute rest gives the other end.
  assert.deepEqual(noTimes.row.missing, ["out", "in"]);
  assert.equal(noTimes.needs.length, 1);
  assert.equal(noTimes.needs[0].minutes, 10);

  // and a row with BOTH times is never asked
  const complete = [{ name: "Flores, Esmeralda", date: "07/29/26", out: "9:00 AM", in: "9:10 AM", minutes: 10, counted: true }];
  assert.equal(
    buildQuestions({ days: [owing] }, { restRows: complete, sourceName: "Flores, Esmeralda" })
      .find((q) => q.kind === "restNoTimes"),
    undefined,
  );
});

// ---------------------------------------------------------------- other people

test("a question only ever belongs to the person whose sheet it is", () => {
  const restRows = [{ name: "Hernadez, Joseph", date: "07/25/26", out: "2:00 PM", in: "2:30 PM", minutes: 30, counted: false }];
  const qs = buildQuestions(
    { days: [day({ date: "07/25/26" })] },
    { restRows, sourceName: "Bucio, Mary" },
  );
  assert.equal(qs.length, 0, "Bucio is never asked about Hernadez's break");
});

test("ids are stable across a rebuild, so an answer still matches its question", () => {
  const days = [day({ punches: [{ min: 8 * 60 }, { min: 17 * 60 }] })];
  const restRows = [{
    name: "X", date: "07/20/26", out: "7:00 AM", in: "7:10 AM",
    minutes: 10, counted: true, shift: "8:00 AM to 11:00 AM",
  }];
  const a = buildQuestions({ days }, { restRows, sourceName: "X" });
  const b = buildQuestions({ days: [{ ...days[0], paidHours: 8 }] }, { restRows, sourceName: "X" });
  assert.ok(a.length, "there is a question to be stable about");
  assert.equal(a[0].id, b[0].id, "the sheet is rebuilt on every answer");
});

// ---------------------------------------------------------------------------
// ONE QUESTION PER BREAK. Mánu 2026-08-09 late, on his own twelve day card:
// "what if only some of them are no? with the way we have it right now, all of
// them are no or all of them are yes." Answered per DAY on 08-09, and split
// again per BREAK on 08-10 - a day short both a lunch and its tens was still
// all-or-nothing, so getting paid for the tens meant claiming the lunch too.

const ndDay = (date, over = {}) => ({
  date, paidHours: 8, mealViolation: false, mealLate: false, restViolation: false,
  restTaken: 0, restRequired: 2, punches: [], breaks: [], ...over,
});

test("the breaks question is one per BREAK, and each is worth one hour", () => {
  const qs = buildQuestions({
    days: [
      ndDay("07/20/26", { mealViolation: true, restViolation: true }),
      ndDay("07/21/26", { restViolation: true }),
      ndDay("07/22/26"),
    ],
  }, { restRows: [], sourceName: "Testperson" });
  const nd = qs.filter((q) => String(q.kind).startsWith("nothingDocumented"));

  // ONE PER BREAK NOW, not one per day. 07/20 is short both a lunch and its
  // rests, so it is two decisions; 07/21 is short only its rests, so it is one.
  assert.equal(nd.length, 3, "two for the day short both, one for the day short rests");
  assert.deepEqual(nd.map((q) => [q.date, q.kind]), [
    ["07/20/26", "nothingDocumentedMeal"],
    ["07/20/26", "nothingDocumentedRest"],
    ["07/21/26", "nothingDocumentedRest"],
  ]);
  // EVERY ONE IS WORTH EXACTLY ONE HOUR, and after the flip that hour comes OFF
  // on a yes. The old combined question was worth two on a day short both, which
  // is what made it all-or-nothing.
  assert.ok(nd.every((q) => q.moves === -1), "one hour off each, on a yes");
  assert.ok(nd.every((q) => q.movesOnDecline === 0), "and nothing on a no");
  // the day's shape still rides along, so the card can group by date
  assert.deepEqual(nd.map((q) => q.row.parts), [2, 2, 1]);
  // distinct ids, or two decisions would share an answer and the split is pointless
  assert.equal(new Set(nd.map((q) => q.id)).size, 3);
  // and they are still marked as one card, committed together
  assert.ok(nd.every((q) => q.batch === "nothingDocumented"));
});

test("a day short both can be answered yes to one and no to the other", () => {
  // THE WHOLE POINT OF THE SPLIT. Mánu 2026-08-10: somebody who got their lunch
  // and worked through their tens had to claim both to be paid for either.
  const days = [ndDay("07/20/26", { mealViolation: true, restViolation: true })];
  const nd = buildQuestions({ days }, { restRows: [], sourceName: "T" })
    .filter((q) => String(q.kind).startsWith("nothingDocumented"));
  assert.equal(nd.length, 2);

  const meal = nd.find((q) => q.kind === "nothingDocumentedMeal");
  const rest = nd.find((q) => q.kind === "nothingDocumentedRest");

  // "I took my lunch" touches only the meal flag...
  assert.deepEqual(patchesFor(meal, "yes", days[0]), { mealViolation: false });
  // ...and "I missed my tens" touches only the rest one, clearing the override
  // so the day's own flag stands and the hour is charged
  assert.deepEqual(patchesFor(rest, "no", days[0]), { restViolation: null });

  // MERGED THE WAY THE REBUILD MERGES THEM: nulls dropped, the rest spread. One
  // hour charged, not two and not none - which no single answer could express.
  const merged = {};
  for (const [q, choice] of [[meal, "yes"], [rest, "no"]]) {
    for (const [k, v] of Object.entries(patchesFor(q, choice, days[0]))) {
      if (v != null) merged[k] = v;
    }
  }
  assert.deepEqual(merged, { mealViolation: false });
  assert.equal(
    (merged.mealViolation === false ? 0 : 1) + (merged.restViolation === false ? 0 : 1),
    1,
    "one hour owed: the tens, not the lunch",
  );
});

test("saying no on one day leaves the others alone", () => {
  const days = [
    ndDay("07/20/26", { mealViolation: true, restViolation: true }),
    ndDay("07/21/26", { restViolation: true }),
  ];
  const nd = buildQuestions({ days }, { restRows: [], sourceName: "T" })
    .filter((q) => String(q.kind).startsWith("nothingDocumented"));

  // the 20th, both parts taken: each clears its own flag and nothing else
  assert.deepEqual(patchesFor(nd[0], "yes", days[0]), { mealViolation: false });
  assert.deepEqual(patchesFor(nd[1], "yes", days[0]), { restViolation: false });
  // the 21st: they missed them, so the override is cleared and the day's own
  // flag - which already says a rest is owed - comes back through
  assert.deepEqual(patchesFor(nd[2], "no", days[1]), { restViolation: null });
  // and answering the 21st cannot reach the 20th
  assert.equal(nd[2].date, "07/21/26");
});

test("progress is counted per question, not per kind", () => {
  // THE BUG THIS FIXES: every screen used to count distinct kinds against the
  // number of questions. That agrees only while a kind is a single question, and
  // it was already wrong for a two-day restIsMealLength card.
  const days = [
    ndDay("07/20/26", { mealViolation: true }),
    ndDay("07/21/26", { mealViolation: true }),
  ];
  const qs = buildQuestions({ days }, { restRows: [], sourceName: "T" });
  assert.equal(qs.length, 2);

  const one = [{ kind: "q_nothingDocumentedMeal", date: "07/20/26", status: "accepted" }];
  const p1 = answerProgress(qs, one);
  assert.equal(p1.answered, 1, "one of the two, not one KIND of one kind");
  assert.equal(p1.settled, false, "so they still cannot sign");

  const both = [...one, { kind: "q_nothingDocumentedMeal", date: "07/21/26", status: "declined" }];
  const p2 = answerProgress(qs, both);
  assert.equal(p2.answered, 2);
  assert.equal(p2.declined, 1);
  assert.equal(p2.settled, true);

  // an OPEN correction is a reported problem, not an answer
  assert.equal(answerProgress(qs, [
    { kind: "q_nothingDocumentedMeal", date: "07/20/26", status: "open" },
  ]).answered, 0);
});

test("an off-clock ten is counted per date, so answering one leaves the other", () => {
  // WAS the grouped case, until 2026-08-12. April's eleven 7:00-7:10 entries
  // looked like one habit and one answer, but a day is a day: answering the 20th
  // must not silently settle the 21st, and the progress count has to say so.
  const days = [
    ndDay("07/20/26", { punches: [{ min: 8 * 60 }, { min: 17 * 60 }] }),
    ndDay("07/21/26", { punches: [{ min: 8 * 60 }, { min: 17 * 60 }] }),
  ];
  const restRows = ["07/20/26", "07/21/26"].map((date) => ({
    name: "T", date, out: "7:00 AM", in: "7:10 AM",
    minutes: 10, counted: true, shift: "8:00 AM to 11:00 AM",
  }));
  const qs = buildQuestions({ days }, { restRows, sourceName: "T" })
    .filter((q) => q.kind === "restOutsideScheduled");
  assert.equal(qs.length, 2, "one question per day");
  assert.equal(
    answerProgress(qs, [
      { kind: "q_restOutsideScheduled", date: "07/20/26", status: "accepted" },
    ]).settled,
    false,
    "the 21st is still outstanding",
  );

  // AND THE COUNT MATCHES THE CARDS ON SCREEN. Two dates is two questions and
  // two answers - the old grouped reading collapsed these to "1 of 1", which now
  // would under-report by one every time somebody has two of these.
  const p = answerProgress(qs, [
    { kind: "q_restOutsideScheduled", date: "07/20/26", status: "accepted" },
    { kind: "q_restOutsideScheduled", date: "07/21/26", status: "accepted" },
  ]);
  assert.equal(p.asked, 2);
  assert.equal(p.answered, 2, "one row and one answer per date");
  assert.equal(p.declined, 0);
  assert.equal(p.settled, true, "both answered");
});


test("saying yes never clears a premium the schedule documented", () => {
  // THE ONE THAT MOVES MONEY THE WRONG WAY. A day can owe a rest under the
  // breaks question AND carry a meal premium the schedule witnessed - a lunch
  // rostered and punched that began after the fifth hour. Clearing both flags on
  // "yes" took that documented hour off too: 9 hours across 7 people, Aranda
  // 19.00 -> 0.00 when the honest answer is 2.00. Found 2026-08-10.
  const days = [
    ndDay("07/29/26", { mealViolation: true, mealLate: true, restViolation: true }),
  ];
  const qs = buildQuestions({ days }, { restRows: [], sourceName: "T" })
    .filter((q) => String(q.kind).startsWith("nothingDocumented"));

  assert.equal(qs.length, 1, "the day is asked about, for its REST");
  assert.equal(qs[0].row.meal, false, "the late lunch is not what is being asked");
  assert.equal(qs[0].row.rest, true);
  assert.equal(qs[0].moves, -1, "one hour comes off, the rest - not two");

  // yes clears the rest and CANNOT REACH the documented meal - since the split
  // the rest question only ever touches restViolation, which is a stronger
  // guarantee than the old "clear meal only if it was asked about"
  assert.deepEqual(patchesFor(qs[0], "yes", days[0]), { restViolation: false });
  assert.ok(!("mealViolation" in patchesFor(qs[0], "yes", days[0])));

  // THE OPPOSITE: a day whose meal is undocumented IS asked about and cleared by
  // yes, or the question would charge for something nobody is claiming.
  const undoc = [ndDay("07/20/26", { mealViolation: true, restViolation: true })];
  const q2 = buildQuestions({ days: undoc }, { restRows: [], sourceName: "T" })
    .filter((q) => String(q.kind).startsWith("nothingDocumented"));
  assert.equal(q2.length, 2, "two decisions now, one per break");
  assert.ok(q2.every((q) => q.moves === -1), "one hour each");
  assert.deepEqual(patchesFor(q2[0], "yes", undoc[0]), { mealViolation: false });
  assert.deepEqual(patchesFor(q2[1], "yes", undoc[0]), { restViolation: false });
});

test("a day answered yes asks for a time for every break it is short", () => {
  // Mánu 2026-08-10: required, "because we need a record of this."
  const days = [ndDay("07/20/26", {
    mealViolation: true, restViolation: true, restTaken: 0, restRequired: 2,
  })];
  const qs = buildQuestions({ days }, { restRows: [], sourceName: "T" })
    .filter((x) => String(x.kind).startsWith("nothingDocumented"));

  // THE TIMES FOLLOW THE SPLIT, which is the quiet win in it: answering "I took
  // my lunch" now asks for ONE time, not three. Before, a both-day demanded all
  // three before it would submit, even from somebody claiming only the lunch.
  const meal = qs.find((q) => q.kind === "nothingDocumentedMeal");
  const rest = qs.find((q) => q.kind === "nothingDocumentedRest");
  assert.deepEqual(meal.needs.map((n) => n.slot), ["meal"]);
  assert.deepEqual(meal.needs.map((n) => n.minutes), [30]);
  assert.deepEqual(rest.needs.map((n) => n.slot), ["rest1", "rest2"]);
  assert.deepEqual(rest.needs.map((n) => n.minutes), [10, 10]);
  // and between them they still account for every break the day is short
  assert.equal(meal.needs.length + rest.needs.length, 3);
  // NOTHING is pre-filled without a real time behind it. The schedule cannot
  // roster a rest period at all, so a ten is never proposed.
  assert.ok(
    [...meal.needs, ...rest.needs].every((n) => !n.prefill),
    "no schedule here, so nothing to propose",
  );

  // one already taken means one still to account for
  const partial = [ndDay("07/21/26", { restViolation: true, restTaken: 1, restRequired: 2 })];
  const q3 = buildQuestions({ days: partial }, { restRows: [], sourceName: "T" })
    .filter((x) => String(x.kind).startsWith("nothingDocumented"))[0];
  assert.deepEqual(q3.needs.map((n) => n.slot), ["rest1"]);

  // a clean day is asked nothing at all, or the card would demand times for
  // breaks nobody says are missing
  assert.equal(
    buildQuestions({ days: [ndDay("07/22/26")] }, { restRows: [], sourceName: "T" })
      .filter((x) => String(x.kind).startsWith("nothingDocumented")).length,
    0,
  );
});

test("a rostered lunch is proposed, and a schedule gap is only suggested", () => {
  const days = [ndDay("07/20/26", {
    mealViolation: true, restViolation: true, restTaken: 0, restRequired: 1,
  })];
  const data = {
    days,
    scheduleCheck: {
      byDate: {
        "07/20/26": {
          // two bookings 15 minutes apart, and a lunch rostered elsewhere in
          // the day. The hole AROUND a rostered lunch is not a rest gap - it is
          // the lunch - so the two have to be separate to test either.
          //
          // THE ROSTER BREAKS FOR THE LUNCH at 3p rather than booking it on top
          // of a block running to 5p. It used to do the latter and lean on
          // "Rincon" being a name this file could not read as a service - every
          // named service is worked time as of 2026-08-26, so a lunch inside
          // one is `mealBookedInside` and never reaches this question.
          shifts: [
            { text: "9a-12p Rincon-ILS Service(3:00)" },
            { text: "12:15p-3p Rincon-ILS Service(2:45)" },
            { text: "3p-3:30p", meal: true },
            { text: "3:30p-5p Rincon-ILS Service(1:30)" },
          ],
        },
      },
    },
  };
  // the day's slots now live across two questions, so gather them
  const slots = buildQuestions(data, { restRows: [], sourceName: "T" })
    .filter((x) => String(x.kind).startsWith("nothingDocumented"))
    .flatMap((x) => x.needs);

  const meal = slots.find((n) => n.slot === "meal");
  assert.equal(meal.prefill, "3p", "the roster booked it, so it is a time and not a guess");
  assert.equal(meal.source, "schedule");

  // THE SCHEDULE GAP IS NO LONGER OFFERED, and that reversed on 2026-08-11.
  // Mánu: "they are not allowed to put their breaks into unscheduled time, it
  // has to be assigned to a service - so showing that there's a gap and
  // suggesting to put it in that gap goes against our policy." The card above
  // this one exists because a ten was logged outside a shift; this one was
  // proposing exactly that, on 506 of the 597 rest slots in the batch.
  const rest = slots.find((n) => n.slot === "rest1");
  assert.equal(rest.prefill, null, "never pre-filled");
  assert.equal(rest.suggest, null, "and no longer suggested either");
  assert.ok(!/gap/.test(rest.hint), "the hint must not point at unscheduled time");

  // AND WHAT IT POINTS AT INSTEAD: the shifts the day was actually worked in,
  // taken from the punches, with the half this ten belongs in.
  const worked = buildQuestions(
    {
      days: [ndDay("07/20/26", {
        mealViolation: true, restViolation: true, restTaken: 0, restRequired: 1,
        punches: [{ min: 9 * 60 }, { min: 17 * 60 }],
      })],
      scheduleCheck: { byDate: { "07/20/26": { shifts: [{ text: "9a-5p Rincon" }] } } },
    },
    { restRows: [], sourceName: "T" },
  ).filter((x) => String(x.kind).startsWith("nothingDocumented")).flatMap((x) => x.needs);
  const r1 = worked.find((n) => n.slot === "rest1");
  assert.deepEqual(r1.shifts, ["9a-5p"], "their own in and out, not the roster's holes");
  assert.deepEqual(r1.window, ["9a-1p"], "the first ten sits in the first four hours");
  assert.match(r1.hint, /has to be inside 9a-1p/);

  // a day with no punches at all cannot place it, and says so rather than
  // inventing somewhere to put it
  const nowhere = buildQuestions(
    { days, scheduleCheck: { byDate: { "07/20/26": { shifts: [{ text: "9a-5p Rincon" }] } } } },
    { restRows: [], sourceName: "T" },
  ).filter((x) => String(x.kind).startsWith("nothingDocumented")).flatMap((x) => x.needs);
  assert.match(nowhere.find((n) => n.slot === "rest1").hint, /no punches on this day/);
});

// ---------------------------------------------------------------------------
// CHANGING YOUR MIND HAS TO LAND WHERE THE FIRST ANSWER WOULD HAVE.
//
// `patchesFor` sets an ABSOLUTE figure for this kind, so it is only correct when
// it is handed the PRISTINE day. Hand it a day a previous answer already
// rewrote and the target is computed from the wrong baseline: Mánu answered "I
// took it during a shift" and then "yes, that is when I took it" on his own
// sheet, and his hours stayed at the lower figure. It reads as "I cannot change
// my answer", which is how he reported it.
//
// The caller is what has to pass the pristine day - `answerTimesheetQuestion`
// now reads `daysOriginal` - and this is the assertion that says why.

test("answering, changing, and changing back lands the same figure every time", () => {
  const q = {
    kind: "restOutsideScheduled",
    row: { detail: [{ date: "07/28/26", minutes: 10 }] },
  };
  // his own 07/28: 6.17 with the ten included
  // an old-model day: the minutes were paid on sight, so `addedHours` says so.
  // The patch reads THAT, not the recorded minutes - see the note on `base`.
  const pristine = day({
    date: "07/28/26", paidHours: 6.17, restsOffClockMin: 10, addedHours: 0.17,
    restTaken: 1, restRequired: 2,
  });

  const yes1 = patchesFor(q, "yes", pristine);
  assert.equal(yes1.paidHours, 6.17);
  const no = patchesFor(q, "no", pristine);
  assert.equal(no.paidHours, 6);
  // BACK AGAIN, from the pristine day - not from what "no" just wrote
  const yes2 = patchesFor(q, "yes", pristine);
  assert.equal(yes2.paidHours, 6.17, "changing back has to undo the change");

  // AND THE FAILURE ITSELF, so this test can fail. Feeding the patched day back
  // in is what the caller used to do, and it never recovers the ten minutes.
  const patched = { ...pristine, paidHours: no.paidHours };
  assert.equal(
    patchesFor(q, "yes", patched).paidHours, 6,
    "computed off an already-patched day it sticks at the lower figure - the bug",
  );
});

// ---------------------------------------------------------------------------
// WHAT HAS TO BE ANSWERED FIRST.
//
// Mánu 2026-08-11: "prioritize what is shown first, and not be able to show the
// other options until the one that will have a domino effect on the rest are
// answered first."
//
// A question that moves paid hours moves the entitlement with it, so the break
// questions for those same dates are asking about premiums that may be about to
// stop existing. The scoping is the part worth pinning: a ten logged outside a
// shift on the 28th says nothing about the 16th, and locking a whole sheet over
// three days would be a gate nobody could defend.

// short a ten AND carrying a ten logged off the clock, so the day raises both
// the hours question and a break question - which is the whole shape under test
const offClockDay = (date) => day({
  date, punches: [{ min: 8 * 60 }, { min: 17 * 60 }],
  restTaken: 1, restRequired: 2, restViolation: true,
});
const offClockRest = (date) => ({
  name: "T", date, out: "7:00 AM", in: "7:10 AM",
  minutes: 10, counted: true, shift: "8:00 AM to 11:00 AM",
});

test("the hours question is asked first, whatever order it was built in", () => {
  const qs = buildQuestions(
    { days: [offClockDay("07/28/26"), ndDay("07/16/26", { restViolation: true })] },
    { restRows: [offClockRest("07/28/26")], sourceName: "T" },
  );
  assert.equal(qs[0].kind, "restOutsideScheduled", "it re-derives the day, so it leads");
  assert.equal(qs[0].movesHours, true);
  assert.ok(qs.slice(1).every((q) => !q.movesHours));
});

test("only the dates the hours question touches are held back", () => {
  const days = [
    offClockDay("07/28/26"),                          // the mover's date
    ndDay("07/16/26", { restViolation: true }),       // nothing to do with it
  ];
  const qs = buildQuestions({ days }, { restRows: [offClockRest("07/28/26")], sourceName: "T" });
  const { waiting } = dependencyGate(qs, []);

  const on28 = qs.find((q) => q.kind === "nothingDocumentedRest" && q.date === "07/28/26");
  const on16 = qs.find((q) => q.kind === "nothingDocumentedRest" && q.date === "07/16/26");
  assert.ok(on28 && on16, "both days raise a break question");
  assert.equal(waiting.has(on28.id), true, "the 28th waits - its hours are about to move");
  assert.equal(waiting.has(on16.id), false, "the 16th does not - it is a different day");
  // and the mover itself is never waiting on anything
  assert.equal(waiting.has(qs[0].id), false);
});

test("answering the hours question releases the days it was holding", () => {
  const days = [offClockDay("07/28/26")];
  const qs = buildQuestions({ days }, { restRows: [offClockRest("07/28/26")], sourceName: "T" });
  const before = dependencyGate(qs, []);
  assert.equal(before.waiting.size > 0, true);

  const after = dependencyGate(qs, [
    { kind: "q_restOutsideScheduled", date: "07/28/26", status: "accepted" },
  ]);
  assert.equal(after.waiting.size, 0, "nothing is held once the hours are settled");
});

test("changing an hours answer only warns when there is something to disturb", () => {
  const days = [offClockDay("07/28/26")];
  const qs = buildQuestions({ days }, { restRows: [offClockRest("07/28/26")], sourceName: "T" });
  const mover = qs.find((q) => q.movesHours);

  // answered upstream, nothing downstream answered yet - nothing to warn about
  const quiet = dependencyGate(qs, [
    { kind: "q_restOutsideScheduled", date: "07/28/26", status: "accepted" },
  ]);
  assert.deepEqual(quiet.disturbs[mover.id], [], "no warning when it reaches nothing");

  // now a break question on the same date has been answered
  const loud = dependencyGate(qs, [
    { kind: "q_restOutsideScheduled", date: "07/28/26", status: "accepted" },
    { kind: "q_nothingDocumentedRest", date: "07/28/26", status: "declined" },
  ]);
  assert.equal(loud.disturbs[mover.id].length, 1, "one answer below would be reworked");
});

// ---------------------------------------------------------------------------
// WHERE A REST PERIOD IS ALLOWED TO GO.
//
// Mánu 2026-08-11: "for the first ten it should be the ones within the first
// four hours of the shift. The second ten should be the ones in the last four
// hours of the shift. They have to select times within that shift."
//
// This replaced the schedule-gap suggestion, which pointed at UNSCHEDULED time -
// the exact thing the `restOutsideScheduled` question penalises. The employer's
// rule is that a rest is assigned to a service, so the window is inside the work.

const worked = (...pairs) => day({
  date: "07/20/26",
  punches: pairs.flatMap(([a, b]) => [{ min: a * 60 }, { min: b * 60 }]),
});

test("the first ten belongs in the first four hours, the second in the last four", () => {
  const d = worked([9, 17]);
  assert.deepEqual(shiftsOf(d), [{ from: 540, to: 1020 }]);
  assert.deepEqual(restWindow(d, 1), [{ from: 9 * 60, to: 13 * 60 }]);
  assert.deepEqual(restWindow(d, 2), [{ from: 13 * 60, to: 17 * 60 }]);

  // a short day cannot run past its own end
  assert.deepEqual(restWindow(worked([9, 11]), 1), [{ from: 9 * 60, to: 11 * 60 }]);
});

test("the window quoted is one they can actually pick from", () => {
  // Uribe 07/31: 8a-9:30a, 10a-12p, 1p-4p. The last four hours run 12p-4p and
  // 12p-1p is unscheduled, so quoting the raw half invites a time the shift
  // check then refuses. Mánu 2026-08-11: "fix the window to only show the shift
  // times."
  const d = worked([8, 9.5], [10, 12], [13, 16]);
  assert.deepEqual(restWindow(d, 2), [{ from: 13 * 60, to: 16 * 60 }], "1p-4p, not 12p-4p");

  // AND SPANS, NOT ONE FLATTENED RANGE. His 07/23 works 10a-12p and 12:15p-2:15p
  // inside the first ten's four hours, with an unscheduled hole between them.
  // Quoting "10a to 2p" would invite 12:05p, which the shift check refuses.
  const split = worked([10, 12], [12.25, 14.25], [14.5, 16.5]);
  assert.deepEqual(restWindow(split, 1), [
    { from: 10 * 60, to: 12 * 60 },
    { from: 12 * 60 + 15, to: 14 * 60 },
  ]);
  assert.equal(restTimeFits(split, 1, 12 * 60 + 5).ok, false, "the hole is not offered");

  // every minute the employee is shown is one the checker accepts
  for (const w of restWindow(d, 2)) {
    for (let t = w.from; t + 10 <= w.to; t += 10) {
      assert.equal(restTimeFits(d, 2, t).ok, true, `${t} is inside a quoted span but refused`);
    }
  }
});

test("a time outside every shift is refused, whatever they remember", () => {
  // the split day: 8-12 and 1-5, with an hour of unscheduled time between. The
  // gap is exactly what used to be offered as a one-tap.
  const d = worked([8, 12], [13, 17]);

  assert.equal(restTimeFits(d, 1, 10 * 60).ok, true, "inside the first shift");
  assert.equal(restTimeFits(d, 2, 15 * 60).ok, true, "inside the second");

  const inGap = restTimeFits(d, 1, 12 * 60 + 30);
  assert.equal(inGap.ok, false, "the unscheduled hole is not somewhere a break may go");
  assert.equal(inGap.why, "outside");

  // right shift, wrong half: a first ten cannot be at 4pm on a 8-5 day
  const lateFirst = restTimeFits(d, 1, 16 * 60);
  assert.equal(lateFirst.ok, false);
  assert.equal(lateFirst.why, "window");

  // a ten that would run past the end of the shift it starts in
  assert.equal(restTimeFits(d, 2, 16 * 60 + 55).ok, false, "ten minutes has to fit inside");
});

test("a day with no punches judges nothing rather than guessing", () => {
  // we have nothing to place it against, so refusing would be inventing a rule
  const d = day({ date: "07/20/26", punches: [] });
  assert.equal(restWindow(d, 1), null);
  assert.equal(restTimeFits(d, 1, 10 * 60).ok, true);
});
