// EVERY WRITE THAT MOVES A SHEET HAS TO REACH BOTH SCREENS.
//
// There are two counters and they were wired in opposite directions. The five
// flag actions bumped the BATCH counter, which is what the reviewer screens
// poll. Nothing in `actions.js` bumped it, so an employee answering a question,
// typing a reason or being reset never reached the day view - the screen you sit
// on to see what is still outstanding.
//
// The sheet counter is the other half: keyed on one timesheet, polled by that
// person's own page, so nobody re-renders for somebody else's change.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ACT = fs.readFileSync("src/app/portal/admin/timesheets/actions.js", "utf8");
const FLAGS = fs.readFileSync("src/app/portal/admin/timesheets/[id]/checks/flag-actions.js", "utf8");

const bodyOf = (src, name) => {
  const i = src.indexOf(`export async function ${name}`);
  if (i === -1) return null;
  const end = src.indexOf("export async function", i + 10);
  return src.slice(i, end === -1 ? undefined : end);
};

// everything that changes what a sheet says
const MOVES_A_SHEET = [
  "classifyMiscTime",
  "clearMiscClassification",
  "resetTimesheetAnswers",
  "answerTimesheetQuestion",
  "answerBreakReason",
];

test("each one tells the employee's own page", () => {
  for (const name of MOVES_A_SHEET) {
    const body = bodyOf(ACT, name);
    assert.ok(body, `${name} is gone`);
    assert.match(body, /bumpSheetVersion\(ts\.id\)/, `${name} does not reach their page`);
  }
});

test("and each one tells the reviewer screens", () => {
  for (const name of MOVES_A_SHEET) {
    const body = bodyOf(ACT, name);
    assert.match(body, /bumpBatchVersion\(ts\.batchId\)/, `${name} does not reach the day view`);
  }
});

test("the break control reaches both, since either side can press it", () => {
  const body = bodyOf(FLAGS, "setBreakAnswer");
  assert.match(body, /bumpBatchVersion\(batchId\)/);
  assert.match(body, /bumpSheetFor\(batchId, personKey\)/);
});

test("the two counters are keyed differently on purpose", () => {
  const lib = fs.readFileSync("src/lib/timesheet-presence.js", "utf8");
  // one per batch for the list of sixty, one per sheet for the person reading
  // their own - or every open review page would re-render for everybody else
  assert.match(lib, /mls:ts:v:/);
  assert.match(lib, /mls:ts:sv:/);
});

test("a bump can never cost the write it belongs to", () => {
  const lib = fs.readFileSync("src/lib/timesheet-presence.js", "utf8");
  const sheet = lib.slice(lib.indexOf("export async function bumpSheetVersion"), lib.indexOf("export async function getSheetVersion"));
  assert.match(sheet, /try \{/);
  assert.match(sheet, /catch \{/);
});

test("an unknown version reads as 0, so a redis blip is quiet rather than a loop", () => {
  const lib = fs.readFileSync("src/lib/timesheet-presence.js", "utf8");
  const get = lib.slice(lib.indexOf("export async function getSheetVersion"), lib.indexOf("export async function getBatchVersion"));
  assert.match(get, /return 0;/);
});
