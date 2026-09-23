// a month pulled as ONE Simple Timesheet export: both pay periods, every
// person twice. the audit lane splits it on each sheet's own header.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { splitByPeriod } from "../split-periods.js";

const A = { from: "09/01/26", to: "09/15/26" };
const B = { from: "09/16/26", to: "09/30/26" };
const sheet = (employee, payPeriod) => ({ employee, payPeriod, days: [] });

test("grouped by employee: each person's two sheets back to back come out earlier half first", () => {
  const r = splitByPeriod([
    sheet("Adams, Taylor", B), sheet("Adams, Taylor", A),
    sheet("Bucio, Mary", A), sheet("Bucio, Mary", B),
    sheet("Cruz, Ana", B),
  ]);
  assert.equal(r.ok, true);
  assert.deepEqual(
    r.sheets.map((s) => `${s.employee} ${s.payPeriod.from}`),
    ["Adams, Taylor 09/01/26", "Bucio, Mary 09/01/26", "Adams, Taylor 09/16/26", "Bucio, Mary 09/16/26", "Cruz, Ana 09/16/26"],
  );
  assert.deepEqual(r.periods, [{ ...A, count: 2 }, { ...B, count: 3 }]);
});

test("grouped by pay period reads the same", () => {
  const r = splitByPeriod([sheet("Adams, Taylor", A), sheet("Bucio, Mary", A), sheet("Adams, Taylor", B)]);
  assert.equal(r.ok, true);
  assert.equal(r.sheets.length, 3);
});

test("a name twice inside one period is refused, not split", () => {
  const r = splitByPeriod([sheet("Adams, Taylor", A), sheet("adams, taylor ", A), sheet("Adams, Taylor", B)]);
  assert.equal(r.ok, false);
  assert.match(r.why, /twice inside 09\/01\/26-09\/15\/26/);
});

test("one period only, three periods, overlap and a missing header are all refused", () => {
  assert.equal(splitByPeriod([sheet("X", A), sheet("X", A)]).ok, false);
  const C = { from: "10/01/26", to: "10/15/26" };
  assert.match(splitByPeriod([sheet("X", A), sheet("X", B), sheet("X", C)]).why, /3 pay periods/);
  assert.match(splitByPeriod([sheet("X", A), sheet("X", { from: "09/10/26", to: "09/25/26" })]).why, /overlap/);
  assert.match(splitByPeriod([sheet("X", A), sheet("X", null)]).why, /no pay period/);
});

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

test("the upload splits a one-file month on the audit lane only", () => {
  const actions = read("src/app/portal/admin/timesheets/actions.js");
  assert.match(actions, /if \(auditOnly\) \{[\s\S]{0,200}?const split = splitByPeriod\(withHours\)/);
  // the payroll lane keeps refusing a name twice
  assert.match(actions, /if \(dupes\.length && !twoPeriods\)/);
});

test("the second timesheet slot is gone, all the way down", () => {
  for (const p of [
    "src/app/portal/admin/timesheets/actions.js",
    "src/app/portal/admin/timesheets/new/UploadForm.js",
    "src/lib/timesheet/upload-slots.js",
  ]) {
    assert.doesNotMatch(read(p), /file2|#\$\{slot\}2/, p);
  }
  // and the form says how the one file is pulled
  assert.match(read("src/app/portal/admin/timesheets/new/UploadForm.js"), /Reports → Timesheets/);
});
