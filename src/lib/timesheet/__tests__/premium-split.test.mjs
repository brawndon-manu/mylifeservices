// The two premium figures. Mánu 2026-08-09: staff author their own schedules
// and signed an acknowledgment saying they would enter their breaks, so a
// missing entry is assumed taken and asked about rather than charged.
import test from "node:test";
import assert from "node:assert/strict";
import { splitPremium } from "../premium-split.js";

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
