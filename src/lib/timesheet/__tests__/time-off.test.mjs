// THE DAY-PROGRAM TIME-OFF QUESTION's rules: which days can be claimed, what
// an entry has to look like to be stored, and the exact lines a "yes" adds to
// the two review emails. The sentences are pinned because both inboxes read
// them - a drifted wording is a different statement to the office.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  periodDates,
  cleanTimeOffEntries,
  checkTimeOffEntries,
  timeOffProblem,
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

// NOTHING IS DROPPED QUIETLY (Mánu 2026-09-08). cleanTimeOffEntries filters,
// which is right for building the stored list but wrong as the only gate: a
// fumbled row vanished and the save still answered ok. These pin the strict
// check the screen and the answer action now share.
test("a bad row refuses the whole answer instead of vanishing from it", () => {
  const F = "09/01/26";
  const T = "09/15/26";
  // the case that shipped broken: three days in, one bad, two stored, "saved"
  const three = [
    { date: "09/02/26", kind: "pto", hours: 8 },
    { date: "09/03/26", kind: "pto", hours: 0 },
    { date: "09/04/26", kind: "sick", hours: 8 },
  ];
  assert.equal(cleanTimeOffEntries(three, F, T).length, 2); // the old silence
  const check = checkTimeOffEntries(three, F, T);
  assert.equal(check.ok, false);
  assert.equal(check.code, "hours");
  assert.equal(check.at, "09/03/26"); // and it names the row
  assert.equal(check.entries, undefined);
});

test("the strict check refuses each rule, naming the day", () => {
  const F = "09/01/26";
  const T = "09/15/26";
  const one = (e) => checkTimeOffEntries([e], F, T);
  assert.equal(one({ date: "08/31/26", kind: "pto", hours: 8 }).code, "date");
  assert.equal(one({ date: "09/16/26", kind: "pto", hours: 8 }).code, "date");
  assert.equal(one({ date: "09/02/26", kind: "vacation", hours: 8 }).code, "kind");
  assert.equal(one({ date: "09/02/26", kind: "pto", hours: 0 }).code, "hours");
  assert.equal(one({ date: "09/02/26", kind: "pto", hours: -1 }).code, "hours");
  assert.equal(one({ date: "09/02/26", kind: "pto", hours: 25 }).code, "hours");
  assert.equal(one({ date: "09/02/26", kind: "pto", hours: Infinity }).code, "hours");
  assert.equal(one({ date: "09/02/26", kind: "pto", hours: "eight" }).code, "hours");
  assert.equal(checkTimeOffEntries([], F, T).code, "empty");
  assert.equal(checkTimeOffEntries(null, F, T).code, "empty");
  // ONE ENTRY PER DAY is the storage rule, so the second row is a refusal now
  // rather than a row that silently shadows the first
  const dup = checkTimeOffEntries(
    [
      { date: "09/02/26", kind: "pto", hours: 4 },
      { date: "09/02/26", kind: "sick", hours: 4 },
    ],
    F,
    T,
  );
  assert.equal(dup.code, "duplicate");
  assert.equal(dup.at, "09/02/26");
});

test("a clean answer passes through and comes back stored-shaped", () => {
  const check = checkTimeOffEntries(
    [
      { date: "09/04/26", kind: "sick", hours: 8 },
      { date: "09/02/26", kind: "pto", hours: 7.5 },
    ],
    "09/01/26",
    "09/15/26",
  );
  assert.equal(check.ok, true);
  // sorted, rounded, and exactly what the filter would have built
  assert.deepEqual(check.entries, [
    { date: "09/02/26", kind: "pto", hours: 7.5 },
    { date: "09/04/26", kind: "sick", hours: 8 },
  ]);
});

test("every refusal has words, and they name the day", () => {
  assert.equal(timeOffProblem({ code: "empty" }), "Add the day you were off.");
  assert.equal(
    timeOffProblem({ code: "hours", at: "09/03/26" }),
    "09/03/26: enter the hours you were off, more than 0 and up to 24.",
  );
  assert.equal(
    timeOffProblem({ code: "duplicate", at: "09/02/26" }),
    "09/02/26: this day is already listed. Change the row it is on.",
  );
  assert.equal(
    timeOffProblem({ code: "date", at: "08/31/26" }),
    "08/31/26: that day is not in this pay period.",
  );
  assert.equal(timeOffProblem({ code: "kind", at: "09/02/26" }), "09/02/26: pick PTO or sick pay.");
  // an unknown code still says something useful rather than nothing
  assert.equal(timeOffProblem({}), "Check the days you entered.");
  assert.equal(timeOffProblem(), "Check the days you entered.");
});
