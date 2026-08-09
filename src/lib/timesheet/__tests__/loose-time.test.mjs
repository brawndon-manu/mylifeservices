// The rules Mánu gave 2026-08-09 for typing a break time on the signed sheet:
// "if they put 9 it auto saves to 9:00 am same for 900 9am, 1230 to 12:30 pm.
// if its anything from 7-11 we assume am if its from 12-6 we assume its pm. if
// they put 12pm then it goes to 12:00 pm."
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseLooseTime, formatTimeDisplay } from "../../loose-time.js";

const work = (s) => parseLooseTime(s, { assumeWorkday: true });

test("his examples, one for one", () => {
  assert.equal(work("9"), "09:00");
  assert.equal(work("900"), "09:00");
  assert.equal(work("9am"), "09:00");
  assert.equal(work("1230"), "12:30");
  assert.equal(work("12pm"), "12:00");
});

test("7 through 11 is morning, 12 through 6 is afternoon", () => {
  for (const [typed, want] of [["7", "07:00"], ["8", "08:00"], ["11", "11:00"]]) {
    assert.equal(work(typed), want, `${typed} should read as morning`);
  }
  for (const [typed, want] of [["12", "12:00"], ["1", "13:00"], ["230", "14:30"], ["6", "18:00"]]) {
    assert.equal(work(typed), want, `${typed} should read as afternoon`);
  }
});

test("a typed am or pm always wins over the assumption", () => {
  // 2 would be afternoon on its own; said out loud it is not
  assert.equal(work("2am"), "02:00");
  assert.equal(work("2"), "14:00");
  // and 9 would be morning on its own
  assert.equal(work("9pm"), "21:00");
  assert.equal(work("9"), "09:00");
  assert.equal(work("12am"), "00:00");
});

test("four bare digits are read as 24-hour and left alone", () => {
  // otherwise 0630 comes back as half past six in the EVENING, which is a wrong
  // time on a wage document. Every example above still lands the same way.
  assert.equal(work("0630"), "06:30");
  assert.equal(work("1430"), "14:30");
  assert.equal(work("0900"), "09:00");
  // three digits are not 24-hour notation, so the rule still applies
  assert.equal(work("630"), "18:30");
});

test("the assumption is OFF unless asked for, so meetings are unaffected", () => {
  // Company Meetings and Events have used this for months. An 8pm event typed
  // as "8" must not silently become 8am there, and a 2pm one must not become
  // 2pm here by a rule that surface never opted into.
  assert.equal(parseLooseTime("2"), "02:00");
  assert.equal(work("2"), "14:00");
  assert.equal(parseLooseTime("230"), "02:30");
  assert.equal(work("230"), "14:30");
});

test("nonsense comes back empty rather than as a guess", () => {
  for (const bad of ["", "   ", "abc", "25", "9:75", "99:99"]) {
    assert.equal(work(bad), "", `"${bad}" should not parse`);
  }
});

test("what the person sees echoed back", () => {
  assert.equal(formatTimeDisplay(work("230")), "02:30 PM");
  assert.equal(formatTimeDisplay(work("9")), "09:00 AM");
  assert.equal(formatTimeDisplay(work("12pm")), "12:00 PM");
  assert.equal(formatTimeDisplay(work("12am")), "12:00 AM");
});
