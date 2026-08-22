// THE DAY PROGRAM'S MILES, off its own export.
//
// The agency reads mileage from the Simple Payroll Processing Report. The day
// program has no payroll report, so upload-rows.js pinned every one of its
// sheets to `qspMiles: null` and mileage never reached a day program document
// at all - which is how Chung's 156.09 for 08/16-08/21 came to be sitting in a
// spreadsheet nobody's payout could see (2026-08-21).
//
// The rule this must never break is the one the payroll side already keeps: a
// zero has to be distinguishable from "no report was uploaded". Null draws no
// mileage line on the sheet and drops the mileage clause from the paragraph
// they sign; 0.00 prints and IS attested to. Getting those two the wrong way
// round asks somebody to swear to a number nobody gave us.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mileageFromTable, anyMilesDriven, mileageNames } from "../../day-program/mileage.js";

const table = (rows, headers = ["Emp Payroll #", "Employee", "Miles Driven", "Reimbursement"]) =>
  ({ headers, rows });

const row = (over = {}) => ({
  "Emp Payroll #": "", Employee: "Chung, Phillip", "Miles Driven": 156.09, Reimbursement: 0, ...over,
});

test("it reads the export QSP actually produces", () => {
  const m = mileageFromTable(table([row()]));
  assert.equal(m.size, 1);
  assert.equal(m.get("chung, phillip").miles, 156.09);
  assert.equal(m.get("chung, phillip").name, "Chung, Phillip");
});

test("a file without the two columns it needs is refused, not read as empty", () => {
  assert.throws(
    () => mileageFromTable(table([row()], ["Employee Name", "RegHr", "OvtHr"])),
    /Employee Mileage Tracking Report/,
  );
});

// the trap parsePayrollReport already guards on its own side: overwriting on a
// duplicate silently halves somebody's figure.
test("two rows for one person add rather than replace", () => {
  const m = mileageFromTable(table([row({ "Miles Driven": 100 }), row({ "Miles Driven": 56.09 })]));
  assert.equal(m.get("chung, phillip").miles, 156.09);
});

test("miles keyed on restKey, so the other exports' spelling finds them", () => {
  const m = mileageFromTable(table([row({ Employee: "  CHUNG, PHILLIP  " })]));
  assert.ok(m.has("chung, phillip"));
});

test("a blank employee cell is skipped rather than keyed as empty", () => {
  const m = mileageFromTable(table([row({ Employee: "" }), row()]));
  assert.equal(m.size, 1);
});

// QSP printed 0.00 in this column on every row of the first pull, because no
// per-mile rate is configured there. It is carried for a person to look at and
// nothing is allowed to multiply by it.
test("the reimbursement column is carried, never treated as what is owed", () => {
  const m = mileageFromTable(table([row({ Reimbursement: 0 })]));
  assert.equal(m.get("chung, phillip").reimbursement, 0);
  assert.equal(m.get("chung, phillip").miles, 156.09);
});

test("anyMilesDriven tells an all-zero file from a real one", () => {
  assert.equal(anyMilesDriven(mileageFromTable(table([row({ "Miles Driven": 0 })]))), false);
  assert.equal(anyMilesDriven(mileageFromTable(table([row()]))), true);
});

test("mileageNames lists what the report claimed, for the coverage check", () => {
  const m = mileageFromTable(table([row(), row({ Employee: "Comia, Caitlan", "Miles Driven": 12 })]));
  assert.deepEqual(mileageNames(m).sort(), ["Chung, Phillip", "Comia, Caitlan"]);
});

// ---- the null-is-not-zero rule, read off the two files that enforce it ----

const ROWS_SRC = fs.readFileSync(new URL("../../day-program/upload-rows.js", import.meta.url), "utf8");
const ANALYZE_SRC = fs.readFileSync(new URL("../../day-program/analyze.js", import.meta.url), "utf8");

test("a sheet takes its miles from the person, falling back to null and never to 0", () => {
  assert.match(ROWS_SRC, /qspMiles:\s*p\.miles\s*\?\?\s*null/);
  assert.doesNotMatch(ROWS_SRC, /qspMiles:\s*p\.miles\s*\|\|\s*0/);
});

test("no mileage report at all leaves every person null, not zero", () => {
  assert.match(ANALYZE_SRC, /mileageBytes \? parseMileageReport\(mileageBytes\) : null/);
  assert.match(ANALYZE_SRC, /miles: mileage \? \(mileage\.get\(key\)\?\.miles \?\? 0\) : null/);
});

// ---- the paragraph, on the half day program sheets actually use ----

const RENDER_SRC = fs.readFileSync(new URL("../render.js", import.meta.url), "utf8");
const ATTEST = RENDER_SRC.slice(
  RENDER_SRC.indexOf("const attest ="),
  RENDER_SRC.indexOf("wrapCentered(page, attest"),
);
// everything before the `:` is the onDutyMeal half - the one every day program
// sheet renders from.
const DP_HALF = ATTEST.slice(0, ATTEST.indexOf('\n    : "I attest'));

test("the day program paragraph attests to mileage too", () => {
  assert.match(DP_HALF, /the miles recorded above are the actual miles I drove for work/);
});

// THE ONE THAT MATTERS, and the bug this file was written for. The sentence
// shipped on the MLS half only. That was invisible while every day program
// sheet was null - and the first one to carry miles printed the figure under
// the totals with nothing in the paragraph covering it, so a signature covered
// every number on the page except the one just added.
test("and it is gated on there being mileage, exactly as the line is", () => {
  assert.match(DP_HALF, /sheet\.milesDriven != null[\s\S]*the miles recorded above[\s\S]*:\s*""/);
});

test("the day program half still says the meal is on-duty and paid", () => {
  assert.match(DP_HALF, /on-duty paid meal period/);
  assert.doesNotMatch(DP_HALF, /received all my meal, rest and recovery periods/);
});
