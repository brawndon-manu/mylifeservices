// THE BUDGET CAPTURE READER takes the month from the document's own title and
// keeps only real client rows - QSP's total rows print no client name, which
// is what marks them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { shapeBudgetCapture, monthLabelOf } from "../budget-capture.js";

const row = (name, hours, extra = {}) => ({
  "Office": "My Life Services",
  "Case Manager": "Gutierrez, Joseph",
  "Client Name": name,
  "Service Type": "ILS POS (520 Monthly)",
  "Authorized Hours": hours,
  "Scheduled Hours": 10,
  ...extra,
});

const TITLE = "Budget Capture Report 8/1/2026 - 8/31/2026";

test("the month comes off the title line", () => {
  const out = shapeBudgetCapture({ title: TITLE, rows: [row("Acuna, Jacob", 15)] });
  assert.equal(out.monthKey, "2026-08");
  assert.equal(out.monthLabel, "August 2026");
  assert.equal(out.rows[0].clientKey, "acuna jacob");
  assert.equal(out.rows[0].authorizedHours, 15);
});

test("total rows have no client name and are not clients", () => {
  const out = shapeBudgetCapture({
    title: TITLE,
    rows: [
      row("Acuna, Jacob", 15),
      { "Office": "", "Case Manager": "Office Total", "Client Name": "", "Authorized Hours": 550 },
      { "Office": "Company Total", "Client Name": "", "Authorized Hours": 7766 },
    ],
  });
  assert.equal(out.rows.length, 1);
});

test("a row with unreadable hours is reported, not stored", () => {
  const out = shapeBudgetCapture({
    title: TITLE,
    rows: [row("Acuna, Jacob", 15), row("Broken, Row", "n/a")],
  });
  assert.equal(out.rows.length, 1);
  assert.deepEqual(out.skipped, ["Broken, Row"]);
});

test("a report with no usable title is refused", () => {
  assert.throws(
    () => shapeBudgetCapture({ title: "Some Other Report", rows: [row("A, B", 1)] }),
    (e) => e.code === "notitle",
  );
});

test("a report spanning two months is refused - the figure is monthly", () => {
  assert.throws(
    () => shapeBudgetCapture({
      title: "Budget Capture Report 8/15/2026 - 9/14/2026",
      rows: [row("A, B", 1)],
    }),
    (e) => e.code === "crossmonth",
  );
});

test("a report of nothing but totals is refused rather than filed empty", () => {
  assert.throws(
    () => shapeBudgetCapture({ title: TITLE, rows: [{ "Client Name": "", "Authorized Hours": 5 }] }),
    (e) => e.code === "empty",
  );
});

test("month labels spell the month out", () => {
  assert.equal(monthLabelOf("2026-12"), "December 2026");
  assert.equal(monthLabelOf("junk"), "junk");
});
