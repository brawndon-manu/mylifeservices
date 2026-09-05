// ONE CLOCK SESSION ACROSS SIBLING BOOKINGS, pinned on the case that exposed
// it: Gutierrez 08/03, Christensen booked 1:30-2:00 and 2:00-3:30, clocked
// once 1:30-3:30.
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitSharedSessions } from "../session-split.js";

const same = (a, b) => (a || "") === (b || "");
const index = (shifts) => {
  const m = new Map();
  for (const s of shifts) {
    const k = `${s.who}|${s.date}`;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(s);
  }
  return m;
};

const mk = (over = {}) => ({
  who: "gutierrez joseph", date: "08/03/26", client: "Christensen, B",
  schedFrom: 810, schedTo: 840, clocked: false,
  ...over,
});

test("the Gutierrez shape: both bookings share the one session", () => {
  const a = mk(); // 1:30-2:00, unclocked
  const b = mk({
    schedFrom: 840, schedTo: 930, clocked: true,
    actualFrom: 810, actualTo: 930, workedMin: 120,
    originalFrom: 810, originalTo: 840,
    noIn: false, noOut: false, gpsIn: "yes", gpsOut: "yes",
  }); // 2:00-3:30, claimed the whole 1:30-3:30 row
  const n = splitSharedSessions(index([a, b]), same);
  assert.equal(n, 1);
  // A holds its slice with the real clock-in and the row's schedule columns
  assert.equal(a.clocked, true);
  assert.deepEqual([a.actualFrom, a.actualTo, a.workedMin], [810, 840, 30]);
  assert.equal(a.gpsIn, "yes");
  assert.equal(a.inheritedOut, true);
  assert.deepEqual([a.originalFrom, a.originalTo], [810, 840]);
  // B keeps its slice with the real clock-out, hands the schedule columns back
  assert.deepEqual([b.actualFrom, b.actualTo, b.workedMin], [840, 930, 90]);
  assert.equal(b.inheritedIn, true);
  assert.equal(b.gpsOut, "yes");
  assert.equal(b.gpsIn, null);
  assert.equal(b.originalFrom, null);
  // slices sum to the session and both carry it
  assert.equal(a.workedMin + b.workedMin, 120);
  assert.deepEqual(a.sharedSession, { from: 810, to: 930, parts: 2 });
});

test("a booking the session never reached keeps its own state", () => {
  const evening = mk({ schedFrom: 1020, schedTo: 1080 }); // 5-6pm, untouched
  const b = mk({ schedFrom: 840, schedTo: 930, clocked: true, actualFrom: 810, actualTo: 930 });
  const a = mk();
  splitSharedSessions(index([a, b, evening]), same);
  assert.equal(evening.clocked, false);
  assert.equal(evening.sharedSession, undefined);
});

test("a different client's booking never takes a slice", () => {
  const other = mk({ client: "Schuck, D" });
  const b = mk({ schedFrom: 840, schedTo: 930, clocked: true, actualFrom: 810, actualTo: 930 });
  splitSharedSessions(index([other, b]), same);
  assert.equal(other.clocked, false);
});

test("an already-clocked sibling is left alone", () => {
  const a = mk({ clocked: true, actualFrom: 810, actualTo: 840 });
  const b = mk({ schedFrom: 840, schedTo: 930, clocked: true, actualFrom: 840, actualTo: 930 });
  const n = splitSharedSessions(index([a, b]), same);
  assert.equal(n, 0);
});
