// WHY A SHIFT IS WORTH READING.
//
// Every rule here ranks and none of them concludes, which is the whole design:
// a session ending early is ordinary and can still be properly billable. These
// tests pin what each rule fires on and, more importantly, what it stays quiet
// about - a rule that cries wolf on travel time is worse than no rule.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  auditReasons, auditRow, sessionCalledOff, shiftKeyOf, clientKey, sameClient, AUDIT_RULES,
} from "../note-audit.js";

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

// THE RULE THAT WAS REMOVED, and the measurement that removed it.
//
// A note does not carry its own account of when the visit happened. Over the 494
// shifts holding both a note and a clock record, the note's time equals the
// BILLED time in 494 of 494, and the clocked time in none of the 43 where those
// two differ - QSP fills it from the booking. Comparing billed against the note
// was comparing a number with a copy of itself.
test("the note's own times are never used as a finding", () => {
  // a note claiming a quarter of the billed time raises nothing by itself
  const rs = auditReasons(shift(), note({ minutes: 45 }));
  assert.equal(rs.some((r) => r.kind === "paid-over-documented"), false);
  assert.equal(rs.some((r) => r.kind.includes("documented")), false);
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

// ---- what a decision is attached to ----
//
// THE LOAD-BEARING PROPERTY. This project re-uploads pay periods constantly -
// four batches for 08/16-08/31 alone - and every re-upload writes new Timesheet
// rows. A review keyed to one of those rows is discarded the next time somebody
// corrects a period, which is exactly when the reviewing has already been done.

const shiftId = {
  employeeKey: "taylor adams", date: "08/17/26", startMin: 720, client: "Michel, Carlos",
};

test("the same shift produces the same key every time", () => {
  assert.equal(shiftKeyOf(shiftId), shiftKeyOf({ ...shiftId }));
});

test("the key is built from the documents, so a re-upload cannot move it", () => {
  // nothing in it comes from our own database
  assert.equal(shiftKeyOf(shiftId), "taylor adams|08/17/26|720|michel, carlos");
});

test("a different shift on the same day is a different key", () => {
  assert.notEqual(shiftKeyOf(shiftId), shiftKeyOf({ ...shiftId, startMin: 900 }));
  assert.notEqual(shiftKeyOf(shiftId), shiftKeyOf({ ...shiftId, client: "Wang, Michael" }));
  assert.notEqual(shiftKeyOf(shiftId), shiftKeyOf({ ...shiftId, date: "08/18/26" }));
});

// two bookings can start at the same minute for one person - the roster
// overlaps them - so the client is part of what makes the shift itself
test("the client separates two bookings that start at the same minute", () => {
  assert.notEqual(
    shiftKeyOf({ ...shiftId, client: "A" }),
    shiftKeyOf({ ...shiftId, client: "B" }),
  );
});

test("the client is matched regardless of how it was capitalised", () => {
  assert.equal(shiftKeyOf(shiftId), shiftKeyOf({ ...shiftId, client: "MICHEL, CARLOS" }));
});

test("a missing piece still produces a key rather than throwing", () => {
  assert.equal(shiftKeyOf({}), "|||");
  assert.equal(shiftKeyOf({ employeeKey: "x", date: "08/17/26" }), "x|08/17/26||");
});

// ---- the same client, written two ways ----
//
// The roster abbreviates and the service note spells the name out. Compared as
// plain strings they never match, and a note that cannot find its own client's
// booking gets attached to whatever else that person worked that day - which is
// how a note about Anthony Grant was reported against Saneeha Amin's shift.

test("the roster's spelling and the note's spelling are the same client", () => {
  for (const [roster, note] of [
    ["Mienik, G", "Grant Mienik"],
    ["Michel, C", "Carlos Michel"],
    ["Cosio, J", "Jeffrey Cosio"],
    ["Irigoyen, C", "Christina Irigoyen"],
  ]) {
    assert.equal(sameClient(roster, note), true, `${roster} / ${note}`);
  }
});

// "Mc Carter Jr." is one surname with two spaces and a full stop in it, so the
// surname is everything after the FIRST word rather than the last word
test("a surname of several words survives both spellings", () => {
  assert.equal(sameClient("Mc Carter Jr., W", "William Mc Carter Jr."), true);
  assert.equal(clientKey("Mc Carter Jr., W"), "mc carter jr|w");
});

test("a nickname in brackets is not part of the name", () => {
  assert.equal(sameClient("Oh, H", "Hankang (Oliver) Oh"), true);
});

test("two different clients do not match", () => {
  assert.equal(sameClient("Mienik, G", "Molly Groty"), false);
  // same surname, different person
  assert.equal(sameClient("Garcia, S", "Johannah Garcia"), false);
});

// two bookings with no client on them are not thereby the same client
test("nothing matches nothing", () => {
  assert.equal(sameClient(null, null), false);
  assert.equal(sameClient("", ""), false);
  assert.equal(sameClient("Mienik, G", null), false);
  assert.equal(clientKey(null), "");
});

// ---- billed above what was clocked ----
//
// THE ONE THE SCREEN EXISTS FOR. Mánu 2026-08-26, reading his own shift in QSP:
// "i clocked in at 1pm and clocked out at 3:54pm. that is the billable hours i
// did for that client. my schedule had it at 1pm-5pm but since I clocked out
// early my time got changed which is good. some people or admin change their
// time back to the original time (clocking out early and adjusting their time so
// they dont lose hours/money) and thats what we are looking for."

// his own 08/18: rostered 1p-3:54p, clock schedule 1p-5p, clocked out 3:54p.
// Trimmed to what was worked, which is what should happen, and it must be silent
test("a booking trimmed to the early clock-out raises nothing", () => {
  const s = shift({
    schedFrom: 13 * 60, schedTo: 15 * 60 + 54, scheduledMin: 174,
    originalFrom: 13 * 60, originalTo: 17 * 60,          // QSP's Original End Time
    actualFrom: 13 * 60, actualTo: 15 * 60 + 54, workedMin: 174,
  });
  assert.deepEqual(auditReasons(s, note({ minutes: 174, words: 90 })), []);
});

// the same shift with the booking put back to 5pm: four hours billed, 2.9 worked
test("a booking left at its original length after an early clock-out is raised", () => {
  const s = shift({
    schedFrom: 13 * 60, schedTo: 17 * 60, scheduledMin: 240,
    originalFrom: 13 * 60, originalTo: 17 * 60,
    actualFrom: 13 * 60, actualTo: 15 * 60 + 54, workedMin: 174,
  });
  const found = auditReasons(s, note({ minutes: 240, words: 200 }))
    .find((r) => r.kind === "billed-over-clocked");
  assert.ok(found);
  assert.equal(found.billedMin, 240);
  assert.equal(found.clockedMin, 174);
  assert.equal(found.neverTrimmed, true);
  assert.match(found.text, /bills 4\.00 hours and the clock records 2\.90 hours/);
  assert.match(found.text, /still ends where it was originally scheduled/);
});

// trimmed, but not all the way - the booking moved, so it is not the
// left-at-the-original case, and the sentence should not say it was
test("a booking trimmed only part way says so without the original clause", () => {
  const s = shift({
    schedFrom: 13 * 60, schedTo: 16 * 60 + 30, scheduledMin: 210,
    originalFrom: 13 * 60, originalTo: 17 * 60,
    actualFrom: 13 * 60, actualTo: 15 * 60 + 54, workedMin: 174,
  });
  const found = auditReasons(s, note({ minutes: 210 }))
    .find((r) => r.kind === "billed-over-clocked");
  assert.ok(found);
  assert.equal(found.neverTrimmed, false);
  assert.doesNotMatch(found.text, /originally scheduled/);
});

test("a few minutes over the clock is inside the noise", () => {
  const s = shift({ scheduledMin: 180, workedMin: 180 - (AUDIT_RULES.billedOverClockMin - 1) });
  assert.equal(auditReasons(s, note()).some((r) => r.kind === "billed-over-clocked"), false);
});

test("clocking in early or working past the booking is not over-billing", () => {
  const s = shift({ scheduledMin: 180, workedMin: 240 });
  assert.equal(auditReasons(s, note()).some((r) => r.kind === "billed-over-clocked"), false);
});

// a missing punch has its own finding and cannot also be evidence that hours
// were billed above a clock that never recorded them
test("a shift missing a punch is not accused of billing above the clock", () => {
  const s = shift({ noOut: true, workedMin: null, scheduledMin: 240 });
  const kinds_ = kinds(auditReasons(s, note()));
  assert.ok(kinds_.includes("never-clocked"));
  assert.equal(kinds_.includes("billed-over-clocked"), false);
});

// it outranks everything except a shift with no note at all
test("billing above the clock sorts to the top of a card", () => {
  const s = shift({ scheduledMin: 240, workedMin: 120 });
  const rs = auditReasons(s, note({ minutes: 240, words: 1 }));
  assert.equal(rs[0].kind, "billed-over-clocked");
});
