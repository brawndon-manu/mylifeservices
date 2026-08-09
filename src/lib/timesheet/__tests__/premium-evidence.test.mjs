// The premium breakdown the portal renders.
//
// The figures on this page get read by somebody deciding what 59 people are
// owed, so the arithmetic has to reconcile and the groups have to stay honest
// about which kind of evidence they hold.
import { test } from "node:test";
import assert from "node:assert/strict";

import { premiumEvidence, longestGapMin } from "../premium-evidence.js";

const at = (h, m = 0) => ({ min: h * 60 + m });
// a stored day, with only the fields the breakdown reads
const day = (o) => ({
  punches: [at(8), at(17)], paidHours: 8, restRequired: 2, restViolation: false,
  mealViolation: false, mealLate: false, mealWaived: false, mealGapMin: null,
  mealGapKind: null, restSource: "rest-report", ...o,
});
const sheet = (sourceName, days) => ({ sourceName, data: { days } });

test("punch gaps are read in document order, not sorted by time", () => {
  // 8a-12p then 12:30p-5p: one 30 minute gap.
  assert.equal(longestGapMin([at(8), at(12), at(12, 30), at(17)]), 30);
  // overlapping bookings: 7:30-11 and 9-10 written as one run. Sorting these by
  // time manufactures a gap; in document order there is none.
  assert.equal(longestGapMin([at(7, 30), at(11), at(9), at(10)]), 0);
});

test("every premium lands in exactly one bucket and the totals reconcile", () => {
  const r = premiumEvidence([
    sheet("A, One", [
      day({ mealViolation: true, mealLate: true }),                        // M1
      day({ mealViolation: true }),                                        // M2
      day({ mealViolation: true, mealGapMin: 30, mealGapKind: "scheduled-transition" }), // M3
      day({ mealViolation: true, punches: [at(8), at(11), at(14), at(19)] }),           // M4, 180 min
      day({ mealWaived: true, paidHours: 6 }),                             // M5
      day({ restViolation: true, restSource: "rest-report" }),             // R1
      day({ restViolation: true, restSource: "none" }),                    // R2
    ]),
  ]);
  const n = Object.fromEntries(r.buckets.map((b) => [b.code, b.days]));
  assert.deepEqual(n, { M1: 1, M2: 1, R1: 1, R2: 1, M3: 1, M4: 1, M5: 1 });

  const { totals } = r;
  assert.equal(totals.witnessed, 3, "M1 + M2 + R1");
  assert.equal(totals.ruled, 1, "R2");
  assert.equal(totals.open, 2, "M3 + M4");
  assert.equal(totals.cleared, 1, "M5");
  assert.equal(totals.owed, 6, "everything except the waived day");
  assert.equal(totals.settled, 4, "witnessed plus ruled");
  assert.equal(totals.gross, 7);
  assert.equal(totals.owed + totals.cleared, totals.gross);
  assert.equal(totals.witnessed + totals.ruled + totals.open, totals.owed);
});

test("a waived day is cleared and never also charged", () => {
  // mealWaived wins over mealViolation, which the engine already keeps false on
  // a waived day. belt and braces: a day carrying both must not pay twice.
  const r = premiumEvidence([sheet("A, One", [day({ mealWaived: true, mealViolation: true })])]);
  const n = Object.fromEntries(r.buckets.map((b) => [b.code, b.days]));
  assert.equal(n.M5, 1);
  assert.equal(n.M1 + n.M2 + n.M3 + n.M4, 0);
  assert.equal(r.totals.owed, 0);
});

test("the ruled group is kept apart from the witnessed ones", () => {
  // R2 is owed because somebody decided silence means none taken. That is not
  // the same claim as a document saying so, and folding them together would
  // overstate what the paperwork actually supports.
  const r = premiumEvidence([
    sheet("A, One", [day({ restViolation: true, restSource: "none" })]),
    sheet("B, Two", [day({ restViolation: true, restSource: "rest-report" })]),
  ]);
  assert.equal(r.buckets.find((b) => b.code === "R2").group, "ruled");
  assert.equal(r.buckets.find((b) => b.code === "R1").group, "witnessed");
  assert.equal(r.totals.witnessed, 1);
  assert.equal(r.totals.ruled, 1);
});

test("a whole period with no break punched is flagged, and it is not a wage figure", () => {
  const r = premiumEvidence([
    // 2 days, both owing a rest, no break punched on either
    sheet("Never, Punched", [
      day({ restRequired: 2, restViolation: true, restSource: "none" }),
      day({ restRequired: 2, restViolation: true, restSource: "none" }),
    ]),
    // punched a break, so not a setup problem
    sheet("Did, Punch", [
      day({ punches: [at(8), at(12), at(12, 10), at(17)], restRequired: 2, restViolation: true }),
    ]),
    // never punched one, but never owed one either
    sheet("Short, Days", [day({ paidHours: 2, restRequired: 0 })]),
  ]);
  assert.deepEqual(r.neverPunched.map((x) => x.name), ["Never, Punched"]);
  assert.equal(r.neverPunched[0].owed, 2);
  // and it changes nothing about what is owed
  assert.equal(r.totals.owed, 3);
});

test("an empty batch does not invent a bucket", () => {
  const r = premiumEvidence([]);
  assert.equal(r.totals.gross, 0);
  assert.equal(r.neverPunched.length, 0);
  assert.equal(r.buckets.length, 7, "the groups still exist, they are just empty");
});
