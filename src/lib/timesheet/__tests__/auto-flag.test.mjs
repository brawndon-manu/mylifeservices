// THE AUTO FLAGGER'S RULES, pinned. The dangerous edges each get a test: a
// decided shift is invisible, GPS blank is not GPS "no", in-person sessions
// that mention phone calls do not fire, benefits-cancelled is not
// session-cancelled, and several rules make ONE flag.
import { test } from "node:test";
import assert from "node:assert/strict";
import { autoFlagRow, autoFlagPlan, autoFlagText, FILED_GAP_MIN, languageMatches, flaggedForWording } from "../auto-flag.js";

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

test("the missing DSN fires off the screen's own finding", () => {
  assert.equal(
    autoFlagRow(row({ reasons: [{ kind: "no-note" }] })).reason,
    "Auto: no DSN.",
  );
  assert.equal(autoFlagRow(row({ reasons: [] })), null);
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

// THE FILING WINDOW IS FIFTEEN MINUTES, either side of the clock out - raised
// from ten on 2026-09-22. pinned at the edge in both directions, because a
// constant that drifts back to ten would quietly flag five minutes of ordinary
// paperwork on every card.
test("a DSN filed more than fifteen minutes from the clock out fires, fifteen does not", () => {
  assert.equal(FILED_GAP_MIN, 15);
  const filed = (gap) => row({ note: { summary: "Staff assisted client at the park.", comments: [], filedGapMin: gap } });
  assert.equal(autoFlagRow(filed(15)), null);
  assert.equal(autoFlagRow(filed(-15)), null);
  assert.equal(autoFlagRow(filed(16)).reason, "Auto: the DSN was filed more than 15 minutes from the clock out.");
  assert.equal(autoFlagRow(filed(-16)).reason, "Auto: the DSN was filed more than 15 minutes from the clock out.");
  assert.equal(autoFlagRow(filed(null)), null);
});

// AN APPROVED CLOCK AMENDMENT ANSWERS THE PUNCH RULES, end by end: a supplied
// time for a missing punch, a stated place for a punch with no location. the
// end it did not cover still fires.
test("an approved amendment stands down the punch rule at the end it covers, and no other", () => {
  assert.equal(autoFlagRow(row({ noOut: true, amendment: { outChanged: true } })), null);
  assert.equal(autoFlagRow(row({ noOut: true, amendment: { inChanged: true } })).reason, "Auto: no clock out.");
  assert.equal(autoFlagRow(row({ noIn: true, amendment: { inChanged: true } })), null);
  assert.equal(autoFlagRow(row({ gpsOut: "no", amendment: { placeOut: "the client's home" } })), null);
  assert.equal(autoFlagRow(row({ gpsOut: "no", amendment: { placeIn: "the client's home" } })).reason, "Auto: GPS missing at clock out.");
  assert.equal(autoFlagRow(row({ gpsIn: "no", amendment: { placeIn: "the park" } })), null);
});

// WHAT WAS SAID: the sentence a language rule matched, the words that tripped
// it and the report it came from, so a flag can be judged against the note
// rather than the rule's name
test("a wording flag quotes the sentence it matched, marks the words and names the report", () => {
  const r = row({
    note: { source: "dsn", summary: "Staff drove to the home. Client cancelled session when staff arrived. Staff went back to the office.", comments: ["Both didn't answer and one client left a message for them to call him back."] },
    scheduleNote: { text: "Rest break added per timesheet review — QA Admin" },
  });
  const found = languageMatches(r);
  assert.deepEqual(found.map((m) => [m.key, m.source, m.matched, m.sentence]), [
    ["cancelled", "DSN", "Client cancelled", "Client cancelled session when staff arrived."],
    ["remote", "DSN comment", "left a message", "Both didn't answer and one client left a message for them to call him back."],
  ]);
  // the supervisor .xls note is named for what it is
  assert.equal(languageMatches(row({ note: { source: "xls", summary: "Client was not home today." } }))[0].source, "service note");
  // the QA annotation is not staff language, and a clean note matches nothing
  assert.deepEqual(languageMatches(row({ scheduleNote: { text: "Rest break added per timesheet review — QA Admin" } })), []);
  assert.deepEqual(languageMatches(row()), []);
});

test("only an auto flag that came from the wording opens the quote", () => {
  assert.equal(flaggedForWording({ reason: "Auto: the note mentions a cancellation or no show." }), true);
  assert.equal(flaggedForWording({ reason: "Auto: billed above the clock; the note records contact that was not in person." }), true);
  assert.equal(flaggedForWording({ reason: "Auto: billed above the clock." }), false);
  assert.equal(flaggedForWording({ reason: "the note mentions a cancellation or no show" }), false);
  assert.equal(flaggedForWording(null), false);
});
