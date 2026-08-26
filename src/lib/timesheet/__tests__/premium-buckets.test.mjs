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
  // "waiver on file" was dropped 2026-08-09: it was the justification, not the
  // outcome, and it made the note the longest thing in a 70pt column.
  assert.ok(words.includes("meal waived"), "the sheet says the meal was waived");
  assert.ok(!words.includes("waiver on file"), "without restating the paperwork");
  assert.ok(!words.includes("no meal period"), "and does not claim a violation");
  // a waived day is NOT a clean day, and must not print the clean-day word
  assert.ok(!words.includes("compliant"), "waived is not the same as compliant");
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
// NOTE the afternoon is split around the second meal rather than running
// straight through it. Since Mánu's 2026-08-09 ruling a meal rostered ON TOP of
// a client booking does not count, and this fixture used to bury the 16:00 one
// inside an 11:30-17:30 block - so it stopped counting the moment the rule
// landed, which is the rule working rather than the test being wrong.
const blocks2 = (meals) => [
  { start: 6 * 60, end: 11 * 60, meal: false },
  ...(meals >= 1 ? [{ start: 11 * 60, end: 11 * 60 + 30, meal: true }] : []),
  ...(meals >= 2
    ? [
        { start: 11 * 60 + 30, end: 16 * 60, meal: false },
        { start: 16 * 60, end: 16 * 60 + 30, meal: true },
        { start: 16 * 60 + 30, end: 17 * 60 + 30, meal: false },
      ]
    : [{ start: 11 * 60 + 30, end: 17 * 60 + 30, meal: false }]),
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

  // and a second meal rostered ON TOP of the afternoon booking does not count,
  // exactly as the first one would not. Mánu 2026-08-09.
  const buried = withSchedule(LONG, {
    mealScheduled: true,
    scheduleBlocks: [
      { start: 6 * 60, end: 11 * 60, meal: false },
      { start: 11 * 60, end: 11 * 60 + 30, meal: true },
      { start: 11 * 60 + 30, end: 17 * 60 + 30, meal: false },
      { start: 16 * 60, end: 16 * 60 + 30, meal: true },   // inside the booking
    ],
  });
  assert.equal(buried.mealsRostered, 1, "the buried one is not a second meal");
  assert.equal(buried.secondMealViolation, true);
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

// MÁNU'S RULING 2026-08-09 REPLACED THE THREE DISCOUNTS THAT USED TO LIVE HERE,
// and he named the reversal himself. A rest recorded off the clock still COUNTS
// as taken; what was wrong was that nobody paid for the ten minutes, so the ten
// minutes get added to the day instead of an hour's premium being charged for
// them. Doing both would compensate the same ten minutes twice, which is the
// contradiction he pointed at on 08/08.
//
// These four tests used to assert the discount. They now assert the payment,
// and each still pairs the case with its opposite.

test("a ten logged outside the rostered day is paid ONCE CONFIRMED, and moving it is only an assumption", () => {
  // April Martinez's shape: a 7:00-7:10 rest on a shift that starts at 8:00,
  // eleven days running. A QSClock default nobody changed.
  //
  // MÁNU 2026-08-09 (evening) read this as a misclick and stopped paying the ten
  // minutes. THE 2026-08-11 FLIP PUT THEM BACK. The reading is unchanged - it
  // probably IS a misclick - but "we think you meant something else" is an
  // ASSUMPTION, and an assumption is never applied on its own.
  const before = analyzeDay({
    date: "07/20/26", punches: [at(8), at(17)], printed: null, mealScheduled: true,
    scheduleBlocks: LUNCH_BLOCKS, restRecorded: 2,
    // CONFIRMED - since 2026-08-12 the minutes only go on once the employee
    // says the entry was not a mistake. Unconfirmed is asserted below.
    restsOffClockConfirmed: true,
    restTimes: [{ out: 7 * 60, in: 7 * 60 + 10 }, { out: 14 * 60, in: 14 * 60 + 10 }],
  });
  assert.equal(before.restsOutsideShift, 1, "still flagged - Mánu asked for this one by name");
  assert.equal(before.restsOutsideScheduled, 1, "and it raises the question");
  assert.equal(before.restsOutsideScheduledMin, 10, "which is what correcting it would take off");
  assert.equal(before.restsOutsideScheduledDetail[0].where, "before-day");
  assert.equal(before.restsOffClock, 1, "but it is in the paid-for bucket");
  assert.equal(before.restsOffClockMin, 10);
  assert.equal(before.restTaken, 2, "the report said 2 and both still count");
  assert.equal(before.restViolation, false, "so no premium");
  // 9 hours on the clock plus the ten minutes she recorded. Under the old
  // default this was a flat 9.00.
  assert.equal(Number(before.paidHours.toFixed(2)), 9.17);
  assert.equal(Number(before.addedHours.toFixed(2)), 0.17, "and the sheet declares it as added");

  // THE OPPOSITE: the same two rests taken inside the shift add nothing and ask
  // nothing, or the assertion above is just measuring that rests exist.
  const onClock = analyzeDay({
    date: "07/20/26", punches: [at(8), at(17)], printed: null, mealScheduled: true,
    scheduleBlocks: LUNCH_BLOCKS, restRecorded: 2,
    restTimes: [{ out: 10 * 60, in: 10 * 60 + 10 }, { out: 14 * 60, in: 14 * 60 + 10 }],
  });
  assert.equal(onClock.restsOutsideScheduled, 0, "nothing to ask about");
  assert.equal(onClock.restsOffClockMin, 0);
  assert.equal(onClock.paidHours, 9, "nothing added, those minutes were already paid");

  // after the last rostered block, with a roster to say so
  const after = analyzeDay({
    date: "07/27/26", punches: [at(8), at(16, 30)], printed: null, restRecorded: 1,
    scheduleBlocks: [{ start: 8 * 60, end: 16 * 60 + 30, meal: false }],
    restsOffClockConfirmed: true,
    restTimes: [{ out: 21 * 60 + 40, in: 21 * 60 + 50 }],
  });
  assert.equal(after.restsOutsideScheduledDetail[0].where, "after-day");
  assert.equal(after.restsOffClockMin, 10, "reported, and paid because she confirmed it");
  assert.equal(Number(after.paidHours.toFixed(2)), 8.67, "not 8.5");

  // AND UNCONFIRMED IT PAYS NOTHING, which is the 2026-08-12 reversal. Without
  // this the assertion above would pass whichever way the default ran.
  const { restsOffClockConfirmed: _drop, ...afterRaw } = {
    date: "07/27/26", punches: [at(8), at(16, 30)], printed: null, restRecorded: 1,
    scheduleBlocks: [{ start: 8 * 60, end: 16 * 60 + 30, meal: false }],
    restsOffClockConfirmed: true,
    restTimes: [{ out: 21 * 60 + 40, in: 21 * 60 + 50 }],
  };
  const unconfirmed = analyzeDay(afterRaw);
  assert.equal(unconfirmed.restsOffClockMin, 10, "still reported, so it is still asked about");
  assert.equal(unconfirmed.addedHours, 0, "but nothing added");
  assert.equal(Number(unconfirmed.paidHours.toFixed(2)), 8.5, "the day pays what was worked");

  // AND THE UNPAID GAP, which nothing asked about before 2026-08-11. Mánu: "if
  // they have an hour gap in their schedule with no service listed, that is an
  // unpaid gap. If there are tens in the unpaid gap, they need that question."
  const gap = analyzeDay({
    date: "07/28/26", punches: [at(8), at(12), at(14), at(16)], printed: null,
    scheduleBlocks: [
      { start: 8 * 60, end: 12 * 60, meal: false },
      { start: 14 * 60, end: 16 * 60, meal: false },
    ],
    restRecorded: 1,
    restTimes: [{ out: 13 * 60, in: 13 * 60 + 10 }],
  });
  assert.equal(gap.restsOutsideScheduled, 1, "an hour into the gap still gets asked");
  assert.equal(gap.restsOutsideScheduledDetail[0].where, "unpaid-gap");
  assert.equal(gap.restsOffClockMin, 10, "and it is paid");
});

// ------------------------- a rest logged hard against the edge of its service

// MÁNU 2026-08-09: "shift ended at 12p and break out 12:10p... engine should
// assume i meant 11:50a-12p", which removed the added hours.
//
// MÁNU 2026-08-11, having seen that all three rows it caught were his own and
// all three were real off-clock breaks: "those 10 minutes were documented
// outside of a shift in between a time with no scheduling so its time added."
//
// It is no longer a rule of its own - it is one shape of "logged outside
// scheduled hours", and the only thing that makes it special is the wording on
// the card and the fact that the service gives us somewhere to move it TO.
test("a rest against its service edge is paid once confirmed, and carries where it would move to", () => {
  const fitAfter = { where: "after", abuts: true, gapMin: 0, from: 10 * 60, to: 12 * 60 };
  const d = analyzeDay({
    date: "07/31/26",
    punches: [at(8), at(9, 30), at(10), at(12), at(13), at(16)],
    printed: null, restRecorded: 2,
    scheduleBlocks: [
      { start: 8 * 60, end: 12 * 60, meal: false },
      { start: 13 * 60, end: 16 * 60, meal: false },
    ],
    // CONFIRMED - since 2026-08-12 the minutes only go on once the employee
    // says the entry was not a mistake. Unconfirmed is asserted below.
    restsOffClockConfirmed: true,
    restTimes: [
      { out: 12 * 60, in: 12 * 60 + 10, fit: fitAfter },
      { out: 15 * 60, in: 15 * 60 + 10 },
    ],
  });
  assert.equal(d.restsOutsideScheduled, 1);
  assert.equal(d.restsOutsideScheduledMin, 10, "what correcting it would take off");
  assert.deepEqual(d.restsOutsideScheduledDetail, [
    {
      wasFrom: "12p", wasTo: "12:10p", minutes: 10, where: "service-edge",
      service: "10a-12p", from: "11:50a", to: "12p",
    },
  ]);
  assert.equal(d.restsOffClockMin, 10, "and the minutes are PAID until he says otherwise");
  assert.equal(Number(d.paidHours.toFixed(2)), 6.67, "not 6.5");
  assert.equal(d.restTaken, 2, "both still count as breaks taken");

  // HATT'S SHAPE, THE MIRROR: a break ending exactly as its service begins.
  const fitBefore = { where: "before", abuts: true, gapMin: 0, from: 16 * 60 + 30, to: 21 * 60 + 30 };
  const mirror = analyzeDay({
    date: "07/20/26", punches: [at(8), at(12)], printed: null, restRecorded: 1,
    scheduleBlocks: [{ start: 8 * 60, end: 12 * 60, meal: false }],
    restTimes: [{ out: 16 * 60 + 20, in: 16 * 60 + 30, fit: fitBefore }],
  });
  assert.equal(mirror.restsOutsideScheduledDetail[0].from, "4:30p", "moved to the START of it");
  assert.equal(mirror.restsOutsideScheduledDetail[0].to, "4:40p");

  // A ROW WITH NO SERVICE ON IT still gets the question - it is still a ten
  // logged off the clock - it just has nowhere to be moved to, so the employee
  // types the time instead of tapping a suggestion.
  const noFit = analyzeDay({
    date: "07/28/26", punches: [at(8), at(12), at(14), at(16)], printed: null,
    scheduleBlocks: [{ start: 8 * 60, end: 12 * 60, meal: false }],
    restRecorded: 1,
    restTimes: [{ out: 12 * 60, in: 12 * 60 + 10 }],
  });
  assert.equal(noFit.restsOutsideScheduled, 1);
  assert.equal(noFit.restsOutsideScheduledDetail[0].from, null, "nowhere to point at");
  assert.equal(noFit.restsOffClockMin, 10);
});

// ------------------------------------------- a meal block of only rest length

// MÁNU 2026-08-09: "she put her 10 minutes rest period for her meal break and
// at the midnight time... engine should detect she already has a meal break and
// assume that 2nd meal break of 10 minutes was actually meant to be her rest
// period break". Bucio 07/25 and five Devine days.
test("a schedule block called a meal but only rest-length is credited as a rest", () => {
  // Bucio's shape: a real 30 minute meal, plus a 10 minute "Meal Break" at
  // midnight. The ten is her rest period, mislabelled and mistimed.
  const bucio = analyzeDay({
    date: "07/25/26", punches: [at(9), at(12, 30), at(12, 45), at(16, 45)],
    printed: { daily: 7.5 }, mealScheduled: true, restRecorded: 0,
    scheduleBlocks: [
      { start: 0, end: 10, meal: true },
      { start: 9 * 60, end: 12 * 60 + 30, meal: false },
      { start: 12 * 60 + 45, end: 16 * 60 + 45, meal: false },
      { start: 12 * 60 + 45, end: 13 * 60 + 15, meal: true },
    ],
  });
  assert.equal(bucio.restsFromShortMeals, 1, "the ten minute block is a rest");
  assert.equal(bucio.restTaken, 1, "credited, though the report recorded none");
  assert.equal(bucio.restRequired, 2);
  assert.equal(bucio.restViolation, true, "1 of 2 is still a violation, so her premium stands");

  // AND THE MEAL IS OWED, WHICH REVERSED ON 2026-08-26. This line read
  // "the real 30 minute meal still satisfies the meal" and asserted false - but
  // her 12:45-1:15 meal is booked inside the 12:45-4:45 booking, so under the
  // 2026-08-09 ruling it never counted. The day only passed because the code
  // struck out any meal that overlapped work and kept the ones that did not,
  // and the one that did not was the MIDNIGHT TEN - a block this same function
  // credits as her rest period. A ten minute rest was clearing her meal.
  //
  // Overlap is measured now rather than being all or nothing, so the ten is a
  // rest and nothing else, and the only real meal on the day is buried.
  assert.equal(bucio.mealInsideBooking, true, "the 30 minute meal is inside the booking");
  assert.equal(bucio.mealViolation, true, "so no meal was provided and the day owes one");

  // DEVINE 07/29: TWO of them on one day, which is the case that actually costs
  // an hour. Counted per row it reads "still a violation" twice and the check
  // can never fail; counted per day it clears the premium.
  const devine = analyzeDay({
    date: "07/29/26", punches: [at(8), at(16)], printed: { daily: 8 },
    mealScheduled: true, restRecorded: 0,
    scheduleBlocks: [
      { start: 8 * 60, end: 16 * 60, meal: false },
      { start: 12 * 60, end: 12 * 60 + 30, meal: true },
      { start: 13 * 60, end: 13 * 60 + 10, meal: true },
      { start: 15 * 60, end: 15 * 60 + 10, meal: true },
    ],
  });
  assert.equal(devine.restsFromShortMeals, 2);
  assert.equal(devine.restTaken, 2);
  assert.equal(devine.restRequired, 2);
  assert.equal(devine.restViolation, false, "*** this is the one premium hour the ruling costs ***");

  // THE OPPOSITE: a proper 30 minute meal block credits no rest at all, or the
  // assertions above are just counting meal blocks.
  const properMeal = analyzeDay({
    date: "07/20/26", punches: [at(8), at(17)], printed: null, mealScheduled: true,
    scheduleBlocks: LUNCH_BLOCKS, restRecorded: 0,
  });
  assert.equal(properMeal.restsFromShortMeals, 0, "thirty minutes is a meal, not a rest");
  assert.equal(properMeal.restTaken, 0);
  assert.equal(properMeal.restViolation, true, "so the premium stands");
});

test("a rest inside a punched-out gap is paid for once confirmed, not deducted", () => {
  // Uribe 07/31: punched out 12:00-13:00 with the rest recorded 12:00-12:10.
  const d = analyzeDay({
    date: "07/31/26",
    punches: [at(8), at(9, 30), at(10), at(12), at(13), at(16)],
    printed: null, restRecorded: 2,
    // CONFIRMED - since 2026-08-12 the minutes only go on once the employee
    // says the entry was not a mistake. Unconfirmed is asserted below.
    restsOffClockConfirmed: true,
    restTimes: [{ out: 12 * 60, in: 12 * 60 + 10 }, { out: 15 * 60, in: 15 * 60 + 10 }],
  });
  assert.equal(d.restsUnpaid, 1);
  assert.equal(d.restsOutsideShift, 0, "it is inside the shift, just not on the clock");
  // THE 08/08 RULING, RESTORED. This asserted the payment, then asserted the
  // withholding after Mánu read his own row as a mis-tap on 08/09, and now
  // asserts the payment again: the 2026-08-11 flip made that reading an
  // assumption, and an assumption does not move a figure on its own.
  //
  // There is no service on these rows, so no assumption is even offered here -
  // this is simply the 08/08 rule, which never went away for anybody else.
  assert.equal(d.restsOutsideScheduled, 1, "off the clock, so it is asked about");
  assert.equal(d.restsOffClock, 1, "and a rest off the clock is paid time");
  assert.equal(d.restsOffClockMin, 10);
  assert.equal(d.restTaken, 2, "both still count");
  assert.equal(d.restViolation, false);
  // 6.5 hours on the clock plus the ten minutes
  assert.equal(Number(d.paidHours.toFixed(2)), 6.67);

  // THE OPPOSITE: the same rest taken while still clocked in is neither flagged
  // nor paid again.
  const onClock = analyzeDay({
    date: "07/31/26", punches: [at(8), at(16)], printed: null, restRecorded: 1,
    restTimes: [{ out: 12 * 60, in: 12 * 60 + 10 }],
  });
  assert.equal(onClock.restsUnpaid, 0);
  assert.equal(onClock.restsOffClock, 0);
  assert.equal(onClock.paidHours, 8);
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

test("a rest recorded inside the lunch counts, and the lunch minutes are paid", () => {
  // Jones 07/28: a rest recorded 12:10-12:20 inside a 12:00-12:30 rostered
  // lunch he had punched out for. It used to be struck off his count and cost
  // an hour. Now the ten minutes are paid, because the lunch is unpaid time and
  // he spent ten of it on a rest.
  const d = analyzeDay({
    date: "07/28/26", punches: LUNCH_DAY, printed: null, mealScheduled: true,
    scheduleBlocks: LUNCH_BLOCKS, restRecorded: 2,
    restTimes: [
      { out: 12 * 60 + 10, in: 12 * 60 + 20 },   // inside the 12:00-12:30 lunch
      { out: 15 * 60, in: 15 * 60 + 10 },        // a real one
    ],
  });
  assert.equal(d.restsInsideMeal, 1, "still flagged");
  assert.equal(d.restsOffClock, 1, "he was punched out for the lunch");
  assert.equal(d.restsOffClockMin, 10);
  assert.equal(d.restTaken, 2, "the report said 2 and both count");
  assert.equal(d.restRequired, 2);
  assert.equal(d.restViolation, false, "so no premium");

  // THE OPPOSITE: a day with only ONE rest recorded still owes, so the pass
  // above is the rule working and not the check having stopped discriminating.
  const short = analyzeDay({
    date: "07/28/26", punches: LUNCH_DAY, printed: null, mealScheduled: true,
    scheduleBlocks: LUNCH_BLOCKS, restRecorded: 1,
    restTimes: [{ out: 12 * 60 + 10, in: 12 * 60 + 20 }],
  });
  assert.equal(short.restTaken, 1);
  assert.equal(short.restRequired, 2);
  assert.equal(short.restViolation, true, "one of two is still a missed rest");
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

test("ten minutes added past the eighth hour are OVERTIME, not straight time", () => {
  // Mánu 2026-08-09, stating it as the rule: "if they did take their ten, and
  // they have over eight hours, then they have to get those ten minutes of
  // overtime." It falls out of paying the minutes before the overtime split
  // rather than after, and that ordering is easy to break by moving one line.
  const eightFlat = {
    payPeriod: { from: "07/16/26", to: "07/31/26" },
    days: [{
      date: "07/20/26",
      punches: [at(8), at(16)],           // exactly eight on the clock
      printed: null,
      restRecorded: 2,
      restsAlreadyPaid: true,
      restsOffClockConfirmed: true,
      // one taken while clocked in, one after clocking out
      restTimes: [
        { out: 10 * 60, in: 10 * 60 + 10 },
        { out: 16 * 60 + 30, in: 16 * 60 + 40 },
      ],
    }],
  };
  const t = analyzeTimesheet(eightFlat);
  const d = t.days[0];
  assert.equal(d.restsOffClock, 1, "only the one after clock-out was unpaid");
  assert.equal(d.restsOffClockMin, 10);
  assert.equal(Number(d.paidHours.toFixed(4)), 8.1667);
  assert.equal(Number(d.regularHours.toFixed(4)), 8, "the first eight stay straight time");
  assert.equal(Number(d.otHours.toFixed(4)), 0.1667, "the added ten minutes are overtime");

  // THE OPPOSITE: the same ten taken on the clock adds nothing and creates no
  // overtime, so this is not just asserting that eight-hour days make OT.
  const onClock = analyzeTimesheet({
    payPeriod: { from: "07/16/26", to: "07/31/26" },
    days: [{ ...eightFlat.days[0], restTimes: [
      { out: 10 * 60, in: 10 * 60 + 10 },
      { out: 14 * 60, in: 14 * 60 + 10 },
    ] }],
  });
  assert.equal(onClock.days[0].restsOffClockMin, 0);
  assert.equal(onClock.days[0].paidHours, 8);
  assert.equal(onClock.days[0].otHours, 0, "nothing added, so nothing over eight");
});

test("a rest that is both inside the lunch and outside the shift is PAID once", () => {
  // The union problem did not go away when the discount did, it moved. Two
  // flags fire on this one rest, and if the payment followed the flags instead
  // of the rest it would add its minutes twice.
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
  assert.equal(d.restsOffClock, 1, "one rest, however many flags it trips");
  assert.equal(d.restsOffClockMin, 5, "five minutes once, not ten");
  assert.equal(d.restTaken, 1, "and it counts");
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

// ------------------------------- overtime on a week cut by the period boundary

// Mon-Sun workweek. 07/16/26 is a Thursday, so the week of 07/13 is cut by a
// pay period starting 07/16 and its Mon-Wed live in the previous export.
const boundaryWeek = (days) =>
  analyzeTimesheet({
    employee: "Test, Person",
    payPeriod: { from: "07/16/26", to: "07/31/26" },
    days,
  });
const plainDay = (date, punches, printed = null) => ({ date, punches, printed });

test("a partial week takes QSP's overtime where ours cannot see the whole week", () => {
  // Hardin's shape: Thu 8, Fri 8, Sun 2.25. We see 18.25 hours and no overtime.
  // QSP printed the Sunday entirely as OT because he had already passed 40 on
  // days that live in the previous pay period.
  const t = boundaryWeek([
    plainDay("07/16/26", [at(8), at(16)], { daily: 8, regular: 8 }),
    plainDay("07/17/26", [at(8), at(16)], { daily: 8, regular: 8 }),
    plainDay("07/19/26", [at(8), at(10, 15)], { daily: 2.25, overtime: 2.25 }),
  ]);
  const sun = t.days.find((d) => d.date === "07/19/26");
  assert.equal(sun.weekPartial, true, "the week is cut by the boundary");
  assert.equal(sun.otHours, 2.25, "QSP's figure is taken");
  assert.equal(sun.regularHours, 0);
  assert.equal(sun.otFromPrinted, true, "and the day says where the number came from");
  // the day's paid hours must not move, only which bucket they sit in
  assert.equal(sun.regularHours + sun.otHours + sun.doubleHours, sun.paidHours);
});

test("it never lowers overtime, and never touches a complete week", () => {
  // ours higher than QSP's on a partial week: Solorzano 07/28 is 0.17 to 0.16.
  const t = boundaryWeek([
    plainDay("07/16/26", [at(8), at(16, 10)], { daily: 8.17, overtime: 0.16 }),
  ]);
  const d = t.days[0];
  assert.equal(d.weekPartial, true);
  assert.ok(d.otHours > 0.16, "our own figure is kept where it is higher");
  assert.notEqual(d.otFromPrinted, true);

  // a COMPLETE week is computed from the punches and QSP's column is ignored,
  // however tempting it looks. Mon 07/20 to Sun 07/26 sits inside the period.
  const full = boundaryWeek([
    plainDay("07/20/26", [at(8), at(16)], { daily: 8, overtime: 5 }),
  ]);
  assert.equal(full.days[0].weekPartial, false);
  assert.equal(full.days[0].otHours, 0, "we can prove this one, so we do not take it on trust");
});

// ------------------------------------------- what the Comments column says

test("a clean day says compliant, and a day with a finding does not", async () => {
  // Mánu 2026-08-09: a blank Comments cell reads as "nobody looked", and the
  // whole point of the column is that somebody did.
  const clean = analyzeTimesheet({
    employee: "Test, Person",
    payPeriod: { from: "07/16/26", to: "07/31/26" },
    // 4 hours: under five so no meal owed, under 3.5 bands so no rest owed
    days: [{ date: "07/20/26", punches: [at(8), at(11)], printed: null, restRecorded: 0 }],
  });
  assert.equal(clean.premiums.totalHours, 0, "nothing owed, or this proves nothing");
  const cleanWords = await pdfWords(
    (await renderCorrected(clean, { printedBy: "T", generatedOn: "8/9/2026" })).bytes);
  assert.ok(cleanWords.includes("compliant"));

  // THE OPPOSITE: a day that owes something must not also claim to be clean.
  const owing = analyzeTimesheet({
    employee: "Test, Person",
    payPeriod: { from: "07/16/26", to: "07/31/26" },
    days: [{ date: "07/20/26", punches: [at(8), at(16, 30)], printed: null, restRecorded: 0 }],
  });
  assert.ok(owing.premiums.totalHours > 0);
  const owingWords = await pdfWords(
    (await renderCorrected(owing, { printedBy: "T", generatedOn: "8/9/2026" })).bytes);
  assert.ok(!owingWords.includes("compliant"), "a day with a finding is not compliant");
});
