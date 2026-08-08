// The rules the premium split rests on.
//
// 727 premium hours divide into 447 that a source document witnesses and 280
// that rest on a question nobody has answered yet. That division is only
// meaningful if the rules underneath it hold, and the one most likely to get
// "fixed" by accident is the first test below: a punched gap, however lunch
// shaped, never clears a meal violation. Only the schedule can say a meal
// happened. Break that and 92 hours quietly move from owed to not owed.
//
// Every test here pairs the case with its opposite, so a rule that stopped
// discriminating would fail rather than keep passing.
import { test } from "node:test";
import assert from "node:assert/strict";

import { analyzeDay, analyzeTimesheet, RULES } from "../parse.js";
import { renderCorrected } from "../render.js";

// what a rendered sheet actually puts on the page. asserting on a flag cannot
// see a document that never prints it.
async function pdfWords(bytes) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes), useSystemFonts: false, isEvalSupported: false,
  }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    for (const item of content.items) if (item.str?.trim()) out.push(item.str.trim());
  }
  return out.join("\n");
}

const at = (h, m = 0) => ({ min: h * 60 + m });
// no mealScheduled key at all, which the parser reads as "the schedule covers
// this day and rosters no meal" - the conservative default that pays.
const day = (punches) => analyzeDay({ date: "07/20/26", punches, printed: null });
const withSchedule = (punches, extra = {}) =>
  analyzeDay({ date: "07/20/26", punches, printed: null, ...extra });

// 8a-12p, out 30 min, 12:30p-5p. 8.5 hrs worked with a lunch-shaped hole in it.
const GAPPED = [at(8), at(12), at(12, 30), at(17)];
// same shape, but the hole opens after the fifth hour has already run out
const LATE_GAP = [at(8), at(13, 30), at(14), at(17)];

// ------------------------------------------------- a gap is not a break (M3)

test("a punched lunch-shaped gap does not clear a meal violation", () => {
  // M3: 67 premium hours across 30 people look exactly like this.
  const unrostered = day(GAPPED);
  assert.equal(unrostered.mealViolation, true, "an unrostered day still owes a meal premium");
  assert.equal(unrostered.mealScheduled, false);

  // the same punches, once the schedule actually rosters the meal. if this side
  // ever stops passing the test above proves nothing.
  const rostered = withSchedule(GAPPED, { mealScheduled: true });
  assert.equal(rostered.mealViolation, false, "a rostered meal on the same punches clears it");
});

test("a missing schedule is neither a violation nor a pass, it goes to a person", () => {
  const noSchedule = withSchedule(GAPPED, { mealScheduled: null });
  assert.equal(noSchedule.mealUnknown, true);
  assert.equal(noSchedule.mealViolation, false, "unknown days stay out of the total");
});

// ------------------------------------------------------- late meals are M1

test("a meal is only late if a meal was rostered in the first place", () => {
  // M1: the break happened, just after the fifth hour. 16 hours, 11 people.
  const rostered = withSchedule(LATE_GAP, { mealScheduled: true });
  assert.equal(rostered.mealLate, true);
  assert.equal(rostered.mealViolation, true, "late is its own violation");
  assert.ok(rostered.mealStartedAfterMin > RULES.mealMustStartByMin);

  // identical punches with nothing rostered are NOT M1. they are M3, and the
  // distinction is what keeps the two buckets from bleeding into each other.
  const unrostered = day(LATE_GAP);
  assert.equal(unrostered.mealLate, false, "nothing was rostered, so nothing was late");
  assert.equal(unrostered.mealViolation, true);
});

test("a meal premium never stacks, even with two lunch-shaped gaps", () => {
  // §226.7 caps it at one meal premium per workday. mealViolation is a flag and
  // must stay one, or a day with two gaps would pay twice.
  const twoGaps = day([at(7), at(11), at(11, 30), at(14), at(14, 45), at(18)]);
  assert.equal(twoGaps.mealViolation, true);
  assert.equal(typeof twoGaps.mealViolation, "boolean");
});

// ------------------------------------------------- the waivable boundary (M5)

test("the meal is owed past five hours worked", () => {
  const fiveFlat = day([at(8), at(13)]);
  assert.equal(fiveFlat.paidHours, 5);
  assert.equal(fiveFlat.mealRequired, false, "exactly five hours owes nothing");
  assert.equal(fiveFlat.mealViolation, false);
  assert.equal(fiveFlat.mealWaived, false, "nothing to waive on a day that owes nothing");
});

// ------------------------------------------- the signed waiver, M5 (63 hours)

test("a signed waiver clears a day of 6 hours or less, and only the waiver clears it", () => {
  // every current member of staff has one on file (Mánu, 2026-08-08), so this
  // is the rule that takes the period from 727 to 664.
  const sixFlat = day([at(8), at(14)]);
  assert.equal(sixFlat.paidHours, 6);
  assert.equal(sixFlat.mealRequired, true, "a meal was still owed");
  assert.equal(sixFlat.mealWaived, true);
  assert.equal(sixFlat.mealViolation, false, "waived, so no premium");

  // the same day with nobody's signature behind it. if this ever stops failing,
  // the test above is passing for the wrong reason.
  const noWaiver = withSchedule([at(8), at(14)], { mealWaiverOnFile: false });
  assert.equal(noWaiver.mealWaived, false);
  assert.equal(noWaiver.mealViolation, true, "no waiver, so the premium stands");
});

test("a waiver cannot reach past 6 hours, or excuse a meal that was taken late", () => {
  // 6.5 hrs. the statute stops at 6 and so does the engine, whatever the
  // paperwork says.
  const past = day([at(8), at(14, 30)]);
  assert.equal(past.paidHours, 6.5);
  assert.equal(past.mealWaived, false);
  assert.equal(past.mealViolation, true);

  // a rostered meal that started late is a violation about TIMING, and waiving
  // a break you actually took is not a thing. M1 must not leak into M5.
  const late = withSchedule(LATE_GAP, { mealScheduled: true });
  assert.equal(late.mealWaived, false, "a meal was taken, so there is nothing to waive");
  assert.equal(late.mealViolation, true);
});

// ------------------------------------------------ rest evidence, R1 vs R2

test("only the Rest Periods Report can witness a rest, and not being in it still pays", () => {
  const eightHours = [at(8), at(16, 30)];

  // R1: the report covers them and shows a shortfall. 282 hours, 34 people.
  const covered = withSchedule(eightHours, { restRecorded: 1 });
  assert.equal(covered.restSource, "rest-report");
  assert.equal(covered.restTaken, 1);
  assert.equal(covered.restRequired, 2);
  assert.equal(covered.restViolation, true);

  // and the report can clear a day, which is what stops R1 being vacuous.
  const cleared = withSchedule(eightHours, { restRecorded: 2 });
  assert.equal(cleared.restViolation, false);

  // R2: the report never mentions them. 125 hours, 18 people. Mánu's ruling of
  // 2026-08-03 is that staff are expected to punch, so the premium stands.
  const uncovered = withSchedule(eightHours, {});
  assert.equal(uncovered.restSource, "none");
  assert.equal(uncovered.restTaken, 0);
  assert.equal(uncovered.restViolation, true);
  assert.equal(uncovered.restUnknown, false, "the report was collected, so this is owed not unknown");
});

test("a batch with no rest source at all goes unknown instead of owed", () => {
  // the 410 to 961 mistake. if nobody uploaded a rest report the days are
  // unanswerable, and charging them would have more than doubled the batch.
  const noSource = withSchedule([at(8), at(16, 30)], { restSourceAvailable: false });
  assert.equal(noSource.restUnknown, true);
  assert.equal(noSource.restViolation, false, "unknown stays out of the total");
});

// ------------------------------------------------ the document says which one

test("a waived day says so on the sheet, and does not look like a compliant day", async () => {
  // 6 hours flat, nothing rostered, waiver on file. the premium is gone, and
  // the reason it is gone has to be printed or the only record of why 63 hours
  // left the period lives in the engine.
  const punches = [at(8), at(14)];
  const sheet = analyzeTimesheet({
    employee: "Test, Person",
    payPeriod: { from: "07/16/26", to: "07/31/26" },
    days: [{ date: "07/20/26", punches, printed: null }],
  });
  assert.equal(sheet.days[0].mealWaived, true);
  assert.equal(sheet.premiums.mealHours, 0, "waived, so it costs nothing");

  const { bytes } = await renderCorrected(sheet, { printedBy: "Test", generatedOn: "8/8/2026" });
  const words = await pdfWords(bytes);
  assert.ok(words.includes("meal waived, waiver on file"), "the sheet says why");
  assert.ok(!words.includes("no meal period"), "and does not also claim a violation");
});

// ------------------------------------------- where the gap falls on the roster

// 8a-12p, out 30 min, 12:30p-5p, with the roster expressed in minutes.
const b = (h1, m1, h2, m2, meal = false) =>
  ({ start: h1 * 60 + m1, end: h2 * 60 + m2, meal });
const gapDay = (scheduleBlocks) =>
  analyzeDay({ date: "07/20/26", punches: GAPPED, printed: null, scheduleBlocks });

test("a gap between two consecutive bookings is a scheduled transition", () => {
  // 63 of the 67 M3 days look exactly like this: one client ends at 12, the
  // next starts at 12:30, and the punch-out sits in the seam.
  const d = gapDay([b(8, 0, 12, 0), b(12, 30, 17, 0)]);
  assert.equal(d.mealGapKind, "scheduled-transition");
  assert.equal(d.mealGapMin, 30);
  // and it changes nothing about what is owed
  assert.equal(d.mealViolation, true, "classifying evidence must not move the premium");
});

test("a gap opening inside one booking is a step-away, not a transition", () => {
  // Lazo 07/29 is the only day in the batch shaped like this.
  const d = gapDay([b(8, 0, 17, 0)]);
  assert.equal(d.mealGapKind, "inside-booking");
  assert.equal(d.mealViolation, true);
});

test("punches that match no rostered seam are unclear rather than assumed", () => {
  const d = gapDay([b(6, 0, 7, 0), b(19, 0, 20, 0)]);
  assert.equal(d.mealGapKind, "unclear");
});

test("a day of overlapping bookings has no real gap to classify", () => {
  // Devine 07/23, Hardin 07/23, McCulley 07/16. QSP serialises two bookings
  // that ran at once, and the seam reads as a gap nobody was away for.
  const punches = [at(7, 30), at(11), at(9), at(10)];   // 3.5 hrs inside a 2.5 hr window
  const d = analyzeDay({ date: "07/23/26", punches, printed: null, scheduleBlocks: [] });
  assert.equal(d.compressedDay, true, "the day is already flagged as overlapping");
  if (d.mealGapKind !== null) assert.equal(d.mealGapKind, "overlap-artifact");
});

test("no schedule means no answer, and a rest-shaped gap is not classified at all", () => {
  assert.equal(gapDay(null).mealGapKind, "no-schedule");
  // a 15 minute gap is rest-shaped, not meal-shaped, so there is nothing here
  const shortGap = analyzeDay({
    date: "07/20/26", punches: [at(8), at(12), at(12, 15), at(17)],
    printed: null, scheduleBlocks: [b(8, 0, 12, 0), b(12, 15, 17, 0)],
  });
  assert.equal(shortGap.mealGapKind, null);
  assert.equal(shortGap.mealGapMin, null);
});

test("a rostered meal is not a seam between bookings", () => {
  // the meal block itself must not count as the boundary, or every properly
  // rostered lunch would read as a transition.
  const d = analyzeDay({
    date: "07/20/26", punches: GAPPED, printed: null, mealScheduled: true,
    scheduleBlocks: [b(8, 0, 12, 0), b(12, 0, 12, 30, true), b(12, 30, 17, 0)],
  });
  // the meal block must not count as the boundary, but neither should the gap
  // then read as a transition between clients: it is the lunch itself.
  assert.equal(d.mealGapKind, "rostered-meal");
  assert.equal(d.mealViolation, false, "and the rostered meal clears the premium as before");
});

// ------------------------------------------------- worked time before a rest

test("worked minutes before an instant are not elapsed minutes", async () => {
  const { workedBeforeMin, RULES } = await import("../parse.js");

  // a straight 8a-5p shift: 4 hours of work by noon, either way you count it
  const straight = [at(8), at(17)];
  assert.equal(workedBeforeMin(straight, 12 * 60), 240);

  // a split shift: 8a-10a, off for three hours, back 1p-5p. At 2pm the clock
  // says six hours have passed and the person has worked three.
  const split = [at(8), at(10), at(13), at(17)];
  assert.equal(workedBeforeMin(split, 14 * 60), 180, "three hours worked, six elapsed");
  assert.ok(14 * 60 - split[0].min > RULES.restWindowMin, "and elapsed would call it late");
  assert.ok(workedBeforeMin(split, 14 * 60) <= RULES.restWindowMin, "worked time does not");

  // nothing yet, and nothing after the last punch beyond the hours worked
  assert.equal(workedBeforeMin(split, 7 * 60), 0);
  assert.equal(workedBeforeMin(split, 23 * 60), 360);
  assert.equal(workedBeforeMin([], 12 * 60), 0);
});

// ------------------------------------------------------- the second meal

// 6a-5:30p with a rostered lunch: 11.5 hours worked, so a second meal is owed.
const LONG = [at(6), at(11), at(11, 30), at(17, 30)];
const blocks2 = (meals) => [
  { start: 6 * 60, end: 11 * 60, meal: false },
  ...(meals >= 1 ? [{ start: 11 * 60, end: 11 * 60 + 30, meal: true }] : []),
  { start: 11 * 60 + 30, end: 17 * 60 + 30, meal: false },
  ...(meals >= 2 ? [{ start: 16 * 60, end: 16 * 60 + 30, meal: true }] : []),
];

test("a second meal is owed past ten hours, and only the schedule can witness it", () => {
  const oneRostered = withSchedule(LONG, { mealScheduled: true, scheduleBlocks: blocks2(1) });
  assert.ok(oneRostered.paidHours > 10);
  assert.equal(oneRostered.secondMealRequired, true);
  assert.equal(oneRostered.mealsRostered, 1);
  assert.equal(oneRostered.secondMealTaken, false);
  assert.equal(oneRostered.secondMealViolation, true);
  assert.equal(oneRostered.mealViolation, true, "the first meal was fine, the second was not");

  // roster the second one and the day is clean. without this the test above
  // could be passing because nothing ever clears a second meal.
  const twoRostered = withSchedule(LONG, { mealScheduled: true, scheduleBlocks: blocks2(2) });
  assert.equal(twoRostered.mealsRostered, 2);
  assert.equal(twoRostered.secondMealViolation, false);
  assert.equal(twoRostered.mealViolation, false);
});

test("exactly ten hours owes no second meal", () => {
  // 6a-4:30p with a 30 minute lunch: 10.0 hours worked, not 10.5.
  const tenFlat = withSchedule([at(6), at(11), at(11, 30), at(16, 30)], {
    mealScheduled: true, scheduleBlocks: blocks2(1),
  });
  assert.equal(tenFlat.paidHours, 10);
  assert.equal(tenFlat.secondMealRequired, false);
  assert.equal(tenFlat.secondMealViolation, false);
  assert.equal(tenFlat.mealViolation, false);
});

test("missing both meals still pays exactly one premium", () => {
  // §226.7 caps the workday at one meal premium however many were missed.
  const none = withSchedule(LONG, { mealScheduled: false, scheduleBlocks: blocks2(0) });
  assert.equal(none.mealViolation, true);
  assert.equal(typeof none.mealViolation, "boolean", "a flag, never a count");
  assert.equal(none.secondMealViolation, true);
});

test("a second meal taken after the tenth hour is late", () => {
  // both rostered, but the second one opens at 10h20m of work
  const late = withSchedule([at(6), at(11), at(11, 30), at(17), at(17, 30), at(19)], {
    mealScheduled: true,
    scheduleBlocks: [
      { start: 6 * 60, end: 11 * 60, meal: false },
      { start: 11 * 60, end: 11 * 60 + 30, meal: true },
      { start: 11 * 60 + 30, end: 17 * 60, meal: false },
      { start: 17 * 60, end: 17 * 60 + 30, meal: true },
      { start: 17 * 60 + 30, end: 19 * 60, meal: false },
    ],
  });
  assert.equal(late.secondMealTaken, true);
  assert.ok(late.secondMealLate, "opened past the end of the tenth hour worked");
  assert.equal(late.mealViolation, true);
});

test("without the roster blocks the second meal goes to a person, not to the total", () => {
  // a caller that hands in mealScheduled alone cannot say how MANY were
  // rostered, so the day must not be charged on a guess either way.
  const noBlocks = withSchedule(LONG, { mealScheduled: true });
  assert.equal(noBlocks.mealsRostered, null);
  assert.equal(noBlocks.secondMealUnknown, true);
  assert.equal(noBlocks.secondMealViolation, false, "unknown stays out of the total");
  assert.equal(noBlocks.mealViolation, false);
});

test("the sheet says which meal was missed, not just that one was", async () => {
  // a day past ten hours where the first lunch happened and the second did not.
  // "no meal period" would be a false sentence on a day they were given one.
  const sheet = analyzeTimesheet({
    employee: "Test, Person",
    payPeriod: { from: "07/16/26", to: "07/31/26" },
    days: [{
      date: "07/20/26", punches: LONG, printed: null,
      mealScheduled: true, scheduleBlocks: blocks2(1),
    }],
  });
  assert.equal(sheet.days[0].secondMealViolation, true);

  const { bytes } = await renderCorrected(sheet, { printedBy: "Test", generatedOn: "8/8/2026" });
  const words = await pdfWords(bytes);
  assert.ok(words.includes("no second meal period"), "the sheet names the one they missed");
  assert.ok(!words.includes("no meal period,"), "and does not claim they got none at all");
});

// ------------------------------------------- a rest tacked onto the lunch

// 8a-5:30p with a rostered 12:00-12:30 lunch
const LUNCH_DAY = [at(8), at(12), at(12, 30), at(17, 30)];
const LUNCH_BLOCKS = [
  { start: 8 * 60, end: 12 * 60, meal: false },
  { start: 12 * 60, end: 12 * 60 + 30, meal: true },
  { start: 12 * 60 + 30, end: 17 * 60 + 30, meal: false },
];
const withRests = (restTimes) =>
  analyzeDay({
    date: "07/20/26", punches: LUNCH_DAY, printed: null, mealScheduled: true,
    scheduleBlocks: LUNCH_BLOCKS, restRecorded: restTimes.length, restTimes,
  });

test("a rest butted against the lunch is spotted, at either end", () => {
  // ends exactly when lunch starts: 11:50-12:00
  const before = withRests([{ out: 11 * 60 + 50, in: 12 * 60 }]);
  assert.equal(before.restTackedOn, 1);
  // starts exactly when lunch ends: 12:30-12:40
  const after = withRests([{ out: 12 * 60 + 30, in: 12 * 60 + 40 }]);
  assert.equal(after.restTackedOn, 1);
});

test("a rest in the middle of a work period is not tacked on", () => {
  // 10:00-10:10, two hours clear of the lunch. without this the test above
  // proves nothing, because a check that always says yes says nothing.
  const clear = withRests([{ out: 10 * 60, in: 10 * 60 + 10 }]);
  assert.equal(clear.restTackedOn, 0);

  // and 20 minutes short of the lunch is still its own break. the six real
  // cases were EXACTLY contiguous; widening the tolerance to 10 started
  // catching rests like this one, which is why it is 2.
  const near = withRests([{ out: 11 * 60 + 30, in: 11 * 60 + 40 }]);
  assert.equal(near.restTackedOn, 0);
});

test("a tacked-on rest is reported and never charged", () => {
  // an 9.5 hour day owes 2 rests. one of them is butted against lunch, and the
  // premium must NOT move: the schedule cannot roster a rest at all, so the
  // employer gave a standalone lunch and the employee stacked against it.
  const d = withRests([
    { out: 12 * 60 + 30, in: 12 * 60 + 40 },
    { out: 15 * 60, in: 15 * 60 + 10 },
  ]);
  assert.equal(d.restTackedOn, 1);
  assert.equal(d.restTaken, 2, "still counted as taken");
  assert.equal(d.restRequired, 2);
  assert.equal(d.restViolation, false, "reported, not charged");
});

test("without rest times or without a rostered lunch there is no answer", () => {
  const noTimes = analyzeDay({
    date: "07/20/26", punches: LUNCH_DAY, printed: null, mealScheduled: true,
    scheduleBlocks: LUNCH_BLOCKS, restRecorded: 1,
  });
  assert.equal(noTimes.restTackedOn, null);

  const noLunch = analyzeDay({
    date: "07/20/26", punches: LUNCH_DAY, printed: null, restRecorded: 1,
    restTimes: [{ out: 12 * 60 + 30, in: 12 * 60 + 40 }],
  });
  assert.equal(noLunch.restTackedOn, null, "nothing to be tacked onto");
});

// --------------------------------- rests outside the shift, and unpaid rests

test("a rest logged outside the shift does not count, and the premium follows", () => {
  // April Martinez's shape: a 7:00-7:10 rest on a shift that starts at 8:00,
  // twelve days running. A default nobody changed, clearing a premium she is
  // owed every one of those days. Same principle as a rest inside the lunch -
  // those minutes are not paid, so they were never a rest period - and Mánu's
  // ruling is that the entry is a records failure on the employer's side.
  const before = analyzeDay({
    date: "07/20/26", punches: [at(8), at(17)], printed: null, mealScheduled: true,
    scheduleBlocks: LUNCH_BLOCKS, restRecorded: 2,
    restTimes: [{ out: 7 * 60, in: 7 * 60 + 10 }, { out: 14 * 60, in: 14 * 60 + 10 }],
  });
  assert.equal(before.restsOutsideShift, 1);
  assert.equal(before.restTaken, 1, "the report said 2, one was before she clocked in");
  assert.equal(before.restRequired, 2);
  assert.equal(before.restViolation, true, "so an hour is owed");

  // after clock-out, the other direction
  const after = analyzeDay({
    date: "07/20/26", punches: [at(8), at(16, 30)], printed: null, restRecorded: 1,
    restTimes: [{ out: 21 * 60 + 40, in: 21 * 60 + 50 }],
  });
  assert.equal(after.restsOutsideShift, 1);

  // and a rest in the middle of the shift is not flagged, or the check says
  // nothing at all
  const normal = analyzeDay({
    date: "07/20/26", punches: [at(8), at(17)], printed: null, restRecorded: 1,
    restTimes: [{ out: 10 * 60, in: 10 * 60 + 10 }],
  });
  assert.equal(normal.restsOutsideShift, 0);
});

test("a rest inside a punched-out gap was not paid, and is reported as such", () => {
  // Uribe 07/31: punched out 12:00-13:00 with the rest recorded 12:00-12:10.
  const d = analyzeDay({
    date: "07/31/26",
    punches: [at(8), at(9, 30), at(10), at(12), at(13), at(16)],
    printed: null, restRecorded: 1,
    restTimes: [{ out: 12 * 60, in: 12 * 60 + 10 }],
  });
  assert.equal(d.restsUnpaid, 1);
  assert.equal(d.restsOutsideShift, 0, "it is inside the shift, just not on the clock");
  // and it does not count, same principle as the other two: unpaid minutes were
  // never a rest period. Uribe 07/28 and 07/29 are exactly this and each gains
  // an hour; his 07/31 already owed one, and the cap is one a day.
  assert.equal(d.restTaken, 0, "the report said 1, the person was off the clock for it");
  assert.equal(d.restViolation, true);

  // the same rest taken while still clocked in is paid, and not flagged
  const onClock = analyzeDay({
    date: "07/31/26", punches: [at(8), at(16)], printed: null, restRecorded: 1,
    restTimes: [{ out: 12 * 60, in: 12 * 60 + 10 }],
  });
  assert.equal(onClock.restsUnpaid, 0);
});

test("a reversed rest row is malformed, not a placement problem", () => {
  // Devine 07/30 reads out 11:45, in 11:35. It must not be counted as either
  // outside the shift or unpaid - it is junk, and the rest reader already
  // handles it.
  const d = analyzeDay({
    date: "07/30/26", punches: [at(8), at(17)], printed: null, restRecorded: 0,
    restTimes: [{ out: 11 * 60 + 45, in: 11 * 60 + 35 }],
  });
  assert.equal(d.restsOutsideShift, 0);
  assert.equal(d.restsUnpaid, 0);
});

// ------------------------------- a rest inside the lunch is not a rest taken

test("a rest recorded inside the lunch does not count, and the premium follows", () => {
  // Jones 07/28: a 9.5 hour day owing 2 rests, one recorded 11:10-11:20 inside
  // an 11:00-11:30 rostered lunch and one genuine. The report says 2 of 2; the
  // inside one is unpaid meal time and was never a rest period.
  const d = analyzeDay({
    date: "07/28/26", punches: LUNCH_DAY, printed: null, mealScheduled: true,
    scheduleBlocks: LUNCH_BLOCKS, restRecorded: 2,
    restTimes: [
      { out: 12 * 60 + 10, in: 12 * 60 + 20 },   // inside the 12:00-12:30 lunch
      { out: 15 * 60, in: 15 * 60 + 10 },        // a real one
    ],
  });
  assert.equal(d.restsInsideMeal, 1);
  assert.equal(d.restTaken, 1, "the report said 2, one of them was lunch");
  assert.equal(d.restRequired, 2);
  assert.equal(d.restViolation, true, "so an hour is owed");
});

test("adjacent still counts, and the two groups never overlap", () => {
  // taking your ten right after lunch is a compliance habit, not an
  // uncompensated break. it must NOT be discounted, or the ruling above turns
  // into a much bigger one nobody made.
  const d = analyzeDay({
    date: "07/28/26", punches: LUNCH_DAY, printed: null, mealScheduled: true,
    scheduleBlocks: LUNCH_BLOCKS, restRecorded: 2,
    restTimes: [
      { out: 12 * 60 + 30, in: 12 * 60 + 40 },   // starts as lunch ends
      { out: 15 * 60, in: 15 * 60 + 10 },
    ],
  });
  assert.equal(d.restsInsideMeal, 0);
  assert.equal(d.restTackedOn, 1);
  assert.equal(d.restTaken, 2, "still taken");
  assert.equal(d.restViolation, false, "and still no premium");
});

test("discounting a rest can never push the count below zero", () => {
  const d = analyzeDay({
    date: "07/28/26", punches: LUNCH_DAY, printed: null, mealScheduled: true,
    scheduleBlocks: LUNCH_BLOCKS, restRecorded: 0,
    restTimes: [{ out: 12 * 60 + 10, in: 12 * 60 + 20 }],
  });
  assert.equal(d.restTaken, 0);
});

test("a rest that is both inside the lunch and outside the shift is discounted once", () => {
  // contrived, but the two rules are independent and both subtract, so the
  // union has to be taken or one rest would remove two from the tally.
  const d = analyzeDay({
    date: "07/20/26", punches: [at(12, 15), at(17)], printed: null, mealScheduled: true,
    scheduleBlocks: [
      { start: 8 * 60, end: 12 * 60, meal: false },
      { start: 12 * 60, end: 12 * 60 + 30, meal: true },
      { start: 12 * 60 + 30, end: 17 * 60, meal: false },
    ],
    restRecorded: 1,
    // 12:05-12:10 is inside the rostered lunch AND before the first punch
    restTimes: [{ out: 12 * 60 + 5, in: 12 * 60 + 10 }],
  });
  assert.equal(d.restsInsideMeal, 1);
  assert.equal(d.restsOutsideShift, 1);
  assert.equal(d.restTaken, 0, "1 recorded, 1 discounted, not 1 minus 2");
});

test("a rostered lunch is not called a transition between bookings", () => {
  // 130 days across 31 people came back "scheduled-transition" when the gap was
  // simply the lunch. The seam test excludes meal blocks, so the two work
  // blocks either side of a rostered lunch look like consecutive bookings.
  const rostered = analyzeDay({
    date: "07/20/26", punches: GAPPED, printed: null, mealScheduled: true,
    scheduleBlocks: [
      { start: 8 * 60, end: 12 * 60, meal: false },
      { start: 12 * 60, end: 12 * 60 + 30, meal: true },
      { start: 12 * 60 + 30, end: 17 * 60, meal: false },
    ],
  });
  assert.equal(rostered.mealGapKind, "rostered-meal");
  assert.equal(rostered.mealViolation, false, "and it is still a compliant day");

  // the identical punches with NO meal rostered are the real M3 shape and must
  // still read as a transition, or the fix has eaten the finding.
  const unrostered = analyzeDay({
    date: "07/20/26", punches: GAPPED, printed: null,
    scheduleBlocks: [
      { start: 8 * 60, end: 12 * 60, meal: false },
      { start: 12 * 60 + 30, end: 17 * 60, meal: false },
    ],
  });
  assert.equal(unrostered.mealGapKind, "scheduled-transition");
  assert.equal(unrostered.mealViolation, true);
});
