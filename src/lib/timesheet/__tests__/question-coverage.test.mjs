// EVERY QUESTION KIND HAS TO BE FULLY DRESSED BEFORE IT SHIPS.
//
// Mánu 2026-08-10, on the test batch: "let's make sure every discrepancy we have
// listed so far is stuff that can be repeated ... if it appears again in the one
// I will eventually upload, the same results should appear."
//
// The failure this exists to stop already happened once, earlier the same day.
// Splitting the breaks question produced two new kinds, and `copyFor` in
// TimesheetQuestion.js still only knew the old one. Its switch fell through to
// `default: return null`, so the card rendered NOTHING - on a page that still
// said "answer all 17 questions above". The build passed. Every test passed.
// Only opening the page showed it.
//
// So: a kind that `buildQuestions` can emit must also have copy for the
// employee, a noun for the audit note, a resolution sentence for payroll, and a
// place in the premium answer table. Adding a kind without one of those should
// break the suite rather than a person's timesheet.
//
// The component is a client module full of JSX and cannot be imported here, so
// its switch labels are read out of the source. That is deliberately crude: it
// catches the one thing that matters, which is a kind nobody wrote copy for.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildQuestions, isMandatory, signingGate } from "../questions.js";
import { QUESTION_NOUN } from "../question-nouns.js";

const root = path.resolve(import.meta.dirname, "../../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

// the switch labels a file handles, e.g. `case "restNoTimes":`
const casesIn = (src, from) => {
  const at = src.indexOf(from);
  assert.ok(at > -1, `could not find ${from} - this test needs updating`);
  return new Set([...src.slice(at).matchAll(/case\s+"([A-Za-z]+)"\s*:/g)].map((m) => m[1]));
};

// EVERY SHAPE THAT RAISES A QUESTION, built so the set is derived rather than
// typed out. If a new kind is added to questions.js, add a shape here and the
// rest of the assertions will tell you what else it needs.
const day = (over = {}) => ({
  date: "04/02/27", paidHours: 8, rawHours: 8, regularHours: 8, otHours: 0,
  doubleHours: 0, addedHours: 0, punches: [], breaks: [],
  restTaken: 0, restRequired: 2, mealViolation: false, mealLate: false,
  restViolation: false, ...over,
});

function everyKind() {
  const kinds = new Set();
  const add = (days, opts = {}) => {
    for (const q of buildQuestions({ days, ...(opts.data || {}) }, {
      restRows: opts.restRows || [], sourceName: opts.sourceName || "Newperson, Someone",
    })) kinds.add(q.kind);
  };
  add([day({ mealViolation: true })]);                                   // nothingDocumentedMeal
  add([day({ restViolation: true })]);                                   // nothingDocumentedRest
  // off the clock: the punches say 8a-5p and the ten is recorded at 7a. Built
  // from the ROWS and the punches, never from a flag analyzeDay sets at upload.
  add([day({ punches: [{ min: 8 * 60 }, { min: 17 * 60 }] })], {
    restRows: [{
      name: "Newperson, Someone", date: "04/02/27", out: "7:00 AM", in: "7:10 AM",
      minutes: 10, counted: true, shift: "8:00 AM to 11:00 AM",
    }],
  });                                                                    // restOutsideScheduled
  add([day({ restsFromShortMeals: 1, restTaken: 1, restRequired: 2, restViolation: true })]); // shortMealRest
  // repair comes off a REST ROW the parser had to fix, not off the day
  add([day({ restViolation: true })], {
    restRows: [{
      name: "Newperson, Someone", date: "04/02/27", out: "9:00 AM", in: "9:10 AM",
      minutes: 10, repair: { field: "out", from: "9:00 PM", to: "9:00 AM" },
    }],
  });                                                                    // repair
  add([day({ mealViolation: true, mealMissing: true })], {
    restRows: [{ name: "Newperson, Someone", date: "04/02/27", out: "2:00 PM", in: "2:30 PM", minutes: 30, counted: false }],
  });                                                                    // restIsMealLength
  add([day({ restTaken: 0, restRequired: 1, restViolation: true })], {
    restRows: [{ name: "Newperson, Someone", date: "04/02/27", out: "", in: "", minutes: null }],
  });                                                                    // restNoTimes
  // too long to be a rest, no single-field repair, and the day's meal is NOT
  // missing - so neither the repair nor the meal reading takes it. Hatt 07/20.
  add([day({ mealViolation: false, mealMissing: false, restViolation: true })], {
    restRows: [{
      name: "Newperson, Someone", date: "04/02/27", out: "3:30 PM", in: "4:30 PM",
      minutes: 60, counted: false, reversed: false, kind: "too-long", repair: null,
    }],
  });                                                                    // restTooLongOffClock
  return kinds;
}

test("every question kind the engine can raise has employee copy", () => {
  const handled = casesIn(read("src/app/t/[token]/TimesheetQuestion.js"), "function copyFor");
  for (const kind of everyKind()) {
    assert.ok(
      handled.has(kind),
      `${kind} has no case in copyFor - the card will render NOTHING for it`,
    );
  }
});

test("every kind has an audit noun and a resolution sentence for payroll", () => {
  // THE NOUNS ARE IMPORTED NOW, NOT GREPPED. This half used to slice
  // actions.js as text and look for the kind inside `const QUESTION_NOUN`.
  // Moving that map into its own module - so the admin day-by-day could read it
  // too, which is why it was printing raw kind names - broke the slice and made
  // this report every kind as missing. A test that reads source as text fails
  // when the source MOVES, which is not the same thing as the code being wrong.
  const actions = read("src/app/portal/admin/timesheets/actions.js");
  const resolutions = casesIn(actions, "function resolutionFor");
  for (const kind of everyKind()) {
    assert.ok(
      QUESTION_NOUN[kind],
      `${kind} is missing from QUESTION_NOUN, so its audit note reads "undefined"`,
    );
    assert.ok(
      resolutions.has(kind),
      `${kind} has no case in resolutionFor, so payroll gets no explanation of the answer`,
    );
  }
});

test("every kind knows what its answer does to the day", () => {
  // THE HOLE THIS CLOSES, found 2026-08-11 by falling into it. Merging two kinds
  // into one meant deleting a span of `patchesFor`, and the three
  // nothingDocumented cases went with it - so every "yes I took my breaks" fell
  // through to `default: return {}` and quietly patched nothing. 53 of 59 people
  // are asked that question. The build passed; three unrelated tests caught it
  // by accident, and only because they happened to assert the patch.
  //
  // A kind with no case here does not error - it silently does nothing, which is
  // the worst shape a payroll bug can have.
  const handled = casesIn(read("src/lib/timesheet/questions.js"), "export function patchesFor");
  for (const kind of everyKind()) {
    assert.ok(
      handled.has(kind),
      `${kind} has no case in patchesFor - answering it would change nothing at all`,
    );
  }
});

test("every kind that settles a premium is in the answer table", () => {
  const table = read("src/lib/timesheet/premium-split.js");
  const listed = new Set(
    [...table.matchAll(/^\s{2}(q_[A-Za-z]+):/gm)].map((m) => m[1].slice(2)),
  );
  for (const kind of everyKind()) {
    // only the kinds that move a meal or rest premium need to be here; the ones
    // that move MINUTES do not, so this asserts the premium ones specifically
    if (!/nothingDocumented|restIsMealLength|restNoTimes|shortMealRest|repair/.test(kind)) continue;
    assert.ok(
      listed.has(kind),
      `${kind} settles a premium but is not in PREMIUM_ANSWER_KINDS, so answering it would move the stored figure while the projected one sat still`,
    );
  }
});

test("the kinds are a known set, so a new one cannot arrive unnoticed", () => {
  // Pin the list. A new kind failing here is the POINT: it is the prompt to give
  // it copy, a noun, a resolution, a premium mapping and a gate classification.
  assert.deepEqual(
    [...everyKind()].sort(),
    [
      "nothingDocumentedMeal",
      "nothingDocumentedRest",
      "repair",
      "restIsMealLength",
      "restNoTimes",
      "restOutsideScheduled",
      "restTooLongOffClock",
      "shortMealRest",
    ],
  );
});

test("the same shape raises the same question on any date, in any period", () => {
  // the whole point of Mánu's question: nothing about this is tied to the batch
  // it was written against.
  const shape = (date) => [day({ date, mealViolation: true, restViolation: true })];
  const kindsOn = (date) =>
    buildQuestions({ days: shape(date) }, { restRows: [], sourceName: "X" })
      .map((q) => q.kind)
      .sort();
  const july = kindsOn("07/20/26");
  for (const other of ["01/01/27", "08/01/26", "12/31/28", "02/29/28"]) {
    assert.deepEqual(kindsOn(other), july, `a ${other} day should raise what a 07/20/26 day raises`);
  }
});

// ---------------------------------------------------------------------------
// THE GATE. Added with the 2026-08-11 flip, and it is the guard that matters
// most on this file: silence now leaves an employee's pay ALONE, so a question
// that quietly becomes optional is a discrepancy somebody signs past without
// ever seeing it. The safe failure is asking too much.

test("a kind nobody classified blocks signing rather than slipping through", () => {
  // the whole point of the default. If `isMandatory` fell open, a new kind would
  // be optional from the day it shipped and nothing would say so.
  assert.equal(isMandatory("aKindNobodyHasWrittenYet"), true);
  assert.equal(isMandatory("repair"), true, "we changed their punches");
  assert.equal(isMandatory("restNoTimes"), true, "we could not read the row");
  assert.equal(isMandatory("nothingDocumentedRest"), false, "ignoring it keeps their pay");
  assert.equal(isMandatory("restOutsideScheduled"), false);
});

// A SHEET IS SIGNABLE AT ANY TIME - Mánu 2026-08-12.
//
// This test used to assert the opposite: an unanswered MANDATORY question held
// the signature up. That premise died with the 2026-08-11 flip, which made
// silence the answer that keeps the employee's pay ON - so the gate was holding
// somebody's timesheet hostage to a question whose safe answer they had already
// given by leaving it alone.
//
// The questions are still asked and still counted; they simply no longer decide
// who may sign.
test("nothing holds a signature up - not a mandatory question, not anything", () => {
  const questions = [
    { kind: "nothingDocumentedRest", date: "07/20/26", mandatory: false },
    { kind: "nothingDocumentedMeal", date: "07/20/26", mandatory: false },
    { kind: "restNoTimes", date: "07/21/26", mandatory: true },
  ];
  const open = signingGate(questions, []);
  assert.equal(open.canSign, true, "even with the unreadable row wide open");
  assert.equal(open.blocking, 0, "so no surface can print a 'before you can sign' warning");
  assert.equal(open.unanswered, 1, "the mandatory one is still counted");
  assert.equal(open.optionalOpen, 2, "and this is what the popup counts");

  // answering things only ever reduces the counts - it never unlocks anything,
  // because nothing was locked
  const settled = signingGate(questions, [
    { kind: "q_restNoTimes", date: "07/21/26", status: "accepted" },
  ]);
  assert.equal(settled.canSign, true);
  assert.equal(settled.unanswered, 0);
  assert.equal(settled.optionalOpen, 2, "still unanswered, still not blocking");

  const optionalOnly = signingGate(questions, [
    { kind: "q_nothingDocumentedRest", date: "07/20/26", status: "accepted" },
    { kind: "q_nothingDocumentedMeal", date: "07/20/26", status: "accepted" },
  ]);
  assert.equal(optionalOnly.canSign, true);
  assert.equal(optionalOnly.unanswered, 1, "the mandatory one is still open, and still fine");
  assert.equal(optionalOnly.optionalOpen, 0);
});

// ---------------------------------------------------------------------------
// WHICH ANSWER A STORED ROW READS BACK AS.
//
// There are three outcomes on `restOutsideScheduled` and only two statuses, so
// a declined row is told apart by whether it carries times: with them it is "I
// took it during a shift", without them "I did not take it at all". That makes
// the times load-bearing, and the action nulled them on every decline - so
// choosing the middle option, filling in three times and confirming came back
// as the third. Mánu 2026-08-11: "when i chose those time options it goes back
// to selecting i did not take it at all."
//
// The rule is asserted here rather than left to a comment, because it is the
// only thing keeping two different answers apart on one status.

const readsBackAs = (kind, status, statedBreaks) => {
  if (status === "accepted") return "yes";
  const hasTimes = Array.isArray(statedBreaks) && statedBreaks.length > 0;
  return kind === "restOutsideScheduled" && !hasTimes ? "notaken" : "no";
};

test("a declined row with times is a different answer from one without", () => {
  const times = [{ slot: "outside1", from: "11:50a", to: "12p" }];

  assert.equal(readsBackAs("restOutsideScheduled", "accepted", null), "yes");
  assert.equal(
    readsBackAs("restOutsideScheduled", "declined", times), "no",
    "times on a decline mean they took it during a shift",
  );
  assert.equal(
    readsBackAs("restOutsideScheduled", "declined", null), "notaken",
    "no times on a decline mean they never got it",
  );
  // and the one that broke: storing null alongside a set of times somebody
  // actually gave turns the middle answer into the third
  assert.notEqual(
    readsBackAs("restOutsideScheduled", "declined", null),
    readsBackAs("restOutsideScheduled", "declined", times),
    "so the times cannot be cleared on this kind's decline",
  );

  // EVERY OTHER KIND IS UNAFFECTED - a decline is a decline, times or not.
  assert.equal(readsBackAs("nothingDocumentedRest", "declined", null), "no");
  assert.equal(readsBackAs("nothingDocumentedRest", "declined", times), "no");
});

test("the action stores the times it resolved, and does not second-guess them", () => {
  // the fix, read out of the source: a bare `statedBreaks` rather than a
  // conditional that nulls it on a decline. Crude, and it is the assertion that
  // would have caught this.
  const src = read("src/app/portal/admin/timesheets/actions.js");
  const record = src.slice(src.indexOf("const record = {"), src.indexOf("if (existing)"));
  // THE INVARIANT IS ABOUT THE CHOICE, not the exact expression. Filtering the
  // list down to the date being written is fine - and necessary, or a grouped
  // question puts every date's times on every date's row. Branching on `pick`
  // is what loses the middle answer.
  assert.ok(
    /statedBreaks/.test(record),
    "statedBreaks has to be stored at all",
  );
  assert.ok(
    !/statedBreaks:\s*pick\s*===/.test(record),
    "nulling times on a decline breaks restOutsideScheduled - it is the decline that carries them",
  );
  assert.ok(
    !/pick === "no".*statedBreaks/s.test(record.slice(0, record.indexOf("statedBreaks"))),
    "the stored times must not depend on which answer was picked",
  );
});
