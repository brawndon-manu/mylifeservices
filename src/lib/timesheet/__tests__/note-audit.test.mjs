// WHY A SHIFT IS WORTH READING.
//
// Every rule here ranks and none of them concludes, which is the whole design:
// a session ending early is ordinary and can still be properly billable. These
// tests pin what each rule fires on and, more importantly, what it stays quiet
// about - a rule that cries wolf on travel time is worse than no rule.
import { test } from "node:test";
import assert from "node:assert/strict";
import { auditReasons, auditRow, sessionCalledOff, AUDIT_RULES } from "../note-audit.js";

const shift = (over = {}) => ({
  name: "Test, Person", date: "08/17/26", service: "ILS Service", client: "Client, A",
  schedFrom: 720, schedTo: 900, scheduledMin: 180,
  actualFrom: 720, actualTo: 900, workedMin: 180,
  noIn: false, noOut: false, gpsIn: "yes", gpsOut: "yes", ...over,
});

const note = (over = {}) => ({
  employee: "Test Person", client: "Client A", date: "08/17/26",
  start: "12:00 PM", end: "3:00 PM", startMin: 720, endMin: 900, minutes: 180,
  summary: "Staff supported the client with cooking and budgeting through the afternoon session.",
  comments: [], categories: [], words: 60,
  signedAt: "3:04 PM", signedDate: "08/17/26", signedAfterMin: 4, ...over,
});

const kinds = (rs) => rs.map((r) => r.kind).sort();

test("a shift with a full note and matching times raises nothing", () => {
  assert.deepEqual(auditReasons(shift(), note()), []);
});

// ---- a billed shift with nothing filed against it ----

test("a client shift with no note is the heaviest reason there is", () => {
  const rs = auditReasons(shift(), null);
  assert.deepEqual(kinds(rs), ["no-note"]);
  assert.equal(rs[0].weight, 100);
});

// THE RULE THAT HAD TO BE NARROWED. A daily service note documents time with a
// CLIENT. Nobody writes one against travel or admin, and asking anyway fired on
// 1,644 shifts across 08/01-08/26 - two thirds of them travel and admin - which
// is a list nobody reads to the bottom.
test("travel, admin and misc are not asked for a note they never have", () => {
  for (const service of ["ILS Travel", "ILS Admin", "ILS Misc", "ILS Training"]) {
    assert.deepEqual(auditReasons(shift({ service }), null), [], service);
  }
});

test("Self Determination is a client booking and is asked", () => {
  const rs = auditReasons(shift({ service: "Self Determination Program" }), null);
  assert.deepEqual(kinds(rs), ["no-note"]);
});

// ---- billed above what the note documents ----

test("a note documenting less than was billed says so, with both figures", () => {
  // billed 3.00 hours, the note documents 12:00-1:00
  const rs = auditReasons(shift(), note({ end: "1:00 PM", endMin: 780, minutes: 60 }));
  const found = rs.find((r) => r.kind === "paid-over-documented");
  assert.ok(found);
  assert.equal(found.billedMin, 180);
  assert.equal(found.documentedMin, 60);
  assert.match(found.text, /bills 3\.00 hours and the note documents 1\.00 hours/);
});

test("a few minutes either way is inside the noise and stays quiet", () => {
  const rs = auditReasons(shift(), note({ minutes: 180 - (AUDIT_RULES.paidOverMin - 1) }));
  assert.equal(rs.some((r) => r.kind === "paid-over-documented"), false);
});

test("a note documenting MORE than was billed is not a finding", () => {
  const rs = auditReasons(shift(), note({ minutes: 300 }));
  assert.deepEqual(rs, []);
});

// ---- the session being called off ----

test("the session being called off is caught", () => {
  for (const text of [
    "Arrived and client cancelled shift because she made plans with a friend.",
    "Staff arrived with client, but client canceled services for today.",
    "As a result, client requested to cancel session.",
    "Client canceled last min due to not feeling well",
  ]) {
    assert.equal(sessionCalledOff({ summary: text, comments: [] }), true, text);
  }
});

// THE RULE THIS ONE EXISTS TO NOT BE. Searching for the word alone returns 17
// notes in a month and about three of them are the session falling through. The
// rest are the service being DELIVERED, and flagging somebody for helping a
// client cancel a gym membership is worse than having no rule at all.
test("helping a client cancel something in the world is not the session falling through", () => {
  for (const text of [
    "Self Advocacy- Staff helped client communicate with phone service provider to cancel her phone.",
    "the client mention to the staff to cancel their gym membership due to the fact that they have moved",
    "Client received a phone call that CT scan appointment was canceled.",
    "Client cancelled appointment due to misunderstanding a voicemail he had received.",
  ]) {
    assert.equal(sessionCalledOff({ summary: text, comments: [] }), false, text);
  }
});

test("the keyword reads the comments as well as the summary", () => {
  assert.equal(
    sessionCalledOff({ summary: "Cooking", comments: ["Client canceled the session."] }),
    true,
  );
});

// ---- when the note was signed ----

test("writing up at the end of the activity is ordinary and raises nothing", () => {
  // signed four minutes after the shift ended, and 307 of 840 are within five
  assert.deepEqual(auditReasons(shift(), note({ signedAfterMin: 4 })), []);
  assert.deepEqual(auditReasons(shift(), note({ signedAfterMin: -12 })), []);
});

test("signed an hour or more before the shift ended is raised", () => {
  const rs = auditReasons(shift(), note({ signedAfterMin: -90 }));
  assert.deepEqual(kinds(rs), ["signed-before-shift"]);
  assert.match(rs[0].text, /90 minutes before the shift ended/);
});

// Marilyn Urena's 8/14 note, signed at 7:56 PM on 8/13 - before the shift it
// describes had begun. A different statement from being written up early.
test("signed before the shift BEGAN says that instead", () => {
  const rs = auditReasons(shift(), note({ signedAfterMin: -764 }));
  const found = rs.find((r) => r.kind === "signed-before-shift");
  assert.equal(found.beforeStart, true);
  assert.equal(found.text, "The note was signed before the shift began.");
});

test("signed days afterwards is its own, lighter reason", () => {
  const rs = auditReasons(shift(), note({ signedAfterMin: 5 * 1440 }));
  assert.deepEqual(kinds(rs), ["signed-late"]);
  assert.match(rs[0].text, /5\.0 days after/);
});

test("a note with no signature raises neither", () => {
  const rs = auditReasons(shift(), note({ signedAfterMin: null, signedAt: null }));
  assert.equal(rs.some((r) => r.kind.startsWith("signed-")), false);
});

// ---- too thin to carry the time ----

test("one word against a two hour shift is raised", () => {
  const rs = auditReasons(shift({ scheduledMin: 120 }), note({ words: 1, minutes: 120 }));
  const found = rs.find((r) => r.kind === "thin-note");
  assert.ok(found);
  assert.match(found.text, /^1 word against 2\.00 hours billed\./);
});

// forty words is a full account of twenty minutes and no account of four hours,
// which is why the rule is rated per hour rather than per note
test("a short note on a short shift is not thin", () => {
  assert.deepEqual(auditReasons(shift({ scheduledMin: 20 }), note({ words: 20, minutes: 20 })), []);
});

// ---- the clock ----

test("a shift nobody clocked is raised even when its note is perfect", () => {
  const rs = auditReasons(shift({ noOut: true, workedMin: null }), note());
  assert.ok(rs.some((r) => r.kind === "never-clocked"));
});

// ---- the row ----

test("a row carries all three records and orders its reasons heaviest first", () => {
  const row = auditRow(shift({ noIn: true, workedMin: null }), null);
  assert.equal(row.billedMin, 180);
  assert.equal(row.clockedMin, null);
  assert.equal(row.documentedMin, null);
  assert.deepEqual(row.reasons.map((r) => r.kind), ["no-note", "never-clocked"]);
  assert.equal(row.score, 140);
});

// a function cannot cross into a client component - React refuses the whole
// render rather than dropping it - and these objects are handed straight to one
test("a reason carries its sentence and not the function that wrote it", () => {
  for (const r of auditRow(shift(), null).reasons) {
    assert.equal(typeof r.text, "string");
    assert.equal(r.describe, undefined);
  }
});

test("nothing to read is no reasons rather than a throw", () => {
  assert.deepEqual(auditReasons(null, null), []);
  assert.equal(auditRow(null, null).score, 0);
});
