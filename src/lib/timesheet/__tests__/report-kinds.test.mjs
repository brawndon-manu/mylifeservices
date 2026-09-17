// WHAT "REPORT A PROBLEM" OFFERS, AND WHAT IT DELIBERATELY DOES NOT.
//
// Three options left this menu because they carried the identical gate as the
// question card that already asks the same thing, so they could only ever appear
// on a day where that card was on screen too. What stays fires on a day whose
// punches look FINE, which no card asks about.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { kindsForDay, ASKED_BY_A_QUESTION_CARD } from "../report-kinds.js";

// the real shapes, off the live 09/01-09/15 period
const ordinary = { paidHours: 8, mealCount: 1, mealViolation: false, mealLate: false, restCount: 0, restRequired: 2, restViolation: false, restAttested: false };
// Ocana 09/03: no meal punched, meal owed, one of two tens recorded, rest owed
const ocana0903 = { paidHours: 7, mealCount: 0, mealViolation: true, mealLate: false, restCount: 1, restRequired: 2, restViolation: true, restAttested: false };
// Hardin 09/01: meal punched but late, rests attested
const hardin0901 = { paidHours: 8.17, mealCount: 1, mealViolation: true, mealLate: true, restCount: 0, restRequired: 2, restViolation: false, restAttested: true };

test("the three the question cards already ask are gone", () => {
  for (const day of [ordinary, ocana0903, hardin0901]) {
    const offered = kindsForDay(day);
    for (const k of ASKED_BY_A_QUESTION_CARD) {
      assert.ok(!offered.includes(k), `${k} must not be offered: ${offered.join(",")}`);
    }
  }
  assert.deepEqual(ASKED_BY_A_QUESTION_CARD, ["meal_taken", "meal_ontime", "rest_taken"]);
});

test("the day whose punches look fine keeps its two, because nothing else asks", () => {
  // a recorded lunch they worked through
  assert.ok(kindsForDay(ordinary).includes("meal_missed"));
  // recorded tens they did not get
  assert.ok(kindsForDay(ocana0903).includes("rest_missed"));
  // nothing recorded, nothing to contradict
  const noMeal = { ...ordinary, mealCount: 0 };
  assert.ok(!kindsForDay(noMeal).includes("meal_missed"));
  assert.ok(!kindsForDay(ordinary).includes("rest_missed"), "no tens recorded, nothing to deny");
});

test("an attested day is not asked about its tens", () => {
  const attested = { ...ocana0903, restAttested: true };
  assert.ok(!kindsForDay(attested).includes("rest_missed"));
  // and the flag is read as EXACTLY true, so an old day carrying neither
  // behaves as it did
  const unknown = { ...ocana0903, restAttested: undefined };
  assert.ok(kindsForDay(unknown).includes("rest_missed"));
});

test("hours, an extra day and something else are always there", () => {
  for (const day of [ordinary, ocana0903, hardin0901]) {
    const o = kindsForDay(day);
    assert.ok(o.includes("hours") && o.includes("day_extra") && o.includes("other"));
  }
  // no day at all: the sheet-scoped kind only
  assert.deepEqual(kindsForDay(null), ["other"]);
  assert.deepEqual(kindsForDay(undefined), ["other"]);
});

test("the ordinary day is unchanged by any of this", () => {
  // 828 of the 877 day cards on the live period looked like one of these two,
  // and neither ever offered a removed kind
  assert.deepEqual(kindsForDay(ordinary), ["hours", "meal_missed", "day_extra", "other"]);
  assert.deepEqual(
    kindsForDay({ ...ordinary, mealCount: 0 }),
    ["hours", "day_extra", "other"],
  );
});

test("the card reads this rule and holds no copy of its own", () => {
  const card = fs.readFileSync(
    path.join(process.cwd(), "src/app/t/[token]/ReportProblem.js"),
    "utf8",
  );
  assert.match(card, /import \{ kindsForDay \} from "@\/lib\/timesheet\/report-kinds"/);
  assert.doesNotMatch(card, /function kindsForDay/, "a second copy is how the two drift");
  // and the card must not reintroduce them by name
  const code = card.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  for (const k of ASKED_BY_A_QUESTION_CARD) {
    assert.ok(!code.includes(`"${k}"`), `${k} should not be named in the card any more`);
  }
});

test("the labels survive, so the rows already filed still read", () => {
  // removing an option from the MENU must not remove it from the record
  const corrections = fs.readFileSync(
    path.join(process.cwd(), "src/lib/timesheet/corrections.js"),
    "utf8",
  );
  for (const k of ASKED_BY_A_QUESTION_CARD) {
    assert.match(corrections, new RegExp(`\\b${k}:\\s*\\{`), `${k} must keep its label`);
  }
});
