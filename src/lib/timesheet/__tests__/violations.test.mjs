// A VIOLATION IS NOT AN ANOMALY, AND THE SCREEN HAS TO KEEP THEM APART.
//
// Mánu 2026-08-12 drew the line: an anomaly is a discrepancy in the record,
// something we repaired or something still to correct in QuickSolve. A missing
// rest period or lunch is not that. The record is accurate and a rule was
// broken, so it is a violation, and it was sitting under a heading whose own
// description reads "Nothing to fix here".
//
// These pin the boundary, because it is the kind of rule that gets restated in
// a second place and then drifts. `violationsFor` is the ONLY definition, read
// by both the checks list and the person page.
import { test } from "node:test";
import assert from "node:assert/strict";

import { dayViolations, violationsFor, violationHead, VIOLATION_KINDS } from "../violations.js";

const day = (over = {}) => ({
  date: "08/01/26", paidHours: 8, restRequired: 2, restTaken: 2, restSource: "rest-report",
  restViolation: false, mealViolation: false, mealLate: false, ...over,
});

test("a clean day is no violation at all", () => {
  assert.deepEqual(dayViolations(day()), []);
});

test("a rest short of what the day requires is a violation, and says how short", () => {
  const v = dayViolations(day({ restViolation: true, restTaken: 1 }));
  assert.equal(v.length, 1);
  assert.equal(v[0].kind, "rest-not-taken");
  assert.equal(v[0].short, 1);
  assert.equal(v[0].detail, "1 of 2 recorded");
  assert.equal(violationHead(v[0]), "a rest period not taken");
});

test("two missed rests read as two, not as one", () => {
  const v = dayViolations(day({ restViolation: true, restTaken: 0 }));
  assert.equal(v[0].short, 2);
  assert.equal(violationHead(v[0]), "2 rest periods not taken");
});

// A REST MISSING BECAUSE THE REPORT NEVER MENTIONS THEM IS STILL MISSING.
// This was excluded for one build and Mánu caught it on Aranda 08/03: her page
// showed the meal and hid two rests she is charged premiums for. The arithmetic
// is the check - her 10.00 premium hours are five meal and five rest - so a day
// dropped here is a premium hour with nothing on screen to explain it.
test("a rest the report never recorded is still a violation, flagged as noReport", () => {
  const v = dayViolations(day({ restViolation: true, restTaken: 0, restSource: "none" }));
  assert.equal(v.length, 1);
  assert.equal(v[0].kind, "rest-not-taken");
  assert.equal(v[0].short, 2);
  assert.equal(v[0].noReport, true);
});

test("a rest the report DID cover is the same finding, not flagged noReport", () => {
  const v = dayViolations(day({ restViolation: true, restTaken: 1 }));
  assert.equal(v[0].noReport, false);
});

// the WHY is a person's fact and gets counted separately, so the page can say
// it once instead of once per day
test("violationsFor counts the no-report days apart for the one-line explanation", () => {
  const v = violationsFor({
    days: [
      day({ date: "08/03/26", restViolation: true, restTaken: 0, restSource: "none", mealViolation: true }),
      day({ date: "08/04/26", restViolation: true, restTaken: 0, restSource: "none", mealViolation: true }),
    ],
  });
  assert.equal(v.total, 4);      // two rests and two meals, all real
  assert.equal(v.noReport, 2);   // both rests share one cause
  assert.equal(v.dayCount, 2);
});

// Aranda 08/01-08/09 as the live batch actually holds her: five days, each one
// missing its meal and both its rests. The page showed 5 and should show 10.
test("Aranda's shape: five days, a meal and two rests on each, is ten findings", () => {
  const v = violationsFor({
    days: ["08/03/26", "08/04/26", "08/05/26", "08/06/26", "08/07/26"].map((date) =>
      day({ date, restViolation: true, restTaken: 0, restSource: "none", mealViolation: true }),
    ),
  });
  assert.equal(v.total, 10);
  assert.equal(v.dayCount, 5);
  assert.equal(v.noReport, 5);
});

test("no meal recorded is a violation and quotes the day's hours", () => {
  const v = dayViolations(day({ mealViolation: true, paidHours: 8.25 }));
  assert.equal(v.length, 1);
  assert.equal(v[0].kind, "meal-not-recorded");
  assert.match(v[0].detail, /8\.25 hour day/);
});

test("a meal that started too late is its own kind, not a missing meal", () => {
  const v = dayViolations(day({ mealViolation: true, mealLate: true, mealStartedAfterMin: 312 }));
  assert.equal(v[0].kind, "meal-late");
  assert.match(v[0].detail, /312 minutes/);
});

// A WAIVED MEAL IS NOT A VIOLATION, and this file must not be the place that
// decides that. `mealViolation` is already (mealMissing AND NOT mealWaived) OR
// mealLate - verified on the live batch, 62 days with no meal, 21 waived, 41
// left, plus 8 late = the 49 it reports. Recomputing it here would be a third
// definition of one rule, so the test asserts we defer rather than re-derive.
test("a waived meal the engine did not call a violation is not one here either", () => {
  assert.deepEqual(dayViolations(day({ mealMissing: true, mealWaived: true, mealViolation: false })), []);
});

test("one day can carry both a rest and a meal violation", () => {
  const v = dayViolations(day({ restViolation: true, restTaken: 1, mealViolation: true }));
  assert.deepEqual(v.map((x) => x.kind), ["rest-not-taken", "meal-not-recorded"]);
});

test("violationsFor keeps the clean days and still counts only the flagged ones", () => {
  const v = violationsFor({
    days: [
      day({ date: "08/01/26", restViolation: true, restTaken: 1 }),
      day({ date: "08/02/26" }),
      day({ date: "08/03/26", mealViolation: true }),
    ],
  });
  // the person page draws a SCHEDULE, so every day survives
  assert.equal(v.days.length, 3);
  // ...but only the two with something on them are the work
  assert.equal(v.dayCount, 2);
  assert.equal(v.total, 2);
  assert.deepEqual(v.kinds, ["rest-not-taken", "meal-not-recorded"]);
});

test("a person with nothing wrong reports a zero total, so no row is built for them", () => {
  const v = violationsFor({ days: [day(), day({ date: "08/02/26" })] });
  assert.equal(v.total, 0);
  assert.equal(v.days.length, 2);
});

test("no stored data at all does not throw", () => {
  assert.equal(violationsFor(null).total, 0);
  assert.equal(violationsFor(undefined).days.length, 0);
  assert.deepEqual(dayViolations(null), []);
});

// every kind the day builder can emit has to have copy, or a card renders a
// blank label and an empty instruction to the reviewer
test("every kind dayViolations emits has a label and something to ask", () => {
  const emitted = new Set();
  for (const d of [
    day({ restViolation: true, restTaken: 1 }),
    day({ mealViolation: true }),
    day({ mealViolation: true, mealLate: true, mealStartedAfterMin: 300 }),
  ]) for (const v of dayViolations(d)) emitted.add(v.kind);

  assert.equal(emitted.size, 3);
  for (const k of emitted) {
    assert.ok(VIOLATION_KINDS[k], `${k} has no entry`);
    assert.ok(VIOLATION_KINDS[k].label?.length, `${k} has no label`);
    assert.ok(VIOLATION_KINDS[k].ask?.length, `${k} has nothing to ask`);
  }
});
