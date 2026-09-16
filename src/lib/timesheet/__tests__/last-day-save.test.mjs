// NEXT ON THE LAST DAY IS NOT ALLOWED TO WALK AWAY FROM AN UNSAVED CARD.
//
// The batched card writes every day in one press, and that press sits after
// the last day - exactly what Next on the last day jumped over on its way to
// the reports. Elizabeth Matias, 2026-09-16: five rest questions unanswered,
// fourteen days walked, and the PTO step saying "Answer the remaining
// questions to generate your document" with the days, the questions and the
// save all hidden behind a stage she had left.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { dayChipLabel } from "../review-days.js";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const rail = read("src/app/t/[token]/DayRail.js");
const card = read("src/app/t/[token]/TimesheetQuestion.js");
const flow = read("src/app/t/[token]/ReviewFlow.js");
const page = read("src/app/t/[token]/page.js");

test("the last day's Next asks the batched card before leaving the days", () => {
  // both rail modes go through one door, and that door checks the card first
  assert.doesNotMatch(rail.replace(/\/\/.*$/gm, ""), /if \(next === days\.length && flow\) \{ flow\.go\("reports"\); return; \}/);
  assert.equal((rail.match(/if \(next === days\.length && flow\) \{ leaveDays\(\); return; \}/g) || []).length, 2);
  assert.match(rail, /const leaveDays = \(\) => \{\s*if \(batch\?\.needsSave\) \{\s*if \(batch\.canSave\) batch\.openConfirm\("reports"\);/);
});

test("a card with nothing off the record lets the walk carry on as before", () => {
  // needsSave is the whole of what is not yet written: staged, unanswered, or owing
  assert.match(card, /const needsSave = dirty\.length > 0 \|\| undecided\.length > 0 \|\| missingTimes > 0 \|\| missingReasons > 0;/);
  assert.match(rail, /flow\.go\("reports"\);\s*\};/);
});

test("the save opened by the last day's Next is what carries the walk on", () => {
  // only that path sets afterSave; the panel's own button clears it
  assert.match(card, /const openConfirm = \(then = null\) => \{ setAfterSave\(then\); setConfirming\(true\); \};/);
  assert.match(card, /if \(afterSave === "reports"\) flow\?\.go\?\.\("reports"\);/);
  assert.match(card, /onClick=\{\(\) => \{ if \(!undecided\.length\) openConfirm\(null\); \}\}/);
});

test("the hold on the later steps names the days it is waiting on", () => {
  assert.match(flow, /openDays = \[\]/);
  assert.match(flow, /const askingDays = \(stage === "leave" \|\| \(!leave && stage === "reports"\)\) && !ready;/);
  assert.match(flow, /\{askingDays && openDays\.map\(\(d\) => \(/);
  // the page hands over every day with a question off the record or a reason owed
  assert.match(page, /const openDays = \[\.\.\.new Set\(\[\s*\.\.\.questions\.filter\(\(q\) => !isOnRecord\(q\)\)/);
  assert.match(page, /openDays=\{openDays\}/);
});

test("a day chip reads the way the rail does", () => {
  assert.equal(dayChipLabel("09/03/26"), "Thu, Sep 3");
  assert.equal(dayChipLabel("07/16/26"), "Thu, Jul 16");
  assert.equal(dayChipLabel("garbage"), "garbage");
});
