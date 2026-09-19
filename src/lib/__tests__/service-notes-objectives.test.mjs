// THE OBJECTIVES OF A SERVICE NOTE END WHERE THE NOTE ENDS.
//
// Found on 2026-09-18 while building the clock amendment: a note with no
// mileage question ran its objectives slice off the end of its own lines,
// through the page footer and onto the signature page. The column anchor then
// landed on the footer, every real goal was read as a comment continuation,
// and the note came out as one nameless objective with "Printed by: ..."
// glued onto its comment and "Employee Name: Signature: Date:" as a goal.
// 101 of 10,927 stored DSN notes carried that fingerprint.
import test from "node:test";
import assert from "node:assert/strict";
import { noteFromLines } from "../timesheet/service-notes.js";

// the 09/02 note, in the shape richLinesOf hands over: goals in their own
// column (x=45), comments to the right (x=60), the footer at the page margin
// (x=30), and the signature block on the next page
const L = (text, x, y) => ({ text, x, y });
const HEAD = [
  L("Lauran Robinson", 45, 740), L("Daily Service Note", 45, 728), L("Frances Tsao", 45, 716),
  L("Shift Dates/Times", 45, 704), L("9/2/2026 4:30 PM - 6:30 PM", 45, 692),
  L("Summary", 45, 680), L("o Is High Priority", 45, 668),
  L("A. Client worked on developing and maintaining independent living skills.", 45, 656),
  L("Service Notes", 45, 640),
];
const GOALS = [
  L("Cleaning", 45, 620), L("Comments: Client did a load of laundry.", 60, 608),
  L("Cooking", 45, 580), L("Money Management", 45, 540),
  L("Personal Health and Hygiene", 45, 500), L("Comments: Client spent 8 minutes walking.", 60, 488),
  L("Independent Recreation in Natural", 45, 460), L("Environments", 45, 449),
  L("Home and Community Safety", 45, 420), L("Shopping in Natural Environment", 45, 380),
];
const FOOT = [L("Printed by: Brandon Uribe Printed on: 9/18/2026 4:08 PM", 30, 40)];
const PAGE2 = [
  L("Employee Name: Signature: Date:", 36, 740), L("Lauran Robinson 9/2/2026 6:11 PM", 36, 728),
  L("Printed by: Brandon Uribe Printed on: 9/18/2026 4:08 PM", 30, 40),
];

test("a note with no mileage question keeps its objectives and loses the footer", () => {
  const note = noteFromLines([...HEAD, ...GOALS, ...FOOT, ...PAGE2]);
  assert.equal(note.sections.length, 7);
  assert.deepEqual(note.categories, [
    "Cleaning", "Cooking", "Money Management", "Personal Health and Hygiene",
    "Independent Recreation in Natural Environments", "Home and Community Safety", "Shopping in Natural Environment",
  ]);
  assert.equal(note.comments.length, 2);
  assert.ok(note.comments.every((c) => !/Printed (by|on):/i.test(c)), "the footer is not part of any comment");
  assert.ok(!note.categories.some((g) => /^Employee Name:/.test(g)), "the signature header is not a goal");
  // and the signature is still read off the next page
  assert.equal(note.signedBy, "Lauran Robinson");
  assert.equal(note.signedAt, "6:11 PM");
});

test("a note whose objectives run onto a second page keeps both pages", () => {
  const second = [
    L("Home and Community Safety", 45, 740), L("Comments: Checked the smoke alarm with the client.", 60, 728),
    L("Shopping in Natural Environment", 45, 700),
  ];
  const note = noteFromLines([...HEAD, ...GOALS.slice(0, 8), ...FOOT, ...second, ...PAGE2]);
  // the footer between the two pages is skipped rather than treated as the end
  assert.equal(note.sections.length, 7);
  assert.equal(note.sections[5].goal, "Home and Community Safety");
  assert.equal(note.sections[5].comment, "Checked the smoke alarm with the client.");
  assert.equal(note.sections[6].goal, "Shopping in Natural Environment");
});

test("the mileage question still ends the objectives where a note has one", () => {
  const note = noteFromLines([...HEAD, ...GOALS, L("Auto Mileage", 45, 360), L("Do you want to claim miles?", 45, 348), L("No", 45, 336), ...FOOT, ...PAGE2]);
  assert.equal(note.sections.length, 7);
  assert.equal(note.miles, false);
});

test("the flat reading gets the same footer treatment", () => {
  const texts = [...HEAD, ...GOALS, ...FOOT, ...PAGE2].map((l) => l.text);
  const note = noteFromLines(texts);
  assert.equal(note.sections, null, "plain strings keep the flat reading");
  assert.ok(!note.categories.some((g) => /Printed (by|on):|^Employee Name:/.test(g)));
  assert.ok(!note.comments.some((c) => /Printed (by|on):/.test(c)));
});
