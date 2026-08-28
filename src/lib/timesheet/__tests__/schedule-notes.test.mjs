// THE REASON STAFF TYPED, WITH THE CLIENT ON IT.
//
// The same notes `comments.js` reads out of the timesheet's printed block, but
// as a table that names the client - which is what lets a reason be handed to
// one booking instead of to a whole day's worth of them.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readScheduleNoteRows, splitReasons, noteDay, noteClock, clockLabel,
} from "../schedule-notes.js";

const row = (over = {}) => ({
  Employee: "Adams, Taylor",
  Client: "Mienik, Grant",
  "Start Date": "8/16/2026",
  "Start Time": "2:45 PM",
  "End Date": "8/16/2026",
  "End Time": "5:34 PM",
  "Total Shift Time": 2.82,
  "Service Type": "ILS Service",
  "Schedule Notes": "Reason given: Client ended early due to being tired and emotional",
  ...over,
});

const one = (over = {}) => readScheduleNoteRows([row(over)])[0];

// ---- the columns ----

test("a row becomes a note with its client and its service on it", () => {
  const note = one();
  assert.equal(note.employee, "Adams, Taylor");
  assert.equal(note.client, "Mienik, Grant");
  assert.equal(note.service, "ILS Service");
});

test("the date is normalised to the spelling every other export uses", () => {
  assert.equal(one().date, "08/16/26");
  assert.equal(noteDay("8/6/2026"), "08/06/26");
  assert.equal(noteDay("not a date"), null);
});

test("the times come through as minutes and as the roster's own spelling", () => {
  const note = one();
  assert.equal(note.start, 885);
  assert.equal(note.end, 1054);
  assert.equal(note.from, "2:45p");
  assert.equal(note.to, "5:34p");
});

// The cards already print these notes as "2:45p-5:34p", and the roster prints
// a whole hour without its minutes.
test("a time on the hour prints without minutes, and noon and midnight are 12", () => {
  assert.equal(clockLabel(480), "8a");
  assert.equal(clockLabel(600), "10a");
  assert.equal(clockLabel(720), "12p");
  assert.equal(clockLabel(0), "12a");
  assert.equal(clockLabel(null), null);
  assert.equal(noteClock("12:00 AM"), 0);
  assert.equal(noteClock("12:30 PM"), 750);
});

// ---- the note itself ----

test("QSP's own label comes off the front", () => {
  assert.equal(one().text, "Client ended early due to being tired and emotional");
});

// 138 of the 290 lines on 08/16-08/27 carry no label at all.
test("a note with no label is kept whole", () => {
  assert.equal(one({ "Schedule Notes": "Traffic accident" }).text, "Traffic accident");
});

// 56 of the 290 carry more than one, printed one per line into the one cell.
test("a shift with two reasons keeps both, apart and joined", () => {
  const note = one({
    "Schedule Notes": "Reason given: Forgot to clock in.\nReason given: Client was done at the library.",
  });
  assert.deepEqual(note.reasons, ["Forgot to clock in.", "Client was done at the library."]);
  assert.equal(note.text, "Forgot to clock in. Client was done at the library.");
});

test("a row with nothing typed on it is not a schedule note", () => {
  assert.deepEqual(readScheduleNoteRows([row({ "Schedule Notes": "" })]), []);
  assert.deepEqual(readScheduleNoteRows([row({ "Schedule Notes": "   \n  " })]), []);
});

test("a row with no date is dropped rather than dated null", () => {
  assert.deepEqual(readScheduleNoteRows([row({ "Start Date": "" })]), []);
});

// 34 of the 290 name no client - the reason an admin or travel block ran the
// way it did is still the reason it ran that way.
test("a note with no client is kept", () => {
  const note = one({ Client: "" });
  assert.equal(note.client, null);
  assert.equal(note.text, "Client ended early due to being tired and emotional");
});

// The Rest Periods report carries this same column and writes at least one of
// them "Cancel Reason:". Only the label QSP puts on a schedule note comes off,
// so nothing else is quietly trimmed away.
test("only QSP's schedule-note label is stripped", () => {
  assert.deepEqual(splitReasons("Cancel Reason: Staff did not attend"),
    ["Cancel Reason: Staff did not attend"]);
});

// The Rest Periods report names its columns differently for the same facts.
test("the rest report's column names are read too", () => {
  const note = readScheduleNoteRows([{
    "Employee Name": "Hernandez-Nieves, Beatriz",
    "Client Name": "Handley, Sarah",
    "Start Date": "8/25/2026",
    "Shift Start Time": "9:00 AM",
    "Shift End Time": "11:00 AM",
    "Service Type": "ILS Service",
    "Schedule Notes": "Reason given: Staff did not attend",
  }])[0];
  assert.equal(note.employee, "Hernandez-Nieves, Beatriz");
  assert.equal(note.client, "Handley, Sarah");
  assert.equal(note.from, "9a");
});
