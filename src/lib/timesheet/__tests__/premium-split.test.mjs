// The two premium figures, AFTER THE 2026-08-11 FLIP.
//
// Every assertion in this file used to run the other way. Silence meant NOT
// PAID: `projected` was the small figure, an unanswered day charged nothing, and
// saying "no I missed it" was what put an hour on. Mánu reversed the default
// after it was costed - 14.00 hours against 678.00 on the live batch - so
// `projected` is now every fault taken literally, and an answer can only ever
// take an hour off.
//
// The arithmetic did not move; the two figures swapped jobs. That is exactly why
// these tests are worth keeping pointed at the direction rather than the sums:
// a rename that quietly kept the old behaviour would still add up.
import test from "node:test";
import assert from "node:assert/strict";
import {
  splitPremium, applyAssumptions, premiumsFromDays, confirmedFromAnswers,
} from "../premium-split.js";

const day = (over = {}) => ({
  date: "07/20/26", paidHours: 8, mealViolation: false, mealLate: false,
  restViolation: false, ...over,
});

test("a late lunch cannot be assumed away; a missing one can", () => {
  // M1: the schedule rosters the meal and it BEGAN after the fifth hour. The
  // document records the violation itself, so there is nothing to assume and
  // nothing to ask - it is projected, and no answer can take it out.
  const late = splitPremium([day({ mealViolation: true, mealLate: true })]);
  assert.equal(late.projected, 1);
  assert.equal(late.assumptions, 0, "nothing here is assumable");
  assert.equal(late.ifAssumptionsHold, 1, "so the floor is the same figure");

  // M2/M3/M4: over six hours with no meal recorded at all. PAID, and the
  // assumption that they took it is what would remove it - once they say so.
  const missing = splitPremium([day({ mealViolation: true, mealLate: false })]);
  assert.equal(missing.projected, 1, "charged from the start");
  assert.equal(missing.assumptions, 1, "and this is what could come off");
  assert.equal(missing.ifAssumptionsHold, 0);
});

test("R1 and R2 are the same species, and both are paid until answered", () => {
  // A day showing 1 of 2 rests and a person the report never mentions are the
  // same thing: what is missing is an entry the employee was supposed to make.
  const shortfall = splitPremium([day({ restViolation: true, restTaken: 1, restRequired: 2 })]);
  const silent = splitPremium([day({ restViolation: true, restTaken: 0, restRequired: 2 })]);
  assert.equal(shortfall.projected, 1);
  assert.equal(silent.projected, 1);
  assert.equal(shortfall.assumptions, 1);
  assert.equal(silent.assumptions, 1);
});

test("an employee confirming they MISSED a break settles it against any assumption", () => {
  // Zermeno's shape: nothing documented, so both premiums are charged. Saying
  // "no, I did not get my lunch or my two tens" does not ADD anything now - the
  // sheet already says it. What it does is take the hours out of reach: no
  // assumption can come along and remove them.
  const d = day({ mealViolation: true, restViolation: true });
  const ignored = splitPremium([d]);
  assert.equal(ignored.projected, 2, "paid whether she answers or not");
  assert.equal(ignored.assumptions, 2, "both are still assumable");
  assert.equal(ignored.ifAssumptionsHold, 0);

  const answered = splitPremium([d], {
    confirmed: new Set(["07/20/26:meal", "07/20/26:rest"]),
  });
  assert.equal(answered.projected, 2, "the same two hours, unmoved");
  assert.equal(answered.assumptions, 0, "but nothing can assume them away now");
  assert.equal(answered.ifAssumptionsHold, 2, "so the floor rose to meet it");
});

test("the ceiling is two a day however many breaks were missed", () => {
  // UPS v. Superior Court (2011): one meal premium AND one rest premium, max.
  const d = splitPremium([day({
    mealViolation: true, mealLate: true, restViolation: true,
    secondMealViolation: true,
  })]);
  assert.equal(d.projected, 2, "not three");
  assert.equal(d.ifAssumptionsHold, 1, "the late meal survives every assumption");
});

test("a clean day owes nothing on either figure", () => {
  // or every assertion above is just measuring that days exist
  const d = splitPremium([day(), day({ date: "07/21/26" })]);
  assert.equal(d.projected, 0);
  assert.equal(d.assumptions, 0);
  assert.equal(d.rows.length, 0);
});

// ---------------------------------------------------------------------------
// THE THREE DOCUMENTS. Mánu 2026-08-09: he wants to hold the default sheet and
// the engine's alternative reading side by side for one person, plus a third
// showing where that person actually landed once they answered.

test("an answer is read off the correction rows, and an accept is what removes", () => {
  // Every question is phrased so "yes" says the break happened. Declining agrees
  // with the sheet and settles the premium in place.
  const declined = confirmedFromAnswers([
    { kind: "q_nothingDocumented", date: "07/20/26", status: "declined" },
  ]);
  assert.deepEqual([...declined].sort(), ["07/20/26:meal", "07/20/26:rest"]);

  const accepted = confirmedFromAnswers([
    { kind: "q_nothingDocumented", date: "07/20/26", status: "accepted" },
  ]);
  assert.equal(accepted.size, 0, "confirming settles nothing in place - it removes");

  // and the two kinds that move MINUTES rather than a premium stay out of it,
  // or answering one of those would silently move an hour of penalty pay
  const minutesOnly = confirmedFromAnswers([
    { kind: "q_restOutsideShift", date: "07/20/26", status: "declined" },
    { kind: "q_restAtServiceEdge", date: "07/20/26", status: "declined" },
  ]);
  assert.equal(minutesOnly.size, 0);

  // an OPEN correction is a reported problem, not an answer
  const open = confirmedFromAnswers([
    { kind: "q_nothingDocumented", date: "07/20/26", status: "open" },
  ]);
  assert.equal(open.size, 0);
});

test("the assumed rows keep the finding and lose the charge", () => {
  const days = [
    day({ date: "07/20/26", mealViolation: true, restViolation: true, restTaken: 1, restRequired: 2 }),
    day({ date: "07/21/26", mealViolation: true, mealLate: true }),
  ];
  const out = applyAssumptions(days);

  // the assumable day stops being charged on THIS copy...
  assert.equal(out[0].mealViolation, false);
  assert.equal(out[0].restViolation, false);
  // ...but it does NOT go silent. 359 rows on the live batch carry an assumable
  // premium and nothing else, so dropping the flag alone would print
  // "compliant" on every one of them - a clean bill of health for a break
  // nobody verified.
  assert.equal(out[0].premiumNote.meal, "assumed");
  assert.equal(out[0].premiumNote.rest, "assumed");
  assert.equal(out[0].premiumNote.restTaken, 1, "the count survives the flag being cleared");
  assert.equal(out[0].premiumNote.restRequired, 2);

  // the documented one is untouched, or no assumption is ever beyond reach
  assert.equal(out[1].mealViolation, true);
  assert.equal(out[1].premiumNote, undefined, "nothing to explain: it is charged");

  assert.equal(premiumsFromDays(out).totalHours, 1, "the late lunch, and only it");
  // AND THE DEFAULT SHEET IS THE UNTOUCHED ONE. This is the assertion the flip
  // actually turns on: `days` is what gets emailed, signed and paid.
  assert.equal(premiumsFromDays(days).totalHours, 3, "against three on the sheet itself");
});

test("an employee who says they missed it keeps the hour on the corrected copy", () => {
  const days = [day({ date: "07/20/26", mealViolation: true, restViolation: true })];
  const answers = [{ kind: "q_nothingDocumented", date: "07/20/26", status: "declined" }];

  // the ASSUMED copy is the engine's alternative reading and is blind to answers
  assert.equal(premiumsFromDays(applyAssumptions(days)).totalHours, 0);

  // the CORRECTED copy is not: she said she missed them, so the assumption is
  // not allowed to take them off
  const corrected = applyAssumptions(days, { confirmed: confirmedFromAnswers(answers) });
  assert.equal(premiumsFromDays(corrected).totalHours, 2, "a meal and a rest");
  assert.equal(corrected[0].premiumNote, undefined, "nothing assumed is left to note");
});

test("silence is called a question before the deadline and an answer after it", () => {
  // Mánu 2026-08-09: "if they don't sign off on it, then the form will be our
  // assumption". Same figure either way - what changes is what the sheet claims.
  const days = [day({ mealViolation: true })];
  assert.equal(applyAssumptions(days, { pastDue: false })[0].premiumNote.state, "needs-confirmation");
  assert.equal(applyAssumptions(days, { pastDue: true })[0].premiumNote.state, "not-documented");
  // AND THE DEADLINE PASSING DOES NOT TOUCH THE SHEET THAT GETS PAID. Under the
  // old default this was the one place silence cost somebody money.
  assert.equal(
    premiumsFromDays(days).totalHours, 1,
    "the projected sheet is unmoved by a deadline going by",
  );
});

test("a day they confirmed they took says so, and a clean day still says nothing", () => {
  // the override has already cleared the violation by the time this runs, so
  // without the answer record the day is indistinguishable from one that never
  // owed anything - and on the corrected copy that sentence is the evidence.
  const confirmedTaken = applyAssumptions([day({ date: "07/20/26" })], {
    answers: { "07/20/26:meal": "taken", "07/20/26:rest": "taken" },
  });
  assert.equal(confirmedTaken[0].premiumNote.meal, "taken");
  assert.equal(confirmedTaken[0].premiumNote.rest, "taken");

  const untouched = applyAssumptions([day({ date: "07/20/26" })], { answers: {} });
  assert.equal(untouched[0].premiumNote, undefined);
});

test("applying assumptions to a batch that owes nothing changes nothing at all", () => {
  // the check that proves the ones above can fail: if applyAssumptions rewrote
  // every day it was handed, every assertion here would still pass by accident.
  const clean = [day({ date: "07/20/26" }), day({ date: "07/21/26" })];
  assert.deepEqual(applyAssumptions(clean), clean);
  assert.equal(premiumsFromDays(applyAssumptions(clean)).totalHours, 0);
});
