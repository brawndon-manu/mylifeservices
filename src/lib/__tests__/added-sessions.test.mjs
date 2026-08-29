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

// ---- the order sessions are stored in ----
//
// The editor appends, so a week added later sat last while happening first.
// Sorted at save: picks key on option id, so the array's order is presentation
// and nothing else.
import { sortSessionOptions } from "../meeting-slots.js";

const part = (id, seriesId, at) => ({ id, seriesId, label: "Session", at });

test("a series added later but happening first comes first", () => {
  const stored = [
    part("w1s1", "w1", "2026-09-10T16:00:00Z"),
    part("w1s2", "w1", "2026-09-11T16:00:00Z"),
    part("w0s1", "w0", "2026-09-03T16:00:00Z"),
    part("w0s2", "w0", "2026-09-04T16:00:00Z"),
  ];
  assert.deepEqual(sortSessionOptions(stored).map((o) => o.id), ["w0s1", "w0s2", "w1s1", "w1s2"]);
});

test("a series stays together even when another series interleaves its dates", () => {
  const stored = [
    part("a1", "a", "2026-09-01T16:00:00Z"),
    part("a2", "a", "2026-09-20T16:00:00Z"),
    part("b1", "b", "2026-09-05T16:00:00Z"),
  ];
  assert.deepEqual(sortSessionOptions(stored).map((o) => o.id), ["a1", "a2", "b1"]);
});

test("days inside a series order by their own time", () => {
  const stored = [part("s2", "w", "2026-09-04T16:00:00Z"), part("s1", "w", "2026-09-03T16:00:00Z")];
  assert.deepEqual(sortSessionOptions(stored).map((o) => o.id), ["s1", "s2"]);
});

test("plain sessions with no series sort by date too", () => {
  const stored = [
    { id: "b", label: "B", at: "2026-09-10T16:00:00Z" },
    { id: "a", label: "A", at: "2026-09-03T16:00:00Z" },
  ];
  assert.deepEqual(sortSessionOptions(stored).map((o) => o.id), ["a", "b"]);
});

test("a session with no date sorts last rather than shoving the schedule down", () => {
  const stored = [
    { id: "tbd", label: "TBD" },
    { id: "a", label: "A", at: "2026-09-03T16:00:00Z" },
  ];
  assert.deepEqual(sortSessionOptions(stored).map((o) => o.id), ["a", "tbd"]);
});
