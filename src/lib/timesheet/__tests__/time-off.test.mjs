// THE DAY-PROGRAM TIME-OFF QUESTION's rules: which days can be claimed, what
// an entry has to look like to be stored, and the exact lines a "yes" adds to
// the two review emails. The sentences are pinned because both inboxes read
// them - a drifted wording is a different statement to the office.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  periodDates,
  cleanTimeOffEntries,
  timeOffAnswerOf,
  timeOffReviewItems,
  TIME_OFF_KIND,
} from "../time-off.js";

test("periodDates walks the period in the sheet's own format", () => {
  const days = periodDates("08/16/26", "08/31/26");
  assert.equal(days.length, 16);
  assert.equal(days[0], "08/16/26");
  assert.equal(days[15], "08/31/26");
});

test("periodDates crosses a month boundary", () => {
  const days = periodDates("07/28/26", "08/03/26");
  assert.deepEqual(days, [
    "07/28/26", "07/29/26", "07/30/26", "07/31/26",
    "08/01/26", "08/02/26", "08/03/26",
  ]);
});

test("periodDates refuses what it cannot read, and a backwards period", () => {
  assert.deepEqual(periodDates("", "08/31/26"), []);
  assert.deepEqual(periodDates("8/16/26", "08/31/26"), []);
  assert.deepEqual(periodDates("08/31/26", "08/16/26"), []);
});

test("cleanTimeOffEntries keeps only days of the period with real hours", () => {
  const out = cleanTimeOffEntries(
    [
      { date: "08/20/26", kind: "pto", hours: 8 },
      { date: "08/18/26", kind: "sick", hours: 4.505 },
      { date: "09/01/26", kind: "pto", hours: 8 },   // outside the period
      { date: "08/19/26", kind: "vacation", hours: 8 }, // not a kind we have
      { date: "08/21/26", kind: "pto", hours: 0 },   // a zero is not a day off
      { date: "08/22/26", kind: "pto", hours: 25 },  // a day cannot hold it
      { date: "08/23/26", kind: "sick", hours: "x" },
    ],
    "08/16/26", "08/31/26",
  );
  assert.deepEqual(out, [
    { date: "08/18/26", kind: "sick", hours: 4.51 },
    { date: "08/20/26", kind: "pto", hours: 8 },
  ]);
});

test("one entry per day - the record it may become allows no more", () => {
  const out = cleanTimeOffEntries(
    [
      { date: "08/20/26", kind: "pto", hours: 8 },
      { date: "08/20/26", kind: "sick", hours: 4 },
    ],
    "08/16/26", "08/31/26",
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, "pto");
});

test("timeOffAnswerOf finds the one time_off row", () => {
  const row = { kind: TIME_OFF_KIND, choice: "no" };
  assert.equal(timeOffAnswerOf([{ kind: "q_repair" }, row]), row);
  assert.equal(timeOffAnswerOf([{ kind: "q_repair" }]), null);
  assert.equal(timeOffAnswerOf(null), null);
});

test("a yes adds one item per day, with the pinned wording", () => {
  const items = timeOffReviewItems([{
    kind: TIME_OFF_KIND,
    choice: "yes",
    timeOff: [
      { date: "08/20/26", kind: "pto", hours: 8 },
      { date: "08/21/26", kind: "sick", hours: 4.5 },
    ],
  }]);
  assert.equal(items.length, 2);
  assert.equal(items[0].date, "08/20/26");
  assert.equal(items[0].said, "You said this day held 8 hours of PTO that is not on the schedule.");
  assert.deepEqual(items[0].changes, [{
    fact: "8 hours of PTO on this day is not on the schedule.",
    action: "Add it to the schedule.",
  }]);
  assert.equal(items[1].said, "You said this day held 4.5 hours of sick time that is not on the schedule.");
  assert.equal(items[1].changes[0].fact, "4.5 hours of sick time on this day is not on the schedule.");
});

test("one hour reads singular", () => {
  const items = timeOffReviewItems([{
    kind: TIME_OFF_KIND, choice: "yes",
    timeOff: [{ date: "08/20/26", kind: "pto", hours: 1 }],
  }]);
  assert.equal(items[0].said, "You said this day held 1 hour of PTO that is not on the schedule.");
});

test("a no says nothing - it agrees with the schedule", () => {
  assert.deepEqual(timeOffReviewItems([{ kind: TIME_OFF_KIND, choice: "no", timeOff: null }]), []);
  assert.deepEqual(timeOffReviewItems([]), []);
});

test("a malformed stored entry is skipped rather than sentenced", () => {
  const items = timeOffReviewItems([{
    kind: TIME_OFF_KIND, choice: "yes",
    timeOff: [
      { date: "", kind: "pto", hours: 8 },
      { date: "08/20/26", kind: "pto", hours: 0 },
      { date: "08/21/26", kind: "pto", hours: 2 },
    ],
  }]);
  assert.equal(items.length, 1);
  assert.equal(items[0].date, "08/21/26");
});
