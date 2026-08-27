// WHY A SHIFT IS WORTH READING.
//
// Every rule here ranks and none of them concludes, which is the whole design:
// a session ending early is ordinary and can still be properly billable. These
// tests pin what each rule fires on and, more importantly, what it stays quiet
// about - a rule that cries wolf on travel time is worse than no rule.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  auditReasons, auditRow, sessionCalledOff, shiftKeyOf, clientKey, sameClient,
  displayClient, AUDIT_RULES,
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
//
// REMOVED 2026-08-27 on Mánu's instruction, both of them. Writing a note up
// early or late is a paperwork habit; what decides whether the hours were
// worked is the clock. The signing time is still read and still shown under the
// note, it just no longer surfaces a shift on its own.

test("nothing about the signing time raises a shift", () => {
  for (const signedAfterMin of [4, -12, -90, -764, 5 * 1440, 30 * 1440, null]) {
    assert.deepEqual(auditReasons(shift(), note({ signedAfterMin })), [], String(signedAfterMin));
  }
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
// The roster and the clock export abbreviate; the note spells the name out.
// Compared as plain strings they never match, and a note that cannot find its
// own client's booking is reported as missing while it sits in the file. Mánu
// caught exactly that on Casey Lewis 08/18 - the note was there, the card said
// "No service note", and the client read `Abigail "Abbie" Sherwold`.

test("the abbreviated spelling and the written-out one are the same client", () => {
  for (const [roster, note_] of [
    ["Mienik, G", "Grant Mienik"],
    ["Michel, C", "Carlos Michel"],
    ["Cosio, J", "Jeffrey Cosio"],
  ]) {
    assert.equal(sameClient(note_, roster), true, `${roster} / ${note_}`);
  }
});

// A NICKNAME IN QUOTES, which is what broke it. The export uses brackets AND
// quotes, sometimes with a stray space: "Hankang (Oliver) Oh",
// `Abigail "Abbie" Sherwold`, "Jose ( Angel) Acuna".
test("a nickname comes off whether it is bracketed or quoted", () => {
  assert.equal(sameClient('Abigail "Abbie" Sherwold', "Sherwold, A"), true);
  assert.equal(sameClient('Michelle "Michael" Tran', "Tran, M"), true);
  assert.equal(sameClient("Hankang (Oliver) Oh", "Oh, H"), true);
  assert.equal(sameClient("Jose ( Angel) Acuna", "Acuna, J"), true);
});

// THE COMMA FORM SAYS WHERE THE SURNAME ENDS and the written-out form never
// does. Guessing "everything after the first word" made "E Nelson" and "Roa
// Garcia" surnames, and got eleven clients wrong.
test("a middle name does not become part of the surname", () => {
  assert.equal(sameClient("William E Nelson", "Nelson, W"), true);
  assert.equal(sameClient("Trixi Roa Garcia", "Garcia, T"), true);
  assert.equal(sameClient("Min Suh Choi", "Choi, M"), true);
  assert.equal(sameClient("George Moussa Faltas", "Faltas, G"), true);
});

test("a surname of several words survives both spellings", () => {
  assert.equal(sameClient("William Mc Carter Jr.", "Mc Carter Jr., W"), true);
  assert.equal(sameClient("William Del Rosario", "Del Rosario, W"), true);
  assert.equal(sameClient("Susan Elder. Morton", "Elder. Morton, S"), true);
});

test("two different clients do not match", () => {
  assert.equal(sameClient("Molly Groty", "Mienik, G"), false);
  // same surname, different person
  assert.equal(sameClient("Johannah Garcia", "Garcia, T"), false);
  assert.equal(sameClient("Susan Nelson", "Nelson, W"), false);
});

test("two abbreviated spellings compare directly", () => {
  assert.equal(sameClient("Nelson, William E", "Nelson, W"), true);
  assert.equal(sameClient("Groty, Molly", "Mienik, G"), false);
});

// two bookings with no client on them are not thereby the same client
test("nothing matches nothing", () => {
  assert.equal(sameClient(null, null), false);
  assert.equal(sameClient("", ""), false);
  assert.equal(sameClient("Mienik, G", null), false);
  assert.equal(clientKey(null), "");
});

// ---- the name as it reads on screen ----
//
// Three spellings of one client reach these screens: the roster abbreviates,
// the clock export spells it out back to front, the note spells it out front to
// back. Showing whichever arrived first put all three shapes on one screen.

test("the clock export's spelling keeps its shape, without the nickname", () => {
  assert.equal(displayClient('Sherwold, Abigail "Abbie"', "Sherwold, A"), "Sherwold, Abigail");
  assert.equal(displayClient("Munoz, Omar", "Munoz, O"), "Munoz, Omar");
});

test("the note's spelling is turned round", () => {
  assert.equal(displayClient("Octavio Nieto", "Nieto, O"), "Nieto, Octavio");
  assert.equal(displayClient("Hankang (Oliver) Oh", "Oh, H"), "Oh, Hankang");
});

// the abbreviated form is the only one that knows where the surname starts
test("a middle name stays with the first name, not the surname", () => {
  assert.equal(displayClient("William E Nelson", "Nelson, W"), "Nelson, William E");
  assert.equal(displayClient("Trixi Roa Garcia", "Garcia, T"), "Garcia, Trixi Roa");
});

test("a surname of several words survives being turned round", () => {
  assert.equal(displayClient("William Mc Carter Jr.", "Mc Carter Jr., W"), "Mc Carter Jr., William");
});

// a shift no clock row and no note ever reached keeps what the roster gave it
test("with no full name anywhere the abbreviation stands", () => {
  assert.equal(displayClient(null, "Sherwold, A"), "Sherwold, A");
  assert.equal(displayClient("", "Sherwold, A"), "Sherwold, A");
});
