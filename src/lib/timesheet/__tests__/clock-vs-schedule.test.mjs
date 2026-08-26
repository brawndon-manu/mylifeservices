// ROSTERED AGAINST CLOCKED, one shift at a time.
//
// Mánu 2026-08-26: "this is for auditing. so we need to see every instance of
// clocked in and clocked out vs what the schedule has them under. for example
// schedule has clock in 12:00p-3p but their clock in has 12:08p-2:53p.
// geofence as well. overe 3.5 hours as well."
//
// The durations `clockShifts` already carried cannot answer that - two shifts
// three hours long can start ninety minutes apart - so the four times come
// through now, and the difference at each end with them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { stampMinutes, shiftFromRow, clockDisagreements } from "../clock.js";

// one spreadsheet row, in QSP's own column names
const row = (over = {}) => ({
  "Employee Name": "Test, Person",
  Client: "Client, A",
  "Service Type": "ILS Service",
  "Schedule Start Date": "8/17/2026",
  "Schedule Start Time": "12:00 PM",
  "Schedule End Date": "8/17/2026",
  "Schedule End Time": "03:00 PM",
  "Actual Start Date": "8/17/2026",
  "Actual Start Time": "12:08 PM",
  "Actual End Date": "8/17/2026",
  "Actual End Time": "02:53 PM",
  "No Clock In": "No",
  "No Clock Out": "No",
  "Field Staff Created Shift": "No",
  Reason: "",
  "GPS Captured on Clock In": "Yes",
  "GPS Captured on Clock Out": "Yes",
  ...over,
});

// ---- the stamp ----

test("a date and a time subtract to the minutes between them", () => {
  const a = stampMinutes("8/17/2026", "12:00 PM");
  const b = stampMinutes("8/17/2026", "12:08 PM");
  assert.equal(b - a, 8);
});

// THE REASON THE DATE IS CARRIED AT ALL. Rostered 11:30 PM, clocked in at
// 12:05 AM the next day, is thirty-five minutes late. Times alone make it
// 1,405 minutes early, which would read as the earliest clock-in of the period.
test("a shift across midnight is late, not enormously early", () => {
  const sched = stampMinutes("8/17/2026", "11:30 PM");
  const actual = stampMinutes("8/18/2026", "12:05 AM");
  assert.equal(actual - sched, 35);
});

test("an unreadable date or time has no stamp rather than a wrong one", () => {
  assert.equal(stampMinutes("", "12:00 PM"), null);
  assert.equal(stampMinutes("8/17/2026", ""), null);
  assert.equal(stampMinutes("not a date", "12:00 PM"), null);
});

// ---- the row ----

test("the four times come through, and the difference at each end", () => {
  const s = shiftFromRow(row());
  assert.equal(s.schedFrom, 12 * 60);
  assert.equal(s.schedTo, 15 * 60);
  assert.equal(s.actualFrom, 12 * 60 + 8);
  assert.equal(s.actualTo, 14 * 60 + 53);
  assert.equal(s.startDelta, 8);   // clocked in eight minutes late
  assert.equal(s.endDelta, -7);    // clocked out seven minutes early
});

// a quarter of the week: 123 of 512 shifts had no clock-in on 08/16-08/22.
// Nothing to compare is a different fact from arriving on time, and a zero here
// would be read as the second.
test("a shift nobody clocked into has no start time and no difference", () => {
  const s = shiftFromRow(row({ "No Clock In": "Yes", "Actual Start Time": "" }));
  assert.equal(s.actualFrom, null);
  assert.equal(s.startDelta, null);
  // the other end still stands on its own
  assert.equal(s.actualTo, 14 * 60 + 53);
  assert.equal(s.endDelta, -7);
});

test("QSP's own verdicts ride along beside our arithmetic", () => {
  const s = shiftFromRow(row({ "Late Clock In": "Yes", "Early Clock Out": "Yes" }));
  assert.equal(s.says.lateIn, true);
  assert.equal(s.says.earlyOut, true);
  assert.equal(s.says.lateOut, false);
  assert.equal(s.says.onTimeIn, false);
});

// ---- where the two records contradict each other ----
//
// The measured shape on 08/16-08/22: 179 rows flagged "Late Clock In", 135 of
// them printing an actual start time identical to the rostered one.
test("flagged late over a clock-in on the rostered minute is a disagreement", () => {
  const s = shiftFromRow(row({ "Late Clock In": "Yes", "Actual Start Time": "12:00 PM" }));
  assert.equal(s.startDelta, 0);
  const d = clockDisagreements(s);
  assert.equal(d.length, 1);
  assert.equal(d[0].end, "in");
  assert.equal(d[0].says, "late");
  assert.equal(d[0].show, "on the minute");
});

test("flagged late over a clock-in that IS late is no disagreement", () => {
  const s = shiftFromRow(row({ "Late Clock In": "Yes" }));
  assert.deepEqual(clockDisagreements(s), []);
});

test("each end is judged on its own times", () => {
  const s = shiftFromRow(row({ "Late Clock Out": "Yes", "Late Clock In": "Yes" }));
  // in was genuinely late (+8), out was seven minutes early against the flag
  const d = clockDisagreements(s);
  assert.equal(d.length, 1);
  assert.equal(d[0].end, "out");
});

test("'on time' over a clock-in that moved is a disagreement too", () => {
  const s = shiftFromRow(row({ "On Time Clock In": "Yes" }));
  const d = clockDisagreements(s);
  assert.equal(d.length, 1);
  assert.equal(d[0].show, "8 min late");
});

// nothing to compare cannot contradict anything
test("a shift nobody clocked raises no disagreement whatever the flags say", () => {
  const s = shiftFromRow(row({
      "No Clock In": "Yes", "No Clock Out": "Yes",
      "Actual Start Time": "", "Actual End Time": "",
      "Late Clock In": "Yes", "Late Clock Out": "Yes",
    }));
  assert.deepEqual(clockDisagreements(s), []);
});

test("a row with no verdicts at all is silent rather than a throw", () => {
  assert.deepEqual(clockDisagreements(null), []);
  assert.deepEqual(clockDisagreements({}), []);
});
