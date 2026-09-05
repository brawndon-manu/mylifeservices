// THE DELTA BETWEEN TWO AUDIT COPIES, pinned. The dangerous edges: a day only
// one copy covers is not a change, minute-identical shifts stay silent, and
// a vanished shift is counted but never badged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffAuditRows, periodOverlap } from "../audit-changes.js";

const row = (over = {}) => ({
  shiftKey: "k1", date: "08/20/26", billedMin: 240, clockedMin: 240,
  note: { words: 50 }, scheduleNote: null,
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
  const { changed, gone } = diffAuditRows(oldRows, newRows, overlap);
  assert.equal(changed.k1, undefined);
  assert.deepEqual(changed.k2, ["hours"]);
  assert.deepEqual(changed.k3, ["note"]);
  assert.deepEqual(changed.k4, ["new"]);
  assert.equal(gone, 0);
});

test("a day the old copy never covered is new territory, not a change", () => {
  const overlap = { from: "08/16/26", to: "08/31/26" };
  const { changed } = diffAuditRows([], [row({ shiftKey: "early", date: "08/05/26" })], overlap);
  assert.deepEqual(changed, {});
});

test("a note that grew and hours that moved stack on one shift", () => {
  const overlap = { from: "08/16/26", to: "08/31/26" };
  const { changed } = diffAuditRows(
    [row({ note: { words: 10 }, clockedMin: 200 })],
    [row({ note: { words: 60 }, clockedMin: 240 })],
    overlap,
  );
  assert.deepEqual(changed.k1, ["hours", "note"]);
});

test("a vanished shift is counted, never badged", () => {
  const overlap = { from: "08/16/26", to: "08/31/26" };
  const { changed, gone } = diffAuditRows([row()], [], overlap);
  assert.deepEqual(changed, {});
  assert.equal(gone, 1);
});
