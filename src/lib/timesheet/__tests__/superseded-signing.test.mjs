// A REPLACED SHEET IS CLOSED TO THE EMPLOYEE - Mánu 2026-09-03, Rosa's case:
// two send emails twenty minutes apart, she opened the older one, and twelve
// answers plus a signature landed on a superseded batch no screen reads.
// These pin the page's gate and the backstop on every token action.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

test("the /t page closes an unsigned sheet on a superseded batch", () => {
  const page = read("src/app/t/[token]/page.js");
  assert.match(page, /if \(!ts\.signedAt\) \{\n\s*const newer = await supersededBy\(ts\.batch\.id\);/,
    "the gate runs only for unsigned sheets - a sheet signed before the replacement stays viewable");
  assert.match(page, /This timesheet was replaced\./);
});

test("every token action refuses a superseded sheet", () => {
  const actions = read("src/app/portal/admin/timesheets/actions.js");
  const gates = actions.match(
    /if \(await supersededByForTimesheet\((id|tsId)\)\) return \{ ok: false, error: "superseded" \};/g,
  );
  // submitTimesheetCorrections, answerTimeOff, answerTimesheetQuestion,
  // acknowledgeSpan, submitSignedTimesheet, answerBreakReason
  assert.equal(gates?.length, 6, "all six employee-side write actions carry the gate");
});
