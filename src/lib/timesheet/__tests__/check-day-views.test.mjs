import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFindings } from "../findings.js";

const workedDate = "09/01/26";
const unworkedDate = "09/02/26";
const punches = [{ min: 540, raw: "9a" }, { min: 1020, raw: "5p" }];
const fixture = () => ({
  restsByDate: [],
  timesheets: [{
    id: "sheet-one", sourceName: "Test, Person", overrides: {},
    data: {
      days: [{ date: workedDate, punches, breaks: [], paidHours: 8, mealViolation: true }],
      scheduleCheck: {
        matched: true,
        flagged: [{ date: unworkedDate, kind: "unworked", schedule: 8, timesheet: 0 }],
        byDate: {
          [workedDate]: { shifts: [{ text: "9a-5p -ILS Service(8:00)", minutes: 480 }] },
          [unworkedDate]: { shifts: [{ text: "9a-5p -ILS Training(8:00)", minutes: 480 }] },
        },
      },
    },
  }],
});

test("schedule-only days can be previewed without inventing worked punches", () => {
  const batch = fixture();
  const before = structuredClone(batch);
  const { dayViews } = buildFindings(batch);
  const view = dayViews.get(`sheet-one|${unworkedDate}`);
  assert.ok(view, "a scheduled day missing from the timesheet must still have a preview");
  assert.deepEqual(view.day.punches, []);
  assert.deepEqual(view.scheduled.map(({ from, to, service }) => ({ from, to, service })), [
    { from: 540, to: 1020, service: "ILS Training" },
  ]);
  assert.deepEqual(batch, before, "building a preview must not modify payroll data");
});

test("person-level violations resolve every affected day to its recorded preview", () => {
  const { entries, dayViews } = buildFindings(fixture());
  const violation = entries.find((e) => e.kind === "violation");
  assert.ok(violation);
  for (const { day } of violation.v.flagged) {
    const view = dayViews.get(`${violation.timesheetId}|${day.date}`);
    assert.ok(view);
    assert.deepEqual(view.day.punches, punches);
    assert.equal(view.scheduled[0].service, "ILS Service");
  }
});
