// A NOTE HAS TO OUTLIVE THE UPLOAD IT WAS WRITTEN ON.
//
// The four notes ever written on the people page are keyed on (batch, row), and
// one of the four is already invisible because a later export replaced its
// batch. This period is uploaded again several times a day while corrections go
// back into QuickSolve, so a note keyed that way could not be written at all.
//
// These pin the key itself rather than the screen: a note keyed on anything an
// upload remakes would still render perfectly and quietly vanish the next
// morning, which is exactly how the 70 marks went.
import { test } from "node:test";
import assert from "node:assert/strict";

import { cleanNoteBody, notesByKey, noteKeyOf, canHoldNote, NOTE_MAX } from "../check-notes.js";
import { markKeyOf } from "../mark-key.js";

const row = (personKey, findingKey, body) => ({ personKey, findingKey, body });

test("a note is keyed exactly the way the mark on the same row is", () => {
  // if these ever diverge, a row's note and its mark belong to different rows
  const e = { personKey: "ckuseridaaaaaaaaaaaaaaaaa", findingKey: "overlap-09/09/26" };
  assert.equal(noteKeyOf(e), markKeyOf(e));
});

test("the key carries no id, so an upload cannot take the note with it", () => {
  const e = {
    timesheetId: "cktimesheetidaaaaaaaaaaaa",
    batchId: "ckbatchidaaaaaaaaaaaaaaaa",
    personKey: "ckuseridaaaaaaaaaaaaaaaaa",
    findingKey: "flag-09/03/26",
  };
  const key = noteKeyOf(e);
  assert.ok(!key.includes(e.timesheetId), `the key still carries a timesheet id: ${key}`);
  assert.ok(!key.includes(e.batchId), `the key still carries a batch id: ${key}`);
  assert.ok(key.includes(e.findingKey), "the key does not say which finding it is about");
});

test("two findings on one person are two notes, not one", () => {
  const a = { personKey: "u1", findingKey: "flag-09/03/26" };
  const b = { personKey: "u1", findingKey: "flag-09/04/26" };
  assert.notEqual(noteKeyOf(a), noteKeyOf(b));
});

test("a row with no person behind it holds no note", () => {
  // a rest report row can name somebody the export never did. Keyed on the
  // finding alone it would share a note with every other unmatched row carrying
  // that finding, so it is refused rather than shared.
  assert.equal(canHoldNote({ personKey: null, findingKey: "rest-09/08/26-10:30 AM" }), false);
  assert.equal(canHoldNote({ personKey: "u1", findingKey: null }), false);
  assert.equal(canHoldNote({ personKey: "u1", findingKey: "person" }), true);
});

test("the map finds a row's own note and nobody else's", () => {
  const m = notesByKey([
    row("u1", "overlap-09/09/26", "trim the booking"),
    row("u1", "person", "left a voicemail"),
    row("u2", "overlap-09/09/26", "this one is the route"),
  ]);
  assert.equal(m.get(noteKeyOf({ personKey: "u1", findingKey: "person" })).body, "left a voicemail");
  assert.equal(m.get(noteKeyOf({ personKey: "u2", findingKey: "overlap-09/09/26" })).body, "this one is the route");
  assert.equal(m.get(noteKeyOf({ personKey: "u3", findingKey: "person" })), undefined);
});

test("an empty note is the absence of one, whichever way it was emptied", () => {
  // clearing the box and pressing Delete note take the same path, so both have
  // to arrive here as the same thing
  assert.equal(cleanNoteBody(""), "");
  assert.equal(cleanNoteBody("   \n  "), "");
  assert.equal(cleanNoteBody(null), "");
  assert.equal(cleanNoteBody(undefined), "");
});

test("a note is trimmed and capped before it is stored", () => {
  assert.equal(cleanNoteBody("  she is back monday  "), "she is back monday");
  const long = cleanNoteBody("x".repeat(NOTE_MAX + 500));
  assert.equal(long.length, NOTE_MAX);
});
