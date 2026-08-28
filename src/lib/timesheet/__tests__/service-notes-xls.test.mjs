// THE OTHER SERVICE NOTES REPORT.
//
// The Employee Detailed Daily Service Notes PDF leaves every Field Supervisor
// out, and this .xls is where their notes are. Neither report is complete on
// its own, so these tests pin two things: that a worksheet is read the way QSP
// prints it, and that merging the two never silently drops a note.
//
// Driven off worksheet rows rather than a file, for the same reason the PDF
// reader's tests are driven off page lines: the export is a 21MB, 276-sheet
// workbook that is not in the repo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readServiceNoteSheet, splitNoteBody, mergeNotes } from "../service-notes-xls.js";

// one worksheet, exactly as `readXlsSheets` hands it over: leading blank rows,
// the title block, the column header, then a shift and its note in a pair
const sheet = (entries) => [
  [null, null, null, null, null],
  [null, null, null, null, null],
  [null, null, null, null, null],
  [null, null, "My Life Services Service Notes", null, null],
  [null, "Staff Name: Aaron Jones", null, "Client Name: James Caviar", null],
  [null, "Date: 8/16/2026 - 8/27/2026", null, "UCI Number: 6861783", null],
  [null, null, null, null, null],
  [null, "Date", "Start Time - End Time", "", "   Total Time   "],
  ...entries.flatMap(([date, times, body]) => [
    [null, date, times, null, 2],
    [null, null, body, null, null],
  ]),
];

const one = (over = {}) => {
  const notes = readServiceNoteSheet(sheet([
    ["08/17/2026", "8:00 AM-10:00 AM (ILS Service)", "Time management:\nSupervisor assisted client with scheduling."],
  ]), over);
  return notes[0];
};

// ---- reading a worksheet ----

test("the staff member and the client come off the title block", () => {
  const note = one();
  assert.equal(note.employee, "Aaron Jones");
  assert.equal(note.client, "James Caviar");
});

test("the date is normalised to the spelling every other export uses", () => {
  assert.equal(one().date, "08/17/26");
});

test("the shift times and the service type are read off the one cell", () => {
  const note = one();
  assert.equal(note.start, "8:00 AM");
  assert.equal(note.end, "10:00 AM");
  assert.equal(note.service, "ILS Service");
  assert.equal(note.minutes, 120);
});

test("the account of the work is the row beneath the shift", () => {
  const note = one();
  assert.deepEqual(note.categories, ["Time management"]);
  assert.deepEqual(note.comments, ["Supervisor assisted client with scheduling."]);
  assert.equal(note.words, 5);
});

test("every shift on a worksheet is read, not just the first", () => {
  const notes = readServiceNoteSheet(sheet([
    ["08/17/2026", "8:00 AM-10:00 AM (ILS Service)", "Cooking:\nStaff cooked with the client."],
    ["08/19/2026", "1:00 PM-3:30 PM (ILS Service)", "Shopping:\nStaff shopped with the client."],
  ]));
  assert.equal(notes.length, 2);
  assert.deepEqual(notes.map((n) => n.date), ["08/17/26", "08/19/26"]);
  assert.equal(notes[1].minutes, 150);
});

// A CLIENT-LESS SHEET IS KEPT. It is where the ILS Admin, Travel and Misc notes
// are filed - 335 of the 621 entries on 08/16-08/27 - and dropping it would
// quietly decide that only client work is documented.
test("a sheet with no client still yields its notes", () => {
  const rows = sheet([["08/17/2026", "8:00 AM-10:00 AM (ILS Admin)", "Misc:\nSupervisor wrote up the week."]]);
  rows[4] = [null, "Staff Name: Aaron Jones", null, "Client Name: ", null];
  const notes = readServiceNoteSheet(rows);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].client, null);
  assert.equal(notes[0].service, "ILS Admin");
});

test("a worksheet with no staff name yields nothing rather than a nameless note", () => {
  const rows = sheet([["08/17/2026", "8:00 AM-10:00 AM (ILS Service)", "Cooking:\nStaff cooked."]]);
  rows[4] = [null, null, null, null, null];
  assert.deepEqual(readServiceNoteSheet(rows), []);
});

// THE TITLE BLOCK CARRIES A DATE RANGE that looks exactly like a shift date, so
// a reader keying on "a cell holding a date" alone invents a note out of the
// header of every sheet in the workbook.
test("the report's own date range is not read as a shift", () => {
  const notes = readServiceNoteSheet(sheet([]));
  assert.deepEqual(notes, []);
});

// ---- the note body ----

test("a line ending in a colon is the goal, the rest is the account", () => {
  const { categories, comments } = splitNoteBody("Cooking:\nStaff cooked.\n\nShopping:\nStaff shopped.");
  assert.deepEqual(categories, ["Cooking", "Shopping"]);
  assert.deepEqual(comments, ["Staff cooked.", "Staff shopped."]);
});

// 58 of 1,653 lines on 08/16-08/27 end in a colon, so the ordinary note is
// prose in paragraphs with no goal named at all.
test("a note with no goal line is all prose rather than all category", () => {
  const { categories, comments } = splitNoteBody("PTO -- Call off, informed Kristy");
  assert.deepEqual(categories, []);
  assert.deepEqual(comments, ["PTO -- Call off, informed Kristy"]);
});

// ---- merging the two reports ----

const note = (over = {}) => ({
  employee: "Marilyn Urena", client: "Silvia Amezcua", date: "08/26/26",
  start: "7:45 AM", end: "9:45 AM", minutes: 120, words: 67,
  summary: "", categories: [], comments: [], ...over,
});

test("a note in both reports is kept once, and the PDF's is the one kept", () => {
  const merged = mergeNotes([note({ signedBy: "Marilyn Urena" })], [note({ signedBy: null })]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].signedBy, "Marilyn Urena");
});

// THE FIVE THAT WERE NOT DUPLICATES. Keyed on person + day + start alone, the
// 08/16-08/27 merge dropped three real notes: Urena's 7:45am ILS Misc write-up
// sat under her 7:45am ILS Service visit, and Esmeralda Flores filed one
// account of one shopping trip against two different clients.
test("two notes at the same minute for different clients are both kept", () => {
  const merged = mergeNotes([note()], [note({ client: null, words: 103 })]);
  assert.equal(merged.length, 2);
});

test("a client spelled with a doubled space is still the same client", () => {
  const merged = mergeNotes([note({ client: "Susan Elder. Morton" })], [note({ client: "Susan Elder.  Morton" })]);
  assert.equal(merged.length, 1);
});

test("a note only the xls has survives the merge", () => {
  const merged = mergeNotes([], [note({ employee: "Ilean Solorzano" })]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].employee, "Ilean Solorzano");
});
