import test from "node:test";
import assert from "node:assert/strict";
import { unmarkedRollCall } from "../meeting-time.js";

// the strip's Unmarked count - Mánu 2026-09-03: only sessions that already
// started count. A September series read "Unmarked 79" on day one because
// five future sessions cannot be marked yet.

const NOW = new Date("2026-09-03T18:00:00Z").getTime();
const past = "2026-09-03T16:00:00Z";
const future = "2026-09-10T16:00:00Z";

test("future sessions contribute nothing", () => {
  const n = unmarkedRollCall(
    [
      {
        at: past,
        people: [{ attended: "present" }, { attended: "absent" }, { attended: null }],
      },
      { at: future, people: [{ attended: null }, { attended: null }] },
    ],
    NOW,
  );
  assert.equal(n, 1, "one unmarked seat in the started session, none from the future one");
});

test("a session with no date never counts, marked seats never count", () => {
  assert.equal(unmarkedRollCall([{ at: null, people: [{ attended: null }] }], NOW), 0);
  assert.equal(
    unmarkedRollCall([{ at: past, people: [{ attended: "present" }] }], NOW),
    0,
  );
  assert.equal(unmarkedRollCall([], NOW), 0);
  assert.equal(unmarkedRollCall(null, NOW), 0);
});

test("a single-session meeting is one row keyed on the meeting's own start", () => {
  const going = [{ attended: "present" }, { attended: null }, { attended: null }];
  assert.equal(unmarkedRollCall([{ at: past, people: going }], NOW), 2);
  assert.equal(unmarkedRollCall([{ at: future, people: going }], NOW), 0);
});
