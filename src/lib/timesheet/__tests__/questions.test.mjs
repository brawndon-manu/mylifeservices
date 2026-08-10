// The five questions an employee must answer before signing, and what each
// answer does to the figures. Mánu 2026-08-09.
//
// The point of this file is the SHAPE of each question, and above all which way
// the money moves. Two of the five arrive with the correction already applied,
// so for those it is DECLINING that changes a number, and getting that backwards
// would quietly hand somebody less than they are owed.
import test from "node:test";
import assert from "node:assert/strict";
import { buildQuestions, patchesFor } from "../questions.js";

const day = (over = {}) => ({
  date: "07/20/26", paidHours: 8.17, restTaken: 2, restRequired: 2,
  restViolation: false, mealViolation: false, punches: ["8a", "5p"], ...over,
});

// ---------------------------------------------------------------- April's shape

test("rests recorded outside the rostered day become ONE question, not eleven", () => {
  const days = ["07/16/26", "07/17/26", "07/20/26"].map((date) =>
    day({ date, restsMisclicked: 1, restsMisclickedMin: 10 }));
  const qs = buildQuestions({ days }, { restRows: [], sourceName: "Martinez, April" });

  const outside = qs.filter((q) => q.kind === "restOutsideShift");
  assert.equal(outside.length, 1, "one card, or eleven identical ones on the real batch");
  assert.deepEqual(outside[0].dates, ["07/16/26", "07/17/26", "07/20/26"]);
  assert.equal(outside[0].row.minutes, 30);
  assert.equal(outside[0].moves, 0, "confirming our correction changes nothing");
  assert.equal(outside[0].movesOnDecline, 0.5, "declining puts the minutes back");
});

test("confirming leaves April alone; declining pays the minutes back", () => {
  const d = day({ restsMisclicked: 1, restsMisclickedMin: 10 });
  const q = { kind: "restOutsideShift" };

  assert.deepEqual(patchesFor(q, "yes", d), { paidHours: null }, "nothing to patch");
  // 8.17 was the figure BEFORE the engine withheld the minutes; the stored day
  // now reads 8.00, so declining has to land back on 8.17 rather than on 8.00.
  const back = patchesFor(q, "no", day({ paidHours: 8, restsMisclickedMin: 10 }));
  assert.equal(back.paidHours, 8.17, "and the overtime that comes with it");
});

// -------------------------------------------------------------- Bucio / Devine

test("a credited short meal block is one question, and declining restores the premium", () => {
  const days = [
    day({ date: "07/29/26", restsFromShortMeals: 2, restTaken: 2, restRequired: 2, restViolation: false }),
  ];
  const qs = buildQuestions({ days }, { restRows: [], sourceName: "Devine, Jennifer" });
  const short = qs.find((q) => q.kind === "shortMealRest");
  assert.ok(short, "asked");
  assert.equal(short.movesOnDecline, 1, "Devine 07/29 is the one hour this ruling costs");

  const declined = patchesFor({ kind: "shortMealRest" }, "no", days[0]);
  assert.equal(declined.restTaken, 0, "both credits come off");
  assert.equal(declined.restViolation, true, "so the premium goes back on");

  // THE OPPOSITE: Bucio, where the credit never cleared anything, so declining
  // moves no money. Without this the assertion above is just measuring that a
  // patch exists.
  const bucio = day({ restsFromShortMeals: 1, restTaken: 1, restRequired: 2, restViolation: true });
  const bq = buildQuestions({ days: [bucio] }, { restRows: [], sourceName: "Bucio, Mary" });
  assert.equal(bq.find((q) => q.kind === "shortMealRest").movesOnDecline, 0, "no premium to restore");
});

// ------------------------------------------------------------------- Hernadez

test("two thirty minute entries are two questions, so each hour is answered on its own", () => {
  const restRows = ["07/25/26", "07/26/26"].map((date) => ({
    name: "Hernadez, Joseph", date, out: "2:00 PM", in: "2:30 PM",
    minutes: 30, counted: false,
  }));
  const days = ["07/25/26", "07/26/26"].map((date) => day({ date, mealViolation: true }));
  const qs = buildQuestions({ days }, { restRows, sourceName: "Hernadez, Joseph" });

  const meals = qs.filter((q) => q.kind === "restIsMealLength");
  assert.equal(meals.length, 2, "grouped into one card by the component, answered per day");
  assert.equal(meals[0].group, "restIsMealLength");
  assert.equal(meals[0].moves, -1);
  assert.notEqual(meals[0].id, meals[1].id, "or one answer would resolve both days");

  assert.deepEqual(patchesFor(meals[0], "yes", days[0]), { mealViolation: false });
  assert.deepEqual(patchesFor(meals[0], "no", days[0]), { mealViolation: null });
});

// --------------------------------------------------------------------- Flores

test("a rest with no times is asked only while the day still owes a premium", () => {
  const restRows = [{ name: "Flores, Esmeralda", date: "07/29/26", out: "", in: "", minutes: 0 }];
  const owing = day({ date: "07/29/26", restTaken: 0, restRequired: 1, restViolation: true, paidHours: 5.02 });
  const qs = buildQuestions({ days: [owing] }, { restRows, sourceName: "Flores, Esmeralda" });
  const noTimes = qs.find((q) => q.kind === "restNoTimes");
  assert.ok(noTimes, "asked");
  assert.equal(noTimes.canGiveTime, true, "she can tell us when instead");
  assert.deepEqual(patchesFor(noTimes, "yes", owing), { restViolation: false });

  // once the premium is gone there is nothing to ask about, or the question
  // would keep appearing after it had been answered
  const settled = day({ date: "07/29/26", restTaken: 1, restRequired: 1, restViolation: false });
  const after = buildQuestions({ days: [settled] }, { restRows, sourceName: "Flores, Esmeralda" });
  assert.equal(after.find((q) => q.kind === "restNoTimes"), undefined);
});

// ---------------------------------------------------------------- other people

test("a question only ever belongs to the person whose sheet it is", () => {
  const restRows = [{ name: "Hernadez, Joseph", date: "07/25/26", out: "2:00 PM", in: "2:30 PM", minutes: 30, counted: false }];
  const qs = buildQuestions(
    { days: [day({ date: "07/25/26" })] },
    { restRows, sourceName: "Bucio, Mary" },
  );
  assert.equal(qs.length, 0, "Bucio is never asked about Hernadez's break");
});

test("ids are stable across a rebuild, so an answer still matches its question", () => {
  const days = [day({ restsMisclicked: 1, restsMisclickedMin: 10 })];
  const a = buildQuestions({ days }, { restRows: [], sourceName: "X" });
  const b = buildQuestions({ days: [{ ...days[0], paidHours: 8 }] }, { restRows: [], sourceName: "X" });
  assert.equal(a[0].id, b[0].id, "the sheet is rebuilt on every answer");
});
