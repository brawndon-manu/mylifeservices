// THE DSN REST-BREAK ATTESTATION (2026-09-08).
//
// Days it covers charge no rest premium, ask no rest-only question, and put no
// rest anomaly row on the checks screen - staff no longer document their tens,
// the attestation riding with the DSN says they were taken. Days before the
// effective date keep every old rule, so an August re-upload still charges
// August honestly. The rule and the date live in rest-attestation.js; these
// pins hold the gate at each of its choke points.
import test from "node:test";
import assert from "node:assert/strict";

import { restAttested, REST_ATTESTATION_EFFECTIVE } from "../rest-attestation.js";
import { analyzeDay, reentitle } from "../parse.js";
import { buildQuestions } from "../questions.js";
import { splitPremium, applyAssumptions, premiumsFromDays } from "../premium-split.js";
import { dayViolations } from "../violations.js";
import { recomputeSheet } from "../corrections.js";
import { applyOvertime } from "../parse.js";

const at = (h, m = 0) => ({ min: h * 60 + m });

test("restAttested turns on at the effective date and not before", () => {
  assert.equal(REST_ATTESTATION_EFFECTIVE, "09/01/26");
  assert.equal(restAttested("08/31/26"), false);
  assert.equal(restAttested("09/01/26"), true);
  assert.equal(restAttested("09/02/26"), true);
  assert.equal(restAttested("12/31/27"), true);
  // an unreadable date is NOT covered - old rules are the careful default
  assert.equal(restAttested(null), false);
  assert.equal(restAttested(""), false);
  assert.equal(restAttested("2026-09-02"), false);
});

test("analyzeDay: an attested day keeps its entitlement and drops the violation", () => {
  // 8:00a-4:30p, report says zero rests - the classic two-rests-owed day
  const punches = [at(8), at(16, 30)];
  const before = analyzeDay({ date: "08/28/26", punches, printed: null, restRecorded: 0 });
  assert.equal(before.restViolation, true, "pre-attestation day still charges");
  assert.equal(before.restRequired, 2);

  const after = analyzeDay({ date: "09/02/26", punches, printed: null, restRecorded: 0 });
  assert.equal(after.restViolation, false, "attested day charges nothing");
  // the entitlement is a fact about the hours and stays truthful
  assert.equal(after.restRequired, 2);
  assert.equal(after.restTaken, 0);
});

test("reentitle carries the same gate, so an answer's recompute cannot revive the premium", () => {
  const stored = { restUnknown: false, restTaken: 0, workGroups: null };
  const before = reentitle({ ...stored, date: "08/28/26" }, 8);
  assert.equal(before.restViolation, true);
  assert.equal(before.restRequired, 2);

  const after = reentitle({ ...stored, date: "09/02/26" }, 8);
  assert.equal(after.restViolation, false);
  assert.equal(after.restRequired, 2);
});

test("a stale stored restViolation on an attested day moves no money and lists nowhere", () => {
  // The September payroll batch was analysed before the attestation shipped
  // and carries restViolation: true on days the attestation covers. Every
  // stored-flag consumer asks the date rule itself rather than trusting the
  // flag, so a stale batch pays and lists exactly what a re-analysed one would.
  const stale = (date) => ({
    date, paidHours: 8, restViolation: true, restTaken: 0, restRequired: 2,
    mealViolation: false, punches: [],
  });
  const before = stale("08/28/26");
  const after = stale("09/02/26");

  assert.equal(splitPremium([before]).rows.filter((r) => r.kind === "rest").length, 1);
  assert.equal(splitPremium([after]).rows.filter((r) => r.kind === "rest").length, 0);

  assert.deepEqual(premiumsFromDays([before]).restDays, ["08/28/26"]);
  assert.deepEqual(premiumsFromDays([after]).restDays, []);
  assert.equal(premiumsFromDays([after]).restHours, 0);

  assert.equal(dayViolations(before).some((v) => v.kind === "rest-not-taken"), true);
  assert.equal(dayViolations(after).some((v) => v.kind === "rest-not-taken"), false);

  // and the projection stamps no "assumed" note on a day that owes nothing
  const projected = applyAssumptions([after], { confirmed: new Set(), answers: {}, pastDue: true });
  assert.equal(projected[0].premiumNote?.rest ?? null, null);

  // recomputeSheet's own premium sum is the money on every rebuild, and it
  // must ask the date too - a day reanalyzeDays cannot rebuild keeps its
  // stale flag forever, and this is what kept 10 rest hours alive on the
  // September batch's first rerun.
  const full = (d) => ({ ...d, rawHours: 8, regularHours: 8, otHours: 0, doubleHours: 0, addedHours: 0 });
  const period = { from: "08/16/26", to: "09/15/26" };
  const beforeSheet = recomputeSheet({ days: [full(before)], payPeriod: period, overrides: null }, applyOvertime, null);
  assert.deepEqual(beforeSheet.premiums.restDays, ["08/28/26"]);
  const afterSheet = recomputeSheet({ days: [full(after)], payPeriod: period, overrides: null }, applyOvertime, null);
  assert.deepEqual(afterSheet.premiums.restDays, []);
});

// The question builders. One malformed-rest fixture, run on either side of the
// date: the rest-only kinds exist before and vanish after, while the one ask
// that moves the MEAL premium keeps firing on both sides.
const NAME = "Uribe, Brandon";

const restOnlyData = (date) => ({
  days: [{
    date,
    paidHours: 8,
    punches: [at(8), at(16, 30)],
    restTaken: 0,
    restRequired: 2,
    restViolation: false,
    mealViolation: false,
    restsFromShortMeals: 1,
  }],
});

const restOnlyRows = (date) => [
  // one mis-picked field would explain it -> `repair`
  {
    name: NAME, date, out: "3:50 PM", in: "3:00 PM", counted: true, minutes: 50,
    repair: { field: "in", from: "3:00 PM", to: "4:00 PM", minutes: 10, why: "the IN hour was rolled back an hour" },
  },
  // neither end recorded -> `restNoTimes`
  { name: NAME, date, out: "", in: "", counted: true, minutes: null, repair: null },
  // an hour long, off the clock, meal accounted for -> `restTooLongOffClock`
  { name: NAME, date, out: "5:00 PM", in: "6:00 PM", counted: false, minutes: 60, repair: null },
  // a clean ten logged before clock-in -> `restOutsideScheduled`
  { name: NAME, date, out: "7:00 AM", in: "7:10 AM", counted: true, minutes: 10, repair: null },
];

const REST_ONLY_KINDS = [
  "repair", "restNoTimes", "restTooLongOffClock", "restOutsideScheduled", "shortMealRest",
];

test("buildQuestions: the rest-only asks fire on a pre-attestation day", () => {
  const date = "08/20/26";
  const kinds = buildQuestions(restOnlyData(date), {
    restRows: restOnlyRows(date), sourceName: NAME,
  }).map((q) => q.kind);
  for (const k of REST_ONLY_KINDS) {
    assert.ok(kinds.includes(k), `${k} should be asked before the attestation (got ${kinds.join(", ")})`);
  }
});

test("buildQuestions: an attested day asks none of them", () => {
  const date = "09/02/26";
  const kinds = buildQuestions(restOnlyData(date), {
    restRows: restOnlyRows(date), sourceName: NAME,
  }).map((q) => q.kind);
  for (const k of REST_ONLY_KINDS) {
    assert.ok(!kinds.includes(k), `${k} must not be asked on an attested day (got ${kinds.join(", ")})`);
  }
});

test("buildQuestions: restIsMealLength still asks on an attested day - it moves the meal premium", () => {
  const mealData = (date) => ({
    days: [{
      date,
      paidHours: 8,
      punches: [at(8), at(16, 30)],
      restTaken: 1,
      restRequired: 2,
      mealMissing: true,
      mealViolation: true,
    }],
  });
  const mealRows = (date) => [
    { name: NAME, date, out: "2:00 PM", in: "2:30 PM", counted: false, minutes: 30, repair: null },
  ];
  for (const date of ["08/20/26", "09/02/26"]) {
    const kinds = buildQuestions(mealData(date), {
      restRows: mealRows(date), sourceName: NAME,
    }).map((q) => q.kind);
    assert.ok(
      kinds.includes("restIsMealLength"),
      `restIsMealLength should survive on ${date} (got ${kinds.join(", ")})`,
    );
  }
});
