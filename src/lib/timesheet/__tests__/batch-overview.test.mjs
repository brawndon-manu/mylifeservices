import { test } from "node:test";
import assert from "node:assert/strict";
import { batchPeriodLabels, batchWorkTotals } from "../batch-overview.js";

test("batch work hours exclude leave already included in paid hours", () => {
  const sheets = [
    { userId: "one", paidHours: 19.05, data: { days: [{ miscKind: "pto", miscMin: 390 }] } },
    { userId: "two", paidHours: 16, data: { days: [{ miscKind: "sick", miscMin: 120 }] } },
  ];
  const totals = batchWorkTotals(sheets);
  assert.deepEqual(totals, { worked: 26.55, pto: 6.5, sick: 2 });
  assert.equal(totals.worked + totals.pto + totals.sick, 35.05);
});

test("calendar leave joins only matched sheets; reported leave does not add pay", () => {
  const sheets = [{ userId: "one", paidHours: 8, corrections: [{ kind: "time_off", timeOff: [{ hours: 8 }] }] }];
  assert.deepEqual(batchWorkTotals(sheets, [
    { personKey: "one", kind: "pto", hours: 3 },
    { personKey: "one", kind: "sick", hours: 2 },
    { personKey: "elsewhere", kind: "pto", hours: 8 },
  ]), { worked: 8, pto: 3, sick: 2 });
});

test("Day Program nominal PTO moves to leave and totals keep payroll rounding", () => {
  assert.deepEqual(batchWorkTotals([
    { paidHours: 8, data: { days: [{ isPto: true, ptoHours: 8 }] } },
    { paidHours: 0.1 }, { paidHours: 0.2 },
  ]), { worked: 0.3, pto: 8, sick: 0 });
  assert.deepEqual(batchWorkTotals(), { worked: 0, pto: 0, sick: 0 });
});

test("period headings keep California dates across server time zones and year boundaries", () => {
  const original = process.env.TZ;
  try {
    for (const zone of ["UTC", "America/Los_Angeles", "Pacific/Auckland"]) {
      process.env.TZ = zone;
      assert.deepEqual(batchPeriodLabels("07/16/26", "07/31/26"), { title: "July 16–31", eyebrow: "July 2026" });
      assert.equal(batchPeriodLabels("12/16/26", "01/15/27").title, "December 16, 2026 to January 15, 2027");
      assert.equal(batchPeriodLabels("07/28/26", "08/03/26").title, "July 28 to August 3");
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test("unreadable or reversed periods do not invent a calendar heading", () => {
  for (const [from, to] of [["02/30/26", "03/15/26"], ["07/31/26", "07/16/26"], ["", ""]]) {
    assert.equal(batchPeriodLabels(from, to).eyebrow, "Pay period");
  }
});
