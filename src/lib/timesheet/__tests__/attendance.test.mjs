// WHAT THE QSCLOCK EXPORT SAYS, and the one trap in reading it.
//
// Mánu 2026-08-22: "we can get data about if they clock into their service
// shift, clck out, if they were geofenced." The export came back that day after
// being held out since 08-06, optional, and for monitoring only.
//
// Measured on 08/16-08/22, 512 shifts: 123 never clocked into, 131 never clocked
// out of, 25 clocked-in with GPS explicitly "No", 30 clocked-out likewise, and
// 127 rows with GPS blank - which are NOT missing location. See below.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { clockMinute, spanMinutes } from "../clock.js";
import { attendanceFindings, complianceCounts, CAP_MINUTES } from "../compliance.js";

const shift = (over = {}) => ({
  name: "Test, Person", key: "test, person", date: "08/17/26",
  client: "Client, A", service: "ILS Service",
  scheduledMin: 180, workedMin: 180,
  noIn: false, noOut: false, gpsIn: "yes", gpsOut: "yes",
  selfCreated: false, reason: null, ...over,
});

const kinds = (fs_) => fs_.map((f) => f.kind).sort();

// ---- reading the clock ----

test("a clock time reads as minutes past midnight", () => {
  assert.equal(clockMinute("02:45 PM"), 14 * 60 + 45);
  assert.equal(clockMinute("12:05 AM"), 5);
  assert.equal(clockMinute("12:30 PM"), 12 * 60 + 30);
  assert.equal(clockMinute(""), null);
  assert.equal(clockMinute("not a time"), null);
});

test("a span across midnight is not negative", () => {
  assert.equal(spanMinutes("10:00 PM", "01:30 AM"), 210);
  assert.equal(spanMinutes("07:30 AM", "11:00 AM"), 210);
  assert.equal(spanMinutes("07:30 AM", ""), null);
});

// ---- the findings ----

test("a shift never clocked into is a finding", () => {
  assert.deepEqual(kinds(attendanceFindings([shift({ noIn: true, gpsIn: null })])), ["no-clock-in"]);
});

test("clocking in and out cleanly is no finding at all", () => {
  assert.deepEqual(attendanceFindings([shift()]), []);
});

// THE TRAP THIS FILE EXISTS FOR.
//
// GPS is blank on 127 of 512 rows, and 123 of those are exactly the shifts
// nobody clocked into - there was no location to capture. Counting blank as
// missing would report 152 where there are 25, and would charge one missed
// clock-in twice: once as the missed clock-in, once as missing GPS.
test("a shift nobody clocked into does NOT also count as missing GPS", () => {
  const f = attendanceFindings([shift({ noIn: true, noOut: true, gpsIn: null, gpsOut: null })]);
  assert.deepEqual(kinds(f), ["no-clock-in", "no-clock-out"]);
  assert.equal(f.some((x) => x.kind === "no-gps"), false);
});

test("clocking with GPS explicitly off is the finding", () => {
  const f = attendanceFindings([shift({ gpsIn: "no" })]);
  assert.deepEqual(kinds(f), ["no-gps"]);
  assert.equal(f[0].which, "in");
});

// two device failures on one shift, not one
test("each end of the shift is counted separately", () => {
  const f = attendanceFindings([shift({ gpsIn: "no", gpsOut: "no" })]);
  assert.equal(f.length, 2);
  assert.deepEqual(f.map((x) => x.which).sort(), ["in", "out"]);
});

// ---- the cap, on what was actually worked ----

test("working past the cap is its own finding, separate from being rostered past it", () => {
  const f = attendanceFindings([shift({ scheduledMin: 180, workedMin: 300 })]);
  assert.deepEqual(kinds(f), ["worked-over-cap"]);
  assert.equal(f[0].minutes, 300);
  assert.equal(f[0].over, 300 - CAP_MINUTES);
  // the rostered figure rides along, because "worked 5.00, rostered 3.00" is a
  // different conversation from "worked 5.00, rostered 5.00"
  assert.equal(f[0].scheduledMin, 180);
});

test("exactly the cap is not over it", () => {
  assert.deepEqual(attendanceFindings([shift({ workedMin: CAP_MINUTES })]), []);
});

test("an uncapped service can run as long as it likes", () => {
  assert.deepEqual(attendanceFindings([shift({ service: "ILS Travel", workedMin: 480 })]), []);
  assert.deepEqual(attendanceFindings([shift({ service: "ILS Admin", workedMin: 480 })]), []);
});

test("Self Determination carries the cap here too", () => {
  const f = attendanceFindings([shift({ service: "Self Determination Program", workedMin: 300 })]);
  assert.deepEqual(kinds(f), ["worked-over-cap"]);
});

// a shift nobody clocked has no worked duration, and inventing one from the
// rostered times would flag the roster twice under two different names
test("a shift with no clock times is never judged on how long it was worked", () => {
  const f = attendanceFindings([shift({ noIn: true, gpsIn: null, workedMin: null, scheduledMin: 480 })]);
  assert.deepEqual(kinds(f), ["no-clock-in"]);
});

test("counts roll up by kind", () => {
  const f = attendanceFindings([
    shift({ noIn: true, gpsIn: null }),
    shift({ noOut: true, gpsOut: null }),
    shift({ gpsIn: "no" }),
    shift({ workedMin: 300 }),
  ]);
  assert.deepEqual(complianceCounts(f), {
    "no-clock-in": 1, "no-clock-out": 1, "no-gps": 1, "worked-over-cap": 1,
  });
});

test("nothing to read is no findings rather than a throw", () => {
  assert.deepEqual(attendanceFindings(null), []);
  assert.deepEqual(attendanceFindings([]), []);
});

// ---- and it still may not touch pay ----
//
// The clock export IS allowed to move one thing - how well a premium is
// evidenced, in gradePremium - and that lives in clock.js, not here.
const CODE = fs
  .readFileSync(new URL("../compliance.js", import.meta.url), "utf8")
  .replace(/^\s*\/\/.*$/gm, "");

test("the attendance reader computes no pay of any kind", () => {
  assert.doesNotMatch(CODE, /premium|paidHours|gradePremium/i);
});
