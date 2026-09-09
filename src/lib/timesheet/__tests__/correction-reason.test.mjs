import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { addsWorkHours, correctionNoteProblem, CORRECTION_KINDS, isCorrectionKind } from "../corrections.js";
import { checkWorkSlots, kindTakesSlots } from "../work-slots.js";
import { periodDates } from "../time-off.js";

const day = { date: "09/03/37", paidHours: 4.5 };

test("added work hours and missing days require a written reason", () => {
  for (const note of [null, undefined, "", " \n\t ", 123, {}]) {
    assert.equal(correctionNoteProblem("hours", day, 6.5, note), "addedHoursReason");
    assert.equal(correctionNoteProblem("day_missing", null, 2, note), "addedHoursReason");
  }
  assert.equal(correctionNoteProblem("hours", day, 6.5, "I clocked out early by mistake."), null);
  assert.equal(correctionNoteProblem("day_missing", null, 2, "My shift was missing."), null);
});

test("reason requirement compares rounded full-day totals and preserves existing categories", () => {
  assert.equal(addsWorkHours("hours", day, 4.504), false);
  assert.equal(addsWorkHours("hours", day, 4.51), true);
  assert.equal(addsWorkHours("hours", { paidHours: 4.504 }, 4.5), false);
  for (const hours of [0, 2, 4.5]) assert.equal(correctionNoteProblem("hours", day, hours, ""), null);
  assert.equal(correctionNoteProblem("day_extra", day, null, ""), null);
  assert.equal(correctionNoteProblem("other", day, null, ""), "note");
  assert.equal(addsWorkHours("hours", day, Infinity), false);
});

// Execute the real action body with an in-memory database and token verifier.
// No Next runtime, credentials, database connection or email is involved.
const actions = readFileSync(new URL("../../../app/portal/admin/timesheets/actions.js", import.meta.url), "utf8");
const start = actions.indexOf("export async function submitTimesheetCorrections(");
const source = actions.slice(start, actions.indexOf("\n}", start) + 2)
  .replace("export async function", "async function")
  .replace('await import("@/lib/timesheet-token")', "tokenVerifier");

function actionHarness() {
  const writes = [];
  const action = vm.runInNewContext(`(${source})`, {
    tokenVerifier: { verifyTimesheetToken: () => "test-sheet" },
    supersededByForTimesheet: async () => null,
    prisma: {
      timesheet: { findUnique: async () => ({
        id: "test-sheet", corrections: [], data: { days: [day] },
        batch: { periodFrom: "09/01/37", periodTo: "09/15/37" },
      }) },
      timesheetCorrection: { createMany: ({ data }) => { writes.push(...data); throw new Error("mock write boundary"); } },
    },
    CORRECTION_KINDS, isCorrectionKind, correctionNoteProblem,
    checkWorkSlots, kindTakesSlots, periodDates,
  });
  return { action, writes };
}

const correction = { date: day.date, kind: "hours", claimedHours: 6.5, slots: [{ from: "830", to: "3" }] };

test("server refuses the whole report before writes when any added-hours reason is missing", async () => {
  for (const badItem of [
    { ...correction, note: "   ", paidHours: 24 },
    { ...correction, kind: "day_missing", date: "09/09/37", note: "" },
  ]) {
    const { action, writes } = actionHarness();
    const result = await action({ token: "test", items: [{ ...correction, note: "Missed clock time." }, badItem] });
    assert.equal(result.ok, false);
    assert.equal(result.code, "addedHoursReason");
    assert.equal(result.at, badItem.date);
    assert.equal(writes.length, 0);
  }
});

test("server preserves a valid reason on the correction sent to storage", async () => {
  const { action, writes } = actionHarness();
  await assert.rejects(action({ token: "test", items: [{ ...correction, note: "  I clocked out early by mistake.  " }] }), /mock write boundary/);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].note, "I clocked out early by mistake.");
  assert.equal(writes[0].claimedHours, 6.5);
});
