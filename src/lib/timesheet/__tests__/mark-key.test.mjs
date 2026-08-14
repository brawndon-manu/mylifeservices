// THE KEY THAT LETS A MARK OUTLIVE AN UPLOAD, and the horizon that stops it
// claiming days it never saw.
import { test } from "node:test";
import assert from "node:assert/strict";

import { markKey, markKeyOf, batchReach, isStale, marksByKey } from "../mark-key.js";

test("the key is person and finding, and neither alone", () => {
  assert.equal(markKey("u1", "person"), "u1|person");
  assert.notEqual(markKey("u1", "person"), markKey("u2", "person"));
  assert.notEqual(markKey("u1", "person"), markKey("u1", "overlap-08/03/26"));
  assert.equal(markKeyOf({ personKey: "u1", findingKey: "rest-late-08/03/26" }), "u1|rest-late-08/03/26");
});

// a null person must not collide with another null person on the same finding,
// or two unmatched rest rows would share one mark
test("a missing person is marked missing rather than dropped", () => {
  assert.equal(markKey(null, "person"), "-|person");
  assert.equal(markKeyOf({}), "-|-");
});

test("reach is the last day the DATA covers, from either source", () => {
  const b = {
    timesheets: [{ data: { days: [{ date: "08/01/26" }, { date: "08/09/26" }] } }],
    restsByDate: [{ date: "08/12/26" }, { date: "08/02/26" }],
  };
  assert.equal(batchReach(b), "08/12/26");
  // dates are compared as dates, not strings - "08/09" sorts after "08/12"
  // alphabetically and that would put the horizon three days early
  assert.equal(batchReach({ timesheets: [{ data: { days: [{ date: "08/09/26" }, { date: "08/12/26" }] } }] }), "08/12/26");
  assert.equal(batchReach({}), null);
});

// the whole point: the period runs to the 15th and the data stops at the 12th
test("a mark made on older data is stale against a fuller batch", () => {
  assert.equal(isStale("08/09/26", "08/12/26"), true);
  assert.equal(isStale("08/12/26", "08/12/26"), false);
  // and never the other way round, or every mark reads as stale for ever
  assert.equal(isStale("08/12/26", "08/09/26"), false);
  assert.equal(isStale(null, "08/12/26"), false);
  assert.equal(isStale("08/09/26", null), false);
});

test("two marks on one key resolve to the most recently touched", () => {
  const rows = [
    { personKey: "u1", findingKey: "person", status: "no-response", updatedAt: new Date("2026-08-13T00:00:00Z") },
    { personKey: "u1", findingKey: "person", status: "responded", updatedAt: new Date("2026-08-14T00:00:00Z") },
    { personKey: "u2", findingKey: "person", status: "contacted", updatedAt: new Date("2026-08-12T00:00:00Z") },
  ];
  const m = marksByKey(rows);
  assert.equal(m.size, 2);
  assert.equal(m.get("u1|person").status, "responded");
  // and the same however the rows arrive, or the answer depends on row order
  assert.equal(marksByKey([...rows].reverse()).get("u1|person").status, "responded");
});

test("a log row with only createdAt still sorts", () => {
  const m = marksByKey([
    { personKey: "u1", findingKey: "person", status: "a", createdAt: new Date("2026-08-13T00:00:00Z") },
    { personKey: "u1", findingKey: "person", status: "b", createdAt: new Date("2026-08-14T00:00:00Z") },
  ]);
  assert.equal(m.get("u1|person").status, "b");
});
