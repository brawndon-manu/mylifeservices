// MILES DRIVEN, the column QSP added to the Simple Payroll Processing Report.
// First seen on the 08/01-08/15 pull, 2026-08-17.
//
// Two rules it must never break: mileage is REIMBURSED, not paid as hours, so
// it stays out of `paid` and out of every hours total; and a report pulled
// before the column existed is still a valid report, so its absence must not
// refuse the upload - which means a zero has to be distinguishable from
// "the report never said".
import { test } from "node:test";
import assert from "node:assert/strict";
import { payrollTotals } from "../payroll.js";

const person = (over = {}) => ({
  name: "A", regular: 10, overtime: 0, regular2: 0, overtime2: 0, double: 0,
  holiday: 0, sick: 0, pto: 0, paid: 10, miles: 0, rows: 1, ...over,
});
const mapOf = (people, hasMiles) => {
  const m = new Map(people.map((p, i) => [String(i), p]));
  m.hasMiles = hasMiles;
  return m;
};

test("miles total across the period", () => {
  const t = payrollTotals(mapOf([person({ miles: 73.64 }), person({ miles: 155.34 })], true));
  assert.equal(t.miles, 228.98);
  assert.equal(t.hasMiles, true);
});

test("miles never touch the hours figures", () => {
  const t = payrollTotals(mapOf([person({ miles: 500 })], true));
  assert.equal(t.paid, 10, "paid is hours only");
  assert.equal(t.regular, 10);
});

test("a report without the column reads as unknown, not as zero miles", () => {
  const t = payrollTotals(mapOf([person()], false));
  assert.equal(t.miles, 0);
  assert.equal(t.hasMiles, false, "so a surface can say nothing rather than 0.00");
});

test("a period where nobody drove is still a period that reported miles", () => {
  const t = payrollTotals(mapOf([person({ miles: 0 })], true));
  assert.equal(t.miles, 0);
  assert.equal(t.hasMiles, true);
});

test("the running total rounds to the cent rather than drifting", () => {
  const t = payrollTotals(mapOf([person({ miles: 0.1 }), person({ miles: 0.2 })], true));
  assert.equal(t.miles, 0.3);
});
