// WHO SETTLED THE MISC TIME DECIDES WHETHER IT IS STILL ASKED.
//
// Mánu 2026-08-16, in three sentences that are three tests:
//   answered on the admin side  -> settled, never asked on theirs
//   not answered on the admin side -> not settled, so ask them
//   answered by THEM -> the answer stands, and the question stays so they can
//   change it
//
// The bug this pins: both routes write the same `miscKind` onto the day, and
// the guard tested that field. So an employee choosing PTO deleted their own
// question, and "Change this" lives on the card - which made the answer
// unchangeable the moment it was given.
//
// Every case runs the real `buildQuestions`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuestions } from "../questions.js";

const DATE = "07/31/26";
const day = (over = {}) => ({
  date: DATE, paidHours: 6.5, rawHours: 6.5, regularHours: 6.5, otHours: 0,
  doubleHours: 0, addedHours: 0, punches: [], breaks: [],
  restTaken: 0, restRequired: 0, mealViolation: false, mealLate: false,
  restViolation: false,
  // 1p-4p Misc, the block off Mánu's own 07/31 sheet
  miscBlocks: [{ from: "1p", to: "4p", min: 180 }],
  miscMin: 180,
  ...over,
});

const asks = (d, opts) =>
  buildQuestions({ days: [d] }, { restRows: [], sourceName: "Uribe, Mánu", ...opts })
    .filter((q) => q.kind === "miscTime");

test("nobody has said what it was, so they are asked", () => {
  assert.equal(asks(day(), { reviewerSettled: new Set() }).length, 1);
});

test("a reviewer classified it, so they are never asked", () => {
  const settled = asks(day({ miscKind: "pto" }), { reviewerSettled: new Set([DATE]) });
  assert.equal(settled.length, 0);
});

test("THEY answered it, so the question stays and can be changed", () => {
  // the same day, the same miscKind - the only difference is that no reviewer
  // override claims it. This is the case that used to vanish.
  const still = asks(day({ miscKind: "pto" }), { reviewerSettled: new Set() });
  assert.equal(still.length, 1, "their own answer deleted the question");
  assert.equal(still[0].date, DATE);
});

test("every settled kind behaves the same way, not just pto", () => {
  for (const k of ["pto", "sick"]) {
    assert.equal(asks(day({ miscKind: k }), { reviewerSettled: new Set() }).length, 1, `${k} vanished`);
    assert.equal(asks(day({ miscKind: k }), { reviewerSettled: new Set([DATE]) }).length, 0, `${k} was asked anyway`);
  }
  // "hours worked" sets miscWorked rather than miscKind, and is the one answer
  // that moves a figure - it must follow the same rule
  assert.equal(asks(day({ miscWorked: true }), { reviewerSettled: new Set() }).length, 1);
  assert.equal(asks(day({ miscWorked: true }), { reviewerSettled: new Set([DATE]) }).length, 0);
});

test("a caller that cannot say who settled it gets the old behaviour", () => {
  // the admin screens and the premium split call this without overrides in
  // hand. They must not start counting an answered day as outstanding.
  assert.equal(asks(day({ miscKind: "pto" }), {}).length, 0);
  assert.equal(asks(day({ miscKind: "pto" }), { reviewerSettled: undefined }).length, 0);
  // and a day nobody has settled is still asked about either way
  assert.equal(asks(day(), {}).length, 1);
});

test("a day with no misc block asks nothing, whoever settled what", () => {
  assert.equal(asks(day({ miscBlocks: [], miscMin: 0 }), { reviewerSettled: new Set() }).length, 0);
});
