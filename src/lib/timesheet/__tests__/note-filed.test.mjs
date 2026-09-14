// WHEN A NOTE WAS FILED, ON THE CARD - Mánu 2026-09-14: "i want to add signed
// at under note DSN x words", then "are there any who signed it that wasnt the
// staff?"
//
// Answering the second question is what renamed this. The DSN's sign-off row is
// headed "Employee Name: | Signature: | Date:" and the SIGNATURE COLUMN IS
// EMPTY on all 661 pages of the export, so there is a filed time and no
// signature. See note-filed.js.
//
// The bug this replaces was silent: the fold-out printed a bare label with
// nothing after it on every note whose export carries no time at all. Nothing
// threw. The screen just said something untrue, on 368 of the 1,029 notes of
// the current period.
import { test } from "node:test";
import assert from "node:assert/strict";
import { filedLine, filedParts, filedGapMin } from "../note-filed.js";

// a real one off the current period
// the fields keep the parser's names; signedBy is the Employee Name column
const dsn = { signedDate: "09/01/26", signedAt: "12:06 PM", signedBy: "Taylor Adams" };
// the supervisor .xls sets all three to null on purpose
const xls = { signedDate: null, signedAt: null, signedBy: null };

test("a note with no filed time prints no line at all", () => {
  assert.equal(filedLine(xls), null);
  assert.equal(filedLine(xls, "09/01/26"), null);
  assert.equal(filedLine({}), null);
  assert.equal(filedLine(null), null);
  assert.equal(filedLine(undefined, "09/01/26"), null);
});

test("the day is dropped when it is the shift's own", () => {
  // 658 of 661 land here, and the card would otherwise repeat the date in its
  // own header
  assert.equal(filedLine(dsn, "09/01/26"), "12:06 PM");
});

test("the day is kept when the note was signed on another one", () => {
  // the three that matter: e.g. a 09/07 shift signed 09/09
  assert.equal(filedLine({ signedDate: "09/09/26", signedAt: "11:22 AM" }, "09/07/26"), "09/09/26 11:22 AM");
});

test("with no shift day to compare against, the date is always kept", () => {
  // this is the fold-out, which is the detailed reading
  assert.equal(filedLine(dsn), "09/01/26 12:06 PM");
});

test("half a stamp prints the half there is", () => {
  assert.equal(filedLine({ signedAt: "12:06 PM" }), "12:06 PM");
  assert.equal(filedLine({ signedDate: "09/01/26" }), "09/01/26");
  // and a date-only stamp on the shift's own day has nothing left to say
  assert.equal(filedLine({ signedDate: "09/01/26" }, "09/01/26"), null);
});

// ---- the halves, because the card colours the day and not the time ----
// Mánu 2026-09-14: "if they are filed on a different day of the shift then can
// you put the date next to the time in red"

test("a day that is not the shift's own comes back marked for the colour", () => {
  const p = filedParts({ signedDate: "09/09/26", signedAt: "11:22 AM" }, "09/07/26");
  assert.deepEqual(p, { date: "09/09/26", time: "11:22 AM", otherDay: true });
});

test("the shift's own day is not shown, so there is nothing to colour", () => {
  const p = filedParts(dsn, "09/01/26");
  assert.deepEqual(p, { date: null, time: "12:06 PM", otherDay: false });
});

test("the fold-out keeps the day and never marks it", () => {
  // nothing to be the odd one out against when no shift day is passed
  const p = filedParts(dsn);
  assert.deepEqual(p, { date: "09/01/26", time: "12:06 PM", otherDay: false });
});

test("no filed time is still no parts at all", () => {
  assert.equal(filedParts(xls, "09/01/26"), null);
  assert.equal(filedParts({}), null);
  assert.equal(filedParts(null, "09/01/26"), null);
});

test("a day filed BEFORE the shift is marked too, not just a late one", () => {
  // the rule he asked for is "a different day", which cuts both ways
  const p = filedParts({ signedDate: "08/31/26", signedAt: "9:00 PM" }, "09/01/26");
  assert.equal(p.otherDay, true);
  assert.equal(p.date, "08/31/26");
});

// ---- how far the filed stamp sits from the clock out ----
// Mánu 2026-09-14: "lets make the auto flag pick up dsn filed time if its over
// 10 minutes of the clock out time ... for example a shift 9am-12pm clocked
// 9am-12pm and dsn filed at 10am"

const NOON = 12 * 60;

test("his own example: a 9-12 shift with the note filed at 10am is two hours early", () => {
  const gap = filedGapMin({ signedAt: "10:00 AM", signedDate: "09/01/26" }, "09/01/26", NOON);
  assert.equal(gap, -120);
});

test("filed at the clock out is nothing at all", () => {
  assert.equal(filedGapMin({ signedAt: "12:00 PM", signedDate: "09/01/26" }, "09/01/26", NOON), 0);
});

test("the ordinary case stays small, and must not fire a ten minute rule", () => {
  // the median on the current period is 3 minutes before clock out
  const gap = filedGapMin({ signedAt: "11:57 AM", signedDate: "09/01/26" }, "09/01/26", NOON);
  assert.equal(gap, -3);
  assert.ok(Math.abs(gap) <= 10);
});

test("a note filed the next day carries the day, not just the clock", () => {
  // 9:00 AM the following day against a noon clock out is 21 hours, not 3 early
  const gap = filedGapMin({ signedAt: "9:00 AM", signedDate: "09/02/26" }, "09/01/26", NOON);
  assert.equal(gap, 1440 - 180);
});

test("no clock out means no gap rather than a gap against nothing", () => {
  assert.equal(filedGapMin({ signedAt: "10:00 AM", signedDate: "09/01/26" }, "09/01/26", null), null);
  assert.equal(filedGapMin({ signedAt: "10:00 AM", signedDate: "09/01/26" }, "09/01/26", undefined), null);
});

test("a note with no stamp has no gap", () => {
  assert.equal(filedGapMin(xls, "09/01/26", NOON), null);
  assert.equal(filedGapMin({}, "09/01/26", NOON), null);
  assert.equal(filedGapMin(null, "09/01/26", NOON), null);
});

test("an unreadable date is refused rather than guessed as the same day", () => {
  // guessing zero would call a next-day filing an on-time one
  assert.equal(filedGapMin({ signedAt: "10:00 AM", signedDate: "nonsense" }, "09/01/26", NOON), null);
  assert.equal(filedGapMin({ signedAt: "10:00 AM", signedDate: "09/01/26" }, "nonsense", NOON), null);
});

test("midnight and noon are not confused", () => {
  assert.equal(filedGapMin({ signedAt: "12:00 AM", signedDate: "09/01/26" }, "09/01/26", 0), 0);
  assert.equal(filedGapMin({ signedAt: "12:30 AM", signedDate: "09/01/26" }, "09/01/26", 0), 30);
});
