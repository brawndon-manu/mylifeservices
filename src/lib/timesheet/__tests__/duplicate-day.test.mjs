import test from "node:test";
import assert from "node:assert/strict";
import {
  buildQuestions, duplicateSegments, singleCountHours, patchesFor, isMandatory,
} from "../questions.js";
import { employeeResolution } from "../corrections.js";
import { qspChanges, reviewChoices } from "../qsp-changes.js";
import { tagsForPerson } from "../person-tags.js";

// Matias 08/28 as stored: the export printed her 8:30a-3p shift twice on one
// page, QSP's own daily column said 13.00, and every downstream count doubled
// with it. Each test pairs the doubled day with its honest twin so a rule that
// stops discriminating fails instead of quietly passing.

const seg = (fromMin, fromRaw, toMin, toRaw) => ({
  start: { min: fromMin, raw: fromRaw },
  end: { min: toMin, raw: toRaw },
  min: toMin - fromMin,
});

const doubledDay = (over = {}) => ({
  date: "08/28/26",
  paidHours: 13,
  segments: [seg(510, "8:30a", 900, "3p"), seg(510, "8:30a", 900, "3p")],
  ...over,
});

const honestDay = () => ({
  date: "08/27/26",
  paidHours: 6.5,
  segments: [seg(510, "8:30a", 900, "3p")],
});

const dataWith = (days) => ({ days });
const build = (days) =>
  buildQuestions(dataWith(days), { restRows: [], sourceName: "Matias, Elizabeth" });

test("an exactly repeated segment is a duplicate; distinct ones are not", () => {
  assert.equal(duplicateSegments(doubledDay()).length, 1);
  assert.equal(duplicateSegments(honestDay()).length, 0);
  // two different windows back to back are ordinary consecutive bookings
  assert.equal(
    duplicateSegments({ segments: [seg(510, "8:30a", 690, "11:30a"), seg(690, "11:30a", 900, "3p")] }).length,
    0,
  );
});

test("single-count hours count each repeated window once", () => {
  assert.equal(singleCountHours(doubledDay()), 6.5);
  assert.equal(singleCountHours(honestDay()), 6.5);
});

test("the doubled day is asked about, the honest day is not", () => {
  const qs = build([doubledDay(), honestDay()]);
  const dup = qs.filter((q) => q.kind === "duplicateDay");
  assert.equal(dup.length, 1);
  assert.equal(dup[0].date, "08/28/26");
  assert.deepEqual(dup[0].row, {
    from: "8:30a", to: "3p", copies: 2, hours: 13, single: 6.5,
  });
  // it blocks sheet generation the way every unanswered question does, and it
  // is mandatory - a kind not named optional defaults there on purpose
  assert.equal(dup[0].mandatory, true);
  assert.equal(isMandatory("duplicateDay"), true);
});

test("a day whose doubled figure is already off stops being asked", () => {
  // the accepted hours claim patched the day to the single-shift figure; the
  // sheet no longer carries the fault the card would point at
  const qs = build([doubledDay({ paidHours: 6.5 })]);
  assert.equal(qs.filter((q) => q.kind === "duplicateDay").length, 0);
});

test("neither answer moves a figure", () => {
  assert.deepEqual(patchesFor({ kind: "duplicateDay" }, "yes", doubledDay()), {});
  assert.deepEqual(patchesFor({ kind: "duplicateDay" }, "no", doubledDay()), {});
});

test("the receipt states their answer both ways", () => {
  assert.equal(
    employeeResolution({ kind: "q_duplicateDay", status: "accepted", choice: "yes" }),
    "You said you worked both of the listed shifts.",
  );
  assert.equal(
    employeeResolution({ kind: "q_duplicateDay", status: "declined", choice: "no" }),
    "You said the shift is entered twice and you worked it once.",
  );
});

test("worked-once grows the office's edit line; worked-twice does not", () => {
  const noRow = {
    kind: "q_duplicateDay", date: "08/28/26", status: "declined", choice: "no",
    question: { row: { from: "8:30a", to: "3p" } },
  };
  const yesRow = { ...noRow, status: "accepted", choice: "yes" };
  const edits = qspChanges([noRow]);
  assert.equal(edits.length, 1);
  assert.equal(
    edits[0].text,
    "The 8:30a to 3p shift is entered twice and was worked once. Remove the duplicate entry.",
  );
  assert.equal(qspChanges([yesRow]).length, 0);
  // and the choices list carries the receipt with the edit under it
  const choices = reviewChoices([noRow]);
  assert.equal(choices.length, 1);
  assert.equal(choices[0].said, "You said the shift is entered twice and you worked it once.");
  assert.equal(choices[0].changes.length, 1);
});

test("the admin chip shows the day whatever the answer, in the office tone", () => {
  const tags = tagsForPerson({ data: dataWith([doubledDay(), honestDay()]) });
  const chip = tags.find((t) => t.key === "duplicate-shift");
  assert.ok(chip, "chip present");
  assert.equal(chip.n, 1);
  assert.equal(chip.tone, "scheduling");
  const clean = tagsForPerson({ data: dataWith([honestDay()]) });
  assert.equal(clean.find((t) => t.key === "duplicate-shift"), undefined);
});
