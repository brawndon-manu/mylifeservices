// THE AUTO FLAGGER'S RULES, pinned. The dangerous edges each get a test: a
// decided shift is invisible, GPS blank is not GPS "no", in-person sessions
// that mention phone calls do not fire, benefits-cancelled is not
// session-cancelled, and several rules make ONE flag.
import { test } from "node:test";
import assert from "node:assert/strict";
import { autoFlagRow, autoFlagPlan, autoFlagText } from "../auto-flag.js";

const row = (over = {}) => ({
  shiftKey: "k", review: null,
  billedMin: 240, clockedMin: 240,
  note: { summary: "Staff assisted client at the park.", comments: [] },
  scheduleNote: null,
  inClockExport: true, noIn: false, noOut: false, gpsIn: "yes", gpsOut: "yes",
  ...over,
});

test("a clean in-person shift raises nothing", () => {
  assert.equal(autoFlagRow(row()), null);
});

test("a decided shift is invisible to the engine", () => {
  assert.equal(autoFlagRow(row({ billedMin: 300, review: { decision: "approved" } })), null);
  assert.equal(autoFlagRow(row({ billedMin: 300, review: { decision: "flagged" } })), null);
});

test("billed above the clock fires on any minute over and not at level", () => {
  assert.equal(autoFlagRow(row({ billedMin: 241 })).reason, "Auto: billed above the clock.");
  assert.equal(autoFlagRow(row({ billedMin: 240 })), null);
  assert.equal(autoFlagRow(row({ billedMin: 200 })), null);
});

test("cancellation language fires and benefits-cancelled does not", () => {
  assert.equal(
    autoFlagRow(row({ note: { summary: "Client cancelled the session today." } })).reason,
    "Auto: the note mentions a cancellation or no show.",
  );
  assert.equal(
    autoFlagRow(row({ note: { summary: "His Medical got cancelled because he didn't renew it. Staff met the client." } })),
    null,
  );
});

test("supervisor phone notes fire and in-person calls together do not", () => {
  assert.equal(
    autoFlagRow(row({ note: { summary: "***Supervisor was in contact with client via phone." } })).reason,
    "Auto: the note records contact that was not in person.",
  );
  assert.equal(
    autoFlagRow(row({ note: { summary: "Staff assisted client with calling the insurance and left a voicemail, then took client to lunch." } })),
    null,
  );
});

test("no note in any source fires; a schedule note alone is a note", () => {
  assert.equal(
    autoFlagRow(row({ note: null, scheduleNote: null })).reason,
    "Auto: no service note, schedule note, or DSN.",
  );
  assert.equal(autoFlagRow(row({ note: null, scheduleNote: { text: "ended early" } })), null);
});

test("missed punches fire only where the export holds the shift", () => {
  assert.equal(autoFlagRow(row({ noOut: true })).reason, "Auto: no clock out.");
  assert.equal(autoFlagRow(row({ noIn: true })).reason, "Auto: no clock in.");
  assert.equal(autoFlagRow(row({ noOut: true, inClockExport: false })), null);
});

test("GPS 'no' fires and blank GPS says nothing", () => {
  assert.equal(autoFlagRow(row({ gpsOut: "no" })).reason, "Auto: GPS missing at clock out.");
  assert.equal(autoFlagRow(row({ gpsIn: null, gpsOut: null })), null);
});

test("several rules make one flag with the phrases joined", () => {
  const v = autoFlagRow(row({ billedMin: 250, noOut: true, gpsIn: "no" }));
  assert.equal(v.reason, "Auto: billed above the clock; no clock out; GPS missing at clock in.");
});

test("the plan counts per rule and the QA annotation is not staff language", () => {
  const rows = [
    row({ billedMin: 250 }),
    row({ scheduleNote: { text: "Rest break added per timesheet review — QA Admin" }, note: null }),
    row({ review: { decision: "approved" }, billedMin: 300 }),
  ];
  const { counts, flags } = autoFlagPlan(rows);
  assert.equal(counts["above-clock"], 1);
  assert.equal(flags.length, 1);
  assert.equal(autoFlagText(rows[1]), "");
});
