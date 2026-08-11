// RE-DERIVING WHAT HANGS OFF THE HOURS, and proving it still agrees with the
// engine that first derived it.
//
// Mánu 2026-08-11, on his own three tens: "I know some of those if it was taken
// after the shifts, I would gain those ten minutes, which would put me over six
// hours, which would make me need a meal, which I didn't take. So things below
// as well can subsequently change."
//
// Nothing was doing that. An answer that moved `paidHours` went through
// `applyOverrides`, which sets the figure and stops, so the day kept the
// entitlement it was analysed with. His sheet went 6.17 -> 6.00 on his own
// answer and carried on charging a meal premium that only exists above six
// hours, and a second rest that only exists above six hours.
//
// `reentitle` is a SECOND COPY of those rules, which is the risk in having it.
// The first test here is the one that matters: run the real engine over real
// shapes, then re-derive from the stored day alone and demand the same answer.
import test from "node:test";
import assert from "node:assert/strict";
import { analyzeDay, reentitle, restsRequired } from "../parse.js";
import { applyOverrides } from "../corrections.js";
import { patchesFor } from "../questions.js";

const at = (h, m = 0) => ({ min: h * 60 + m });
const LUNCH = [
  { start: 8 * 60, end: 17 * 60, meal: false },
  { start: 12 * 60, end: 12 * 60 + 30, meal: true },
];

// the fields `reentitle` is allowed to look at - everything else it must derive
const stored = (d) => ({
  date: d.date, paidHours: d.paidHours, restTaken: d.restTaken,
  restUnknown: d.restUnknown, mealScheduled: d.mealScheduled,
  mealInsideBooking: d.mealInsideBooking, mealLate: d.mealLate,
  secondMealLate: d.secondMealLate, mealsRostered: d.mealsRostered,
});

const SHAPES = [
  ["a six hour day with no meal rostered", {
    date: "07/28/26", punches: [at(8), at(14)], printed: null,
    mealScheduled: false, restRecorded: 1,
  }],
  ["the same day ten minutes longer", {
    date: "07/28/26", punches: [at(8), at(14, 10)], printed: null,
    mealScheduled: false, restRecorded: 1,
  }],
  ["a full day with a rostered lunch", {
    date: "07/20/26", punches: [at(8), at(17)], printed: null,
    mealScheduled: true, scheduleBlocks: LUNCH, restRecorded: 2,
  }],
  ["a full day with no lunch rostered", {
    date: "07/21/26", punches: [at(8), at(17)], printed: null,
    mealScheduled: false, restRecorded: 0,
  }],
  ["a day nobody scheduled at all", {
    date: "07/22/26", punches: [at(8), at(17)], printed: null,
    mealScheduled: null, restRecorded: 1,
  }],
  ["a short day owing nothing", {
    date: "07/23/26", punches: [at(9), at(12)], printed: null,
    mealScheduled: false, restRecorded: 0,
  }],
  ["past ten hours, so a second meal is owed", {
    date: "07/24/26", punches: [at(7), at(19)], printed: null,
    mealScheduled: true, scheduleBlocks: LUNCH, restRecorded: 3,
  }],
];

test("re-deriving a day agrees with the engine that analysed it", () => {
  for (const [name, input] of SHAPES) {
    const full = analyzeDay(input);
    const again = reentitle(stored(full), full.paidHours);
    for (const k of [
      "restRequired", "mealRequired", "mealUnknown", "mealWaived", "mealMissing",
      "secondMealRequired", "secondMealUnknown", "secondMealViolation",
      "mealViolation", "restViolation",
    ]) {
      assert.equal(again[k], full[k], `${name}: ${k} drifted from analyzeDay`);
    }
  }
});

test("the six hour line moves two rules at once, and that is the whole point", () => {
  // Mánu's 07/28 and 07/29. Ten minutes either side of six hours flips the meal
  // waiver AND the number of rests owed, which is why an answer that moves the
  // hours cannot leave the entitlement where it was.
  const base = {
    date: "07/28/26", restTaken: 1, restUnknown: false,
    mealScheduled: false, mealInsideBooking: false, mealLate: false,
    secondMealLate: false, mealsRostered: null,
  };

  const at600 = reentitle(base, 6.0);
  assert.equal(at600.restRequired, 1, "one ten owed at six hours");
  assert.equal(at600.mealWaived, true, "and the waiver reaches the day");
  assert.equal(at600.mealViolation, false);
  assert.equal(at600.restViolation, false, "so the day owes nothing");

  const at617 = reentitle(base, 6.17);
  assert.equal(at617.restRequired, 2, "two owed a tenth of an hour later");
  assert.equal(at617.mealWaived, false, "and the waiver no longer reaches it");
  assert.equal(at617.mealViolation, true);
  assert.equal(at617.restViolation, true, "so the same day owes two hours");
});

test("the bands are the statute's, not something this file invented", () => {
  assert.equal(restsRequired(3.4), 0);
  assert.equal(restsRequired(3.5), 1);
  assert.equal(restsRequired(6), 1);
  assert.equal(restsRequired(6.01), 2);
  assert.equal(restsRequired(10), 2);
  assert.equal(restsRequired(10.01), 3);
});

// ---------------------------------------------------------------------------
// A PATCH NOBODY COPIES IS A PATCH THAT DOES NOTHING.
//
// `applyOverrides` copies a WHITELIST of fields off the override onto the day,
// and a field missing from it is ignored in silence - no error, no warning, the
// figure simply never moves. `patchesFor` had been setting `addedHours`,
// `restsOffClock` and `restsOffClockMin` ever since an answer started moving
// hours, and none of the three were on the list. Uribe's daily total corrected
// to 6.00 while the comment beside it still read "+0.17 added". Mánu 2026-08-11.
//
// So the two are checked against each other rather than by eye.

test("every field an answer patches survives applyOverrides", () => {
  const q = {
    kind: "restOutsideScheduled",
    row: { detail: [{ date: "07/28/26", minutes: 10 }] },
  };
  const d = {
    date: "07/28/26", paidHours: 6.17, restsOffClock: 1, restsOffClockMin: 10,
    addedHours: 0.17, restTaken: 1, restRequired: 2, restUnknown: false,
  };

  for (const choice of ["yes", "no", "notaken"]) {
    const patch = patchesFor(q, choice, d);
    const [out] = applyOverrides([d], { "07/28/26": patch });
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) continue;
      assert.deepEqual(
        out[k], v,
        `"${choice}" patches ${k} to ${JSON.stringify(v)} and applyOverrides dropped it - `
        + "add it to the whitelist there or the sheet keeps the old figure",
      );
    }
  }
});

test("taking the minutes off stops the sheet declaring them as added", () => {
  const q = {
    kind: "restOutsideScheduled",
    row: { detail: [{ date: "07/28/26", minutes: 10 }] },
  };
  const d = {
    date: "07/28/26", paidHours: 6.17, restsOffClock: 1, restsOffClockMin: 10,
    addedHours: 0.17, restTaken: 1, restRequired: 2, restUnknown: false,
  };
  const [moved] = applyOverrides([d], { "07/28/26": patchesFor(q, "no", d) });
  assert.equal(moved.paidHours, 6, "the hours come off");
  assert.equal(moved.addedHours, 0, "and the +0.17 note goes with them");
  assert.equal(moved.restsOffClockMin, 0, "as does the stripe on the cell");

  // AND THE OPPOSITE: confirming the time keeps all three where they were.
  const [kept] = applyOverrides([d], { "07/28/26": patchesFor(q, "yes", d) });
  assert.equal(kept.paidHours, 6.17);
  assert.equal(kept.addedHours, 0.17, "still added, so still declared");
});
