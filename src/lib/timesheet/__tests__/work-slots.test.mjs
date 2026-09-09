// A FULL DAY'S WORK, AS THE EMPLOYEE STATES IT (Mánu 2026-09-08).
// An hours correction carries every slot for the day now, and the number has
// to agree with them. These pins hold the rules the screen and the server both
// call, so neither can accept a claim the other would refuse.
import test from "node:test";
import assert from "node:assert/strict";

import {
  checkWorkSlots,
  slotsFromShifts,
  minutesToClock,
  clockLabel,
  kindTakesSlots,
  MAX_SLOTS,
} from "../work-slots.js";

test("the day's own punches open the boxes, unchanged slots included", () => {
  // shiftsOf's shape: minutes in, pairs out
  assert.deepEqual(slotsFromShifts([{ from: 480, to: 660 }, { from: 690, to: 870 }]), [
    { from: "08:00 AM", to: "11:00 AM" },
    { from: "11:30 AM", to: "02:30 PM" },
  ]);
  // a zero-length or backwards punch pair is not a slot to edit
  assert.deepEqual(slotsFromShifts([{ from: 480, to: 480 }, { from: 700, to: 600 }]), []);
  assert.deepEqual(slotsFromShifts(null), []);
  assert.equal(minutesToClock(0), "00:00");
  assert.equal(minutesToClock(1439), "23:59");
  assert.equal(clockLabel(780), "01:00 PM");
});

test("slots that add up to the claimed hours pass, at the app's two decimals", () => {
  const r = checkWorkSlots([{ from: "8", to: "11" }, { from: "1130", to: "230" }], 6);
  assert.equal(r.ok, true);
  assert.equal(r.minutes, 360);
  assert.equal(r.hours, 6);
  // stored structured, in minutes, sorted
  assert.deepEqual(r.slots, [{ from: 480, to: 660 }, { from: 690, to: 870 }]);
  // the loose parser and the workday rule are the ones the cards use: "230"
  // is the afternoon, not half two in the morning
  assert.equal(checkWorkSlots([{ from: "9", to: "1215" }], 3.25).ok, true);
  // 7.5 and 7.50 are the same claim
  assert.equal(checkWorkSlots([{ from: "8", to: "330" }], 7.5).ok, true);
});

test("a total that disagrees with the slots is refused, and says both figures", () => {
  const r = checkWorkSlots([{ from: "8", to: "11" }], 6);
  assert.equal(r.ok, false);
  assert.equal(r.code, "mismatch");
  assert.equal(r.hours, 3);
  assert.equal(r.message, "These slots come to 3.00 hours. The day says 6.00.");
  assert.equal(r.slots, undefined); // nothing structured leaves a failed check
});

test("incomplete, backwards, overnight and overlapping slots are all refused", () => {
  assert.equal(checkWorkSlots([{ from: "8", to: "" }], 8).code, "incomplete");
  assert.equal(checkWorkSlots([{ from: "", to: "5" }], 8).code, "incomplete");
  assert.equal(checkWorkSlots([{ from: "zzz", to: "5" }], 8).code, "incomplete");
  // end before start, and the overnight shape that used to be a checkbox
  assert.equal(checkWorkSlots([{ from: "5", to: "8" }], 3).code, "backwards");
  assert.equal(checkWorkSlots([{ from: "10p", to: "6a" }], 8).code, "backwards");
  // equal start and end is not a slot
  assert.equal(checkWorkSlots([{ from: "8", to: "8" }], 0.01).code, "backwards");
  // touching is fine, crossing is not
  assert.equal(checkWorkSlots([{ from: "8", to: "12" }, { from: "12", to: "4" }], 8).ok, true);
  assert.equal(checkWorkSlots([{ from: "8", to: "1230" }, { from: "12", to: "4" }], 8.5).code, "overlap");
});

test("the hours figure itself has to be a real day", () => {
  assert.equal(checkWorkSlots([{ from: "8", to: "11" }], "").code, "badHours");
  assert.equal(checkWorkSlots([{ from: "8", to: "11" }], null).code, "badHours");
  assert.equal(checkWorkSlots([{ from: "8", to: "11" }], 0).code, "badHours");
  assert.equal(checkWorkSlots([{ from: "8", to: "11" }], -3).code, "badHours");
  assert.equal(checkWorkSlots([{ from: "8", to: "11" }], 25).code, "badHours");
  assert.equal(checkWorkSlots([{ from: "8", to: "11" }], "abc").code, "badHours");
});

test("an empty claim is refused rather than counted as zero", () => {
  // ZERO HOURS IS NOT THIS FORM'S JOB. Removing a day goes through day_extra,
  // which is a kind of its own, so a blank slot list can only be a mistake.
  assert.equal(checkWorkSlots([], 8).code, "noSlots");
  assert.equal(checkWorkSlots([{ from: "", to: "" }], 8).code, "noSlots");
  assert.equal(checkWorkSlots(null, 8).code, "noSlots");
  const many = Array.from({ length: MAX_SLOTS + 1 }, () => ({ from: "8", to: "9" }));
  assert.equal(checkWorkSlots(many, MAX_SLOTS + 1).code, "tooMany");
});

test("only the two hours kinds carry slots", () => {
  assert.equal(kindTakesSlots("hours"), true);
  assert.equal(kindTakesSlots("day_missing"), true);
  for (const k of ["meal_missed", "meal_taken", "meal_ontime", "rest_missed", "rest_taken", "day_extra", "other"]) {
    assert.equal(kindTakesSlots(k), false, `${k} must not ask for slots`);
  }
});

test("what the boxes are prefilled with survives the server's own check", () => {
  // THE INTEGRATION THAT MATTERS. The screen fills the boxes with display
  // strings from slotsFromShifts and sends them BACK AS TYPED, so the server
  // re-reads the employee's own input. If those two ends ever disagree about a
  // format, an untouched day would be refused on submit while the screen said
  // it was fine.
  const shifts = [{ from: 510, to: 630 }, { from: 690, to: 990 }]; // 8:30-10:30, 11:30-4:30
  const prefilled = slotsFromShifts(shifts);
  assert.deepEqual(prefilled, [
    { from: "08:30 AM", to: "10:30 AM" },
    { from: "11:30 AM", to: "04:30 PM" },
  ]);
  const hours = (630 - 510 + 990 - 690) / 60; // 7
  const check = checkWorkSlots(prefilled, hours);
  assert.equal(check.ok, true, check.message);
  // and it comes back as the very minutes it started from
  assert.deepEqual(check.slots, shifts);
  // a midnight-adjacent day round-trips too
  const late = slotsFromShifts([{ from: 0, to: 60 }, { from: 1380, to: 1439 }]);
  assert.deepEqual(late, [{ from: "12:00 AM", to: "01:00 AM" }, { from: "11:00 PM", to: "11:59 PM" }]);
  const lateCheck = checkWorkSlots(late, (60 + 59) / 60);
  assert.equal(lateCheck.ok, true, lateCheck.message);
});
