// WHICH WEEKS OF CLOCK DATA A PERIOD IS HOLDING.
//
// The QSClock report is exported a week at a time and a pay period is a
// fortnight, so one period needs two of them. Without this the card can say
// "512 shifts" and nothing at all about whether the second week is missing or
// simply unworked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { clockCoverage } from "../clock.js";

const on = (date) => ({ date });

test("coverage is the first and last day the rows mention", () => {
  const c = clockCoverage([on("08/17/26"), on("08/22/26"), on("08/16/26")]);
  assert.deepEqual(c, { from: "08/16/26", to: "08/22/26", days: 3 });
});

test("days counts distinct dates, not rows", () => {
  // a real week is 512 rows over 7 dates
  const c = clockCoverage([on("08/16/26"), on("08/16/26"), on("08/17/26")]);
  assert.equal(c.days, 2);
});

// "08/16/26" against "09/02/26" sorts correctly as text only by luck of the
// year lining up; across a December boundary the string order reverses.
test("dates are ordered by when they are, not by how they spell", () => {
  const c = clockCoverage([on("01/03/27"), on("12/28/26")]);
  assert.equal(c.from, "12/28/26");
  assert.equal(c.to, "01/03/27");
});

test("nothing to cover says so rather than throwing", () => {
  assert.deepEqual(clockCoverage([]), { from: null, to: null, days: 0 });
  assert.deepEqual(clockCoverage(null), { from: null, to: null, days: 0 });
});
