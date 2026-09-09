import test from "node:test";
import assert from "node:assert/strict";
import { reportQueue, reportSlotCheck, reportDate } from "../reported-issues.js";

test("open reports take priority over a previous rebuild", () => {
  assert.equal(reportQueue({ recomputedAt: "2026-09-08", corrections: [{ status: "open" }] }), "review");
});
test("only a rebuild after acceptance moves the sheet to history", () => {
  const corrections = [{ status: "accepted", resolvedAt: "2026-09-08T12:00:00Z" }];
  assert.equal(reportQueue({ corrections }), "rebuild");
  assert.equal(reportQueue({ corrections, recomputedAt: "2026-09-08T11:00:00Z" }), "rebuild");
  assert.equal(reportQueue({ corrections, recomputedAt: "2026-09-08T12:01:00Z" }), "history");
});
test("declined-only reports do not require a document rebuild", () => {
  assert.equal(reportQueue({ corrections: [{ status: "declined" }] }), "history");
});
test("slot evidence distinguishes matching totals, overlap, and mismatch", () => {
  assert.equal(reportSlotCheck([{ from: 480, to: 660 }, { from: 690, to: 960 }], 7.5), null);
  assert.match(reportSlotCheck([{ from: 480, to: 660 }, { from: 650, to: 960 }], 8), /overlap/);
  assert.match(reportSlotCheck([{ from: 480, to: 660 }], 4), /match/);
  assert.equal(reportSlotCheck([], 4), null);
});
test("date labels are stable across server and browser time zones", () => {
  assert.equal(reportDate("09/02/26"), "Wed, Sep 2");
  assert.equal(reportDate(null), "This timesheet");
});

test("invalid-only slot evidence is not treated as missing evidence", () => {
  assert.match(reportSlotCheck([{ from: -1, to: 480 }], 8), /invalid/);
});
