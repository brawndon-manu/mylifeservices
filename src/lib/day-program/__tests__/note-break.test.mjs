// THE SPELLINGS A SECOND TEN ARRIVES IN, pinned. The nine from 08/01-08/15
// plus "Break taken:" from 08/16-08/31 - and the refusals that keep a Zoom
// meeting or a stated MISSED break from becoming a rest. The duplicate case
// ("Break taken" restating the recorded ten) is not this function's job: the
// stitch in analyze drops any noted window overlapping the report's own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { noteBreak } from "../analyze.js";

test("the labelled second-break spellings still read", () => {
  assert.ok(noteBreak("Break #2 12:15-12:25"));
  assert.ok(noteBreak("2nd Break 1:10-1:20"));
  assert.ok(noteBreak("second break: 10:00-10:10"));
});

test("Break taken reads now, with and without the meridiem", () => {
  assert.deepEqual(noteBreak("Reason given: Day program\nBreak taken: 10:00-10:10am"), { out: 600, in: 610 });
  assert.ok(noteBreak("Break taken: 10:00-10:10"));
});

test("a label with no range, a missed break, a meeting - none become a rest", () => {
  assert.equal(noteBreak("Break taken:"), null);
  assert.equal(noteBreak("Break2: Unable due to staffing"), null);
  assert.equal(noteBreak("Zoom meeting 10:00-10:30"), null);
  assert.equal(noteBreak(""), null);
  assert.equal(noteBreak(null), null);
});

test("a range no ten fits stays a note", () => {
  assert.equal(noteBreak("Break taken: 10:00-11:30"), null);
});

// bare "Break", the loosest spelling (Matias 08/16-08/31), with its own
// negation guard - a stated missed break must never become a credited one
test("bare Break with a range reads", () => {
  assert.deepEqual(noteBreak("Break 12:30-12:40"), { out: 750, in: 760 });
  assert.ok(noteBreak("Break : 1:10-1:20"));
  assert.ok(noteBreak("Reason given: Testing QSP error\nStarted at 8:30am\nBreak 12:30-12:40"));
});

test("a negated break stays a note", () => {
  assert.equal(noteBreak("no break 12:30-12:40"), null);
  assert.equal(noteBreak("missed break 12:30-12:40"), null);
  assert.equal(noteBreak("was unable to take my break 12:30-12:40"), null);
  assert.equal(noteBreak("didn't take break 12:30-12:40"), null);
});

test("a typo'd range no clock can read stays a note", () => {
  assert.equal(noteBreak("Break 12:10-12;20"), null);
});
