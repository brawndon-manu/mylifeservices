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
  assert.match(shell, /if \(!done\?\.readyOn\?\.\(date\) \|\| open\) return children;/);
});

test("the day view hands the shell the server's reading of what is still open", () => {
  // `plainBlockedOn` is what the footer already reads; the shell must read the
  // same thing or the two will disagree on screen again
  assert.match(day, /<DayShell\s+date=\{day\.date\}[\s\S]{0,400}blocked=\{plainBlockedOn\(day\.date\)\}/);
});

test("the unanswered line names the days it is waiting on", () => {
  // one card holds a fortnight and the day view shows one day at a time, so a
  // count with no dates pointed at nothing anybody could go to
  assert.match(shell, /const undecidedDates = \[\.\.\.new Set\(undecided\.map\(\(\{ q \}\) => q\.date\)\.filter\(Boolean\)\)\];/);
  assert.match(shell, /still need an answer\.`\}[\s\S]{0,400}undecidedDates\.map\(\(d\) => \(/);
});

test("a day chip opens the day through the rail, not by scrolling to a hidden pane", () => {
  // the rail selects whichever day the address bar names; scrolling alone found
  // a hidden pane in the day view and moved nothing
  assert.match(shell, /const jumpToDay = \(date\) => \{\s*const want = `#day-\$\{date\}`;/);
  assert.doesNotMatch(shell.replace(/\/\/.*$/gm, ""), /onClick=\{\(\) => \{\s*const el = document\.getElementById\(dayAnchorId\(d\)\);/);
});
