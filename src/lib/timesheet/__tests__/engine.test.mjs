// Engine tests. Run with `npm run test:timesheet`.
//
// These exist because the break rules are intricate, they were changed twice in
// one day, and both times the only thing standing behind the change was a script
// in a temp folder that no longer exists. Every assertion below is one that
// actually caught something, or guards an edge that would be silent if it broke.
//
// No test framework on purpose - node's built-in runner, no new dependency for a
// project that doesn't otherwise have one.
import { test } from "node:test";
import assert from "node:assert/strict";

import { restsRequired, analyzeDay, applyOvertime, RULES } from "../parse.js";
import { findAnomalies, suggestPunches, reviewSheet } from "../anomalies.js";
import { recomputeSheet, patchFor, mergeOverride, CORRECTION_KINDS } from "../corrections.js";
import { compareToSchedule, scheduleKey } from "../schedule.js";

// minutes from midnight, the way the parser holds a punch
const at = (h, m = 0) => ({ min: h * 60 + m });
const day = (punches, date = "07/20/26") => analyzeDay({ date, punches, printed: null });

// ---------------------------------------------------------------- rest periods

test("rest periods follow the major-fraction bands, not whole 4-hour blocks", () => {
  // CA: one per 4 hours worked "or major fraction thereof". A major fraction of
  // a 4-hour block is anything over two hours, which lands the bands off the
  // multiples of four. Counting whole blocks under-counts every shift between
  // six and eight hours, which is most of them.
  assert.equal(restsRequired(0), 0);
  assert.equal(restsRequired(3.5), 0, "exactly 3.5 owes nothing");
  assert.equal(restsRequired(3.6), 1, "just past 3.5 owes one");
  assert.equal(restsRequired(6), 1, "exactly 6 still owes one");
  assert.equal(restsRequired(6.1), 2, "just past 6 owes two");
  assert.equal(restsRequired(7), 2, "the band that whole-block counting got wrong");
  assert.equal(restsRequired(8), 2);
  assert.equal(restsRequired(10), 2);
  assert.equal(restsRequired(10.1), 3);
  assert.equal(restsRequired(14), 3);
  assert.equal(restsRequired(14.1), 4);
});

test("the old whole-block rule and the current one differ where it matters", () => {
  for (const h of [3.75, 6.5, 7, 7.5, 11]) {
    assert.notEqual(Math.floor(h / 4), restsRequired(h), `${h}h should differ`);
  }
  for (const h of [4, 5, 6, 8, 10]) {
    assert.equal(Math.floor(h / 4), restsRequired(h), `${h}h should agree`);
  }
});

// ------------------------------------------------------------------ meal timing

test("a meal must BEGIN by the end of the fifth hour, not merely happen", () => {
  // 8h shift, lunch after 4 hours worked
  const onTime = day([at(8), at(12), at(12, 30), at(16, 30)]);
  assert.equal(onTime.mealCount, 1);
  assert.equal(onTime.mealLate, false);
  assert.equal(onTime.mealViolation, false);
  assert.equal(onTime.mealStartedAfterMin, 240);

  // same shift, lunch after six hours worked
  const late = day([at(8), at(14), at(14, 30), at(16, 30)]);
  assert.equal(late.mealLate, true);
  assert.equal(late.mealMissing, false, "it happened, it was just late");
  assert.equal(late.mealViolation, true);
});

test("the fifth-hour boundary is exact", () => {
  const exactly300 = day([at(8), at(13), at(13, 30), at(16, 30)]);
  assert.equal(exactly300.mealStartedAfterMin, 300);
  assert.equal(exactly300.mealLate, false, "300 minutes is the deadline, not past it");

  const oneMinuteLate = day([at(8), at(13, 1), at(13, 31), at(16, 30)]);
  assert.equal(oneMinuteLate.mealLate, true);
});

test("missing and late are tracked apart but pay one premium between them", () => {
  const none = day([at(8), at(16, 30)]);
  assert.equal(none.mealMissing, true);
  assert.equal(none.mealLate, false, "you cannot be late for a meal you never took");
  assert.equal(none.mealViolation, true);
  assert.equal(RULES.premiumHoursPerViolation, 1);
});

test("a short day owes neither a meal nor a rest", () => {
  const short = day([at(9), at(12, 30)]); // 3.5 hours
  assert.equal(short.mealRequired, false);
  assert.equal(short.mealViolation, false);
  assert.equal(short.restRequired, 0);
});

// -------------------------------------------------------------------- overtime

test("daily overtime splits at 8 and double time at 12", () => {
  const [d] = applyOvertime([day([at(6), at(19, 50)])], null);
  assert.equal(d.regularHours, 8);
  assert.ok(Math.abs(d.otHours - 4) < 0.01);
  assert.ok(d.doubleHours > 1.8);
});

test("weekly overtime is drawn only from hours still at straight time", () => {
  // Mon 19.83h then four 8h days. The long Monday contributes 8 straight-time
  // hours, not 19.83, so the week lands on exactly 40 and no weekly OT triggers.
  // Pyramiding would wrongly push Thursday and Friday into overtime.
  const days = [
    day([at(8), at(11, 30), at(11, 40), at(20, 20)], "07/20/26"),
    day([at(8), at(16)], "07/21/26"),
    day([at(8), at(16)], "07/22/26"),
    day([at(8), at(16)], "07/23/26"),
    day([at(8), at(16)], "07/24/26"),
  ];
  const out = applyOvertime(days, { from: "07/20/26", to: "07/24/26" });
  const straight = out.reduce((n, d) => n + d.regularHours, 0);
  assert.ok(straight <= 40.01, `straight time should cap at 40, got ${straight}`);
});

// ------------------------------------------------------------- malformed punches

test("a clock-out before the clock-in is caught", () => {
  const found = findAnomalies({ punches: [at(15, 10), at(14, 30)] });
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, "backwards_segment");
});

test("an impossibly long stretch is caught", () => {
  // the real one: Garcia 07/20, a rest break whose second time took a PM
  const found = findAnomalies({ punches: [at(11, 30), at(23, 20)] });
  assert.equal(found[0].kind, "long_segment");
});

test("a break running backwards is caught", () => {
  const found = findAnomalies({ punches: [at(9), at(11, 5), at(11), at(13)] });
  assert.ok(found.some((f) => f.kind === "reversed_break"));
});

test("an ordinary day is not flagged", () => {
  assert.equal(findAnomalies({ punches: [at(8), at(12), at(12, 30), at(16, 30)] }).length, 0);
});

test("Garcia's real 07/20 punches resolve to an 8-hour day", () => {
  // the exact sequence from the export, and the schedule independently says 8.00
  const punches = [
    at(8, 30), at(11, 30), at(11, 30), at(23, 20), at(11, 30), at(13, 30),
    at(13, 30), at(15, 30), at(15, 30), at(16, 20), at(16, 30), at(16, 30),
  ];
  const before = day(punches);
  assert.ok(before.paidHours > 19, "as exported it reads as a 19+ hour day");
  const { punches: fixed } = suggestPunches({ punches });
  const after = analyzeDay({ date: "07/20/26", punches: fixed, printed: null });
  assert.ok(Math.abs(after.paidHours - 8) < 0.25, `expected ~8, got ${after.paidHours}`);
});

test("a repair is never offered unless it actually repairs the day", () => {
  // Purcell 07/31: the naive swap turns 16.29 hours into MINUS 8, so no
  // suggestion may be offered for it at all.
  const punches = [at(15, 15), at(17, 25), at(5, 15), at(19, 22)];
  const [row] = reviewSheet([{ date: "07/31/26", punches, printed: null }], analyzeDay);
  assert.ok(row, "the day must still be flagged");
  assert.equal(row.suggestion, null, "but no repair may be offered");
  assert.equal(row.needsHuman, true);
});

test("no suggestion anywhere is negative or absurd", () => {
  const cases = [
    [at(15, 15), at(17, 25), at(5, 15), at(19, 22)],
    [at(8, 36), at(12, 30), at(9, 31), at(12, 31), at(12, 30), at(12, 40)],
    [at(10), at(14, 50), at(15), at(11, 35)],
  ];
  for (const punches of cases) {
    const [row] = reviewSheet([{ date: "07/01/26", punches, printed: null }], analyzeDay);
    if (row?.suggestion) {
      assert.ok(row.suggestion.hours > 0 && row.suggestion.hours <= 16,
        `offered ${row.suggestion.hours} hours`);
    }
  }
});

// ------------------------------------------------------------------ corrections

test("recomputing with no overrides changes nothing", () => {
  const days = [
    { date: "07/20/26", paidHours: 8, rawHours: 8, mealViolation: false, restViolation: false, restCount: 2, restRequired: 2 },
    { date: "07/21/26", paidHours: 6, rawHours: 6, mealViolation: true, restViolation: false, restCount: 1, restRequired: 1 },
  ];
  const out = recomputeSheet({ days, payPeriod: null, overrides: null }, applyOvertime);
  assert.equal(out.totals.paidHours, 14);
  assert.equal(out.premiums.totalHours, 1);
});

test("a worked-through lunch adds the time back AND owes a premium", () => {
  const d = { date: "07/20/26", paidHours: 8, rawHours: 8, mealMin: 30, mealViolation: false, restViolation: false, restCount: 2, restRequired: 2 };
  const patch = patchFor("meal_missed", d, null);
  assert.equal(patch.mealViolation, true);
  assert.equal(patch.paidHours, 8.5);

  const out = recomputeSheet(
    { days: [d], payPeriod: null, overrides: mergeOverride(null, d.date, patch) },
    applyOvertime,
  );
  assert.equal(out.totals.paidHours, 8.5);
  assert.equal(out.premiums.totalHours, 1);
  assert.ok(out.totals.otHours > 0, "the extra half hour crosses 8 and becomes overtime");
});

test("every correction kind has copy and a defined shape", () => {
  for (const [key, spec] of Object.entries(CORRECTION_KINDS)) {
    assert.ok(spec.label, `${key} needs a label`);
    assert.ok(spec.help, `${key} needs help text`);
    assert.ok(["day", "newDay", "sheet"].includes(spec.scope), `${key} scope`);
  }
});

// -------------------------------------------------------------------- schedule

test("schedule names line up with timesheet names", () => {
  assert.equal(scheduleKey("Garcia, Stephanie"), scheduleKey("Stephanie Garcia"));
  assert.equal(scheduleKey("Rotter, B."), "b. rotter");
});

test("the schedule comparison only judges days inside the pay period", () => {
  // the schedule covers a whole month; a pay period is half of one. without the
  // window every sheet reports a fortnight of "missing" days from the other half.
  const timesheet = [{ date: "07/16/26", paidHours: 8 }, { date: "07/17/26", paidHours: 8 }];
  const schedule = [
    { date: "07/02/26", workHours: 8 },
    { date: "07/16/26", workHours: 8 },
    { date: "07/17/26", workHours: 8 },
  ];
  const cmp = compareToSchedule(timesheet, schedule);
  assert.equal(cmp.flagged.length, 0, "07/02 is outside the period and must be ignored");
});

test("a day that disagrees with the schedule is flagged", () => {
  const cmp = compareToSchedule(
    [{ date: "07/20/26", paidHours: 19.83 }],
    [{ date: "07/20/26", workHours: 8 }],
  );
  assert.equal(cmp.flagged.length, 1);
  assert.ok(Math.abs(cmp.flagged[0].diff - 11.83) < 0.01);
});

test("small differences are not flagged", () => {
  const cmp = compareToSchedule(
    [{ date: "07/20/26", paidHours: 8.25 }],
    [{ date: "07/20/26", workHours: 8 }],
  );
  assert.equal(cmp.flagged.length, 0);
});
