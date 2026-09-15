// SALARIED EXEMPT STAFF.
//
// Meal and rest periods do not apply to them, so no premium is ever owed, their
// sheet asks for no signature, and no email goes out asking for one. Their hours
// still reach every payout report: this is about breaks and signing, not about
// being off the payroll.
//
// THE MODEL IS ENTITLEMENT, NOT FORGIVENESS. An exempt person is owed no break,
// rather than owed one and excused it. That matters because everything
// downstream keys on the entitlement - the violation, the premium, the question
// on the review page, the row on the checks screen - so none of those places
// needs to know who the person is. The alternative, a gate at each of them, is
// the thirty-one-readers problem the rest attestation already paid for once.
//
// NOT `timesheetExempt`, which means the opposite kind of thing: that account
// never holds a timesheet at all and is dropped from every matching pool.
// Reusing it here would have deleted these people from the payout.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { analyzeDay, reentitle } from "../parse.js";
import { premiumsFromDays, splitPremium } from "../premium-split.js";
import { dayViolations } from "../violations.js";
import { buildQuestions } from "../questions.js";

const at = (h, m = 0) => ({ min: h * 60 + m });
// 8:00a-5:00p with no break recorded: two rests and a meal owed by anybody else
const longDay = (over = {}) => ({
  date: "09/02/26", punches: [at(8), at(17)], printed: null, restRecorded: 0, ...over,
});

test("analyzeDay: an exempt person is owed no break, so none can be missed", () => {
  const ordinary = analyzeDay(longDay());
  assert.equal(ordinary.restRequired, 2, "the same day owes two rests for anybody else");
  assert.equal(ordinary.mealRequired, true);
  assert.equal(ordinary.mealViolation, true);

  const exempt = analyzeDay(longDay({ salariedExempt: true }));
  assert.equal(exempt.restRequired, 0);
  assert.equal(exempt.mealRequired, false);
  assert.equal(exempt.secondMealRequired, false);
  assert.equal(exempt.restViolation, false);
  assert.equal(exempt.mealViolation, false);
  // the hours are untouched - this is about breaks, not about pay
  assert.equal(exempt.paidHours, ordinary.paidHours);
});

test("reentitle carries it, so an answer's recompute cannot hand the entitlement back", () => {
  const stored = { date: "09/02/26", restUnknown: false, restTaken: 0, workGroups: null };
  const ordinary = reentitle({ ...stored }, 9);
  assert.equal(ordinary.restRequired, 2);
  assert.equal(ordinary.restViolation, true);

  const exempt = reentitle({ ...stored, salariedExempt: true }, 9);
  assert.equal(exempt.restRequired, 0);
  assert.equal(exempt.mealRequired, false);
  assert.equal(exempt.restViolation, false);
  assert.equal(exempt.mealViolation, false);
});

test("no premium reaches the payout, and the hours still do", () => {
  const day = (salariedExempt) => analyzeDay(longDay({ salariedExempt }));
  const ordinary = [day(false)];
  const exempt = [day(true)];

  assert.ok(premiumsFromDays(ordinary).totalHours > 0, "the same day owes somebody else");
  assert.equal(premiumsFromDays(exempt).totalHours, 0);
  assert.deepEqual(premiumsFromDays(exempt).restDays, []);
  assert.deepEqual(premiumsFromDays(exempt).mealDays, []);
  assert.equal(splitPremium(exempt).rows.length, 0);
  assert.deepEqual(dayViolations(exempt[0]), []);
  // the hours are the whole point of them staying on the payout
  assert.equal(exempt[0].paidHours, ordinary[0].paidHours);
});

test("the review page asks them nothing about breaks", () => {
  const data = (salariedExempt) => ({ days: [analyzeDay(longDay({ salariedExempt }))] });
  const kinds = (salariedExempt) =>
    buildQuestions(data(salariedExempt), { restRows: [], sourceName: "Hatt, Kristy" })
      .map((q) => q.kind);
  assert.ok(kinds(false).length > 0, "the same day asks somebody else something");
  assert.deepEqual(kinds(true), [], "an exempt day asks nothing");
});

test("a stale stored day cannot resurrect the entitlement", () => {
  // a day analysed before the flag existed carries no `salariedExempt`, which
  // reads as not exempt - the old answer, and what its stored figures already
  // said. Nothing moves until the sheet is recalculated.
  const stale = { date: "09/02/26", paidHours: 9, restViolation: true, restRequired: 2, restTaken: 0, mealViolation: true, punches: [] };
  assert.equal(premiumsFromDays([stale]).totalHours > 0, true);
  // and once it IS recalculated with the flag, both go
  const now = { ...stale, salariedExempt: true, restViolation: false, mealViolation: false };
  assert.equal(premiumsFromDays([now]).totalHours, 0);
});

test("the flag survives storage and every rebuild", () => {
  // THE FAILURE THIS CATCHES: `stored.js` drops anything not on its list, so a
  // flag the engine reads and the projection forgets is one that works at
  // upload and quietly stops working on the first recompute. That exact shape
  // cost three fields once before - see the note at the top of stored.js.
  const stored = fs.readFileSync("src/lib/timesheet/stored.js", "utf8");
  assert.match(stored, /"salariedExempt",/, "it must be a REQUIRED_DAY_FIELD");
  assert.match(stored, /salariedExempt: d\.salariedExempt === true,/, "and actually written");
  const re = fs.readFileSync("src/lib/timesheet/reanalyze.js", "utf8");
  assert.match(re, /salariedExempt: d\.salariedExempt === true,/, "re-analysis must re-inject it");
});

test("an exempt person is never emailed, and never counted as ready to send", () => {
  const actions = fs.readFileSync("src/app/portal/admin/timesheets/actions.js", "utf8");
  assert.match(actions, /user: \{ salariedExempt: false \},/,
    "the send's own where clause has to exclude them, not just the screen");
  const page = fs.readFileSync("src/app/portal/admin/timesheets/[id]/page.js", "utf8");
  assert.match(page, /!r\.user\.salariedExempt/,
    "the ready count must not promise a message the send will refuse");
});

test("the exemption is resolved by account, never by name", () => {
  // matchEmployee returns { userId, method, confidence, suggestions } and no
  // user object, so reading `m.user.salariedExempt` is undefined forever - a
  // silent always-false. It is an id lookup against the staff list instead.
  const actions = fs.readFileSync("src/app/portal/admin/timesheets/actions.js", "utf8");
  assert.match(actions, /exemptIds\.has\(m\.userId\)/);
  assert.doesNotMatch(actions, /m\.user\?\.salariedExempt/);
});
