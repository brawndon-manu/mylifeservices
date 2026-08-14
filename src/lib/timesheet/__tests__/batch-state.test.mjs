// LIVE, NEEDS A DECISION, FINAL - and the one transition the portal is not
// allowed to make on its own.
import { test } from "node:test";
import assert from "node:assert/strict";

import { batchState, canSendAll, periodDays, supersededIds } from "../batch-state.js";

const batch = (reachDay, extra = {}) => ({
  periodFrom: "08/01/26",
  periodTo: "08/15/26",
  timesheets: reachDay ? [{ data: { days: [{ date: "08/01/26" }, { date: reachDay }] } }] : [],
  ...extra,
});

test("still coming in while the data stops short of the period end", () => {
  const s = batchState(batch("08/12/26"));
  assert.equal(s.key, "live");
  assert.equal(s.reach, "08/12/26");
  assert.equal(s.daysToCome, 3);
  assert.equal(s.covered, false);
  assert.equal(s.pulses, true);
});

test("the data reaching the last day asks a question, it does not answer one", () => {
  const s = batchState(batch("08/15/26"));
  assert.equal(s.key, "needs-decision");
  assert.equal(s.covered, true);
  assert.equal(s.daysToCome, 0);
  // THE POINT. A full period is not a finished one: the schedule locks at 8pm
  // and no export says whether that happened.
  assert.equal(canSendAll(batch("08/15/26")), false);
});

test("only an attestation makes it final", () => {
  const b = batch("08/15/26", { lockedAt: new Date("2026-08-15T20:14:00Z"), lockedByName: "Mánu" });
  const s = batchState(b);
  assert.equal(s.key, "final");
  assert.equal(s.lockedByName, "Mánu");
  assert.equal(canSendAll(b), true);
});

// an attestation on a period still coming in would be somebody saying the
// schedule is locked before the days exist. It wins, because only a person can
// know - but it must not be reachable by accident, which is the UI's job.
test("an attestation is believed even against a short period", () => {
  assert.equal(batchState(batch("08/12/26", { lockedAt: new Date() })).key, "final");
});

test("no readable data refuses to send rather than guessing", () => {
  const s = batchState(batch(null));
  assert.equal(s.key, "live");
  assert.equal(s.reach, null);
  // null, NOT 0 - "none missing" and "cannot tell" are different answers
  assert.equal(s.daysToCome, null);
  assert.equal(canSendAll(batch(null)), false);
});

test("dates are compared as dates, not as strings", () => {
  // "08/09/26" sorts after "08/12/26" alphabetically, which would report the
  // period as three days shorter than it is
  assert.equal(batchState({
    periodFrom: "08/01/26", periodTo: "08/15/26",
    timesheets: [{ data: { days: [{ date: "08/09/26" }, { date: "08/12/26" }] } }],
  }).reach, "08/12/26");
  // and a period crossing a month end still measures
  assert.equal(batchState({
    periodFrom: "07/16/26", periodTo: "07/31/26",
    timesheets: [{ data: { days: [{ date: "07/31/26" }] } }],
  }).daysToCome, 0);
});

test("the strip covers the whole period and marks what is in", () => {
  const d = periodDays(batch("08/12/26"));
  assert.equal(d.length, 15);
  assert.equal(d[0].day, 1);
  assert.equal(d.at(-1).day, 15);
  assert.equal(d.filter((x) => x.covered).length, 12);
  assert.equal(d.filter((x) => !x.covered).map((x) => x.day).join(","), "13,14,15");
  // 08/01/26 is a Saturday and 08/02 a Sunday
  assert.equal(d[0].weekend, true);
  assert.equal(d[1].weekend, true);
  assert.equal(d[2].weekend, false);
});

// ------------------------- only one upload of a fortnight is the one being worked

test("a replaced upload is superseded, not live", () => {
  const b = batch("08/12/26");
  assert.equal(batchState(b).key, "live", "on its own it is the live one");
  const s = batchState(b, { newerInPeriod: true });
  assert.equal(s.key, "superseded");
  assert.equal(s.pulses, false, "two dead exports must not both be blinking");
  assert.equal(canSendAll(b, { newerInPeriod: true }), false);
});

test("superseded beats even an attestation", () => {
  // the attestation was about THAT export being final, and it no longer is
  const b = batch("08/15/26", { lockedAt: new Date() });
  assert.equal(batchState(b).key, "final");
  assert.equal(batchState(b, { newerInPeriod: true }).key, "superseded");
  assert.equal(canSendAll(b, { newerInPeriod: true }), false, "send from the current upload, not this one");
});

test("the newest of each period survives, and periods do not bleed into each other", () => {
  const rows = [
    { id: "aug-old", periodFrom: "08/01/26", periodTo: "08/15/26", createdAt: "2026-08-12T14:36:00Z" },
    { id: "aug-mid", periodFrom: "08/01/26", periodTo: "08/15/26", createdAt: "2026-08-12T23:44:00Z" },
    { id: "aug-new", periodFrom: "08/01/26", periodTo: "08/15/26", createdAt: "2026-08-13T09:04:00Z" },
    { id: "july", periodFrom: "07/16/26", periodTo: "07/31/26", createdAt: "2026-08-12T14:30:00Z" },
  ];
  const stale = supersededIds(rows);
  assert.equal(stale.size, 2);
  assert.ok(stale.has("aug-old"));
  assert.ok(stale.has("aug-mid"));
  assert.ok(!stale.has("aug-new"), "the newest August upload is the live one");
  // July is older than every August row and must NOT be superseded by them
  assert.ok(!stale.has("july"), "a different period is not a later upload of this one");
});

test("one batch on its own is never superseded", () => {
  const stale = supersededIds([{ id: "only", periodFrom: "08/01/26", periodTo: "08/15/26", createdAt: "2026-08-13T09:04:00Z" }]);
  assert.equal(stale.size, 0);
  assert.equal(supersededIds([]).size, 0);
});
