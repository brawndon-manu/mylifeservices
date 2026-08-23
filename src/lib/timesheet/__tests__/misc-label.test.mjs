// WHAT THE MISC BLOCK IS CALLED ONCE SOMEBODY HAS SAID WHAT IT WAS.
//
// A block reading "Misc" is the question. The day header already gets a chip
// once the time is classified, but the chip is about the day and the block is
// the thing sitting on the hours, so the picture went on asking after it had
// been answered.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const CAL = fs.readFileSync("src/app/t/[token]/DayCalendar.js", "utf8");

test("the three answers each get their own label", () => {
  assert.match(CAL, /pto: "Misc - PTO"/);
  assert.match(CAL, /sick: "Misc - Sick Pay"/);
  assert.match(CAL, /worked: "Misc Service"/);
});

test("and unclassified Misc still reads as the question", () => {
  assert.ok(CAL.includes('MISC_LABELS.worked : "Misc")'), "the unclassified fallback is gone");
});

test("it reads the field both routes write", () => {
  // `patchesFor` writes miscKind for the employee's card AND for the reviewer
  // control, which goes through the same function - so one lookup cannot
  // disagree with whoever answered
  assert.match(CAL, /MISC_LABELS\[day\?\.miscKind\]/);
  const q = fs.readFileSync("src/lib/timesheet/questions.js", "utf8");
  assert.match(q, /return \{ miscKind: kind, miscWorked: kind === "worked" \};/);
  const act = fs.readFileSync("src/app/portal/admin/timesheets/actions.js", "utf8");
  assert.match(act, /patchesFor\(\{ kind: "miscTime" \}, kind, day\)/);
});

test("a day stored before the kind was written still labels", () => {
  assert.match(CAL, /day\?\.miscWorked \? MISC_LABELS\.worked : "Misc"/);
});

test("the ten minute block is still a break, classified or not", () => {
  // MISC_COUNTS_UP_TO_MIN lets a short block through as worked time without
  // anybody being asked, so it is never what the PTO question is about
  assert.match(CAL, /miscBreak \? "Misc Break" : serviceLabel\(booked, day\)/);
});

test("the screen reader hears the same label as the block", () => {
  // absolutely positioned colour is nothing to a screen reader, so `spoken` is
  // the whole page for anyone using one - and a second spelling there is the
  // one that would never be noticed
  const spoken = CAL.slice(CAL.indexOf("function spoken("), CAL.indexOf("function spoken(") + 700);
  assert.match(spoken, /serviceLabel\(booked, day\)/);
});


// A REVIEWER'S CLASSIFICATION MUST SURVIVE THE EMPLOYEE ANSWERING SOMETHING.
//
// `answerTimesheetQuestion` rebuilds the whole override set from the corrections
// and started that set at {}. A Misc classification is NOT a correction - it is
// not a reply to a question - so it lived only in `overrides`, and the next
// answer the employee gave threw it away. The admin screen went on showing it as
// recorded, by name and to the minute, over a sheet that no longer carried it.
const ACT = fs.readFileSync("src/app/portal/admin/timesheets/actions.js", "utf8");

test("the override rebuild carries the reviewer's classification over", () => {
  const body = ACT.slice(ACT.indexOf("rebuild EVERY override from every answer"), ACT.indexOf("const pristine ="));
  assert.match(body, /_source !== "misc-classify"/);
  assert.doesNotMatch(body, /const overrides = \{\};\s*\n\s*\/\/ PATCH THE PRISTINE/);
});

test("it carries the same fields the clear removes", () => {
  // two lists that drift means a field added to patchesFor is kept here and
  // never cleared, or cleared and never kept
  const keep = ACT.slice(ACT.indexOf("const KEEP = new Set("), ACT.indexOf("const KEEP = new Set(") + 140);
  assert.match(keep, /MISC_PATCH_FIELDS, "_was", "_by", "_at", "_source"/);
  const clear = ACT.slice(ACT.indexOf("for (const k of [...MISC_PATCH_FIELDS"), ACT.indexOf("for (const k of [...MISC_PATCH_FIELDS") + 120);
  assert.match(clear, /MISC_PATCH_FIELDS, "_was", "_by", "_at", "_source"/);
});

test("and nothing else survives, or a stale patch would outlive its answer", () => {
  const body = ACT.slice(ACT.indexOf("const KEEP = new Set("), ACT.indexOf("const pristine ="));
  assert.match(body, /KEEP\.has\(k\)/);
});

test("classifying tells the employee page to refetch", () => {
  for (const name of ["classifyMiscTime", "clearMiscClassification"]) {
    const i = ACT.indexOf(`export async function ${name}`);
    const end = ACT.indexOf("export async function", i + 10);
    const body = ACT.slice(i, end === -1 ? undefined : end);
    assert.match(body, /revalidatePath\(`\/t\//, `${name} changes their page and does not refresh it`);
  }
});


// AND EVERY WAY THE MISC CONTROL CAN REFUSE HAS WORDS FOR IT.
//
// Two of the five came out as "that did not save, try again". One of them is
// reachable in normal use: the panel shows a classification read off the DAY,
// and the override holding it is a separate thing that can go missing
// underneath. Change this then asked to clear something already gone and
// reported a save failure over a sheet that was fine.
const MISCCARD = fs.readFileSync(
  "src/app/portal/admin/timesheets/[id]/person/[sheetId]/MiscClassify.js", "utf8");

test("no refusal from either misc action falls through to try again", () => {
  const codes = new Set();
  for (const name of ["classifyMiscTime", "clearMiscClassification"]) {
    const i = ACT.indexOf(`export async function ${name}`);
    const end = ACT.indexOf("export async function", i + 10);
    const body = ACT.slice(i, end);
    for (const m of body.matchAll(/error: "([a-z]+)"/g)) codes.add(m[1]);
    // A REFUSAL RETURNED THROUGH A HELPER IS STILL A REFUSAL, 2026-08-22.
    // This swept for `error: "..."` written in the body and nothing else, so
    // `return refusal(newer)` - whose code lives in superseded.js - was invisible
    // to it. A reviewer on a replaced upload got "that did not save, try again",
    // the one instruction that cannot work, and this test passed the whole time.
    if (/return refusal\(/.test(body)) codes.add(SUPERSEDED_CODE);
  }
  assert.ok(codes.has("superseded"), "the superseded refusal must be in the set");
  assert.ok(codes.size >= 5, `expected the full set, found ${[...codes].join(", ")}`);
  const map = MISCCARD.slice(MISCCARD.indexOf("function errorText"));
  const missing = [...codes].filter((c) => !map.includes(`"${c}"`));
  assert.deepEqual(missing, [], `refusals with no words: ${missing.join(", ")}`);
});

// read from the source of truth rather than typed here, so renaming the code
// breaks this test instead of silently passing it
const SUPERSEDED_CODE = /error: "([a-z]+)"/.exec(
  fs.readFileSync("src/lib/timesheet/superseded.js", "utf8").slice(
    fs.readFileSync("src/lib/timesheet/superseded.js", "utf8").indexOf("export function refusal"),
  ),
)[1];

// and the replaced-upload refusal points somewhere, because "try again" was
// wrong precisely for having no next step
test("the superseded refusal offers the current upload", () => {
  assert.match(MISCCARD, /currentBatchId/);
  assert.match(MISCCARD, /Open the current upload/);
});

test("clearing something already clear is not a failure", () => {
  const i = ACT.indexOf("export async function clearMiscClassification");
  const body = ACT.slice(i, ACT.indexOf("export async function", i + 10));
  assert.match(body, /return \{ ok: true, already: true \}/);
  // and where the day and the override disagree it reconciles rather than
  // reporting a save that never happened
  assert.match(body, /return \{ ok: true, reconciled: true \}/);
});
