import test from "node:test";
import assert from "node:assert/strict";
import { recomputeSheet } from "../corrections.js";
import { applyOvertime, reentitle } from "../parse.js";
import { splitPremium, splitPremiumForSheets, batchPremiumStanding } from "../premium-split.js";
import { answerActorId, actorKindFor } from "../answer-actor.js";

// THE TWO PREMIUM CARDS, END TO END. Mánu 2026-08-17: an employee answering
// "I took it" was dropping projected premium with no admin involved. Now the
// ORIGINAL figure stands whatever they answer - the number if nobody signs -
// and the LIVE figure moves as sign-offs land, which is the one payroll pays.
// Only a reviewer-recorded answer settles an hour on both without a signature.
//
// The mechanism is three small pieces and each is tested here: the answer
// records who actually gave it (answer-actor), the reband marks whose answer
// took a premium off a day (recomputeSheet), and the counters read the
// markers (splitPremium and the payroll aggregation in batchPremiumStanding).

// ---------------------------------------------------------------------------
// who answered

test("a reviewer driving somebody else's sheet is recorded as themselves", () => {
  const viewer = { id: "admin-1", role: "SUPER" };
  assert.equal(answerActorId(viewer, true, "emp-1"), "admin-1");
});

test("no session means the employee answered", () => {
  assert.equal(answerActorId(null, false, "emp-1"), "emp-1");
});

test("an employee signed into the portal on their own sheet is still the employee", () => {
  const viewer = { id: "emp-1", role: "EMPLOYEE" };
  assert.equal(answerActorId(viewer, false, "emp-1"), "emp-1");
});

test("a manager answering their OWN sheet is the employee, not a reviewer", () => {
  const viewer = { id: "mgr-1", role: "SUPER" };
  assert.equal(answerActorId(viewer, true, "mgr-1"), "mgr-1");
  assert.equal(actorKindFor("mgr-1", "mgr-1", new Set(["mgr-1"])), "employee");
});

test("a reviewer on an unmatched sheet is recorded as themselves", () => {
  const viewer = { id: "admin-1", role: "SUPER" };
  assert.equal(answerActorId(viewer, true, null), "admin-1");
  assert.equal(actorKindFor("admin-1", null, new Set(["admin-1"])), "admin");
});

test("rows from before provenance existed read as the employee", () => {
  const reviewers = new Set(["admin-1"]);
  assert.equal(actorKindFor("emp-1", "emp-1", reviewers), "employee");
  assert.equal(actorKindFor(null, "emp-1", reviewers), "employee");
  assert.equal(actorKindFor(null, null, reviewers), "employee");
});

test("re-matching a sheet does not turn old answers into a reviewer's", () => {
  // the sheet used to belong to old-emp, whose answers stored their id. After
  // a re-match the sheet's userId is new-emp - the old rows differ from it,
  // but old-emp reviews nothing, so their hours must not settle themselves.
  const reviewers = new Set(["admin-1"]);
  assert.equal(actorKindFor("old-emp", "new-emp", reviewers), "employee");
  // and an actual reviewer's row still reads as one
  assert.equal(actorKindFor("admin-1", "new-emp", reviewers), "admin");
});

// ---------------------------------------------------------------------------
// the reband markers

// the same 6.17 day the per-date tests use: owes a meal and a second ten
const day = (date, extra = {}) => ({
  date,
  paidHours: 6.17,
  restTaken: 1,
  restRequired: 2,
  mealScheduled: false,
  mealsRostered: 0,
  restViolation: true,
  mealRequired: true,
  mealWaived: false,
  mealViolation: true,
  punches: [{ min: 8 * 60 }, { min: 14 * 60 }],
  breaks: [],
  rawHours: 6,
  regularHours: 6.17,
  otHours: 0,
  doubleHours: 0,
  ...extra,
});

const rebuild = (days, overrides) =>
  recomputeSheet({ days, payPeriod: null, overrides }, applyOvertime, reentitle);

test("an employee's 'I took it' marks the dropped rest as theirs", () => {
  const out = rebuild([day("07/28/26")], {
    "07/28/26": { restViolation: false, _restAnsweredBy: "employee" },
  });
  const d = out.days[0];
  assert.equal(d.restViolation, false, "the answer holds the flag off");
  assert.equal(d.restDroppedBy, "employee");
  assert.equal(d.mealDroppedBy, null, "the meal was not answered and keeps its premium");
  assert.equal(d.mealViolation, true);
});

test("a reviewer's answer marks the drop as admin", () => {
  const out = rebuild([day("07/28/26")], {
    "07/28/26": { restViolation: false, _restAnsweredBy: "admin" },
  });
  assert.equal(out.days[0].restDroppedBy, "admin");
});

test("an override with no provenance reads as the employee", () => {
  // Adams 07/28 is exactly this row: answered before provenance existed.
  // The hour must stay visible, never settle itself.
  const out = rebuild([day("07/28/26")], {
    "07/28/26": { restViolation: false },
  });
  assert.equal(out.days[0].restDroppedBy, "employee");
});

test("no marker lands on a day that never owed the hour", () => {
  const clean = day("07/28/26", { restViolation: false, restTaken: 2 });
  const out = rebuild([clean], {
    "07/28/26": { restViolation: false, _restAnsweredBy: "employee" },
  });
  assert.equal(out.days[0].restDroppedBy, null);
});

test("a classification's re-derivation drop is marked as the reviewer's", () => {
  // a misc classification lowers the entitlement and the flag falls out of
  // reentitle by itself - no restViolation in the patch. The _source names it
  // a reviewer's act, so the hour settles at once.
  const out = rebuild([day("07/28/26")], {
    "07/28/26": { restTaken: 2, _source: "misc-classify" },
  });
  const d = out.days[0];
  assert.equal(d.restViolation, false, "two tens cover the requirement");
  assert.equal(d.restDroppedBy, "admin");
});

test("an unattributed re-derivation drop reads as the employee", () => {
  // same drop, nobody's name on it - the conservative reading holds the hour
  const out = rebuild([day("07/28/26")], {
    "07/28/26": { restTaken: 2 },
  });
  assert.equal(out.days[0].restDroppedBy, "employee");
});

test("a paid-hours answer that cascades premiums away is still marked", () => {
  // "that ten was inside my shift": 6.17 becomes 6.00, the meal waiver comes
  // back and the second rest stops being owed - no violation key anywhere in
  // the patch, both premiums gone through reentitle alone. This was the leak:
  // without the date-level stamp these hours settled on the employee's own
  // answer.
  const out = rebuild([day("07/28/26")], {
    "07/28/26": { paidHours: 6.0, addedHours: 0, restsOffClock: 0, restsOffClockMin: 0, _answeredBy: "employee" },
  });
  const d = out.days[0];
  assert.equal(d.mealViolation, false, "the waiver is back at 6.00");
  assert.equal(d.restViolation, false, "one ten owed and one taken");
  assert.equal(d.mealDroppedBy, "employee");
  assert.equal(d.restDroppedBy, "employee");
  const split = splitPremium(d ? [d] : [], {});
  assert.equal(split.pendingSignoff, 2, "both hours wait on the signature");
  assert.equal(split.originalProjected, 2);
});

test("a declined late lunch marks the dropped meal premium", () => {
  // "no, I went on time" - the punch is what is wrong, so the premium the
  // late lunch carried comes off, and it is the employee saying so
  const lateLunch = day("07/28/26", {
    paidHours: 6.0,
    mealScheduled: true,
    mealInsideBooking: false,
    mealsRostered: 1,
    mealLate: true,
    mealViolation: true,
    restViolation: false,
    restTaken: 2,
  });
  const out = rebuild([lateLunch], {
    "07/28/26": { mealViolation: false, mealLate: false, _mealAnsweredBy: "employee" },
  });
  const d = out.days[0];
  assert.equal(d.mealViolation, false);
  assert.equal(d.mealLate, false);
  assert.equal(d.mealDroppedBy, "employee");
});

test("the markers vanish when the answer is taken back", () => {
  const first = rebuild([day("07/28/26")], {
    "07/28/26": { restViolation: false, _restAnsweredBy: "employee" },
  });
  assert.equal(first.days[0].restDroppedBy, "employee");
  // overrides rebuilt from scratch with the answer gone - the day owes again
  const second = rebuild([day("07/28/26")], {});
  assert.equal(second.days[0].restViolation, true);
  assert.equal(second.days[0].restDroppedBy ?? null, null);
});

// ---------------------------------------------------------------------------
// the two cards

test("an employee's answered hour stays in both figures while unsigned", () => {
  const days = [
    { date: "07/28/26", restViolation: false, restDroppedBy: "employee" },
    { date: "07/29/26", restViolation: true },
  ];
  const split = splitPremium(days, {});
  assert.equal(split.projected, 1, "the sheet itself charges one hour");
  assert.equal(split.pendingSignoff, 1, "the answered hour is pending, not gone");
  assert.equal(split.originalProjected, 2, "the original holds both");
  assert.equal(split.liveProjected, 2, "and so does the live one until they sign");
});

test("a signature moves the live figure and leaves the original alone", () => {
  const days = [{ date: "07/28/26", restViolation: false, restDroppedBy: "employee" }];
  const split = splitPremium(days, { signed: true });
  assert.equal(split.pendingSignoff, 0);
  assert.equal(split.liveProjected, split.projected, "their answer is real now");
  assert.equal(split.originalProjected, 1, "the original still shows what stood before sign-offs");
});

test("a reviewer-recorded answer settles both figures on its own", () => {
  const days = [{ date: "07/28/26", restViolation: false, restDroppedBy: "admin" }];
  const split = splitPremium(days, {});
  assert.equal(split.pendingSignoff, 0);
  assert.equal(split.originalProjected, split.projected);
  assert.equal(split.liveProjected, split.projected);
});

test("a day still owed is never double counted", () => {
  // the guard, not an expected state: a marker beside a standing violation
  const days = [{ date: "07/28/26", restViolation: true, restDroppedBy: "employee" }];
  const split = splitPremium(days, {});
  assert.equal(split.projected, 1);
  assert.equal(split.pendingSignoff, 0);
  assert.equal(split.originalProjected, 1);
  assert.equal(split.liveProjected, 1);
});

test("both premiums on one day can be pending together", () => {
  const days = [{
    date: "07/28/26",
    mealViolation: false, mealDroppedBy: "employee",
    restViolation: false, restDroppedBy: "employee",
  }];
  const split = splitPremium(days, {});
  assert.equal(split.pendingSignoff, 2);
});

test("across a batch, sign-offs move the live figure sheet by sheet", () => {
  const sheets = [
    // answered "I took it" and has not signed - the Adams shape
    {
      id: "a",
      signedAt: null,
      data: { days: [{ date: "07/28/26", restViolation: false, restDroppedBy: "employee" }] },
    },
    // answered the same and SIGNED - their hour is genuinely off the live figure
    {
      id: "b",
      signedAt: new Date("2026-08-18"),
      data: { days: [{ date: "07/28/26", restViolation: false, restDroppedBy: "employee" }, { date: "07/30/26", mealViolation: true }] },
    },
  ];
  const r = splitPremiumForSheets(sheets, {});
  assert.equal(r.projected, 1, "the documents charge one hour between them");
  assert.equal(r.originalProjected, 3, "the original counts every answered hour back in");
  assert.equal(r.liveProjected, 2, "the live one keeps only the unsigned answer");
  assert.equal(r.pendingSignoff, 1);
});

// ---------------------------------------------------------------------------
// what payroll pays

test("the payroll aggregation pays the live figure, per person and in total", () => {
  const day = (extra) => ({
    date: "07/28/26", paidHours: 6, punches: [], breaks: [], ...extra,
  });
  const sheets = [
    {
      id: "a", sourceName: "A", signedAt: null,
      data: { days: [day({ restViolation: false, restDroppedBy: "employee" })] },
      corrections: [],
    },
    {
      id: "b", sourceName: "B", signedAt: new Date("2026-08-18"),
      data: { days: [day({ restViolation: false, restDroppedBy: "employee" })] },
      corrections: [],
    },
  ];
  const st = batchPremiumStanding(sheets, { restRows: [] });
  assert.equal(st.byId.a.charged, 1, "unsigned: the answered hour is still paid");
  assert.equal(st.byId.b.charged, 0, "signed: their answer is real and the hour is off");
  assert.equal(st.charged, 1, "the total payroll pays is the live sum");
  assert.equal(st.original, 2, "the original reference is carried beside it");
});
