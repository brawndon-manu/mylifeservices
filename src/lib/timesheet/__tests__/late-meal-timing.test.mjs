// The late-meal rule, pinned by the one day in the batch that argues with it.
//
// `mealLate` requires the schedule to have rostered a meal, then times the day's
// FIRST 21-90 minute punch gap. It never asks whether that gap is the rostered
// meal, which reads like a defect and mostly is not: measured 2026-08-09 over
// all 16 late-meal premiums in the live batch, 15 time the rostered meal.
//
// KRISTY HATT, 07/31/26, IS THE ONE THAT DOES NOT, AND SHE IS OWED THE PREMIUM
// ANYWAY. That is the whole point of this file. The obvious "fix" - require the
// timed gap to BE the rostered meal - withdraws her hour and takes the batch
// from 680 to 679, and she is owed it on either reading of her day:
//
//   she is on the clock continuously 07:30-13:30, six hours, because the seams
//   between her bookings are zero minutes wide. The schedule rostered her meal
//   at 11:30-12:00, which falls INSIDE that run, so she worked through it. Her
//   only unpaid gap is 13:30-14:30, at 360 worked minutes against a 300 minute
//   deadline. Either she was given no meal at all, or she took one an hour late.
//   Both owe the same premium.
//
// So the rule reaches the right answer by a route nobody had written down, and
// the risk is somebody correcting it. If a change makes the first test below
// fail, that change is taking an hour off a real person.
//
// Every test pairs the case with its opposite.
import { test } from "node:test";
import assert from "node:assert/strict";

import { analyzeDay, RULES } from "../parse.js";

const at = (h, m = 0) => ({ min: h * 60 + m });
const b = (h1, m1, h2, m2, meal = false) =>
  ({ start: h1 * 60 + m1, end: h2 * 60 + m2, meal });

// Hatt 07/31/26 exactly: three bookings with zero-minute seams, then an hour
// off, then a fourth. Eight hours paid.
const HATT = [at(7, 30), at(9, 30), at(9, 30), at(11, 30), at(11, 30), at(13, 30), at(14, 30), at(16, 30)];
// HER REAL ROSTER, read off the July schedule export rather than invented.
// Note the third and fourth entries: the meal QSP rostered at 11:30-12:00 sits
// INSIDE a client booking running 11:30-13:30. She was scheduled to be at lunch
// and with a client at the same time, which is its own reason she worked
// through it. The seam between that booking and the 14:30 one is the 13:30-14:30
// gap the timing test ends up reading.
const HATT_ROSTER = [
  b(7, 30, 9, 30),
  b(9, 30, 11, 30),
  b(11, 30, 12, 0, true),
  b(11, 30, 13, 30),
  b(14, 30, 16, 30),
];

const hatt = (extra = {}) =>
  analyzeDay({
    date: "07/31/26",
    punches: HATT,
    printed: { daily: 8 },
    mealScheduled: true,
    scheduleBlocks: HATT_ROSTER,
    restsAlreadyPaid: true,
    ...extra,
  });

// UPDATED 2026-08-09 by Mánu's ruling that a lunch rostered inside a booking is
// not a lunch. Her day still owes the hour, and now for the reason that was
// staring at everyone: QSP gave her a meal at 11:30-12:00 and a client from
// 11:30 to 13:30. The premium no longer depends on the timing test reading a
// gap it never checked, which was the fragility this file was written to pin.
test("Hatt 07/31: the rostered lunch is booked over, so it never counted. Premium OWED", () => {
  const d = hatt();
  assert.equal(d.mealInsideBooking, true, "meal 11:30-12:00 vs booking 11:30-13:30");
  assert.equal(d.mealViolation, true, "withdrawing this takes an hour off a real person");
  // and it is no longer reached through lateness at all
  assert.equal(d.mealLate, false, "you cannot be late for a meal you were never given");
  // she is still on the clock six hours before her first unpaid minute, which is
  // what made the old route look right
  assert.equal(d.mealStartedAfterMin, 360);
  assert.ok(d.mealStartedAfterMin > RULES.mealMustStartByMin);
});

test("the same shift with a CLEAN rostered meal, taken on time, owes nothing", () => {
  // the roster fixed: the 11:30-12:00 lunch with no booking over it, and she
  // punches out for it 240 minutes in. If this ever stops clearing, the test
  // above is passing because the day always owes.
  const cleanRoster = [
    b(7, 30, 11, 30),
    b(11, 30, 12, 0, true),
    b(12, 0, 16, 30),
  ];
  const onTime = [at(7, 30), at(11, 30), at(12, 0), at(16, 30)];
  const d = analyzeDay({
    date: "07/31/26",
    punches: onTime,
    printed: { daily: 8 },
    mealScheduled: true,
    scheduleBlocks: cleanRoster,
    restsAlreadyPaid: true,
  });
  assert.equal(d.mealInsideBooking, false);
  assert.equal(d.mealStartedAfterMin, 240);
  assert.equal(d.mealLate, false);
  assert.equal(d.mealViolation, false, "a meal actually given, and taken on time");
});

// 15 of the 16 look like this instead, and they must keep working.
test("a late meal taken at the rostered time is still late, and still charged", () => {
  // rostered 14:30-15:00 and punched there, but that is 360 minutes in
  const roster = [b(8, 30, 14, 30), b(14, 30, 15, 0, true), b(15, 0, 17, 0)];
  const punches = [at(8, 30), at(14, 30), at(15, 0), at(17, 0)];
  const d = analyzeDay({
    date: "07/29/26",
    punches,
    printed: { daily: 8 },
    mealScheduled: true,
    scheduleBlocks: roster,
    restsAlreadyPaid: true,
  });
  assert.equal(d.mealGapKind, "rostered-meal", "this gap IS the rostered meal");
  assert.equal(d.mealLate, true);
  assert.equal(d.mealViolation, true);

  // the same roster, met on time, must clear - otherwise the test above proves
  // only that this day always owes
  const early = [at(8, 30), at(12, 30), at(13, 0), at(17, 0)];
  const ok = analyzeDay({
    date: "07/29/26",
    punches: early,
    printed: { daily: 8 },
    mealScheduled: true,
    scheduleBlocks: [b(8, 30, 12, 30), b(12, 30, 13, 0, true), b(13, 0, 17, 0)],
    restsAlreadyPaid: true,
  });
  assert.equal(ok.mealLate, false);
  assert.equal(ok.mealViolation, false);
});

test("lateness is measured in WORKED minutes, not elapsed time", () => {
  // a split shift: off 10:00-14:00, back 14:00-18:00, meal gap at 18:00.
  // elapsed from clock-in is 10.5 hours; worked before it is only 5 hours, so
  // this is NOT late. measuring elapsed here turned 45 late rests into 54 once
  // already.
  const split = [at(8), at(9), at(14), at(18), at(18, 30), at(19)];
  const d = analyzeDay({
    date: "07/29/26",
    punches: split,
    printed: null,
    mealScheduled: true,
    scheduleBlocks: [b(8, 0, 9, 0), b(14, 0, 18, 0), b(18, 0, 18, 30, true), b(18, 30, 19, 0)],
    restsAlreadyPaid: true,
  });
  assert.equal(d.mealStartedAfterMin, 300, "5 hours worked, not 10.5 elapsed");
  assert.equal(d.mealLate, false, "exactly on the deadline is not past it");
});
