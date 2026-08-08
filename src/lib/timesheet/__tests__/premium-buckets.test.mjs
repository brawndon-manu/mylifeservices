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
  assert.equal(d.mealGapKind, "scheduled-transition", "the two WORK blocks still bracket it");
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
