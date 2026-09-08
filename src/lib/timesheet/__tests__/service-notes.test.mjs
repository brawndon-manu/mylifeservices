// READING A DAILY SERVICE NOTE, and the two traps in the document.
//
// Measured on the 8/1-8/26 export: 1,848 pages, 1,259 notes, 49 staff, 218
// clients. Every note carries its own shift times, and those times are the
// CLOCK times - 330 of 373 match the clock export exactly in the week both
// documents cover.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  noteFromLines, readNotePages, noteDate, noteMinute, linesOf,
} from "../service-notes.js";

// the lines of one note, as they come off the page
const NOTE = [
  "Taylor Adams",
  "Daily Service Note",
  "Carlos Michel",
  "Shift Dates/Times",
  "8/5/2026 10:00 AM - 12:00 PM",
  "Summary",
  "o Is High Priority",
  "Staff supported client in practicing communication skills while dining in the community.",
  "Service Notes",
  "Cooking",
  "Self Advocacy",
  "Comments: Staff accompanied client to a restaurant to purchase and enjoy a meal",
  "in a community setting.",
  "Auto Mileage",
  "Do you want to claim miles?",
  "Yes",
  "Employee Name: Signature: Date:",
  "Taylor Adams 8/5/2026 12:04 PM",
  "Printed by: Brandon Uribe Printed on: 8/26/2026 3:11 PM",
];

test("a note reads out who wrote it, for whom, and when", () => {
  const n = noteFromLines(NOTE);
  assert.equal(n.employee, "Taylor Adams");
  assert.equal(n.client, "Carlos Michel");
  assert.equal(n.date, "08/05/26");
  assert.equal(n.start, "10:00 AM");
  assert.equal(n.end, "12:00 PM");
  assert.equal(n.minutes, 120);
});

test("the dates come out in the spelling every other export here uses", () => {
  assert.equal(noteDate("8/5/2026"), "08/05/26");
  assert.equal(noteDate("12/31/2026"), "12/31/26");
  assert.equal(noteDate("not a date"), null);
  assert.equal(noteMinute("12:04 PM"), 12 * 60 + 4);
  assert.equal(noteMinute("12:04 AM"), 4);
});

test("the summary is the narrative, without the priority checkbox", () => {
  const n = noteFromLines(NOTE);
  assert.match(n.summary, /^Staff supported client in practicing/);
  assert.doesNotMatch(n.summary, /Is High Priority/);
});

test("a comment that wraps stays one comment, and the goals stay separate", () => {
  const n = noteFromLines(NOTE);
  assert.deepEqual(n.categories, ["Cooking", "Self Advocacy"]);
  assert.equal(n.comments.length, 1);
  assert.match(n.comments[0], /restaurant to purchase and enjoy a meal in a community setting\.$/);
});

test("mileage is the answer to the question, as a yes or a no", () => {
  assert.equal(noteFromLines(NOTE).miles, true);
  const no = noteFromLines(NOTE.map((l) => (l === "Yes" ? "No" : l)));
  assert.equal(no.miles, false);
});

// ---- the form rebuilt from positions, 2026-09-07 ----
//
// Measured on the 9/1-9/5 export: goal names print at x=45 in their own
// font, comments at x=60, a WRAPPED goal name sits ~11pt under its first
// line, and a NEW goal after an uncommented one leaves the empty comment
// space (~40pt). Mánu, showing the phone screens: an objective answered Yes
// carries a required comment; No has no comment box at all - so a bare goal
// name in print IS a No.

const rl = (text, x, y) => ({ text, x, y, font: "f" });
const RICH_NOTE = [
  rl("Taylor Adams", 277, 733),
  rl("Daily Service Note", 276, 708),
  rl("Michael McPheeters", 14, 679),
  rl("Shift Dates/Times", 14, 659),
  rl("9/1/2026 10:30 AM - 12:06 PM", 29, 643),
  rl("Summary", 14, 623),
  rl("o Is High Priority", 79, 621),
  rl("Staff and client did laundry before going out.", 29, 609),
  rl("Service Notes", 16, 579),
  rl("Cleaning", 45, 564),
  rl("Comments: Staff and client cleaned the bathroom and", 60, 552),
  rl("made the bed.", 60, 540),
  rl("Cooking/Meal Prep", 45, 525),
  rl("Independent Recreation/Participation in", 45, 485),
  rl("Natural Environments", 45, 474),
  rl("Comments: Staff accompanied client to Irvine Spectrum.", 60, 462),
  rl("Auto Mileage", 16, 326),
  rl("Do you want to claim miles?", 45, 311),
  rl("Yes", 67, 299),
  rl("Employee Name: Signature: Date:", 24, 226),
  rl("Taylor Adams 9/1/2026 12:06 PM", 52, 212),
  rl("Printed by: Brandon Uribe Printed on: 9/5/2026 10:19 PM", 101, 22),
];

test("rich lines rebuild the form: one section per objective, comment means yes", () => {
  const n = noteFromLines(RICH_NOTE);
  assert.deepEqual(n.sections, [
    { goal: "Cleaning", comment: "Staff and client cleaned the bathroom and made the bed." },
    { goal: "Cooking/Meal Prep", comment: null },
    { goal: "Independent Recreation/Participation in Natural Environments", comment: "Staff accompanied client to Irvine Spectrum." },
  ]);
  // a wrapped goal name is ONE goal; a bare goal after it stays its own; and
  // no goal name leaks into any comment's text
  assert.deepEqual(n.categories, [
    "Cleaning", "Cooking/Meal Prep", "Independent Recreation/Participation in Natural Environments",
  ]);
  assert.equal(n.comments.length, 2);
  for (const c of n.comments) assert.doesNotMatch(c, /Cooking|Recreation/);
  // words count the writing, not the goal names
  assert.equal(n.words, "Staff and client did laundry before going out. Staff and client cleaned the bathroom and made the bed. Staff accompanied client to Irvine Spectrum.".split(" ").length);
  assert.equal(n.employee, "Taylor Adams");
  assert.equal(n.date, "09/01/26");
  assert.equal(n.signedAt, "12:06 PM");
});

test("the priority checkbox reads unticked as o, anything else as ticked", () => {
  assert.equal(noteFromLines(RICH_NOTE).highPriority, false);
  const ticked = noteFromLines(RICH_NOTE.map((l) =>
    l.text === "o Is High Priority" ? rl("x Is High Priority", 79, 621) : l));
  assert.equal(ticked.highPriority, true);
  assert.doesNotMatch(ticked.summary, /Is High Priority/);
});

test("two uncommented goals in a row stay two goals, not one wrapped name", () => {
  const n = noteFromLines([
    ...RICH_NOTE.slice(0, 9),
    rl("Shopping in Natural Environment", 45, 407),
    rl("Health- Medical/Dental Appointments", 45, 364),
    rl("Independent Recreation in Natural", 45, 324),
    rl("Environments", 45, 313),
    rl("Comments: Staff accompanied client to Panda Express.", 60, 301),
    ...RICH_NOTE.slice(16),
  ]);
  assert.deepEqual(n.sections.map((s) => s.goal), [
    "Shopping in Natural Environment",
    "Health- Medical/Dental Appointments",
    "Independent Recreation in Natural Environments",
  ]);
  assert.equal(n.sections[0].comment, null);
  assert.equal(n.sections[1].comment, null);
  assert.match(n.sections[2].comment, /Panda Express/);
});

test("plain string lines keep the flat reading and no sections", () => {
  const n = noteFromLines(NOTE);
  assert.equal(n.sections, null);
  assert.equal(n.highPriority, false);
});

// ---- the signature, and the trap under it ----

test("the signature is read even when its header wraps onto two lines", () => {
  const wrapped = NOTE.map((l) =>
    l === "Employee Name: Signature: Date:" ? "Employee Name: Signature:" : l);
  wrapped.splice(wrapped.indexOf("Employee Name: Signature:") + 1, 0, "Date:");
  const n = noteFromLines(wrapped);
  assert.equal(n.signedBy, "Taylor Adams");
  assert.equal(n.signedDate, "08/05/26");
  assert.equal(n.signedAt, "12:04 PM");
});

// THE TRAP. "Printed by: Brandon Uribe Printed on: 8/26/2026 3:11 PM" is the
// page footer and it matches the signature's shape exactly. Read as a signature
// it invents a signing time of 3:11 PM on 26 August for every unsigned note,
// and the audit then reports those notes as signed up to sixteen days late.
test("the printed-on footer is not mistaken for a signature", () => {
  const unsigned = NOTE.filter((l) => l !== "Taylor Adams 8/5/2026 12:04 PM");
  const n = noteFromLines(unsigned);
  assert.equal(n.signedAt, null);
  assert.equal(n.signedBy, null);
  assert.equal(n.signedAfterMin, null);
});

test("signing after the shift is a positive lag, before it a negative one", () => {
  // ends 12:00 PM, signed 12:04 PM
  assert.equal(noteFromLines(NOTE).signedAfterMin, 4);
  // signed the evening BEFORE the shift - a real note in the 8/1-8/26 export,
  // Marilyn Urena's 8/14 shift, signed 8/13 at 7:56 PM
  const early = noteFromLines(NOTE.map((l) =>
    l === "Taylor Adams 8/5/2026 12:04 PM" ? "Taylor Adams 8/4/2026 7:56 PM" : l));
  assert.equal(early.signedAfterMin, -1440 + (19 * 60 + 56) - 12 * 60);
  assert.ok(early.signedAfterMin < 0);
});

// ---- splitting the document into notes ----

const page = (lines) => lines;

test("a note runs from its own first page to the start of the next one", () => {
  const notes = readNotePages([
    page(NOTE.slice(0, 13)),
    page(NOTE.slice(13)),
    page(["Marilyn Urena", "Daily Service Note", "Susan Elder", "Shift Dates/Times",
      "8/6/2026 9:00 AM - 10:00 AM", "Summary", "Worked on budgeting.",
      "Employee Name: Signature: Date:", "Marilyn Urena 8/6/2026 10:02 AM"]),
  ]);
  assert.equal(notes.length, 2);
  assert.equal(notes[0].employee, "Taylor Adams");
  assert.equal(notes[0].signedAt, "12:04 PM");   // read across the page break
  assert.equal(notes[0].page, 1);
  assert.equal(notes[1].employee, "Marilyn Urena");
  assert.equal(notes[1].page, 3);
});

// a note with no shift times cannot be lined up against a roster or a clock, so
// keeping it would put a row on the audit screen that no rule can ever judge
test("a note with no shift times is left out rather than kept unjudgeable", () => {
  const notes = readNotePages([
    page(["Someone", "Daily Service Note", "A Client", "Summary", "No times on this one."]),
  ]);
  assert.deepEqual(notes, []);
});

test("a document with no notes in it reads as none rather than throwing", () => {
  assert.deepEqual(readNotePages([]), []);
  assert.deepEqual(readNotePages([page(["Cover page"]), page(["Index"])]), []);
});

// THE CHARACTER THAT TAKES AN UPLOAD DOWN.
//
// The 8/1-8/26 export carries a NUL. Stored without stripping it the insert
// comes back `22P05, unsupported Unicode escape sequence`, naming neither the
// note nor the character - the failure that took four timesheet uploads down on
// 2026-08-15. Taken off where the text comes off the page, the same place
// `parse.js` does it for the timesheet.
//
// The escape is written out rather than pasted: a literal NUL in a source file
// makes ripgrep call the whole file binary and skip it in every search.
const NUL = String.fromCharCode(0);

const item = (str, x, y) => ({ str, transform: [0, 0, 0, 0, x, y] });

test("a control character is stripped as the text comes off the page", () => {
  const lines = linesOf([item(`Taylor${NUL} Adams`, 0, 700), item("Daily Service Note", 0, 680)]);
  assert.deepEqual(lines, ["Taylor Adams", "Daily Service Note"]);
  assert.equal(lines[0].includes(NUL), false);
});

test("a line is rebuilt left to right, and the page top to bottom", () => {
  assert.deepEqual(
    linesOf([item("second", 0, 100), item("world", 60, 200), item("hello", 10, 200)]),
    ["hello world", "second"],
  );
});

// A NOTE THAT BREAKS BETWEEN ITS HEADER AND ITS CLIENT NAME.
//
// Once in 1,259: Marilyn Urena's 08/04 note ends a page after "Daily Service
// Note" and opens the next one with the client. Read as "the third line of the
// note", the client came out as the page footer - "Printed by: Brandon Uribe
// Printed on: 8/26/2026 3:11 PM" - and the shift then matched no client at all.
test("the client is the line above the shift times, across a page break", () => {
  const n = noteFromLines([
    "Marilyn Urena",
    "Daily Service Note",
    "Printed by: Brandon Uribe Printed on: 8/26/2026 3:11 PM",
    "Matthew Arslan",
    "Shift Dates/Times",
    "8/4/2026 3:00 PM - 5:00 PM",
    "Summary",
    "Shifting Support to ILS",
  ]);
  assert.equal(n.client, "Matthew Arslan");
  assert.equal(n.employee, "Marilyn Urena");
  assert.equal(n.start, "3:00 PM");
});

test("an ordinary note still reads its client from the same place", () => {
  assert.equal(noteFromLines(NOTE).client, "Carlos Michel");
});
