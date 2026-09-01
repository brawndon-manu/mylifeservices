// THE REPORTED-PROBLEM CARD'S TIMES, on their way to the office. An unpunched
// break claim carries when it happened; the email line prints those times once
// the report is ACCEPTED, and a claim nobody accepted - or one declined - must
// never read as an edit instruction. Rows filed before the card asked for
// times keep the old timeless sentence.
import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewChoices } from "../qsp-changes.js";

const lunchAt = (status, statedBreaks) => ({
  kind: "meal_taken", date: "08/20/26", status, choice: null, statedBreaks,
});
const MEAL = [{ kindOf: "meal", minutes: 30, from: "12p", to: "12:30p", source: "typed" }];

test("an accepted lunch claim prints its time, once", () => {
  const items = reviewChoices([lunchAt("accepted", MEAL)]);
  assert.equal(items.length, 1);
  assert.equal(items[0].changes.length, 1);
  assert.equal(items[0].changes[0].fact, "The lunch taken from 12p to 12:30p has nothing recorded for it.");
  assert.equal(items[0].changes[0].action, "Log it.");
});

test("a row filed before times existed keeps the old sentence", () => {
  const items = reviewChoices([lunchAt("accepted", null)]);
  assert.equal(items[0].changes[0].fact, "The lunch taken that day was never punched.");
});

test("an open or declined claim tells the office nothing", () => {
  assert.deepEqual(reviewChoices([lunchAt("open", MEAL)]), []);
  assert.deepEqual(reviewChoices([lunchAt("declined", MEAL)]), []);
});

test("two accepted rests print two timed lines", () => {
  const items = reviewChoices([{
    kind: "rest_taken", date: "08/20/26", status: "accepted",
    statedBreaks: [
      { kindOf: "rest", minutes: 10, from: "10a", to: "10:10a", source: "typed" },
      { kindOf: "rest", minutes: 10, from: "2p", to: "2:10p", source: "typed" },
    ],
  }]);
  assert.equal(items[0].changes.length, 2);
  assert.match(items[0].changes[0].fact, /rest break taken from 10a to 10:10a/);
  assert.match(items[0].changes[1].fact, /rest break taken from 2p to 2:10p/);
});

test("a declined question's times still speak - only report rows wait on acceptance", () => {
  const items = reviewChoices([{
    kind: "q_restOutsideScheduled", date: "08/21/26", status: "declined", choice: "no",
    statedBreaks: [{ kindOf: "rest", minutes: 10, from: "10a", to: "10:10a", replaces: { from: "7:50a", to: "8a" } }],
  }]);
  assert.equal(items.length, 1);
  assert.match(items[0].changes[0].fact, /recorded 7:50a to 8a actually happened 10a to 10:10a/);
});

// the accepted claim's landing on the day override, tested where it lives
import { claimedTimesPatch } from "../corrections.js";

test("accepting a claim joins its times to what the date already holds", () => {
  const overrides = { "08/20/26": { statedBreaks: [{ kindOf: "rest", from: "10a", to: "10:10a" }] } };
  const patch = claimedTimesPatch(overrides, "08/20/26", MEAL);
  assert.equal(patch.statedBreaks.length, 2);
  assert.equal(patch.statedBreaks[0].kindOf, "rest");
  assert.equal(patch.statedBreaks[1].from, "12p");
});

test("no usable times, no date, no claim - no patch key at all", () => {
  assert.equal(claimedTimesPatch({}, "08/20/26", null), null);
  assert.equal(claimedTimesPatch({}, "08/20/26", [{ kindOf: "meal" }]), null);
  assert.equal(claimedTimesPatch({}, null, MEAL), null);
});
