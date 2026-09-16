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

// AN AUDIT COPY IS NOT A NEWER PAYROLL EXPORT - Mánu 2026-09-16: "why does it
// say superseded if this is the latest version". His 3:45am ILS export was the
// live batch; his 3:52am AUDIT copy was seven minutes newer. The batch page kept
// its own count of newer uploads, that count had never been taught the audit
// flag, so it found 1 and called the live batch replaced - which hides the send
// control and takes the whole period read-only. Two live payroll batches were
// mislabelled: the current fortnight and 08/16-08/31.
//
// The rule itself was never wrong. `supersededBy` has always matched on the same
// KIND as well as the same program. The page had a third copy of the rule, one
// filter short, which is the same way the program filter went missing before it.
test("the one rule about being replaced lives in one place", () => {
  const rule = read("src/lib/timesheet/superseded.js");
  // same program AND same kind, or a day program upload and an audit copy each
  // read as a newer version of the payroll batch
  assert.match(rule, /program: batch\.program,/);
  assert.match(rule, /auditOnly: batch\.auditOnly,/);
});

test("the batch page asks that rule instead of counting for itself", () => {
  const page = read("src/app/portal/admin/timesheets/[id]/page.js");
  assert.match(page, /const newerInPeriod = !!\(await supersededBy\(batch\.id\)\);/);
  // the hand-rolled count is gone - it is what lost the audit flag
  assert.doesNotMatch(page, /prisma\.timesheetBatch\.count\(\{[\s\S]*?createdAt: \{ gt: batch\.createdAt \}/);
});

test("the timesheets list never lets an audit copy into a period group", () => {
  // groupByPeriod keys on period and program only, so the list relies on audit
  // copies never reaching it. If that filter goes, the newest audit copy becomes
  // the period's `current` card and the real payroll batch folds underneath it.
  const list = read("src/app/portal/admin/timesheets/page.js");
  assert.match(list, /where: \{ program: "MLS", auditOnly: false \}/);
});
