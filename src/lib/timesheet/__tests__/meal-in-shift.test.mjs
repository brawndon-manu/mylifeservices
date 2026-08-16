// A MEAL THE ROSTER BOOKED INSIDE A BLOCK SOMEBODY WAS ALREADY WORKING.
//
// ONE SCENARIO, ONE TEST, THROUGH THE REAL FUNCTIONS. Every case below is a day
// that actually exists on a batch, and each is put through the same code the
// page runs: `mealBookedInside` to classify it, `buildQuestions` to see which
// question it raises, `patchesFor` to see what the answer does to the day,
// `dayViolations` for what the reviewer is told, and `reasonOwedOn` for whether
// a why is required. Nothing here reads source as text.
//
// That distinction is the whole point of the file. Three bugs on 2026-08-15 got
// past a full suite of text-scanning tests and were caught only by loading the
// page: a `const` used before its declaration, twice, and a value read from the
// wrong scope. A test that greps for a string cannot tell whether the thing
// runs.
//
// THE FIXTURES ARE REAL ROWS with the client names taken out. `serviceOf` reads
// everything after the last hyphen, so "9a-1p Client-ILS Service(4:00)" parses
// exactly as the original did and no name goes into a public repo.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mealBookedInside, buildQuestions, patchesFor,
} from "../questions.js";
import { dayViolations, VIOLATION_KINDS } from "../violations.js";
import { reasonOwedOn, reasonSlotFor } from "../break-answers.js";

const FIXTURES = {
  "clocked": {
    "who": "Cain, Ashley",
    "entry": {
      "shifts": [
        {
          "text": "9a-1p Client-ILS Service(4:00)",
          "meal": false
        },
        {
          "text": "1p-1:15p -ILS Travel(0:15)",
          "meal": false
        },
        {
          "text": "1p-1:30p -Meal Break(0:30)",
          "meal": true
        },
        {
          "text": "1:15p-3:15p Client-ILS Service(2:00)",
          "meal": false
        },
        {
          "text": "3:15p-3:30p -ILS Travel(0:15)",
          "meal": false
        },
        {
          "text": "3:30p-5p Client-ILS Service (1:30)",
          "meal": false
        }
      ]
    },
    "day": {
      "date": "08/03/26",
      "paidHours": 8,
      "mealViolation": true,
      "mealLate": false,
      "restViolation": false,
      "restRequired": 2,
      "restTaken": 2,
      "punches": [
        {
          "min": 540,
          "raw": "9a"
        },
        {
          "min": 780,
          "raw": "1p"
        },
        {
          "min": 780,
          "raw": "1p"
        },
        {
          "min": 795,
          "raw": "1:15p"
        },
        {
          "min": 795,
          "raw": "1:15p"
        },
        {
          "min": 915,
          "raw": "3:15p"
        },
        {
          "min": 915,
          "raw": "3:15p"
        },
        {
          "min": 930,
          "raw": "3:30p"
        },
        {
          "min": 930,
          "raw": "3:30p"
        },
        {
          "min": 1020,
          "raw": "5p"
        }
      ]
    }
  },
  "movable": {
    "who": "Garcia, Stephanie",
    "entry": {
      "shifts": [
        {
          "text": "8a-1p -ILS Admin(5:00)",
          "meal": false
        },
        {
          "text": "12p-12:30p -Meal Break(0:30)",
          "meal": true
        },
        {
          "text": "1p-2:20p Client-ILS Service (1:20)",
          "meal": false
        },
        {
          "text": "2:20p-4p Client-ILS Service(1:40)",
          "meal": false
        }
      ]
    },
    "day": {
      "date": "08/13/26",
      "paidHours": 8,
      "mealViolation": true,
      "mealLate": false,
      "restViolation": true,
      "restRequired": 2,
      "restTaken": 1,
      "punches": [
        {
          "min": 480,
          "raw": "8a"
        },
        {
          "min": 780,
          "raw": "1p"
        },
        {
          "min": 780,
          "raw": "1p"
        },
        {
          "min": 860,
          "raw": "2:20p"
        },
        {
          "min": 860,
          "raw": "2:20p"
        },
        {
          "min": 960,
          "raw": "4p"
        }
      ]
    }
  },
  "quiet": {
    "who": "Cain, Ashley",
    "entry": {
      "shifts": [
        {
          "text": "9a-12p Client-ILS Service (3:00)",
          "meal": false
        },
        {
          "text": "12p-12:15p -ILS Travel(0:15)",
          "meal": false
        },
        {
          "text": "12p-12:30p -Meal Break(0:30)",
          "meal": true
        },
        {
          "text": "1:30p-6p Client-ILS Service (4:30)",
          "meal": false
        }
      ]
    },
    "day": {
      "date": "08/06/26",
      "paidHours": 7.75,
      "mealViolation": false,
      "mealLate": false,
      "restViolation": false,
      "restRequired": 1,
      "restTaken": 2,
      "punches": [
        {
          "min": 540,
          "raw": "9a"
        },
        {
          "min": 720,
          "raw": "12p"
        },
        {
          "min": 720,
          "raw": "12p"
        },
        {
          "min": 735,
          "raw": "12:15p"
        },
        {
          "min": 810,
          "raw": "1:30p"
        },
        {
          "min": 1080,
          "raw": "6p"
        }
      ]
    }
  },
  "tenminute": {
    "who": "Devine, Jennifer",
    "entry": {
      "shifts": [
        {
          "text": "8a-11:30a Client-ILS Service (3:30)",
          "meal": false
        },
        {
          "text": "11:30a-12p -ILS Travel(0:30)",
          "meal": false
        },
        {
          "text": "12p-12:10p -Meal Break(0:10)",
          "meal": true
        },
        {
          "text": "12p-4p Client-ILS Service (4:00)",
          "meal": false
        }
      ]
    },
    "day": {
      "date": "07/21/26",
      "paidHours": 8,
      "mealViolation": true,
      "mealLate": false,
      "restViolation": true,
      "restRequired": 2,
      "restTaken": 1,
      "punches": [
        {
          "min": 480,
          "raw": "8a"
        },
        {
          "min": 690,
          "raw": "11:30a"
        },
        {
          "min": 690,
          "raw": "11:30a"
        },
        {
          "min": 720,
          "raw": "12p"
        },
        {
          "min": 720,
          "raw": "12p"
        },
        {
          "min": 960,
          "raw": "4p"
        }
      ]
    }
  }
};

const sheetOf = (f) => ({
  days: [f.day],
  scheduleCheck: { byDate: { [f.day.date]: f.entry } },
});
const kindsOn = (f) => buildQuestions(sheetOf(f), { restRows: [], sourceName: f.who })
  .filter((q) => q.date === f.day.date)
  .map((q) => q.kind);
const questionOn = (f, kind) => buildQuestions(sheetOf(f), { restRows: [], sourceName: f.who })
  .find((q) => q.kind === kind);


// ---------------------------------------------------------------- CLOCKED
// Cain 08/03. Booked 1p-1:30p, landing across ILS Travel 1p-1:15p AND the
// 1:15p-3:15p ILS Service after it. Punches run 9a to 5p unbroken.
test("a meal booked across a clocked shift is classified as clocked", () => {
  const hit = mealBookedInside(FIXTURES.clocked.entry);
  assert.ok(hit, "not classified at all");
  assert.equal(hit.kind, "clocked");
  // THE SERVICE OVERLAP WINS where a meal spans both kinds. The travel half is
  // real and is deliberately ignored: the shift is what makes it impossible.
  assert.equal(hit.service, "ILS Service");
  assert.equal(hit.mealFrom, 13 * 60);
  assert.equal(hit.mealTo, 13 * 60 + 30);
  assert.equal(hit.blockFrom, 13 * 60 + 15);
});

test("it replaces the meal question rather than adding a second one", () => {
  const kinds = kindsOn(FIXTURES.clocked);
  assert.ok(kinds.includes("mealInShift"), `got ${kinds.join(", ")}`);
  assert.ok(!kinds.includes("nothingDocumentedMeal"), "asked twice about the same meal");
});

test("its answer leaves the premium where it is", () => {
  const q = questionOn(FIXTURES.clocked, "mealInShift");
  // one answer, and it agrees with the day: the meal could not have happened
  assert.deepEqual(patchesFor(q, "no", FIXTURES.clocked.day), { mealViolation: null });
});

test("it owes a reason, like every other missed meal", () => {
  assert.equal(reasonOwedOn("mealInShift", "no"), true);
  assert.equal(reasonSlotFor("mealInShift"), "meal");
});

test("the reviewer is told to fix the schedule, not to chase a punch", () => {
  const f = FIXTURES.clocked;
  const v = dayViolations(f.day, f.entry).find((x) => x.kind === "meal-in-shift");
  assert.ok(v, "no finding raised");
  assert.equal(v.detail, "1p-1:30p, inside ILS Service");
  assert.match(VIOLATION_KINDS["meal-in-shift"].ask, /moved outside the shift/);
  assert.doesNotMatch(VIOLATION_KINDS["meal-in-shift"].ask, /needs punching/);
});


// ---------------------------------------------------------------- MOVABLE
// Garcia 08/13. Booked 12p-12:30p inside ILS Admin 8a-1p and nothing else.
test("a meal booked inside unpunched time is classified as movable", () => {
  const hit = mealBookedInside(FIXTURES.movable.entry);
  assert.ok(hit);
  assert.equal(hit.kind, "movable");
  assert.equal(hit.service, "ILS Admin");
});

test("it asks for the meal time and what the block becomes, on the yes only", () => {
  const q = questionOn(FIXTURES.movable, "mealMovable");
  assert.ok(q, "no movable question raised");
  assert.equal(q.wantsBlock, true);
  assert.equal(q.needsOn, "yes");
  assert.equal(q.needs.length, 1);
  assert.equal(q.needs[0].kindOf, "meal");
});

test("saying the block can move takes the premium off, saying it cannot leaves it", () => {
  const q = questionOn(FIXTURES.movable, "mealMovable");
  assert.deepEqual(patchesFor(q, "yes", FIXTURES.movable.day), { mealViolation: false });
  assert.deepEqual(patchesFor(q, "no", FIXTURES.movable.day), { mealViolation: null });
});

test("only the branch where the meal did not happen owes a reason", () => {
  assert.equal(reasonOwedOn("mealMovable", "no"), true);
  assert.equal(reasonOwedOn("mealMovable", "yes"), false);
});


// ---------------------------------------------------------------- QUIET
// Cain 08/06. The roster overlaps ILS Travel, but she clocked out 12:15p to
// 1:30p and took a lunch, so the day owes nothing. 281 live days are this.
test("an overlap on a day that owes no meal raises nothing", () => {
  const f = FIXTURES.quiet;
  assert.equal(f.day.mealViolation, false, "fixture is not the quiet case");
  const kinds = kindsOn(f);
  assert.ok(!kinds.includes("mealInShift"), `got ${kinds.join(", ")}`);
  assert.ok(!kinds.includes("mealMovable"), `got ${kinds.join(", ")}`);
  assert.equal(dayViolations(f.day, f.entry).filter((x) => /meal/.test(x.kind)).length, 0);
});

test("travel alone is neither case, for this period", () => {
  // deliberately unhandled until the rule for it is decided - 2 live days, 4 in
  // July. If travel ever becomes movable this test is what should fail first.
  const hit = mealBookedInside(FIXTURES.quiet.entry);
  assert.equal(hit, null, "travel is being classified before anybody decided what it is");
});


// ---------------------------------------------------------------- TEN MINUTES
// Devine 07/21. The roster books ten minutes as a "Meal Break". It is a rest by
// any measure, and it is still what the schedule calls it.
test("a ten minute booking is treated as the meal the roster calls it", () => {
  const hit = mealBookedInside(FIXTURES.tenminute.entry);
  assert.ok(hit, "not classified");
  assert.equal(hit.kind, "clocked");
  assert.equal(hit.mealTo - hit.mealFrom, 10);
});

test("and it raises the same question, at its real length", () => {
  const q = questionOn(FIXTURES.tenminute, "mealInShift");
  assert.ok(q);
  assert.equal(q.row.mealFrom, "12p");
  assert.equal(q.row.mealTo, "12:10p");
});


// ---------------------------------------------------------------- THE GUARD
test("every scenario in this file is covered by a test above", () => {
  // a fixture nobody asserts on is a scenario nobody is checking
  const covered = new Set(["clocked", "movable", "quiet", "tenminute"]);
  for (const k of Object.keys(FIXTURES)) {
    assert.ok(covered.has(k), `fixture "${k}" has no test`);
  }
  assert.equal(covered.size, Object.keys(FIXTURES).length);
});
