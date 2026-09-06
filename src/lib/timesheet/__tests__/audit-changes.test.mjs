// THE DELTA BETWEEN TWO AUDIT COPIES, pinned. The dangerous edges: a day only
// one copy covers is not a change, minute-identical shifts stay silent, a
// vanished shift keeps its identity, and a decided shift whose facts moved
// goes back in the flagged pile with the reviewer's verdict surviving inside
// the reason.
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffAuditRows, periodOverlap, adjustedAfterReviewPlan } from "../audit-changes.js";

const row = (over = {}) => ({
  shiftKey: "k1", who: "Bee Wye", whoLegal: "Brianna Wyatt", date: "08/20/26",
  client: "Acuna, Jacob", billedMin: 240, clockedMin: 240,
  note: { words: 50, summary: "walked to the bank", source: "dsn" }, scheduleNote: null,
  ...over,
});

test("the overlap of two ranges is the days both cover", () => {
  assert.deepEqual(
    periodOverlap({ from: "08/16/26", to: "08/31/26" }, { from: "08/01/26", to: "08/31/26" }),
    { from: "08/16/26", to: "08/31/26" },
  );
  assert.equal(periodOverlap({ from: "08/01/26", to: "08/15/26" }, { from: "09/01/26", to: "09/15/26" }), null);
});

test("moved hours and grown notes mark a change; identical shifts stay silent", () => {
  const overlap = { from: "08/16/26", to: "08/31/26" };
  const oldRows = [row(), row({ shiftKey: "k2", billedMin: 120 }), row({ shiftKey: "k3", note: null })];
  const newRows = [
    row(),                                            // untouched
    row({ shiftKey: "k2", billedMin: 150 }),          // hours moved
    row({ shiftKey: "k3", note: { words: 40 } }),     // note appeared
    row({ shiftKey: "k4" }),                          // new on a covered day
  ];
  const { changed, details, gone } = diffAuditRows(oldRows, newRows, overlap);
  assert.equal(changed.k1, undefined);
  assert.deepEqual(changed.k2, ["hours"]);
  assert.equal(details.k2, "billed 2.00h -> 2.50h");
  assert.deepEqual(changed.k3, ["note"]);
  assert.deepEqual(changed.k4, ["new"]);
  assert.deepEqual(gone, []);
});

test("a day the old copy never covered is new territory, not a change", () => {
  const overlap = { from: "08/16/26", to: "08/31/26" };
  const { changed } = diffAuditRows([], [row({ shiftKey: "early", date: "08/05/26" })], overlap);
  assert.deepEqual(changed, {});
});

test("a note that grew and hours that moved stack on one shift", () => {
  const overlap = { from: "08/16/26", to: "08/31/26" };
  const { changed, details } = diffAuditRows(
    [row({ note: { words: 10 }, clockedMin: 200 })],
    [row({ note: { words: 60 }, clockedMin: 240 })],
    overlap,
  );
  assert.deepEqual(changed.k1, ["hours", "note"]);
  assert.match(details.k1, /clocked 3\.33h -> 4\.00h/);
  assert.match(details.k1, /changed \(10 -> 60 words\)/);
});

test("a note that vanished or shrank is a change now, not silence", () => {
  const overlap = { from: "08/16/26", to: "08/31/26" };
  const { changed, details } = diffAuditRows(
    [row(), row({ shiftKey: "k2", note: { words: 80, summary: "s", source: "dsn" } })],
    [row({ note: null }), row({ shiftKey: "k2", note: { words: 30, summary: "s", source: "dsn" } })],
    overlap,
  );
  assert.deepEqual(changed.k1, ["note-gone"]);
  assert.equal(details.k1, "DSN note gone (was 50 words)");
  assert.deepEqual(changed.k2, ["note"]);
  assert.equal(details.k2, "DSN note changed (80 -> 30 words)");
});

test("same words but different opening is a reword; schedule notes count both ways", () => {
  const overlap = { from: "08/16/26", to: "08/31/26" };
  const { changed, details } = diffAuditRows(
    [row({ note: { words: 50, summary: "walked to the bank", source: "xls" }, scheduleNote: { text: "cancelled" } }),
      row({ shiftKey: "k2", scheduleNote: null })],
    [row({ note: { words: 50, summary: "drove to the office", source: "xls" }, scheduleNote: null }),
      row({ shiftKey: "k2", scheduleNote: { text: "makeup visit" } })],
    overlap,
  );
  assert.deepEqual(changed.k1.sort(), ["note", "note-gone"]);
  assert.match(details.k1, /service note reworded/);
  assert.match(details.k1, /schedule note gone/);
  assert.deepEqual(changed.k2, ["note"]);
  assert.equal(details.k2, "schedule note added");
});

test("a vanished shift keeps its identity for the screen and the re-flag", () => {
  const overlap = { from: "08/16/26", to: "08/31/26" };
  const { changed, gone } = diffAuditRows([row()], [], overlap);
  assert.deepEqual(changed, {});
  assert.equal(gone.length, 1);
  assert.equal(gone[0].shiftKey, "k1");
  assert.equal(gone[0].whoLegal, "Brianna Wyatt");
  assert.equal(gone[0].billedMin, 240);
});

// ---- the flips: decided shifts whose facts moved ----

const review = (over = {}) => ({
  shiftKey: "k1", decision: "approved", reason: null, decidedBy: { name: "Brandon Uribe" },
  ...over,
});

test("an approved shift that changed flips to flagged and says what moved", () => {
  const flips = adjustedAfterReviewPlan(
    { changed: { k1: ["hours"] }, details: { k1: "billed 2.25h -> 3.00h" }, gone: [] },
    [review()],
  );
  assert.deepEqual(flips, [{
    shiftKey: "k1",
    reason: "Auto: changed after review (billed 2.25h -> 3.00h). Was approved by Brandon Uribe.",
  }]);
});

test("a flagged shift keeps the reviewer's words inside the new reason", () => {
  const flips = adjustedAfterReviewPlan(
    { changed: { k1: ["note-gone"] }, details: { k1: "DSN note gone (was 208 words)" }, gone: [] },
    [review({ decision: "flagged", reason: "no clock out" })],
  );
  assert.equal(
    flips[0].reason,
    'Auto: changed after review (DSN note gone (was 208 words)). Earlier flag: "no clock out"',
  );
});

test("an undecided shift that changed is left alone", () => {
  const flips = adjustedAfterReviewPlan(
    { changed: { k9: ["hours"] }, details: { k9: "billed 1.00h -> 2.00h" }, gone: [] },
    [review()],
  );
  assert.deepEqual(flips, []);
});

test("a reviewed shift that vanished flips with the verdict carried", () => {
  const flips = adjustedAfterReviewPlan(
    { changed: {}, details: {}, gone: [{ shiftKey: "k1" }, { shiftKey: "k8" }] },
    [review()],
  );
  assert.deepEqual(flips, [{
    shiftKey: "k1",
    reason: "Auto: gone from the latest upload. Was approved by Brandon Uribe.",
  }]);
});

test("a second flip refreshes the change and carries the closing, never nests", () => {
  const first = adjustedAfterReviewPlan(
    { changed: { k1: ["hours"] }, details: { k1: "billed 2.25h -> 3.00h" }, gone: [] },
    [review({ decision: "flagged", reason: "looks double booked" })],
  )[0];
  const second = adjustedAfterReviewPlan(
    { changed: { k1: ["hours"] }, details: { k1: "billed 3.00h -> 1.50h" }, gone: [] },
    [review({ decision: "flagged", reason: first.reason })],
  )[0];
  assert.equal(
    second.reason,
    'Auto: changed after review (billed 3.00h -> 1.50h). Earlier flag: "looks double booked"',
  );
});

test("a reviewed shift that came back wears that instead of a change list", () => {
  const flips = adjustedAfterReviewPlan(
    { changed: { k1: ["new"] }, details: { k1: "appeared on a day the previous copy already covered" }, gone: [] },
    [review({ decision: "flagged", reason: "Auto: gone from the latest upload. Was approved by Brandon Uribe." })],
  );
  assert.equal(flips[0].reason, "Auto: back in the upload. Was approved by Brandon Uribe.");
});
