// ONE PERSON, WHATEVER THE DOCUMENT CALLS THEM.
//
// The timesheet prints the legal name, the clock export and the service notes
// print the one they go by, and one spelling in the portal is simply wrong.
// Unreconciled, a person's clock rows never reach their shifts - Ruth/Angel
// Delgado Pineda and Francisco/Frank Velasquez between them had 13 rows that
// found nothing, and ten of those became phantom bookings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWhoKey, NAME_FIXES } from "../people.js";

const STAFF = [
  { name: "Ruth Delgado Pineda", preferredFirstName: "Angel", preferredLastName: null },
  { name: "Francisco Velasquez", preferredFirstName: "Frank", preferredLastName: null },
  { name: "Brandon Uribe", preferredFirstName: "Mánu", preferredLastName: null },
  { name: "Joseph Hernadez", preferredFirstName: null, preferredLastName: null },
  { name: "Ashley Cain", preferredFirstName: null, preferredLastName: null },
];

const who = buildWhoKey(STAFF);

test("the timesheet's spelling and the clock export's reach the same person", () => {
  // timesheet says Ruth, clock export says Angel
  assert.equal(who("Delgado Pineda, Ruth"), who("Delgado Pineda, Angel"));
  assert.equal(who("Velasquez, Francisco"), who("Velasquez, Frank"));
});

// the legal name is canonical because that is what the document that PAYS uses
test("the legal spelling is the one everything lands on", () => {
  assert.equal(who("Delgado Pineda, Angel"), "ruth delgado pineda");
  assert.equal(who("Mánu Uribe"), "brandon uribe");
});

test("last-first and first-last are the same spelling", () => {
  assert.equal(who("Cain, Ashley"), who("Ashley Cain"));
});

// ---- the corrections ----
//
// "Hernadez" is missing an n. QSP was corrected between the 08/01 and 08/16
// exports, so the clock exports, the service notes and the 08/16 timesheet all
// spell it Hernandez while the portal account and the two older timesheets do
// not.

test("a known misspelling reaches the same person as the correct one", () => {
  assert.equal(who("Hernadez, Joseph"), who("Hernandez, Joseph"));
  assert.equal(who("Hernadez, Joseph"), who("Joseph Hernandez"));
});

// EVERYTHING LANDS ON THE CORRECT SPELLING, including the sheets and the portal
// account that carry the typo. The canonical side of a correction is the right
// name by definition - resolving onto the misspelling would spread it.
test("the correction resolves onto the right spelling, not the wrong one", () => {
  assert.equal(who("Hernandez, Joseph"), "joseph hernandez");
  assert.equal(who("Hernadez, Joseph"), "joseph hernandez");
});

// NOT A FUZZY MATCHER. Every correction is a specific mistake somebody found in
// a specific document. A rule that guessed which near-identical names were one
// person would eventually merge two real people, which on a screen reporting
// who billed what is the worst thing it could do.
test("names that merely look alike are left alone", () => {
  const w = buildWhoKey([
    { name: "Johannah Garcia" }, { name: "Stephanie Garcia" },
    { name: "Joseph Gutierrez" }, { name: "Joseph Hernadez" },
  ]);
  assert.notEqual(w("Garcia, Johannah"), w("Garcia, Stephanie"));
  assert.notEqual(w("Gutierrez, Joseph"), w("Hernadez, Joseph"));
});

test("every correction says which document is wrong and why", () => {
  for (const fix of NAME_FIXES) {
    assert.ok(fix.canonical, "a correction needs the right spelling");
    assert.ok(fix.also.length, "a correction needs something to correct");
    assert.ok(fix.why && fix.why.length > 10, `${fix.canonical} needs a reason`);
  }
});

test("somebody with no portal account keeps their own spelling", () => {
  assert.equal(who("Meltvedt, Serena"), "serena meltvedt");
});

test("nothing to resolve is not a crash", () => {
  const w = buildWhoKey();
  assert.equal(w("Cain, Ashley"), "ashley cain");
  assert.equal(w(""), "");
});
