// LEAVING THE DAYS DOES NOT LEAVE AN ANSWER BEHIND.
//
// The batched card used to write every day in one press that sat after the last
// day - exactly what Next on the last day jumped over on its way to the
// reports. Elizabeth Matias, 2026-09-16: five rest questions unanswered,
// fourteen days walked, and the PTO step saying "Answer the remaining
// questions to generate your document" with the days, the questions and the
// save all hidden behind a stage she had left.
//
// Since 2026-09-25 every answer saves where it is given, and the day's own
// button saves what is on it. The last door out of the days still checks: an
// answer typed on one day and left there by pressing the rail is saved on the
// way out, and half an answer anywhere stops the walk on that day.
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

test("both rail modes leave the days through one door", () => {
  assert.doesNotMatch(rail.replace(/\/\/.*$/gm, ""), /if \(next === days\.length && flow\) \{ flow\.go\("reports"\); return; \}/);
  assert.equal((rail.match(/if \(next === days\.length && flow\) \{ leaveDays\(\); return; \}/g) || []).length, 2);
});

test("that door saves every finished answer before the reports open", () => {
  assert.match(rail, /const waiting = unsaved\?\.pendingAll\?\.\(\) \|\| \[\];/);
  assert.match(rail, /for \(const e of waiting\) \{\s*if \(!\(await unsaved\.saveOne\(e\.id\)\)\) return;\s*\}\s*flow\.go\("reports"\);/);
  // the old door asked a card that held everything until one press
  assert.doesNotMatch(rail, /needsSave|openConfirm|useBatchSave/);
});

test("and stops on the day with half an answer", () => {
  assert.match(rail, /if \(half\) \{\s*unsaved\.attempt\(half\.date\);/);
});

test("the day's own button saves what is on the day before it moves", () => {
  assert.match(card, /const waiting = done\.pendingOn\?\.\(date\) \|\| \[\];/);
  assert.match(card, /for \(const e of waiting\) \{\s*if \(!\(await done\.saveOne\(e\.id\)\)\) \{/);
  // half an answer stops it where it is
  assert.match(card, /if \(halfDone\) \{\s*done\.attempt\?\.\(date\);\s*return;\s*\}/);
  // nothing waits for a panel further down any more (the notes may still tell
  // its history, so the words are looked for outside comments)
  const code = card.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /export function BatchConfirm/);
  assert.doesNotMatch(code, /Save my answers/);
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
