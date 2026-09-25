// AN ANSWER SAVES WHERE IT IS GIVEN, AND LEAVING ITS DAY SAVES IT TOO.
//
// The meal and rest answers used to wait in the page until a Save my answers
// panel after the last day and an "Are you sure you want to confirm?" under it,
// so somebody who pressed Next through the fortnight and left had saved
// nothing, and the sign step then said their questions were unanswered. Now:
// every complete answer has its own Save answer, the day's button reads Save
// and next while something on the day is unsaved and saves it on the way, half
// an answer stops that press with a line saying what is missing, and closing
// the tab with an answer on screen asks first. The cards are client
// components, so the words and the wiring are read off the source.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const card = read("src/app/t/[token]/TimesheetQuestion.js");
const day = read("src/app/t/[token]/DayByDay.js");
// the source with its notes taken out, for the words that must be gone
const code = card.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

test("the new words are there, as approved", () => {
  // the button under a complete answer, on both kinds of card
  assert.ok((card.match(/"Save answer"/g) || []).length >= 3, "Save answer on the batched rows, the single card and the day button");
  assert.match(card, /\{saving \? "Saving…" : "Save answer"\}/);
  assert.match(card, /\{pending \? "Saving…" : "Save answer"\}/);
  // under every saved answer
  assert.equal((card.match(/Saved\. You can change it any time before you sign\./g) || []).length, 2);
  // the day's button while something on it is unsaved
  assert.match(card, /waiting\.length \? "Save and next" : "Next"/);
});

test("the old words are gone", () => {
  for (const gone of [
    /Save my answers/,
    /Are you sure you want to confirm\?/,
    /Answer ready to review\./,
    /review your answers before submitting/,
    /Confirm and move on/,
    /Yes, confirm/,
    /saved together as one set/,
  ]) assert.doesNotMatch(code, gone);
  assert.doesNotMatch(code, /export function BatchConfirm/);
  assert.doesNotMatch(day, /BatchConfirm/);
});

test("a batched answer saves on its own, and a day saves its finished ones together", () => {
  assert.match(card, /onClick=\{\(\) => saveQs\(\[q\]\)\}/);
  assert.match(card, /const saveDay = \(date\) => saveQs\(list\.filter\(\(q\) => q\.date === date && stateOf\(q\) === "ready"\)\);/);
  // each day reports what it holds unsaved, so the day's button can save it
  assert.match(card, /id=\{`batch\|\$\{date\}`\}\s*date=\{date\}\s*state=\{dayState\(date\)\}\s*save=\{\(\) => saveDay\(date\)\}/);
});

test("a saved batched answer folds to its line, and Change this opens it again", () => {
  assert.match(card, /const isSettled = \(q\) => !waiting\?\.has\?\.\(q\.id\) && onRecord\(q\) != null && !editing\.has\(q\.id\) && !dirtyQ\(q\);/);
  assert.match(card, /\{settled \? renderSaved\(item\) : \(/);
  assert.match(card, /onClick=\{\(\) => setEditing\(\(e\) => new Set\(e\)\.add\(q\.id\)\)\}/);
});

test("the single card saves from its own button and reports what it holds", () => {
  const one = card.slice(card.indexOf("function OneQuestion("), card.indexOf("// A WHOLE CARD ANSWERED DAY BY DAY"));
  assert.match(one, /\{complete && \(\s*<div className="flex flex-wrap items-center gap-x-3\.5 gap-y-2">\s*<button\s*type="button"\s*disabled=\{pending\}\s*onClick=\{commit\}/);
  assert.match(one, /state=\{proposed && proposed\.choice !== null \? \(complete \? "ready" : "incomplete"\) : null\}/);
  // it stays on its day: moving on is the day button's job now
  assert.doesNotMatch(one, /movesOn|nav\.go\(/);
});

test("closing the tab with an answer on screen asks first, and only then", () => {
  assert.match(card, /const anyPending = pending\.size > 0;/);
  assert.match(card, /if \(!anyPending\) return;\s*const warn = \(e\) => \{\s*e\.preventDefault\(\);\s*e\.returnValue = "";\s*\};\s*window\.addEventListener\("beforeunload", warn\);/);
  assert.match(card, /return \(\) => window\.removeEventListener\("beforeunload", warn\);/);
});

test("a day with only one possible answer does not count as unsaved until something is typed", () => {
  // otherwise every such day would stop Next and trip the close warning the
  // moment the page opened
  assert.match(card, /if \(noRoom\(q\) && onRecord\(q\) == null && !String\(reasons\[q\.id\] \?\? ""\)\.trim\(\)\) return false;/);
});
