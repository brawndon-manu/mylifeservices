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
