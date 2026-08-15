// THE KEY BOTH ENDS OF ONE CONVERSATION HAVE TO AGREE ON.
//
// A break answer can be written from two places: a reviewer pressing "Confirm
// not taken" after a call, and the employee saying they missed it on their own
// page. Same fact, same day, so it has to be the same ROW - two spellings would
// be two records that can disagree, and the sheet prints both.
//
// It lived inline on the admin screen and nowhere else, because nowhere else
// could write one. These pin it now that a second caller exists.
import { test } from "node:test";
import assert from "node:assert/strict";

import { breakFindingKey, breakFindingKind } from "../break-answers.js";

test("the three kinds get three different keys", () => {
  // a late meal and a missing meal are different questions about the same day -
  // one asks why it was not taken, the other why it started when it did - so
  // they must not land on one row
  assert.equal(breakFindingKey("rest", "08/04/26"), "break-rest-08/04/26");
  assert.equal(breakFindingKey("meal", "08/04/26"), "break-meal-08/04/26");
  assert.equal(breakFindingKey("meal-late", "08/04/26"), "break-meallate-08/04/26");
  const keys = new Set([
    breakFindingKey("rest", "08/04/26"),
    breakFindingKey("meal", "08/04/26"),
    breakFindingKey("meal-late", "08/04/26"),
  ]);
  assert.equal(keys.size, 3);
});

test("the spelling is exactly what the admin screen already writes", () => {
  // `meallate`, unpunctuated. That is what is in the database on the admin path
  // and it is not worth a migration to prettify - but it IS worth pinning, since
  // the employee's side now has to produce the identical string.
  assert.match(breakFindingKey("meal-late", "07/31/26"), /^break-meallate-/);
  assert.doesNotMatch(breakFindingKey("meal-late", "07/31/26"), /meal-late/);
});

test("a kind or a date it cannot build a key from returns null", () => {
  // the caller has to be able to tell "no key" from a key spelled "break--"
  assert.equal(breakFindingKey("rest", null), null);
  assert.equal(breakFindingKey(null, "08/04/26"), null);
  assert.equal(breakFindingKey("lunch", "08/04/26"), null, "not a kind we answer");
  assert.equal(breakFindingKey("", ""), null);
});

test("a stored key says which violation it belongs to without anyone parsing it", () => {
  assert.deepEqual(breakFindingKind("break-rest-08/04/26"), { kind: "rest", date: "08/04/26" });
  assert.deepEqual(breakFindingKind("break-meal-08/04/26"), { kind: "meal", date: "08/04/26" });
  assert.deepEqual(breakFindingKind("break-meallate-08/04/26"), { kind: "meal-late", date: "08/04/26" });
});

test("round trip, on every kind", () => {
  // THE CHECK THAT MATTERS. `meal` is a prefix of `meallate`, so a lazy pattern
  // reads "break-meallate-08/04/26" as a meal on the date "late-08/04/26" - and
  // the two would then share a row, which is the one thing the three keys exist
  // to prevent.
  for (const kind of ["rest", "meal", "meal-late"]) {
    const back = breakFindingKind(breakFindingKey(kind, "08/04/26"));
    assert.deepEqual(back, { kind, date: "08/04/26" }, `${kind} did not survive the round trip`);
  }
});

test("anything that is not one of ours comes back null", () => {
  assert.equal(breakFindingKind("person"), null, "the whole-person mark is not a break answer");
  assert.equal(breakFindingKind("overlap-08/07/26"), null);
  assert.equal(breakFindingKind(""), null);
  assert.equal(breakFindingKind(null), null);
});
