import { test } from "node:test";
import assert from "node:assert/strict";
import { schedulingView } from "../scheduling-view.js";
import { attendanceOf, complianceFor, complianceCounts } from "../compliance.js";

const fixture = () => ({
  timesheets: [{
    id: "sheet-a", sourceName: "Test, Employee",
    data: { scheduleCheck: { byDate: Object.fromEntries(Array.from({ length: 15 }, (_, i) => [
      `07/${String(i + 16).padStart(2, "0")}/26`,
      { shifts: [{ text: "9a-1p Client, A-ILS Service(4:00)", minutes: 240 }] },
    ])) } },
  }],
  clockFindings: { byPerson: { "Test, Employee": { matched: true, findings: [
    { kind: "no-clock-in", date: "07/16/26", service: "ILS Service", minutes: 0 },
    { kind: "no-clock-in", date: "07/16/26", service: "ILS Service", minutes: 0 },
  ] } } },
});

test("the Scheduling page retains every source finding, including rows beyond the old twelve-row cap", () => {
  const batch = fixture();
  const before = structuredClone(batch);
  const original = batch.timesheets.flatMap((sheet) => complianceFor(sheet.data, attendanceOf(batch, sheet.sourceName)));
  const { rows, groups } = schedulingView(batch);
  assert.equal(rows.length, original.length);
  assert.deepEqual(complianceCounts(rows), complianceCounts(original));
  assert.equal(groups.find((g) => g.key === "booking-over-cap").count, 15);
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length, "two similar shifts must remain separate findings");
  assert.deepEqual(batch, before, "presenting scheduling findings must never change payroll data");
});

test("preferred display names do not change clock matching or the day a row opens", () => {
  const { rows } = schedulingView(fixture(), { "sheet-a": "Preferred Name" });
  assert.ok(rows.every((row) => row.who === "Preferred Name"));
  const clock = rows.filter((row) => row.kind === "no-clock-in");
  assert.equal(clock.length, 2);
  assert.ok(clock.every((row) => row.dayKey === "sheet-a|07/16/26"));
});

test("empty and missing clock data do not manufacture attendance findings", () => {
  const batch = fixture();
  batch.clockFindings = null;
  const { rows } = schedulingView(batch);
  assert.equal(rows.length, 15);
  const empty = schedulingView({ timesheets: [] });
  assert.deepEqual(empty.rows, []);
  assert.ok(empty.groups.every((group) => group.count === 0));
});
