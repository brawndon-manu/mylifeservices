// THE SESSIONS AN EDIT ADDED, and only those.
//
// The time-change path resets and notifies; an added session resets nobody, so
// it needs its own detection - and it must never claim a session whose time
// merely moved, or one edit would email everybody twice about one meeting.
import { test } from "node:test";
import assert from "node:assert/strict";
import { addedSessions } from "../meeting-slots.js";

const opt = (id, at) => ({ id, label: "Session", at });

test("a new option id is an added session", () => {
  const old = [opt("a", "2026-09-10T16:00:00Z")];
  const now = [opt("a", "2026-09-10T16:00:00Z"), opt("b", "2026-09-03T16:00:00Z")];
  assert.deepEqual(addedSessions(old, now).map((o) => o.id), ["b"]);
});

test("a session whose time moved is not an addition", () => {
  const old = [opt("a", "2026-09-10T16:00:00Z")];
  const now = [opt("a", "2026-09-11T16:00:00Z")];
  assert.deepEqual(addedSessions(old, now), []);
});

test("a removed session is not an addition either", () => {
  const old = [opt("a", "x"), opt("b", "y")];
  const now = [opt("a", "x")];
  assert.deepEqual(addedSessions(old, now), []);
});

// a single-time meeting converted to sessions: every session is new
test("sessions added to a meeting that had none are all additions", () => {
  assert.deepEqual(addedSessions(null, [opt("a", "x"), opt("b", "y")]).map((o) => o.id), ["a", "b"]);
  assert.deepEqual(addedSessions([], [opt("a", "x")]).map((o) => o.id), ["a"]);
});

test("an option with no id is never counted", () => {
  assert.deepEqual(addedSessions([], [{ label: "broken" }]), []);
});
