// WHY A BREAK WAS NOT TAKEN, and the two answers that behave oppositely on the
// next export.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BREAK_ANSWERS, breakAnswer, isBreakAnswer, isHeardVia,
  needsEmployeeReason, employeeAsk, answersByFinding,
} from "../break-answers.js";

test("confirming it was not taken expects NO change in the next export", () => {
  // there is nothing to punch, so the finding stays for ever and that is right
  assert.equal(BREAK_ANSWERS["not-taken"].expectsChange, false);
  assert.equal(BREAK_ANSWERS["not-taken"].asksReason, true);
});

test("saying they took it DOES expect the next export to move", () => {
  assert.equal(BREAK_ANSWERS["took-it"].expectsChange, true);
  // nothing to explain: the fix is the punch, not a sentence
  assert.equal(BREAK_ANSWERS["took-it"].asksReason, false);
});

test("only the two answers are answers", () => {
  assert.ok(isBreakAnswer("not-taken"));
  assert.ok(isBreakAnswer("took-it"));
  assert.equal(isBreakAnswer("settled"), false);
  assert.equal(isBreakAnswer(""), false);
  assert.equal(breakAnswer("nonsense"), null);
});

test("how we heard it is a closed list", () => {
  assert.ok(isHeardVia("phone"));
  assert.ok(isHeardVia("in-person"));
  assert.equal(isHeardVia("carrier pigeon"), false);
});

// THE STATE THAT MOVES THE QUESTION TO THE EMPLOYEE. A null reason is not an
// empty field, it is an obligation.
test("confirmed not taken with no reason is the employee's to answer", () => {
  assert.equal(needsEmployeeReason({ answer: "not-taken", reason: null }), true);
  assert.equal(needsEmployeeReason({ answer: "not-taken", reason: "client would not settle" }), false);
  // and "they took it" never asks them for a reason - there is nothing to explain
  assert.equal(needsEmployeeReason({ answer: "took-it", reason: null }), false);
  assert.equal(needsEmployeeReason(null), false);
});

test("what the employee is asked: write one, check ours, or nothing", () => {
  assert.equal(employeeAsk({ answer: "not-taken", reason: null }), "write");
  assert.equal(employeeAsk({ answer: "not-taken", reason: "traffic" }), "confirm");
  assert.equal(
    employeeAsk({ answer: "not-taken", reason: "traffic", confirmedAt: new Date() }),
    null,
    "once they have agreed our wording there is nothing left to ask",
  );
  assert.equal(employeeAsk({ answer: "took-it" }), null);
  assert.equal(employeeAsk(null), null);
});

test("answers are looked up by the same key marks use", () => {
  const m = answersByFinding([
    { personKey: "u1", findingKey: "breaks-08/03/26", answer: "not-taken" },
    { personKey: "u2", findingKey: "breaks-08/03/26", answer: "took-it" },
  ]);
  assert.equal(m.get("u1|breaks-08/03/26").answer, "not-taken");
  assert.equal(m.get("u2|breaks-08/03/26").answer, "took-it");
  // one person's answer must never be read for another's identical day
  assert.notEqual(m.get("u1|breaks-08/03/26"), m.get("u2|breaks-08/03/26"));
  assert.equal(m.get("u1|breaks-08/04/26"), undefined);
});

// ------------------------------- the lines that go on the bottom of the sheet

import { formatBreakComments } from "../break-answers.js";

const ours = {
  answer: "not-taken", kind: "meal", date: "08/03/26",
  reason: "Client would not settle, could not leave them to eat.",
};

test("a reason we took, not yet checked by them, says so on the document", () => {
  const [line] = formatBreakComments([ours]);
  assert.match(line, /^1\) 08\/03\/26 meal period not taken: Client would not settle/);
  assert.match(line, /not yet confirmed by the employee/);
});

test("once they agree our wording, the line says confirmed", () => {
  const [line] = formatBreakComments([{ ...ours, confirmedText: ours.reason }]);
  assert.match(line, /\[confirmed by employee\]/);
  assert.equal(formatBreakComments([{ ...ours, confirmedText: ours.reason }]).length, 1);
});

// THE ONE THAT MATTERS. Ours is not replaced by theirs - the document has to
// show that the record moved.
test("when they correct us, BOTH print, ours first", () => {
  const lines = formatBreakComments([
    { ...ours, confirmedText: "The client's family turned up and I stayed." },
  ]);
  assert.equal(lines.length, 2);
  assert.match(lines[0], /Client would not settle/);
  assert.match(lines[0], /recorded from a call/);
  assert.match(lines[1], /employee correction: The client's family turned up/);
  assert.match(lines[1], /in the employee's own words/);
});

test("a reason only they gave is theirs alone, not a correction to anything", () => {
  const lines = formatBreakComments([
    { answer: "not-taken", kind: "rest", date: "08/04/26", reason: null, confirmedText: "No cover." },
  ]);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /rest period not taken: No cover\./);
  assert.ok(!/correction/.test(lines[0]));
});

test("numbering continues from QSP's own notes rather than restarting at one", () => {
  const lines = formatBreakComments([ours], 2);
  assert.match(lines[0], /^3\)/);
});

test("nothing to say prints nothing, and took-it never prints", () => {
  assert.deepEqual(formatBreakComments([]), []);
  assert.deepEqual(formatBreakComments([{ answer: "not-taken", reason: null }]), []);
  assert.deepEqual(
    formatBreakComments([{ answer: "took-it", reason: "should never appear" }]),
    [],
    "a punch that needs making is not a reason for anything",
  );
});

// ------------------------------- every answer the day actually allows

import { answerOptionsFor, answerSummary, stillMissing } from "../break-answers.js";

test("a meal is two buttons, because it is one thing", () => {
  const o = answerOptionsFor({ kind: "meal", missing: 1 });
  assert.deepEqual(o.map((x) => x.label), [
    "Confirm not taken",
    "They took it, needs punching",
  ]);
  assert.deepEqual(o.map((x) => x.takenCount), [0, 1]);
});

// THE ONE THAT DROVE THIS. "0 of 2 recorded" cannot be answered by two buttons:
// they may have taken neither, or one of the two.
test("two rests short offers none, one, and both", () => {
  const o = answerOptionsFor({ kind: "rest", missing: 2 });
  assert.deepEqual(o.map((x) => x.label), [
    "Confirm none of the 2 taken",
    "They took 1 of 2, needs punching",
    "They took all 2, needs punching",
  ]);
  assert.deepEqual(o.map((x) => x.takenCount), [0, 1, 2]);
});

test("three short needs no new code", () => {
  assert.equal(answerOptionsFor({ kind: "rest", missing: 3 }).length, 4);
});

// TAKING SOME IS STILL MISSING SOME, and the leftover is owed a reason exactly
// like a day where they took none.
test("only an answer that accounts for every one skips the reason", () => {
  const o = answerOptionsFor({ kind: "rest", missing: 2 });
  assert.equal(o[0].asksReason, true, "none taken");
  assert.equal(o[1].asksReason, true, "one of two still leaves one");
  assert.equal(o[2].asksReason, false, "all of them, nothing left to explain");
});

test("what is still missing drives the obligation, not which button", () => {
  assert.equal(stillMissing({ answer: "took-it", takenCount: 1, missingCount: 2 }), 1);
  assert.equal(stillMissing({ answer: "took-it", takenCount: 2, missingCount: 2 }), 0);
  assert.equal(stillMissing({ answer: "not-taken", takenCount: 0, missingCount: 2 }), 2);
  // a reason is owed on the partial one even though they pressed "took it"
  assert.equal(
    needsEmployeeReason({ answer: "took-it", takenCount: 1, missingCount: 2, reason: null }),
    true,
  );
  assert.equal(
    needsEmployeeReason({ answer: "took-it", takenCount: 2, missingCount: 2, reason: null }),
    false,
  );
});

test("the card says the count back", () => {
  assert.equal(
    answerSummary({ answer: "took-it", takenCount: 1, missingCount: 2, kind: "rest" }),
    "They took 1 of 2, needs punching",
  );
  assert.equal(
    answerSummary({ answer: "not-taken", takenCount: 0, missingCount: 2, kind: "rest" }),
    "Confirmed none of the 2 taken",
  );
  assert.equal(
    answerSummary({ answer: "not-taken", takenCount: 0, missingCount: 1, kind: "meal" }),
    "Confirmed meal break not taken",
  );
});

// A LATE MEAL WAS TAKEN, so "did you take it" is the wrong question entirely.
test("a late meal asks about the time, not about whether it happened", () => {
  const o = answerOptionsFor({ kind: "meal-late", missing: 1 });
  assert.deepEqual(o.map((x) => x.label), [
    "Confirm it really was that late",
    "The punched time is wrong, needs correcting",
  ]);
  assert.ok(!o.some((x) => /not taken/i.test(x.label)), "nothing here says not taken");
  assert.equal(o[0].asksReason, true, "a genuinely late meal is owed a why");
  assert.equal(
    answerSummary({ kind: "meal-late", answer: "took-it", takenCount: 1, missingCount: 1 }),
    "The punched time is wrong, needs correcting",
  );
});
