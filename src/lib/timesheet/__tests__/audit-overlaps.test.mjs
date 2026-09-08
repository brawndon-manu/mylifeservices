// DOUBLE BOOKINGS, pinned: a client with two staff flags, touching edges
// stay silent, and one finding per row however many partners. The staff-side
// rule ("booked in two places at once") retired 2026-09-08 - travel shifts
// and office-created late-clock shifts overlap innocently, so a staff
// member's own overlapping bookings deliberately flag NOTHING; only the same
// client under two different staff does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { stampOverlaps } from "../audit-overlaps.js";

const ampm = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
const row = (over = {}) => ({
  employeeKey: "a", who: "Ann A", date: "08/05/26", client: "Rincon, Remy",
  schedFrom: 600, schedTo: 720, reasons: [], score: 0,
  ...over,
});

test("one staff member booked in two places flags nothing - travel shifts overlap innocently", () => {
  const r1 = row();
  const r2 = row({ client: "Rison, Trixi", schedFrom: 660, schedTo: 780 });
  const { client } = stampOverlaps([r1, r2], ampm);
  assert.equal(client, 0);
  assert.deepEqual(r1.reasons, []);
  assert.deepEqual(r2.reasons, []);
  assert.equal(r1.score, 0);
});

test("one client with two different staff flags both rows", () => {
  const r1 = row();
  const r2 = row({ employeeKey: "b", who: "Kamilah Rison", schedFrom: 660, schedTo: 780 });
  const { client } = stampOverlaps([r1, r2], ampm);
  assert.equal(client, 2);
  assert.ok(r1.reasons.some((x) => x.kind === "double-booked-client"));
  assert.match(r1.reasons[0].text, /Kamilah Rison/);
  assert.equal(r1.score, 85);
});

test("back to back bookings never flag", () => {
  const r1 = row();
  const r2 = row({ employeeKey: "b", who: "Bea B", schedFrom: 720, schedTo: 780 });
  const out = stampOverlaps([r1, r2], ampm);
  assert.deepEqual(out, { client: 0 });
});

test("several partners make one finding naming them all", () => {
  const r1 = row({ schedFrom: 600, schedTo: 900 });
  const r2 = row({ employeeKey: "b", who: "Bea B", schedFrom: 630, schedTo: 690 });
  const r3 = row({ employeeKey: "c", who: "Cee C", schedFrom: 700, schedTo: 760 });
  stampOverlaps([r1, r2, r3], ampm);
  assert.equal(r1.reasons.filter((x) => x.kind === "double-booked-client").length, 1);
  assert.match(r1.reasons[0].text, /Bea B/);
  assert.match(r1.reasons[0].text, /Cee C/);
});

test("a row with no window is skipped", () => {
  const r1 = row({ schedFrom: null, schedTo: null });
  const out = stampOverlaps([r1, row({ employeeKey: "b", who: "Bea B" })], ampm);
  assert.deepEqual(out, { client: 0 });
});

test("a client booking overlapping a clientless block is not a double booking", () => {
  const r1 = row();
  const r2 = row({ employeeKey: "b", who: "Bea B", client: null, schedFrom: 660, schedTo: 780 });
  const out = stampOverlaps([r1, r2], ampm);
  assert.deepEqual(out, { client: 0 });
});
