import test from "node:test";
import assert from "node:assert/strict";
import { mealWindows, mealTimeFits, restTimeFits, MEAL_MIN_MINUTES } from "../questions.js";

// minutes past midnight, the only unit the day rows use
const at = (h, m = 0) => h * 60 + m;
// a day is its punches, in pairs. these are Uribe 08/02 as the Daily Service
// Payroll Report prints it: 9-11, 11:30-1:30, 5:15-6:15.
const uribe0802 = {
  punches: [
    { min: at(9) }, { min: at(11) },
    { min: at(11, 30) }, { min: at(13, 30) },
    { min: at(17, 15) }, { min: at(18, 15) },
  ],
};
const continuous = { punches: [{ min: at(9) }, { min: at(16) }] };

test("both gaps are offered, not only the longest", () => {
  // Mánu 2026-08-12: "offer both gaps or let them choose their own"
  const w = mealWindows(uribe0802);
  assert.deepEqual(w, [
    { from: at(11), to: at(11, 30) },     // 30 minutes
    { from: at(13, 30), to: at(17, 15) }, // 225 minutes
  ]);
});

test("a gap under thirty minutes is not offered at all", () => {
  const day = { punches: [{ min: at(9) }, { min: at(12) }, { min: at(12, 20) }, { min: at(15) }] };
  assert.deepEqual(mealWindows(day), []);
  assert.equal(mealTimeFits(day, at(12)).ok, false);
});

test("a lunch fits a thirty minute gap exactly, and nowhere later in it", () => {
  assert.equal(mealTimeFits(uribe0802, at(11)).ok, true);
  // starting five past leaves only 25 minutes before the next shift
  assert.equal(mealTimeFits(uribe0802, at(11, 5)).ok, false);
});

test("the 225 minute gap holds one with room to spare", () => {
  // "the two hundred twenty five minute gap is unscheduled unpaid time" - which
  // is exactly why a half hour fits inside it
  assert.equal(mealTimeFits(uribe0802, at(13, 30)).ok, true);
  assert.equal(mealTimeFits(uribe0802, at(15)).ok, true);
  assert.equal(mealTimeFits(uribe0802, at(16, 45)).ok, true);
  assert.equal(mealTimeFits(uribe0802, at(16, 46)).ok, false); // runs past 5:15
});

test("a time inside a worked shift is refused - a meal is off the clock", () => {
  assert.equal(mealTimeFits(uribe0802, at(10)).ok, false);
  assert.equal(mealTimeFits(uribe0802, at(12)).ok, false);
});

test("a day with no gap offers nothing and accepts nothing", () => {
  assert.deepEqual(mealWindows(continuous), []);
  assert.equal(mealTimeFits(continuous, at(12)).why, "nogap");
});

test("a meal goes in a gap and a ten goes in a shift - opposite rules", () => {
  // the same minute cannot be right for both, which is the point of two functions
  const inGap = at(11, 10);
  const inShift = at(10);
  assert.equal(mealTimeFits(uribe0802, at(11)).ok, true);
  assert.equal(restTimeFits(uribe0802, 1, inShift).ok, true);
  assert.equal(mealTimeFits(uribe0802, inShift).ok, false);
  assert.equal(restTimeFits(uribe0802, 1, inGap).ok, false);
});

test("nonsense in, false out - never a thrown upload", () => {
  assert.equal(mealTimeFits(uribe0802, null).ok, false);
  assert.equal(mealTimeFits(uribe0802, NaN).ok, false);
  assert.equal(mealTimeFits({ punches: [] }, at(12)).ok, true);   // no punches: nothing to judge it by
  assert.equal(MEAL_MIN_MINUTES, 30);
});
