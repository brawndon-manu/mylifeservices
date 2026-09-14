// WHICH DAYS AN AUDIT COPY SHOWS - Mánu 2026-09-14: "is there a way we can make
// it so i pick which days it goes to as far as what is showed".
//
// Measured on the copy that prompted it: uploaded 09/14 with every export
// pulled for 09/01-09/13 except the month schedule, which carried the whole
// month. 79 rows landed on 09/14 with no clock row, no note and no punch on any
// of them, and all 79 became "no DSN" auto flags.
import { test } from "node:test";
import assert from "node:assert/strict";
import { auditWindow, inAuditWindow } from "../audit-window.js";

const period = { periodFrom: "09/01/26", periodTo: "09/15/26" };

test("with nothing typed, the window is the period", () => {
  assert.deepEqual(auditWindow(period), { from: "09/01/26", to: "09/15/26" });
  assert.deepEqual(auditWindow({ ...period, partialFrom: null, partialThrough: null }), { from: "09/01/26", to: "09/15/26" });
});

test("a typed end narrows it", () => {
  const w = auditWindow({ ...period, partialThrough: "09/13/26" });
  assert.deepEqual(w, { from: "09/01/26", to: "09/13/26" });
  assert.equal(inAuditWindow("09/13/26", w), true);
  assert.equal(inAuditWindow("09/14/26", w), false);
  assert.equal(inAuditWindow("09/15/26", w), false);
});

test("a typed start narrows it", () => {
  const w = auditWindow({ ...period, partialFrom: "09/08/26" });
  assert.deepEqual(w, { from: "09/08/26", to: "09/15/26" });
  assert.equal(inAuditWindow("09/07/26", w), false);
  assert.equal(inAuditWindow("09/08/26", w), true);
});

test("a window WIDER than the period is the period, never wider", () => {
  // a stray value must not pull days in that the batch never collected
  const w = auditWindow({ ...period, partialFrom: "08/20/26", partialThrough: "09/30/26" });
  assert.deepEqual(w, { from: "09/01/26", to: "09/15/26" });
});

test("the month boundary is not a string comparison", () => {
  // "10/01/26" < "09/30/26" as text, which would silently widen the window
  const w = auditWindow({ periodFrom: "09/25/26", periodTo: "10/05/26", partialThrough: "10/01/26" });
  assert.deepEqual(w, { from: "09/25/26", to: "10/01/26" });
  assert.equal(inAuditWindow("09/30/26", w), true);
  assert.equal(inAuditWindow("10/01/26", w), true);
  assert.equal(inAuditWindow("10/02/26", w), false);
});

test("the year boundary holds too", () => {
  const w = auditWindow({ periodFrom: "12/26/26", periodTo: "01/05/27", partialThrough: "12/31/26" });
  assert.equal(inAuditWindow("12/31/26", w), true);
  assert.equal(inAuditWindow("01/01/27", w), false);
});

test("a date nobody can read is kept rather than dropped", () => {
  // dropping a row nothing can place is worse than showing it
  const w = auditWindow({ ...period, partialThrough: "09/13/26" });
  assert.equal(inAuditWindow("", w), true);
  assert.equal(inAuditWindow(null, w), true);
  assert.equal(inAuditWindow("nonsense", w), true);
});

test("his real batch, as it stands and as the box would have made it", () => {
  // stored today: the old month-to-date trim wrote 09/14, which keeps the 14th
  const asIs = auditWindow({ ...period, partialFrom: "09/01/26", partialThrough: "09/14/26" });
  assert.equal(inAuditWindow("09/14/26", asIs), true);
  // typed 09/01-09/13 at upload, which is what he wanted
  const typed = auditWindow({ ...period, partialFrom: "09/01/26", partialThrough: "09/13/26" });
  assert.equal(inAuditWindow("09/14/26", typed), false);
  assert.equal(inAuditWindow("09/13/26", typed), true);
});
