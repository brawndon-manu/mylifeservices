// THE COMMENTS BLOCK, SPLIT BACK INTO DAYS.
//
// Real lines off 08/16-08/31, client names taken out. The wrapping is the whole
// difficulty: QSP prints a note across as many lines as it needs and only the
// first carries the date.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseComments, notesFor, datesWithNotes } from "../comments.js";

// Beall, Allyson - four notes, two of them wrapped, one carrying a second
// "Reason given:" inside its own text
const BEALL = [
  "1) 08/17/26 4p-6:07p: Reason given: Notes took a minute",
  "2) 08/18/26 4p-5:30p: Reason given: Was asked by supervisor to assist new staff with arriving at her clients home",
  "as she was having issues.",
  "3) 08/20/26 10a-1p: Originally scheduled for a client -- mother canceled on staff 30 min prior to shift.",
  "4) 08/21/26 10a-2p: Additional stops: Walmart",
];

test("each note carries the day and the block it is about", () => {
  const out = parseComments(BEALL);
  assert.equal(out.length, 4);
  assert.deepEqual(
    out.map((c) => `${c.date} ${c.from}-${c.to}`),
    ["08/17/26 4p-6:07p", "08/18/26 4p-5:30p", "08/20/26 10a-1p", "08/21/26 10a-2p"],
  );
});

test("a wrapped line joins the note above it", () => {
  const out = parseComments(BEALL);
  assert.match(out[1].text, /assist new staff with arriving at her clients home as she was having issues\.$/);
});

test('"Reason given:" comes off, because the label is the column', () => {
  assert.equal(parseComments(BEALL)[0].text, "Notes took a minute");
  // a note that never had the prefix is untouched
  assert.match(parseComments(BEALL)[3].text, /^Additional stops/);
});

test("a day's notes come back on their own", () => {
  assert.equal(notesFor(BEALL, "08/18/26").length, 1);
  assert.equal(notesFor(BEALL, "08/19/26").length, 0);
  assert.equal(notesFor(BEALL, null).length, 0);
  assert.match(notesFor(BEALL, "08/20/26")[0].text, /mother canceled/);
});

test("two notes on one day both come back", () => {
  const two = [
    "1) 08/21/26 10a-1:36p: Reason given: Putting groceries in apartment",
    "2) 08/21/26 2:30p-4:46p: Reason given: Staff assisted client with calling bank. Problem",
    "solved/bank error",
  ];
  const out = notesFor(two, "08/21/26");
  assert.equal(out.length, 2);
  assert.match(out[1].text, /Problem solved\/bank error$/);
});

test("which days have any, without parsing per row", () => {
  assert.deepEqual([...datesWithNotes(BEALL)], ["08/17/26", "08/18/26", "08/20/26", "08/21/26"]);
});

test("nothing, empty and junk are all just no notes", () => {
  assert.deepEqual(parseComments(null), []);
  assert.deepEqual(parseComments([]), []);
  assert.deepEqual(parseComments(["", "   "]), []);
  // a wrapped line with no note above it has nothing to attach to
  assert.deepEqual(parseComments(["as she was having issues."]), []);
});
