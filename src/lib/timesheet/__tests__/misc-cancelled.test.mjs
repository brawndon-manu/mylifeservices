// CLIENT CANCELLATION, the fourth Misc answer. Mánu 2026-08-17:
//
//   "client cancellation hours are unworked paid time. So it shouldn't be
//    counted for whether they are needed a premium or not. it's also counted
//    as unscheduled time. For example, if on my shift I have nine to twelve
//    service hours, then a MISC client cancellation, then two to five service
//    hours, I'm not owed anything per the unscheduled hours rule."
//
// So the block is cut out of the punched stretches and the hole it leaves
// follows the gap rule: over an hour it splits the day, an hour or under and
// the stretches rejoin. The span itself keeps soaking up its share of the
// paid hours - it is paid time - and earns nothing.
import { test } from "node:test";
import assert from "node:assert/strict";

import { workGroupsFor, entitlementFor, reentitle } from "../parse.js";
import { scheduleBlocks } from "../schedule.js";
import { patchesFor, buildQuestions } from "../questions.js";
import { reanalyzeDays } from "../reanalyze.js";

const at = (h, m = 0) => ({ min: h * 60 + m, raw: `${h}:${String(m).padStart(2, "0")}` });

// his example, typed into QSP back to back: 9-12 service, 12-2 Misc, 2-5 service
const HIS_PUNCHES = [at(9), at(12), at(12), at(14), at(14), at(17)];
const HIS_SHIFTS = [
  { text: "9a-12p Client, A-ILS Service(3:00)" },
  { text: "12p-2p -ILS Misc(2:00)" },
  { text: "2p-5p Client, A-ILS Service(3:00)" },
];

test("HIS EXAMPLE: a two hour cancellation splits the day and nothing is owed", () => {
  const blocks = scheduleBlocks(HIS_SHIFTS);
  const g = workGroupsFor(HIS_PUNCHES, blocks, { miscCancelled: true });
  const working = g.filter((x) => !x.cancelled);
  assert.equal(working.length, 2, "two stretches either side of the cancellation");
  assert.equal(g.filter((x) => x.cancelled).length, 1, "the cancelled span rides along");
  const e = entitlementFor({ workGroups: g, paidHours: 8 });
  assert.equal(e.restRequired, 0, "three paid hours a stretch owes no ten");
  assert.equal(e.mealRequired, false, "and no stretch is long enough for a meal");
});

test("the same day classified PTO still owes - the split is what cancellation adds", () => {
  const blocks = scheduleBlocks(HIS_SHIFTS);
  const g = workGroupsFor(HIS_PUNCHES, blocks, {});
  assert.equal(g.length, 1, "back-to-back punches read as one stretch");
  const e = entitlementFor({ workGroups: g, paidHours: 8 });
  assert.equal(e.restRequired, 1, "six discounted hours still owe a ten");
  assert.equal(e.mealRequired, true, "and a meal");
});

test("a cancellation of an hour or less does not split the stretches", () => {
  // same shape, 45 minute cancellation: the hole rejoins, the day keeps its meal
  const punches = [at(9), at(12), at(12), at(12, 45), at(12, 45), at(17)];
  const blocks = scheduleBlocks([
    { text: "9a-12p Client, A-ILS Service(3:00)" },
    { text: "12p-12:45p -ILS Misc(0:45)" },
    { text: "12:45p-5p Client, A-ILS Service(4:15)" },
  ]);
  const g = workGroupsFor(punches, blocks, { miscCancelled: true });
  assert.equal(g.filter((x) => !x.cancelled).length, 1, "45 minutes is not MORE than an hour");
  const e = entitlementFor({ workGroups: g, paidHours: 8 });
  assert.equal(e.mealRequired, true, "the stretch either side rejoins and still owes its meal");
});

test("a cancelled group soaks its paid share instead of inflating the others", () => {
  // 8 paid hours over 9-12, cancelled 12-2, 2-5: each working stretch counts
  // as 3.00, not 4.00 - the cancelled time is paid, so it keeps its share
  const blocks = scheduleBlocks(HIS_SHIFTS);
  const g = workGroupsFor(HIS_PUNCHES, blocks, { miscCancelled: true });
  const punched = g.reduce((n, x) => n + x.min, 0);
  assert.equal(punched, 480, "the cancelled span still counts toward the split of paid hours");
});

test("reentitle honors stored cancelled groups, so a rebuild cannot undo it", () => {
  const day = {
    paidHours: 8,
    restTaken: 0,
    mealScheduled: false,
    workGroups: [
      { start: 540, end: 720, min: 180, miscMin: 0 },
      { start: 720, end: 840, min: 120, miscMin: 0, cancelled: true },
      { start: 840, end: 1020, min: 180, miscMin: 0 },
    ],
  };
  const out = reentitle(day, 8);
  assert.equal(out.restRequired, 0);
  assert.equal(out.mealRequired, false);
  assert.equal(out.restViolation, false, "nothing owed, nothing violated");
});

test("the reviewer patch passes 'cancelled' straight through", () => {
  const patch = patchesFor({ kind: "miscTime" }, "cancelled", {});
  assert.equal(patch.miscKind, "cancelled");
  assert.equal(patch.miscWorked, false);
});

// the employee card's fourth answer sends the same value the reviewer's
// control does, so both routes have to land the same patch - and a day either
// of them has classified stops being asked about.
const miscDay = (over = {}) => ({
  date: "08/03/26", paidHours: 8, punches: [at(8, 30), at(16, 30)],
  restTaken: 0, restRequired: 0, mealRequired: false, mealScheduled: false,
  restUnknown: false, restViolation: false, mealViolation: false,
  workGroups: [{ start: 510, end: 990, min: 480, miscMin: 480 }],
  miscBlocks: [{ start: 510, end: 990, min: 480, from: "8:30a", to: "4:30p" }],
  miscMin: 480,
  ...over,
});

test("a day classified as a cancellation is never asked about its Misc again", () => {
  const qs = buildQuestions({ days: [miscDay({ miscKind: "cancelled" })] },
    { restRows: [], sourceName: "Hatt, Kristy" });
  assert.equal(qs.some((x) => x.kind === "miscTime"), false);
});

test("re-analysis reads the classification off the override", () => {
  const day = {
    date: "08/05/26",
    paidHours: 8,
    rawHours: 8,
    restTaken: 0,
    restRecorded: null,
    mealScheduled: false,
    mealsRostered: 0,
    punches: HIS_PUNCHES,
    breaks: [],
    restViolation: true,
    mealViolation: true,
    restRequired: 1,
    mealRequired: true,
  };
  const res = reanalyzeDays([day], {
    scheduleByDate: { "08/05/26": { shifts: HIS_SHIFTS } },
    restSourceAvailable: true,
    overrides: { "08/05/26": { miscKind: "cancelled", miscWorked: false } },
  });
  const d = res.days[0];
  assert.equal(d.restRequired, 0, "the cancellation reached the engine");
  assert.equal(d.mealRequired, false);
});
