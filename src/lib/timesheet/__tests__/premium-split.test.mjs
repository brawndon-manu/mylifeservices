// The two premium figures. Mánu 2026-08-09: staff author their own schedules
// and signed an acknowledgment saying they would enter their breaks, so a
// missing entry is assumed taken and asked about rather than charged.
import test from "node:test";
import assert from "node:assert/strict";
import {
  splitPremium, projectDays, premiumsFromDays, confirmedFromAnswers,
} from "../premium-split.js";

const day = (over = {}) => ({
  date: "07/20/26", paidHours: 8, mealViolation: false, mealLate: false,
  restViolation: false, ...over,
});

test("a late lunch is documented; a missing one is assumed", () => {
  // M1: the schedule rosters the meal and it BEGAN after the fifth hour. The
  // document records the violation itself - nobody had to fail to write
  // something down for us to know.
  const late = splitPremium([day({ mealViolation: true, mealLate: true })]);
  assert.equal(late.projected, 1);
  assert.equal(late.ignoringAssumptions, 1);
  assert.equal(late.assumed, 0, "nothing is being assumed here");

  // M2/M3/M4: over six hours with no meal recorded at all. Entering it was
  // theirs to do, so it is assumed taken and asked about.
  const missing = splitPremium([day({ mealViolation: true, mealLate: false })]);
  assert.equal(missing.projected, 0, "not charged");
  assert.equal(missing.ignoringAssumptions, 1, "but never hidden");
  assert.equal(missing.assumed, 1);
});

test("R1 and R2 are the same species, and both are assumed", () => {
  // A day showing 1 of 2 rests and a person the report never mentions are the
  // same thing: what is missing is an entry the employee was supposed to make.
  // These sat in different buckets under the old model.
  const shortfall = splitPremium([day({ restViolation: true, restTaken: 1, restRequired: 2 })]);
  const silent = splitPremium([day({ restViolation: true, restTaken: 0, restRequired: 2 })]);
  assert.equal(shortfall.projected, 0);
  assert.equal(silent.projected, 0);
  assert.equal(shortfall.assumed, 1);
  assert.equal(silent.assumed, 1);
});

test("a premium the employee confirms they are owed joins the projected figure", () => {
  // Zermeno's shape: nothing documented, so nothing charged - until she says
  // "no, I did not take my lunch or my two tens", which is TWO premiums.
  const d = day({ mealViolation: true, restViolation: true });
  const ignored = splitPremium([d]);
  assert.equal(ignored.projected, 0, "she ignored it, so the form is our assumption");
  assert.equal(ignored.ignoringAssumptions, 2);

  const answered = splitPremium([d], {
    confirmed: new Set(["07/20/26:meal", "07/20/26:rest"]),
  });
  assert.equal(answered.projected, 2, "one meal premium and one rest premium");
  assert.equal(answered.assumed, 0, "nothing is assumed once she has answered");
  assert.equal(answered.ignoringAssumptions, 2, "and the ceiling still holds");
});

test("the ceiling is two a day however many breaks were missed", () => {
  // UPS v. Superior Court (2011): one meal premium AND one rest premium, max.
  const d = splitPremium([day({
    mealViolation: true, mealLate: true, restViolation: true,
    secondMealViolation: true,
  })]);
  assert.equal(d.ignoringAssumptions, 2, "not three");
  assert.equal(d.projected, 1, "the late meal only");
});

test("a clean day owes nothing on either figure", () => {
  // or every assertion above is just measuring that days exist
  const d = splitPremium([day(), day({ date: "07/21/26" })]);
  assert.equal(d.projected, 0);
  assert.equal(d.ignoringAssumptions, 0);
  assert.equal(d.rows.length, 0);
});

// ---------------------------------------------------------------------------
// THE THREE DOCUMENTS. Mánu 2026-08-09: he wants to hold the engine's proposal
// and the raw figure side by side for one person, plus a third showing where
// that person actually landed once they answered.

test("an answer is read off the correction rows, and a decline is what charges", () => {
  // Every question is phrased so "yes" agrees with the cheap reading the engine
  // already took. Saying NO is the employee telling us they are owed.
  const declined = confirmedFromAnswers([
    { kind: "q_nothingDocumented", date: "07/20/26", status: "declined" },
  ]);
  assert.deepEqual([...declined].sort(), ["07/20/26:meal", "07/20/26:rest"]);

  const accepted = confirmedFromAnswers([
    { kind: "q_nothingDocumented", date: "07/20/26", status: "accepted" },
  ]);
  assert.equal(accepted.size, 0, "confirming our reading charges nothing");

  // and the two kinds that move MINUTES rather than a premium stay out of it,
  // or declining one of those would silently add an hour of pay
  const minutesOnly = confirmedFromAnswers([
    { kind: "q_restOutsideShift", date: "07/20/26", status: "declined" },
    { kind: "q_restSnappedToShift", date: "07/20/26", status: "declined" },
  ]);
  assert.equal(minutesOnly.size, 0);

  // an OPEN correction is a reported problem, not an answer
  const open = confirmedFromAnswers([
    { kind: "q_nothingDocumented", date: "07/20/26", status: "open" },
  ]);
  assert.equal(open.size, 0);
});

test("the projected rows keep the finding and lose the charge", () => {
  const days = [
    day({ date: "07/20/26", mealViolation: true, restViolation: true, restTaken: 1, restRequired: 2 }),
    day({ date: "07/21/26", mealViolation: true, mealLate: true }),
  ];
  const out = projectDays(days);

  // the assumed day stops being charged...
  assert.equal(out[0].mealViolation, false);
  assert.equal(out[0].restViolation, false);
  // ...but it does NOT go silent. 359 rows on the live batch carry an assumed
  // premium and nothing else, so dropping the flag alone would print
  // "compliant" on every one of them - a clean bill of health for a break
  // nobody verified.
  assert.equal(out[0].premiumNote.meal, "assumed");
  assert.equal(out[0].premiumNote.rest, "assumed");
  assert.equal(out[0].premiumNote.restTaken, 1, "the count survives the flag being cleared");
  assert.equal(out[0].premiumNote.restRequired, 2);

  // the documented one is untouched, or the projected sheet charges nothing ever
  assert.equal(out[1].mealViolation, true);
  assert.equal(out[1].premiumNote, undefined, "nothing to explain: it is charged");

  assert.equal(premiumsFromDays(out).totalHours, 1, "the late lunch, and only it");
  assert.equal(premiumsFromDays(days).totalHours, 3, "against three before projecting");
});

test("the corrected rows charge what the employee said they are owed", () => {
  const days = [day({ date: "07/20/26", mealViolation: true, restViolation: true })];
  const answers = [{ kind: "q_nothingDocumented", date: "07/20/26", status: "declined" }];

  // the PROJECTED copy is the engine's proposal and is blind to answers
  assert.equal(premiumsFromDays(projectDays(days)).totalHours, 0);

  // the CORRECTED copy is not
  const corrected = projectDays(days, { confirmed: confirmedFromAnswers(answers) });
  assert.equal(premiumsFromDays(corrected).totalHours, 2, "a meal and a rest");
  assert.equal(corrected[0].premiumNote, undefined, "nothing assumed is left to note");
});

test("silence is called a question before the deadline and an answer after it", () => {
  // Mánu 2026-08-09: "if they don't sign off on it, then the form will be our
  // assumption". Same figure either way - what changes is what the sheet claims.
  const days = [day({ mealViolation: true })];
  assert.equal(projectDays(days, { pastDue: false })[0].premiumNote.state, "needs-confirmation");
  assert.equal(projectDays(days, { pastDue: true })[0].premiumNote.state, "not-documented");
  assert.equal(
    premiumsFromDays(projectDays(days, { pastDue: true })).totalHours, 0,
    "the deadline passing charges nobody anything",
  );
});

test("a day they confirmed they took says so, and a clean day still says nothing", () => {
  // the override has already cleared the violation by the time this runs, so
  // without the answer record the day is indistinguishable from one that never
  // owed anything - and on the corrected copy that sentence is the evidence.
  const confirmedTaken = projectDays([day({ date: "07/20/26" })], {
    answers: { "07/20/26:meal": "taken", "07/20/26:rest": "taken" },
  });
  assert.equal(confirmedTaken[0].premiumNote.meal, "taken");
  assert.equal(confirmedTaken[0].premiumNote.rest, "taken");

  const untouched = projectDays([day({ date: "07/20/26" })], { answers: {} });
  assert.equal(untouched[0].premiumNote, undefined);
});

test("projecting a batch that owes nothing changes nothing at all", () => {
  // the check that proves the ones above can fail: if projectDays rewrote every
  // day it was handed, every assertion here would still pass by accident.
  const clean = [day({ date: "07/20/26" }), day({ date: "07/21/26" })];
  assert.deepEqual(projectDays(clean), clean);
  assert.equal(premiumsFromDays(projectDays(clean)).totalHours, 0);
});
