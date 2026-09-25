// WALKING PAST A DAY IS NOT ANSWERING IT - the second half.
//
// 6ea73c7 stopped the rail calling a walked day answered. The shell that wraps
// a day's questions still did: Carminia Suarez, 2026-09-16, had every day on
// her sheet walked and none of her three meal questions on record, and each of
// those days drew "Answered" under a green tick with the question hidden behind
// it - while the confirm underneath counted it as still owing and the footer
// said the day was not finished. Reopening and answering did not survive a
// reload, because the walk lives on the sheet and a staged answer lives in the
// tab.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const shell = fs.readFileSync(path.join(process.cwd(), "src/app/t/[token]/TimesheetQuestion.js"), "utf8");
const day = fs.readFileSync(path.join(process.cwd(), "src/app/t/[token]/DayByDay.js"), "utf8");

test("a walked day with something still owing shows its questions, not Answered", () => {
  // the same test the footer applies: the server's reading of the plain cards
  // plus the batched rows staged in the tab
  assert.match(shell, /const open = blocked \|\| \(hasBatchRow && !!ctx\?\.blockedOn\?\.\(date\)\);/);
  // the fold itself takes a press since 2026-09-16 - see day-shell-press.test.mjs
  assert.match(shell, /if \(!folds\) return children;/);
});

test("the day view hands the shell the server's reading of what is still open", () => {
  // `plainBlockedOn` is what the footer already reads; the shell must read the
  // same thing or the two will disagree on screen again
  assert.match(day, /<DayShell\s+date=\{day\.date\}[\s\S]{0,400}blocked=\{plainBlockedOn\(day\.date\)\}/);
});

// THE SAVE PANEL THAT COUNTED UNANSWERED DAYS IS GONE, 2026-09-25: every answer
// saves where it is given now, so nothing is held for a press at the bottom and
// there is no bottom panel to count what is left. What still says where a day
// needs something is the flow's own hold (last-day-save.test.mjs) and, on the
// day itself, the line under the box that is missing something.
test("half an answer is named on its own day, once somebody tries to leave it", () => {
  assert.match(shell, /const stillNeeded = timeMissing && !!done\?\.attemptedOn\?\.\(q\.date\);/);
  assert.match(shell, /const stillNeeded = !said && !!done\?\.attemptedOn\?\.\(q\.date\);/);
  assert.doesNotMatch(shell, /const undecidedDates =/);
});

test("leaving the days with half an answer goes to that day through the rail", () => {
  // the rail owns the selection, so it is the rail that moves to the day, not a
  // scroll that would find a hidden pane
  const rail = fs.readFileSync(path.join(process.cwd(), "src/app/t/[token]/DayRail.js"), "utf8");
  assert.match(rail, /const half = waiting\.find\(\(e\) => e\.state === "incomplete"\);/);
  assert.match(rail, /unsaved\.attempt\(half\.date\);\s*const i = days\.findIndex\(\(d\) => d\.date === half\.date\);\s*if \(i >= 0\) setSel\(i\);/);
});
