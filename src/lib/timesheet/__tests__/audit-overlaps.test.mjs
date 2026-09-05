// DOUBLE BOOKINGS, pinned: staff in two places, a client with two staff,
// touching edges stay silent, and one finding per row however many partners.
import { test } from "node:test";
import assert from "node:assert/strict";
import { stampOverlaps } from "../audit-overlaps.js";

const ampm = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
const row = (over = {}) => ({
  employeeKey: "a", who: "Ann A", date: "08/05/26", client: "Rincon, Remy",
  schedFrom: 600, schedTo: 720, reasons: [], score: 0,
  ...over,
});

test("one staff member booked in two places flags both rows", () => {
  const r1 = row();
  const r2 = row({ client: "Rison, Trixi", schedFrom: 660, schedTo: 780 });
  const { staff } = stampOverlaps([r1, r2], ampm);
  assert.equal(staff, 2);
  assert.ok(r1.reasons.some((x) => x.kind === "double-booked-staff"));
  assert.match(r1.reasons[0].text, /Rison, Trixi/);
  assert.equal(r1.score, 85);
});

test("one client with two different staff flags both rows", () => {
  const r1 = row();
  const r2 = row({ employeeKey: "b", who: "Kamilah Rison", schedFrom: 660, schedTo: 780 });
  const { staff, client } = stampOverlaps([r1, r2], ampm);
  assert.equal(staff, 0);
  assert.equal(client, 2);
  assert.match(r1.reasons[0].text, /Kamilah Rison/);
});

test("back to back bookings never flag", () => {
  const r1 = row();
  const r2 = row({ client: "Rison, Trixi", schedFrom: 720, schedTo: 780 });
  const out = stampOverlaps([r1, r2], ampm);
  assert.deepEqual(out, { staff: 0, client: 0 });
});

test("several partners make one finding naming them all", () => {
  const r1 = row({ schedFrom: 600, schedTo: 900 });
  const r2 = row({ client: "B, B", schedFrom: 630, schedTo: 690 });
  const r3 = row({ client: "C, C", schedFrom: 700, schedTo: 760 });
  stampOverlaps([r1, r2, r3], ampm);
  assert.equal(r1.reasons.filter((x) => x.kind === "double-booked-staff").length, 1);
  assert.match(r1.reasons[0].text, /B, B/);
  assert.match(r1.reasons[0].text, /C, C/);
});

test("a row with no window is skipped", () => {
  const r1 = row({ schedFrom: null, schedTo: null });
  const out = stampOverlaps([r1, row({ client: "X, X" })], ampm);
  assert.deepEqual(out, { staff: 0, client: 0 });
});

test("a client booking overlapping a clientless block is not a double booking", () => {
  const r1 = row();
  const r2 = row({ client: null, schedFrom: 660, schedTo: 780 });
  const out = stampOverlaps([r1, r2], ampm);
  assert.deepEqual(out, { staff: 0, client: 0 });
});
