// WHAT PAYROLL ACCEPTED STAYS ACCEPTED (Mánu 2026-09-25, ask 4), seen three
// ways on the July rehearsal before this: accepting "I worked through my
// lunch" made the rebuilt day ask "Did you take your meal break?"; answering
// that card "Took it" took the premium back off in silence; a reset rebuilt
// with nothing and the accepted reports fell out of the figures.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildQuestions, settledByReports, settledQuestion } from "../questions.js";

const actions = fs.readFileSync("src/app/portal/admin/timesheets/actions.js", "utf8");
const bodyOf = (name) => {
  const at = actions.indexOf(`export async function ${name}`);
  return actions.slice(at, actions.indexOf("\nexport async function", at + 10));
};

const at = (h, m = 0) => ({ min: h * 60 + m });
// Mora 07/17 as the accepted meal_missed rebuilt it: 3p-5p, 5:30p-6:45p, the
// punched half hour paid back, the meal violation on, and the day now long
// enough to owe a rest it never recorded
const DAY = {
  date: "07/17/26",
  punches: [at(15), at(17), at(17, 30), at(18, 45)],
  paidHours: 3.75, mealMin: 30, restRequired: 1, restTaken: 0, restViolation: true,
  mealScheduled: false, mealViolation: true, mealLate: false,
};
const ask = (answers) => buildQuestions(
  { days: [DAY], scheduleCheck: { byDate: {} } },
  { sourceName: "Lark, Jordan", restRows: [], answers },
);
const kinds = (qs) => qs.filter((q) => q.date === DAY.date).map((q) => q.kind).sort();

test("the day asks about its meal and its rest until payroll settles one of them", () => {
  assert.deepEqual(kinds(ask([])), ["nothingDocumentedMeal", "nothingDocumentedRest"]);
});

test("an accepted meal report settles the meal: the rest question stays, the meal question goes", () => {
  const qs = ask([{ kind: "meal_missed", date: DAY.date, status: "accepted" }]);
  assert.deepEqual(kinds(qs), ["nothingDocumentedRest"]);
  const taken = ask([{ kind: "meal_taken", date: DAY.date, status: "accepted" }]);
  assert.deepEqual(kinds(taken), ["nothingDocumentedRest"]);
});

test("an accepted rest report settles the rest: the meal question stays", () => {
  const qs = ask([{ kind: "rest_missed", date: DAY.date, status: "accepted" }]);
  assert.deepEqual(kinds(qs), ["nothingDocumentedMeal"]);
});

test("a declined or open report settles nothing, and neither does a report on another day or an hours report", () => {
  for (const rows of [
    [{ kind: "meal_missed", date: DAY.date, status: "declined" }],
    [{ kind: "meal_missed", date: DAY.date, status: "open" }],
    [{ kind: "meal_missed", date: "07/18/26", status: "accepted" }],
    [{ kind: "hours", date: DAY.date, status: "accepted" }],
    [{ kind: "q_nothingDocumentedMeal", date: DAY.date, status: "accepted" }],
  ]) {
    assert.deepEqual(kinds(ask(rows)), ["nothingDocumentedMeal", "nothingDocumentedRest"], JSON.stringify(rows));
  }
});

test("the rule itself: subjects per date, and a grouped question only when every day is settled", () => {
  const settled = settledByReports([
    { kind: "meal_ontime", date: "07/16/26", status: "accepted" },
    { kind: "rest_taken", date: "07/16/26", status: "accepted" },
    { kind: "rest_missed", date: "07/17/26", status: "declined" },
    { kind: "other", date: null, status: "accepted" },
  ]);
  assert.deepEqual(Object.keys(settled), ["07/16/26"]);
  assert.deepEqual([...settled["07/16/26"]].sort(), ["meal", "rest"]);
  assert.equal(settledQuestion({ kind: "mealLate", date: "07/16/26" }, settled), true);
  assert.equal(settledQuestion({ kind: "restOutsideScheduled", date: "07/16/26" }, settled), true);
  assert.equal(settledQuestion({ kind: "miscTime", date: "07/16/26" }, settled), false);
  assert.equal(settledQuestion({ kind: "shortMealRest", dates: ["07/16/26", "07/17/26"] }, settled), false);
  assert.equal(settledQuestion({ kind: "shortMealRest", dates: ["07/16/26"] }, settled), true);
  assert.equal(settledQuestion({ kind: "nothingDocumentedMeal", date: "07/17/26" }, settled), false);
});

test("the answer path lays the accepted reports first and leaves their fields alone", () => {
  const body = bodyOf("answerTimesheetQuestion");
  assert.match(body, /const settled = await layAcceptedReports\(tx, ts, overrides\);/);
  assert.match(body, /Object\.entries\(patch\)\.filter\(\(\[k, v\]\) => v != null && !settled\[date\]\?\.has\(k\)\)/);
  // one re-derivation, not a second copy of the loop
  assert.doesNotMatch(body, /const acceptedReports = await tx\.timesheetCorrection\.findMany/);
});

test("the re-derivation reports what each accepted report wrote, per day", () => {
  const helper = actions.slice(actions.indexOf("async function layAcceptedReports"), actions.indexOf("export async function answerTimesheetQuestion"));
  assert.match(helper, /const untouched = ts\.data\?\.daysOriginal \|\| ts\.data\?\.days \|\| \[\];/);
  assert.match(helper, /status: "accepted",\n\s*NOT: \{ OR: \[\{ kind: \{ startsWith: "q_" \} \}, \{ kind: \{ startsWith: "fix_" \} \}\] \},/);
  assert.match(helper, /select: \{ kind: true, date: true, claimedHours: true, statedBreaks: true, statedSlots: true \},/);
  assert.match(helper, /for \(const k of Object\.keys\(patch\)\) settled\[c\.date\]\.add\(k\);/);
  assert.match(helper, /return settled;/);
});

test("both resets rebuild from the accepted reports, not from nothing", () => {
  const one = bodyOf("resetTimesheetAnswers");
  assert.match(one, /const kept = \{\};\n\s*await layAcceptedReports\(prisma, ts, kept\);\n\s*const res = await rebuildSheetFor\(\{ \.\.\.ts, overrides: kept \}, kept, \{ fullReset: full \}\);/);
  const all = bodyOf("resetBatchAnswers");
  assert.match(all, /const kept = \{\};\n\s*await layAcceptedReports\(prisma, ts, kept\);\n\s*const res = await rebuildSheetFor\(\{ \.\.\.ts, overrides: kept \}, kept\);/);
  assert.doesNotMatch(actions, /rebuildSheetFor\(\{ \.\.\.ts, overrides: \{\} \}, \{\}/);
});
