import test from "node:test";
import assert from "node:assert/strict";
import { buildQuestions, patchesFor, questionId } from "../questions.js";
import { recomputeSheet } from "../corrections.js";
import { applyOvertime, reentitle } from "../parse.js";

// WHAT THEY CONFIRM HAS TO REACH THE TIMESHEET UNDERNEATH IT. Mánu 2026-08-12:
// "as long as whatever they confirm gets changed in the time sheet below, then
// we're good."
//
// Splitting `restOutsideScheduled` into one card per date is exactly the change
// that could quietly break that: the card used to carry every date, and an
// answer patched all of them together. These run the whole loop - build the
// questions, answer ONE of them, apply the patch, recompute the sheet - and
// check both that the answered day moved and that the other one did not.

// a 6.00 hour day with a ten logged ten minutes before the shift starts, which
// is what puts it at 6.17 and over the six hour line
const day = (date) => ({
  date,
  paidHours: 6.17,
  restsOffClock: 1,
  restsOffClockMin: 10,
  addedHours: 0.17,
  restTaken: 1,
  restRequired: 2,
  // the schedule COVERS this day and rosters no meal. Without it the day is
  // `mealUnknown`, and an unknown meal can never be waived however few hours it
  // holds - so the waiver would not come back and the test would be measuring
  // the gap in its own fixture rather than the cascade.
  mealScheduled: false,
  mealsRostered: 0,
  restViolation: true,
  mealRequired: true,
  mealWaived: false,
  mealViolation: true,
  punches: [{ min: 8 * 60 }, { min: 14 * 60, }],
  breaks: [],
  printed: { daily: 6 },
  rawHours: 6,
  regularHours: 6.17,
  otHours: 0,
  doubleHours: 0,
  workedMin: 370,
});
const offClockRow = (date) => ({
  name: "T", date, out: "7:50 AM", in: "8:00 AM",
  minutes: 10, counted: true, shift: "8:00 AM to 2:00 PM",
});

const DATES = ["07/28/26", "07/29/26"];
const build = () =>
  buildQuestions({ days: DATES.map(day) }, {
    restRows: DATES.map(offClockRow),
    sourceName: "T",
  }).filter((q) => q.kind === "restOutsideScheduled");

test("two dates make two cards, each speaking only for itself", () => {
  const qs = build();
  assert.equal(qs.length, 2);
  assert.deepEqual(qs.map((q) => q.date), DATES);
  assert.notEqual(questionId(qs[0]), questionId(qs[1]));
  // each card's evidence is its own day and nobody else's
  for (const q of qs) {
    assert.deepEqual([...new Set(q.row.detail.map((x) => x.date))], [q.date]);
  }
});

test("answering one date reaches the sheet, and leaves the other date alone", () => {
  const qs = build();
  const days = DATES.map(day);
  const target = qs[0];                       // 07/28 only
  const its = days.find((d) => d.date === target.date);

  // "I took it during a shift" - the minutes stop being off-clock time
  const overrides = { [target.date]: patchesFor(target, "no", its) };
  const out = recomputeSheet({ days, payPeriod: null, overrides }, applyOvertime, reentitle);

  const got = (date) => out.days.find((d) => d.date === date);
  assert.equal(got("07/28/26").paidHours, 6, "the answered day drops to 6.00");
  assert.equal(got("07/28/26").addedHours, 0, "and stops claiming added minutes");
  assert.equal(got("07/29/26").paidHours, 6.17, "the unanswered day is untouched");
  assert.equal(got("07/29/26").addedHours, 0.17);
});

test("the entitlement follows the hours down, on that day only", () => {
  // 6.17 owes a meal and two tens; 6.00 waives the meal and owes one. That
  // cascade is the whole reason these questions are asked in order.
  const qs = build();
  const days = DATES.map(day);
  const target = qs[0];
  const overrides = { [target.date]: patchesFor(target, "no", days.find((d) => d.date === target.date)) };
  const out = recomputeSheet({ days, payPeriod: null, overrides }, applyOvertime, reentitle);

  const answered = out.days.find((d) => d.date === "07/28/26");
  const other = out.days.find((d) => d.date === "07/29/26");
  assert.equal(answered.restRequired, 1, "one ten owed at 6.00, not two");
  assert.equal(answered.mealUnknown, false, "the schedule covers the day, so it can be judged");
  assert.equal(answered.mealWaived, true, "and the meal waiver comes back");
  assert.equal(answered.mealViolation, false, "so the premium it carried goes away");
  assert.equal(other.restRequired, 2, "the other day still owes two");
  assert.equal(other.mealWaived, false);
});

test("confirming the time keeps the minutes paid, and only on its own day", () => {
  const qs = build();
  const days = DATES.map(day);
  const target = qs[1];                       // 07/29 this time
  const its = days.find((d) => d.date === target.date);

  const overrides = { [target.date]: patchesFor(target, "yes", its) };
  const out = recomputeSheet({ days, payPeriod: null, overrides }, applyOvertime, reentitle);

  const got = (date) => out.days.find((d) => d.date === date);
  assert.equal(got("07/29/26").paidHours, 6.17, "yes keeps the ten paid");
  assert.equal(got("07/28/26").paidHours, 6.17, "and says nothing about the other day");
});

test("answering both dates moves both, which one card could never have done separately", () => {
  const qs = build();
  const days = DATES.map(day);
  const overrides = {};
  for (const q of qs) {
    overrides[q.date] = patchesFor(q, "no", days.find((d) => d.date === q.date));
  }
  const out = recomputeSheet({ days, payPeriod: null, overrides }, applyOvertime, reentitle);
  assert.deepEqual(out.days.map((d) => d.paidHours), [6, 6]);
});

test("one date declined and the other confirmed land differently on the same sheet", () => {
  // the case the grouped card made impossible - Mánu's original objection to
  // grouping, now applied to this kind too
  const qs = build();
  const days = DATES.map(day);
  const overrides = {
    [qs[0].date]: patchesFor(qs[0], "no", days.find((d) => d.date === qs[0].date)),
    [qs[1].date]: patchesFor(qs[1], "yes", days.find((d) => d.date === qs[1].date)),
  };
  const out = recomputeSheet({ days, payPeriod: null, overrides }, applyOvertime, reentitle);
  assert.equal(out.days.find((d) => d.date === "07/28/26").paidHours, 6);
  assert.equal(out.days.find((d) => d.date === "07/29/26").paidHours, 6.17);
});
