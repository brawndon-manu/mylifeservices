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
