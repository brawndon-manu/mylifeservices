// THREE THINGS THE EMPLOYEE'S CALENDAR AND CARDS DID NOT SAY.
//
// All three were found by looking at the Tests card rather than by reading the
// code, which is the argument for it existing. None of them moves a figure.
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildQuestions, patchesFor, isMandatory } from "../questions.js";
import { rosteredMeal } from "../recorded-breaks.js";

// a day worked 9a-4:45p with a ten minute "Meal Break" rostered inside it - the
// shape `shortMealRest` is built from, and the shape no punch gap can show
const day = (over = {}) => ({
  date: "07/23/26",
  punches: [{ min: 540, raw: "9a" }, { min: 750, raw: "12:30p" },
    { min: 765, raw: "12:45p" }, { min: 1005, raw: "4:45p" }],
  paidHours: 7.67, restRequired: 2, restTaken: 1, restViolation: true,
  restsFromShortMeals: 1, mealScheduled: true, mealViolation: false,
  ...over,
});

const sched = (text) => ({ shifts: [{ meal: true, text, minutes: 10 }] });

test("a rostered meal block is readable off the schedule row", () => {
  // the block `shortMealRest` credits as somebody's rest period. It is ten
  // minutes, so it is TOO SHORT to be a punched-out lunch by construction -
  // which is why the gap logic could never draw it and why every one of those
  // cards showed an empty picture.
  assert.deepEqual(rosteredMeal(sched("12p-12:10p -Meal Break(0:10)")), { from: 720, to: 730 });
  assert.equal(rosteredMeal({ shifts: [{ meal: false, text: "9a-12:30p X-ILS Service(3:30)" }] }), null);
  assert.equal(rosteredMeal(null), null);
});

test("the two-lunches card gets BOTH times, not a time and a sentence", () => {
  // it read "Your schedule has / a lunch that day" against "And this is
  // recorded / 3:30p to 4:30p" - one side a fragment, which is not something
  // anybody can compare against a time
  const qs = buildQuestions(
    {
      days: [day({ restsFromShortMeals: 0, mealScheduled: true })],
      scheduleCheck: { byDate: { "07/23/26": sched("12p-12:30p -Meal Break(0:30)") } },
    },
    {
      sourceName: "Uribe, Mánu",
      restRows: [{
        name: "Uribe, Mánu", date: "07/23/26",
        out: "3:30 PM", in: "4:30 PM", minutes: 60, counted: false,
      }],
    },
  );
  const q = qs.find((x) => x.kind === "restTooLongOffClock");
  assert.ok(q, "the long off-clock row still raises its question");
  assert.equal(q.row.twoLunches, true);
  assert.equal(q.row.rosteredFrom, "12p");
  assert.equal(q.row.rosteredTo, "12:30p");
  assert.equal(q.row.rosteredMinutes, 30);
});

// PROVING THAT ONE CAN FAIL. With no meal on the schedule row there is no
// second lunch, so the fields go away - and if they did not, the card would be
// quoting times off a roster that does not have them.
test("no rostered lunch means no rostered times to quote", () => {
  const qs = buildQuestions(
    {
      days: [day({ restsFromShortMeals: 0, mealScheduled: false })],
      scheduleCheck: { byDate: { "07/23/26": { shifts: [] } } },
    },
    {
      sourceName: "Uribe, Mánu",
      restRows: [{
        name: "Uribe, Mánu", date: "07/23/26",
        out: "3:30 PM", in: "4:30 PM", minutes: 60, counted: false,
      }],
    },
  );
  const q = qs.find((x) => x.kind === "restTooLongOffClock");
  assert.equal(q.row.twoLunches, false);
  assert.equal(q.row.rosteredFrom, null);
});

// A REST LOGGED INSIDE THE ROSTERED LUNCH.
//
// `findings.js` has folded this into the same finding for ADMINS since
// 2026-08-12 - "the lunch is WHY the rest was off the clock". That merge never
// reached the employee, so their card said the ten was taken after their shift
// and never mentioned that it lands in their lunch. Same minutes, two stories.
const lunchDay = {
  date: "07/20/26",
  // 7:30a-10a, 10a-10:30a, 10:30a-1p, then 1:30p-4p. The 1p-1:30p hole is the
  // rostered lunch, and the ten is logged inside it.
  punches: [{ min: 450 }, { min: 600 }, { min: 600 }, { min: 630 },
    { min: 630 }, { min: 780 }, { min: 810 }, { min: 960 }],
  paidHours: 8, addedHours: 0, restRequired: 2, restTaken: 1,
  restViolation: true, restsOffClock: 1, restsOffClockMin: 10,
  restsInsideMeal: 1, mealScheduled: true, mealViolation: true,
};

const lunchRow = {
  name: "Uribe, Mánu", date: "07/20/26",
  out: "1:00 PM", in: "1:10 PM", minutes: 10, counted: true,
  shiftFrom: "10:30 AM", shiftTo: "1:00 PM",
};

test("the off-clock card carries the fact that the ten lands in the lunch", () => {
  const qs = buildQuestions(
    { days: [lunchDay], scheduleCheck: { byDate: {} } },
    { sourceName: "Uribe, Mánu", restRows: [lunchRow] },
  );
  const q = qs.find((x) => x.kind === "restOutsideScheduled");
  assert.ok(q, "the ten logged off the clock still raises its question");
  assert.equal(q.row.inLunch, 1);
});

// AND THAT IT CAN FAIL. A day whose ten is off the clock but NOT in a rostered
// lunch must not get the clause, or the card tells everybody their break was in
// their lunch and the sentence stops meaning anything.
test("a ten off the clock but not in a lunch gets no lunch clause", () => {
  const qs = buildQuestions(
    {
      days: [{ ...lunchDay, restsInsideMeal: 0 }],
      scheduleCheck: { byDate: {} },
    },
    { sourceName: "Uribe, Mánu", restRows: [lunchRow] },
  );
  const q = qs.find((x) => x.kind === "restOutsideScheduled");
  assert.equal(q.row.inLunch, 0);
});

// A MEAL THAT WAS TAKEN, AND STARTED TOO LATE.
//
// The one violation an employee had never been asked about. `mealLate` days are
// excluded from the "nothing documented" question by construction - "did you
// take your lunch?" is the wrong question when the record says they did - and
// until 2026-08-14 no other kind covered them. 11 on the live batch, 13 in July.
const lateLunchDay = {
  date: "08/04/26",
  punches: [{ min: 480 }, { min: 810 }, { min: 840 }, { min: 990 }],
  breaks: [{ kind: "meal", min: 30, start: { raw: "1:30p", min: 810 }, end: { raw: "2p", min: 840 } }],
  paidHours: 8, mealRequired: true, mealViolation: true, mealLate: true,
  mealStartedAfterMin: 330, restRequired: 2, restTaken: 2, restViolation: false,
};

test("a late lunch is asked about at all, which it never used to be", () => {
  const qs = buildQuestions(
    { days: [lateLunchDay], scheduleCheck: { byDate: {} } },
    { sourceName: "Uribe, Mánu", restRows: [] },
  );
  const q = qs.find((x) => x.kind === "mealLate");
  assert.ok(q, "a day whose lunch started after the fifth hour raises nothing");
  assert.equal(q.date, "08/04/26");
  // the fact somebody can check against their own memory
  assert.equal(q.row.lateMinutes, 330);
  assert.equal(q.row.from, "1:30p");
});

test("it does NOT also get asked whether they took the lunch", () => {
  // THE TRAP THIS AVOIDS. `employeeQuestion` was fixed for exactly this: it told
  // somebody whose lunch merely started late that they never had one. Two cards
  // on one day would put that back, in a worse form - one of them asking a
  // question whose honest answer is "I did take it".
  const qs = buildQuestions(
    { days: [lateLunchDay], scheduleCheck: { byDate: {} } },
    { sourceName: "Uribe, Mánu", restRows: [] },
  );
  assert.equal(qs.filter((x) => x.kind === "nothingDocumentedMeal").length, 0);
  assert.equal(qs.filter((x) => x.kind === "mealLate").length, 1);
});

test("confirming it was late moves nothing, and correcting the punch takes it off", () => {
  // the rule that holds across every card: an answer that CONFIRMS the record
  // never moves money, only a correction does
  const qs = buildQuestions(
    { days: [lateLunchDay], scheduleCheck: { byDate: {} } },
    { sourceName: "Uribe, Mánu", restRows: [] },
  );
  const q = qs.find((x) => x.kind === "mealLate");
  assert.deepEqual(patchesFor(q, "yes", lateLunchDay), {});
  // and the flag goes with the violation. Clearing one and not the other leaves
  // a day charging nothing while still declaring the fault, which is what the
  // sheet prints beside it and what the next rebuild reads.
  assert.deepEqual(patchesFor(q, "no", lateLunchDay), { mealViolation: false, mealLate: false });
});

test("a lunch on time raises no late question", () => {
  // THE CHECK THAT HAS TO FAIL FOR THE OTHERS TO MEAN ANYTHING
  const onTime = { ...lateLunchDay, mealLate: false, mealViolation: false, mealStartedAfterMin: 180 };
  const qs = buildQuestions(
    { days: [onTime], scheduleCheck: { byDate: {} } },
    { sourceName: "Uribe, Mánu", restRows: [] },
  );
  assert.equal(qs.filter((x) => x.kind === "mealLate").length, 0);
});

test("it never blocks a signature", () => {
  // the break happened. Silence leaves the premium on, exactly like the other
  // break questions, so there is nothing here worth holding a signature for.
  assert.equal(isMandatory("mealLate"), false);
});
