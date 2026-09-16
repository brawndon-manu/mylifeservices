// NOTHING FOLDS UNDER SOMEBODY'S FINGERS.
//
// The day shell folds a day to its one line once it is marked finished and
// nothing on it is owing. "Nothing owing" is read live off the staged answers,
// so on a day walked before its question was answered it first came true on the
// first character of a required reason - and the shell folded the day with the
// reason box gone from under the person typing in it (2026-09-16). A fold takes
// a press now: the provider counts finish presses per day, and a day shown open
// while already marked folds only once that count has moved.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { shellFolds } from "../day-shell.js";

const card = fs.readFileSync(path.join(process.cwd(), "src/app/t/[token]/TimesheetQuestion.js"), "utf8");

test("a day nobody has finished with stays open", () => {
  assert.equal(shellFolds({ ready: false, open: false }), false);
  assert.equal(shellFolds({ ready: false, open: true }), false);
});

test("a marked day with something still owing stays open", () => {
  assert.equal(shellFolds({ ready: true, open: true, presses: 0 }), false);
  assert.equal(shellFolds({ ready: true, open: true, presses: 3 }), false);
});

test("a day marked before this tab opened, with nothing owing, folds as it always did", () => {
  // after a reload: walked on the sheet, answers on record, never shown open here
  assert.equal(shellFolds({ ready: true, open: false, presses: 0, pressesWhenShownOpen: null }), true);
});

test("the first letter of a reason does not fold a walked day", () => {
  // shown open at press 0 (walked, question unanswered), then typing makes
  // "nothing owing" true with no press in between
  assert.equal(shellFolds({ ready: true, open: false, presses: 0, pressesWhenShownOpen: 0 }), false);
});

test("a press after the day was shown open folds it", () => {
  assert.equal(shellFolds({ ready: true, open: false, presses: 1, pressesWhenShownOpen: 0 }), true);
  assert.equal(shellFolds({ ready: true, open: false, presses: 4, pressesWhenShownOpen: 3 }), true);
});

test("Change this and then Next folds it again", () => {
  // Change this unmarks the day, so it is shown open with nothing remembered;
  // Next marks it and bumps the count
  assert.equal(shellFolds({ ready: false, open: false, presses: 1, pressesWhenShownOpen: null }), false);
  assert.equal(shellFolds({ ready: true, open: false, presses: 2, pressesWhenShownOpen: null }), true);
});

test("the shell reads the rule with the count it remembered, and the provider counts every press", () => {
  const code = card.replace(/\/\/.*$/gm, "");
  assert.match(code, /const folds = shellFolds\(\{ ready, open, presses, pressesWhenShownOpen: shownOpenAt\.current \}\);/);
  assert.match(code, /useEffect\(\(\) => \{ shownOpenAt\.current = ready && !folds \? presses : null; \}\);/);
  assert.match(code, /if \(!folds\) return children;/);
  // the old door, which folded on the live state alone, is gone
  assert.doesNotMatch(code, /if \(!done\?\.readyOn\?\.\(date\) \|\| open\) return children;/);
  // every press counts, including one on a day already in the set
  assert.match(code, /markReady: \(date\) => \{\s*setReady\(\(r\) => \(r\.has\(date\) \? r : new Set\(r\)\.add\(date\)\)\);\s*setPresses\(\(p\) => \(\{ \.\.\.p, \[date\]: \(p\[date\] \|\| 0\) \+ 1 \}\)\);/);
  assert.match(code, /pressesOn: \(date\) => presses\[date\] \|\| 0,/);
});
