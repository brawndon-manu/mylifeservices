// NOTHING AN EMPLOYEE READS MAY NAME THE PREMIUM.
//
// The timesheet review page used to print `resolutionNote` back to the person
// whose sheet it is. That field is payroll's audit note: it says what an answer
// did to the hour and cites the case the hour comes from. `employeeResolution`
// is the sentence for their side of the same row.
//
// The first test is the one that matters and it is deliberately a scan rather
// than a list of expected strings - a new question kind added later gets caught
// by it without anybody remembering to come back here.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  employeeResolution, resolutionTakesReason,
} from "../corrections.js";

// every kind the answer path can write, in both directions, plus the three-way
// card and the partial. Kept as data so the scan below covers all of them.
const KINDS = [
  "repair", "restIsMealLength", "restNoTimes", "restOutsideScheduled",
  "nothingDocumented", "nothingDocumentedMeal", "nothingDocumentedRest",
  "mealLate", "restTooLongOffClock", "shortMealRest",
];
const PICKS = ["yes", "no", "partial", "wrongone"];

const row = (kind, choice, statedBreaks = []) => ({
  kind: `q_${kind}`,
  date: "08/07/26",
  choice,
  status: choice === "yes" ? "accepted" : "declined",
  statedBreaks,
});

const BANNED = /premium|penalt|UPS v\.|Superior Court|owed|payroll|QSP|flagged/i;

test("no sentence names the premium, the penalty, the case or payroll", () => {
  for (const kind of KINDS) {
    for (const pick of PICKS) {
      for (const q of [null, { row: { twoLunches: true } }]) {
        const said = employeeResolution(row(kind, pick, [
          { slot: 0, kindOf: "rest", from: "11:30a", to: "11:40a", source: "typed" },
        ]), q);
        if (!said) continue;
        assert.ok(
          !BANNED.test(said),
          `${kind}/${pick} says something only admin may read: ${said}`,
        );
      }
    }
  }
});

test("the scan can fail, so passing it means something", () => {
  // the exact shape of note this replaced, proving BANNED matches real copy
  const audit = "Employee says they did not get their meal break that day. "
    + "One hour of premium restored, per UPS v. Superior Court.";
  assert.ok(BANNED.test(audit));
});

test("every kind produces a sentence in both directions", () => {
  for (const kind of KINDS) {
    for (const pick of ["yes", "no"]) {
      const said = employeeResolution(row(kind, pick), null);
      assert.ok(said, `${kind}/${pick} said nothing at all`);
      assert.ok(said.startsWith("You "), `${kind}/${pick} is not in their voice: ${said}`);
    }
  }
});

test("the times they gave come back with the answer", () => {
  const said = employeeResolution(row("nothingDocumentedRest", "yes", [
    { slot: 0, kindOf: "rest", from: "11:30a", to: "11:40a", source: "typed" },
  ]), null);
  assert.match(said, /11:30a to 11:40a/);
  // and the provenance the audit note carries does not follow them over
  assert.ok(!/given by the employee|from their schedule/.test(said));
});

test("a partial is not read back as a plain decline", () => {
  const partial = employeeResolution(row("nothingDocumentedRest", "partial", [
    { slot: 0, kindOf: "rest", from: "1p", to: "1:10p", source: "typed" },
  ]), null);
  const declined = employeeResolution(row("nothingDocumentedRest", "no"), null);
  assert.notEqual(partial, declined);
  assert.match(partial, /some of your rest periods/);
  assert.match(partial, /1p to 1:10p/);
});

test("the two lunches card reads its third outcome off `choice`", () => {
  const q = { row: { twoLunches: true } };
  const yes = employeeResolution(row("restTooLongOffClock", "yes"), q);
  const no = employeeResolution(row("restTooLongOffClock", "no"), q);
  const wrongone = employeeResolution(row("restTooLongOffClock", "wrongone"), q);
  assert.equal(new Set([yes, no, wrongone]).size, 3);
  // `status` is "declined" on two of the three, so a version reading the status
  // alone would give the same sentence for both
  assert.notEqual(no, wrongone);
});

test("a row written before `choice` existed still reads", () => {
  const legacy = { kind: "q_nothingDocumentedMeal", date: "08/07/26", status: "declined" };
  assert.match(employeeResolution(legacy, null), /did not get your meal break/);
});

test("a reason belongs only to an answer that says a break was missed", () => {
  assert.equal(resolutionTakesReason(row("nothingDocumentedRest", "no")), true);
  assert.equal(resolutionTakesReason(row("nothingDocumentedRest", "partial")), true);
  assert.equal(resolutionTakesReason(row("nothingDocumentedRest", "yes")), false);
  assert.equal(resolutionTakesReason(row("nothingDocumentedMeal", "no")), true);
  // the late lunch is the one where CONFIRMING is what asks for a sentence
  assert.equal(resolutionTakesReason(row("mealLate", "yes")), true);
  assert.equal(resolutionTakesReason(row("mealLate", "no")), false);
  // and nothing else carries one
  for (const kind of ["repair", "restNoTimes", "restOutsideScheduled", "shortMealRest", "restIsMealLength"]) {
    assert.equal(resolutionTakesReason(row(kind, "no")), false, kind);
  }
});

test("an unanswered row says nothing", () => {
  assert.equal(employeeResolution({ kind: "q_repair", date: "08/07/26", status: "open" }, null), null);
  assert.equal(employeeResolution(null, null), null);
});
