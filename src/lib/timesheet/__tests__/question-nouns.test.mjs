// EVERY QUESTION HAS WORDS FOR ITSELF.
//
// The note saved beside an answer is built at answer time and STORED, so a kind
// with no noun does not render badly - it writes the word "undefined" into an
// audit row and leaves it there. That happened: one row on the July batch reads
// "Asked about the 07/31/26 undefined." for good, because `miscTime` was never
// added to the map.
//
// The kinds below come from the real `buildQuestions` wherever it can be
// provoked into emitting them, so this cannot drift from what the engine does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuestions } from "../questions.js";
import { QUESTION_NOUN, questionNoun, questionHeading } from "../question-nouns.js";

const day = (over = {}) => ({
  date: "07/20/26", paidHours: 8, rawHours: 8, regularHours: 8, otHours: 0,
  doubleHours: 0, addedHours: 0, punches: [], breaks: [],
  restTaken: 0, restRequired: 2, mealViolation: false, mealLate: false,
  restViolation: false, ...over,
});

// what the engine actually emits, gathered by running it
function emittedKinds() {
  const kinds = new Set();
  const add = (days, opts = {}) => {
    for (const q of buildQuestions({ days, ...(opts.data || {}) }, {
      restRows: opts.restRows || [], sourceName: "Newperson, Someone",
    })) kinds.add(q.kind);
  };
  add([day({ mealViolation: true })]);
  add([day({ restViolation: true })]);
  add([day({ mealViolation: true, mealLate: true })]);
  // a Misc block nobody has classified - the kind that was missing its noun
  add([day({ miscBlocks: [{ from: "1p", to: "4p", minutes: 180 }], miscMinutes: 180 })]);
  return kinds;
}

test("every kind the engine emits has a noun", () => {
  const missing = [...emittedKinds()].filter((k) => !QUESTION_NOUN[k]);
  assert.deepEqual(missing, [], `these would write "undefined" into an audit row: ${missing.join(", ")}`);
});

test("miscTime specifically, because this is the one that got out", () => {
  assert.equal(questionNoun("miscTime"), "time rostered as Misc, with nothing saying what it was");
  assert.match(`Asked about the 07/31/26 ${questionNoun("miscTime")}.`, /^Asked about the 07\/31\/26 time rostered as Misc/);
});

test("a kind with no noun reads as the kind, never as undefined", () => {
  // the fallback matters more than it looks: the next gap should leave
  // something a person can search for, not the word undefined
  assert.equal(questionNoun("somethingNew"), "somethingNew");
  assert.equal(`Asked about the 01/01/26 ${questionNoun("somethingNew")}.`.includes("undefined"), false);
  assert.equal(questionNoun(undefined), "");
});

test("the heading is the noun as a sentence", () => {
  assert.equal(questionHeading("restOutsideScheduled"), "Ten logged outside scheduled working hours");
  assert.equal(questionHeading("miscTime"), "Time rostered as Misc, with nothing saying what it was");
});

test("the kinds the fixtures above cannot reach still have nouns", () => {
  // mealInShift and mealMovable need a rostered meal and punch shapes the day
  // helper here does not build, and repair needs a rest row to correct. Listed
  // by name rather than skipped, so removing a noun still fails something.
  for (const k of ["repair", "mealInShift", "mealMovable", "restNoTimes", "restIsMealLength", "shortMealRest", "restTooLongOffClock"]) {
    assert.ok(QUESTION_NOUN[k], `${k} has no noun`);
  }
});
