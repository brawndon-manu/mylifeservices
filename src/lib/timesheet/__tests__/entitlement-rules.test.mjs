// TWO RULES ABOUT WHAT A DAY IS OWED, from Mánu 2026-08-12.
//
// 1. A gap over an hour ends the stretch the entitlement is counted over. Eight
//    hours on the clock can owe nothing, because nobody worked a stretch long
//    enough to earn a break.
// 2. Time rostered as Misc, over ten minutes, is not time worked. It is usually
//    PTO or sick pay. Under ten minutes it counts - that shape is a ten somebody
//    could not fit inside their service hours.
//
// Both defaults are DON'T CHARGE, which is the reverse of every other rule here,
// and the reason the employee gets asked and the reviewer can answer first.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  workGroupsFor, entitlementFor, restsRequired, restsTakenFrom, analyzeDay,
  GAP_SPLITS_ENTITLEMENT_MIN, MISC_COUNTS_UP_TO_MIN,
} from "../parse.js";
import { scheduleBlocks, isMiscService } from "../schedule.js";
import { buildQuestions, patchesFor } from "../questions.js";
import { applyOverrides } from "../corrections.js";

const at = (h, m = 0) => ({ min: h * 60 + m, raw: `${h}:${String(m).padStart(2, "0")}` });
const groups = (punches, blocks, opts) => workGroupsFor(punches, blocks, opts);

// ---------------------------------------------------------------- rule 2, gaps

test("HIS EXAMPLE: 9a-12, 1:10p-4:10p, 6p-8p owes no rests and no meal", () => {
  const punches = [at(9), at(12), at(13, 10), at(16, 10), at(18), at(20)];
  const g = groups(punches, []);
  assert.equal(g.length, 3, "two gaps over an hour make three stretches");
  const e = entitlementFor({ workGroups: g, paidHours: 8 });
  assert.equal(e.restRequired, 0);
  assert.equal(e.mealRequired, false);
});

test("without the rule those same eight hours would owe two rests and a meal", () => {
  // the old arithmetic, kept here so the change is visible rather than asserted
  assert.equal(restsRequired(8), 2);
  const e = entitlementFor({ workGroups: [], paidHours: 8 });
  assert.equal(e.restRequired, 2);
  assert.equal(e.mealRequired, true);
});

test("a gap of exactly an hour does NOT split, more than an hour does", () => {
  const exactly = groups([at(9), at(12), at(13), at(16)], []);
  assert.equal(exactly.length, 1, "60 minutes is not MORE than 60");
  const over = groups([at(9), at(12), at(13, 1), at(16)], []);
  assert.equal(over.length, 2);
  assert.equal(GAP_SPLITS_ENTITLEMENT_MIN, 60);
});

test("a normal lunch does not split the day", () => {
  const g = groups([at(8), at(12), at(12, 30), at(17)], []);
  assert.equal(g.length, 1);
  const e = entitlementFor({ workGroups: g, paidHours: 8.5 });
  assert.equal(e.restRequired, 2);
  assert.equal(e.mealRequired, true);
});

test("one long stretch either side of a big gap can still each owe their own", () => {
  // 6 hours, gap of two, 6 hours. Each stretch earns a meal and a rest of its own.
  const g = groups([at(6), at(12), at(14), at(20)], []);
  assert.equal(g.length, 2);
  const e = entitlementFor({ workGroups: g, paidHours: 12 });
  assert.equal(e.restRequired, 2, "one per stretch");
  assert.equal(e.mealRequired, true);
});

// --------------------------------------------------------------- rule 1, Misc

test("isMiscService reads what serviceOf returns", () => {
  assert.equal(isMiscService("ILS Misc"), true);
  assert.equal(isMiscService("Misc"), true);
  assert.equal(isMiscService("ILS Service"), false);
  assert.equal(isMiscService("ILS Travel"), false);
  assert.equal(isMiscService(null), false);
});

test("scheduleBlocks now carries the service and marks Misc", () => {
  const b = scheduleBlocks([
    { text: "8:30a-4:30p -ILS Misc(8:00)" },
    { text: "10:30a-2:06p Duff, E-ILS Service (3:36)" },
  ]);
  assert.equal(b[0].misc, true);
  assert.equal(b[1].misc, false);
  assert.equal(b[1].service, "ILS Service");
});

test("ARANDA'S SHAPE: a whole day rostered Misc owes nothing", () => {
  const punches = [at(8, 30), at(16, 30)];
  const blocks = scheduleBlocks([{ text: "8:30a-4:30p -ILS Misc(8:00)" }]);
  const g = groups(punches, blocks);
  assert.equal(g[0].miscMin, 480, "the whole stretch is discounted");
  const e = entitlementFor({ workGroups: g, paidHours: 8 });
  assert.equal(e.restRequired, 0);
  assert.equal(e.mealRequired, false);
});

test("Misc of ten minutes or less still counts, because that shape is a rest", () => {
  const punches = [at(9), at(17)];
  const blocks = scheduleBlocks([{ text: "12p-12:10p -ILS Misc(0:10)" }]);
  const g = groups(punches, blocks);
  assert.equal(g[0].miscMin, 0, "ten minutes is not OVER ten minutes");
  assert.equal(MISC_COUNTS_UP_TO_MIN, 10);
  const e = entitlementFor({ workGroups: g, paidHours: 8 });
  assert.equal(e.restRequired, 2, "the day is unchanged by it");
});

test("Misc takes only its own share off, not the whole day", () => {
  // 9 hours worked, 3 of them Misc, so 6 count. Six hours owes one rest and a meal.
  const punches = [at(8), at(17)];
  const blocks = scheduleBlocks([{ text: "2p-5p -ILS Misc(3:00)" }]);
  const g = groups(punches, blocks);
  assert.equal(g[0].miscMin, 180);
  const e = entitlementFor({ workGroups: g, paidHours: 9 });
  assert.equal(e.restRequired, 1);
  assert.equal(e.mealRequired, true, "six hours still earns a meal");
});

test("once somebody says the Misc time was work, it counts again", () => {
  const punches = [at(8, 30), at(16, 30)];
  const blocks = scheduleBlocks([{ text: "8:30a-4:30p -ILS Misc(8:00)" }]);
  const g = groups(punches, blocks, { miscWorked: true });
  assert.equal(g[0].miscMin, 0);
  const e = entitlementFor({ workGroups: g, paidHours: 8 });
  assert.equal(e.restRequired, 2);
  assert.equal(e.mealRequired, true);
});

// ------------------------------------------------- the paid hours are the basis

test("the groups set the boundaries, the day's PAID hours are what is shared out", () => {
  // Mánu's real 07/28: 6.50 paid over 6.00 punched. Summing punch spans instead
  // of sharing out paid hours dropped a rest on a day nothing had changed about.
  const punches = [at(10), at(12), at(12, 15), at(14, 15), at(14, 30), at(16, 30)];
  const g = groups(punches, []);
  assert.equal(g.length, 1, "fifteen minute gaps do not split anything");
  const e = entitlementFor({ workGroups: g, paidHours: 6.5 });
  assert.equal(e.restRequired, restsRequired(6.5), "identical to the old rule");
});

test("a day with no punch pairs falls back to paid hours rather than zeroing", () => {
  const e = entitlementFor({ workGroups: [], paidHours: 8 });
  assert.equal(e.restRequired, 2);
  assert.equal(e.mealRequired, true);
});

test("a stored day from before these rules has no groups and is unaffected", () => {
  const e = entitlementFor({ workGroups: null, paidHours: 10 });
  assert.equal(e.restRequired, restsRequired(10));
  assert.equal(e.mealRequired, true);
});

test("reversed punch pairs are skipped rather than counted as negative time", () => {
  const g = groups([at(12, 10), at(12)], []);
  assert.equal(g.length, 0);
});

// -------------------------------------------------- the ten minute Misc break

// MÁNU'S OWN 07/30, which is the case done right: "12p-12:10p -ILS Misc(0:10)"
// on the schedule, punched, AND a Rest Periods Report row of 12:00 to 12:10 PM
// filed against it. That is what should read "Misc Break" on the calendar.
const MISC_TEN = { text: "12p-12:10p -ILS Misc(0:10)" };

test("a ten minute Misc block is not discounted like a long one", () => {
  const b = scheduleBlocks([MISC_TEN]);
  assert.equal(b[0].misc, true);
  const g = groups([at(10), at(16)], b);
  assert.equal(g[0].miscMin, 0, "ten minutes or less still counts as worked");
});

test("a Misc ten WITH a rest row filed for it is already counted, not counted twice", () => {
  // his 07/30: the report carries 12:00-12:10, so `recorded` already holds it.
  // Crediting it again here would clear a rest he never took.
  const covered = restsTakenFrom(1, 0, 0, 0);
  assert.equal(covered, 1, "one rest, from the report, and nothing added on top");
});

test("a Misc ten with NO rest row is still credited, so no premium appears", () => {
  // Urena 07/23 1p-1:10p is the real one. The break happened; the row is missing.
  const uncovered = restsTakenFrom(0, 0, 0, 1);
  assert.equal(uncovered, 1, "credited as the ten it was");
});

test("restsTakenFrom keeps its old answer for every caller that does not pass the fourth", () => {
  assert.equal(restsTakenFrom(2, 1, 1), restsTakenFrom(2, 1, 1, 0));
  assert.equal(restsTakenFrom(2, 1, 1), 2);
});

// ------------------------------------------------------------- the question

const miscDay = (over = {}) => ({
  date: "08/03/26", paidHours: 8, punches: [at(8, 30), at(16, 30)],
  restTaken: 0, restRequired: 0, mealRequired: false, mealScheduled: false,
  restUnknown: false, restViolation: false, mealViolation: false,
  workGroups: [{ start: 510, end: 990, min: 480, miscMin: 480 }],
  miscBlocks: [{ start: 510, end: 990, min: 480, from: "8:30a", to: "4:30p" }],
  miscMin: 480,
  ...over,
});

test("a day with discounted Misc time gets asked about it", () => {
  const qs = buildQuestions({ days: [miscDay()] }, { restRows: [], sourceName: "Aranda, Jennifer" });
  const q = qs.find((x) => x.kind === "miscTime");
  assert.ok(q, "the question is raised");
  assert.equal(q.date, "08/03/26");
  assert.equal(q.row.hours, 8);
  assert.deepEqual(q.row.blocks[0], { from: "8:30a", to: "4:30p", minutes: 480 });
  // the only question here that can ADD a premium rather than clear one
  assert.equal(q.moves, 1);
});

test("a reviewer classifying it first means the employee is never asked", () => {
  const qs = buildQuestions({ days: [miscDay({ miscKind: "pto" })] },
    { restRows: [], sourceName: "Aranda, Jennifer" });
  assert.equal(qs.some((x) => x.kind === "miscTime"), false);
});

test("a day with no Misc block is not asked", () => {
  const qs = buildQuestions({ days: [miscDay({ miscBlocks: [], miscMin: 0 })] },
    { restRows: [], sourceName: "Aranda, Jennifer" });
  assert.equal(qs.some((x) => x.kind === "miscTime"), false);
});

test("PTO and sick pay are recorded and move no figure", () => {
  for (const c of ["pto", "sick"]) {
    const p = patchesFor({ kind: "miscTime" }, c, miscDay());
    assert.equal(p.miscKind, c);
    assert.equal(p.miscWorked, false);
    assert.equal(p.restRequired, undefined, "entitlement is untouched");
    assert.equal(p.mealViolation, undefined);
  }
});

// THE CARD'S OWN THREE. It can show `yes`, `no` and one `third`, so the answers
// arrive under those names and are translated here. The reviewer, who has no
// card, writes the kind straight through - both spellings have to land the same.
test("the card's yes and no map onto PTO and sick pay", () => {
  assert.equal(patchesFor({ kind: "miscTime" }, "yes", miscDay()).miscKind, "pto");
  assert.equal(patchesFor({ kind: "miscTime" }, "no", miscDay()).miscKind, "sick");
  assert.equal(patchesFor({ kind: "miscTime" }, "yes", miscDay()).miscWorked, false);
  assert.equal(patchesFor({ kind: "miscTime" }, "no", miscDay()).miscWorked, false);
});

test("the card route and the reviewer route reach the same patch", () => {
  assert.deepEqual(
    patchesFor({ kind: "miscTime" }, "yes", miscDay()),
    patchesFor({ kind: "miscTime" }, "pto", miscDay()),
  );
});

test("HOURS WORKED records the flag and leaves the arithmetic to the engine", () => {
  // THIS PATCH USED TO CARRY THE ENTITLEMENT. It stopped on 2026-08-12, when
  // `rebuildSheetFor` started re-running `analyzeDay`: computing it here was
  // then both redundant and cruder than the thing it pre-empted, because this
  // function cannot see `scheduleBlocks` and its meal test ignored the waiver.
  // It disagreed with the engine on 3 of the 33 real Misc days.
  const p = patchesFor({ kind: "miscTime" }, "worked", miscDay());
  assert.equal(p.miscWorked, true);
  assert.equal(p.miscKind, "worked");
  assert.deepEqual(Object.keys(p).sort(), ["miscKind", "miscWorked"]);
});

test("the engine, not the patch, decides what worked Misc time costs", () => {
  // the same eight hour day, re-analysed the way a rebuild does it: one stretch
  // of real work owes two rests and a meal
  const day = miscDay();
  const blocks = scheduleBlocks([{ text: "8:30a-4:30p -ILS Misc(8:00)", meal: false }]);
  const a = analyzeDay({ ...day, miscWorked: true, scheduleBlocks: blocks, restsAlreadyPaid: true });
  assert.equal(a.restRequired, 2);
  assert.equal(a.mealRequired, true);
  // and with the flag off it owes nothing, which is the rule the answer exists
  // to overturn
  const b = analyzeDay({ ...day, scheduleBlocks: blocks, restsAlreadyPaid: true });
  assert.equal(b.restRequired, 0);
  assert.equal(b.mealRequired, false);
});

// THE TRAP. `applyOverrides` copies a WHITELIST, and a field left off it is
// ignored in silence - that is fault #6 from 2026-08-11, where a corrected total
// sat next to a note still claiming 0.17 added. Anything patchesFor writes for
// this kind has to survive the trip, so this asserts the round trip rather than
// trusting that somebody remembered.
test("every field this answer writes survives applyOverrides", () => {
  const day = miscDay();
  const patch = patchesFor({ kind: "miscTime" }, "worked", day);
  const [out] = applyOverrides([day], { [day.date]: patch });
  for (const [k, v] of Object.entries(patch)) {
    assert.deepEqual(out[k], v, `${k} was dropped by the whitelist in applyOverrides`);
  }
  assert.equal(out.corrected, true);
});

test("a declined answer survives the trip too", () => {
  const day = miscDay();
  const patch = patchesFor({ kind: "miscTime" }, "pto", day);
  const [out] = applyOverrides([day], { [day.date]: patch });
  assert.equal(out.miscKind, "pto");
  assert.equal(out.miscWorked, false);
});
