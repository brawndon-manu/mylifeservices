// WHAT A SHIFT BILLS, pinned: the roster's figure, the reviewer's correction,
// the signed amendment, and which of the last two wins when both stand.
import { test } from "node:test";
import assert from "node:assert/strict";
import { billableOf, billableMinOf, isAdjusted, adjustedWord } from "../billable-of.js";

const row = (over = {}) => ({ billedMin: 150, schedFrom: 840, schedTo: 990, review: null, amendment: null, ...over });
const amendment = (over = {}) => ({ min: 138, from: 825, to: 963, timesChanged: true, by: "Mánu Uribe", byLegal: "Brandon Uribe", at: "2026-09-22T23:23:20.309Z", ...over });
const review = (over = {}) => ({ billableMin: 120, billableFrom: 840, billableTo: 960, by: "April", byLegal: "April Martinez", lastAt: "2026-09-20T10:00:00.000Z", ...over });

test("with nothing set the roster bills, over its own window", () => {
  const b = billableOf(row());
  assert.deepEqual([b.min, b.from, b.to, b.source, b.by], [150, 840, 990, "billed", null]);
  assert.equal(isAdjusted(row()), false);
});

test("a signed amendment sets the billable, and says who approved it", () => {
  const b = billableOf(row({ amendment: amendment() }));
  assert.deepEqual([b.min, b.from, b.to, b.source, b.by, b.byLegal], [138, 825, 963, "amendment", "Mánu Uribe", "Brandon Uribe"]);
  assert.equal(billableMinOf(row({ amendment: amendment() })), 138);
  assert.equal(adjustedWord(row({ amendment: amendment() })), "amended");
});

test("an amendment that moved no time leaves the roster's figure alone", () => {
  const b = billableOf(row({ amendment: amendment({ timesChanged: false }) }));
  assert.equal(b.source, "billed");
  assert.equal(b.min, 150);
});

test("a reviewer's correction bills, and a review that corrected nothing defers to the amendment", () => {
  const b = billableOf(row({ review: review() }));
  assert.deepEqual([b.min, b.source, b.by], [120, "review", "April"]);
  assert.equal(adjustedWord(row({ review: review() })), "adjusted");
  const deferred = billableOf(row({ review: review({ billableMin: null }), amendment: amendment() }));
  assert.equal(deferred.source, "amendment");
});

test("when both stand the later statement wins", () => {
  // the amendment was approved after the correction: it had the correction in front of it
  const later = billableOf(row({ review: review(), amendment: amendment() }));
  assert.equal(later.source, "amendment");
  // the reviewer corrected again after the approval: that is the last word
  const recorrected = billableOf(row({ review: review({ lastAt: "2026-09-23T08:00:00.000Z" }), amendment: amendment() }));
  assert.equal(recorrected.source, "review");
  // a review with no timestamp at all never outranks a dated approval
  const undated = billableOf(row({ review: review({ lastAt: null }), amendment: amendment() }));
  assert.equal(undated.source, "amendment");
});
