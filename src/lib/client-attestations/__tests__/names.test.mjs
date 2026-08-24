import { test } from "node:test";
import assert from "node:assert/strict";
import { clientKey, staffNameParts, matchScheduleStaff } from "../names.js";

// THE REAL DISAGREEMENTS between the August 2026 schedule export and HR's
// roster. Every pair below is one person spelled two ways by two documents.
const SAME_PERSON = [
  ["Jacob Acuna", "Acuna, Jacob"],
  ["Jose ( Angel) Acuna", "Acuna, Jose ( Angel)"],
  ["Susan Elder. Morton", "Elder. Morton, Susan"],
  ['Abigail "Abbie" Sherwold', 'Sherwold, Abigail "Abbie"'],
  ["Noelle (Caleb) McCarty", "McCarty, Noelle (Caleb)"],
  ["Celeste Martinez-Andraca", "Martinez-Andraca, Celeste"],
  ["William Mc Carter Jr.", "Mc Carter Jr., William"],
];

test("a client is one key however the two exports spell the name", () => {
  for (const [schedule, roster] of SAME_PERSON) {
    assert.equal(clientKey(schedule), clientKey(roster), `${schedule} / ${roster}`);
  }
});

test("two different people never collide", () => {
  // the pair this list actually contains: siblings, same surname
  assert.notEqual(clientKey("Mario Martinez-Andraca"), clientKey("Celeste Martinez-Andraca"));
  assert.notEqual(clientKey("Acuna, Jacob"), clientKey("Acuna, Jose ( Angel)"));
});

test("a middle initial on one export only does not split a person", () => {
  assert.equal(clientKey("William E Nelson"), clientKey("Nelson, William"));
});

test("staff come off the schedule as a surname and an initial", () => {
  assert.deepEqual(staffNameParts("Solorzano, I"), { last: "solorzano", initial: "i" });
  assert.deepEqual(staffNameParts("Romero-Alba, J"), { last: "romero alba", initial: "j" });
  // not a staff cell at all
  assert.equal(staffNameParts("ILS Service"), null);
  assert.equal(staffNameParts(""), null);
});

const USERS = [
  { id: "u1", name: "Ilean Solorzano", preferredFirstName: null, preferredLastName: null },
  { id: "u2", name: "Joseph Gutierrez", preferredFirstName: "Joe", preferredLastName: null },
  { id: "u3", name: "Ryan Nguyen", preferredFirstName: null, preferredLastName: null },
  { id: "u4", name: "Jim Nguyen", preferredFirstName: null, preferredLastName: null },
];

test("a surname and initial that fit exactly one account match it", () => {
  assert.deepEqual(matchScheduleStaff("Solorzano, I", USERS), { userId: "u1", method: "initial" });
  assert.deepEqual(matchScheduleStaff("Gutierrez, J", USERS), { userId: "u2", method: "initial" });
});

test("a shared surname resolves to nobody rather than to the first row back", () => {
  // "Nguyen, R" is Ryan and only Ryan - the initial does the separating
  assert.deepEqual(matchScheduleStaff("Nguyen, R", USERS), { userId: "u3", method: "initial" });
  // but a surname whose initial fits two accounts must not pick one
  const twins = [
    { id: "a", name: "Jose Ramirez" },
    { id: "b", name: "Juan Ramirez" },
  ];
  assert.deepEqual(matchScheduleStaff("Ramirez, J", twins), { userId: null, method: "ambiguous" });
});

test("a surname alone is never a match", () => {
  assert.deepEqual(matchScheduleStaff("Solorzano, Z", USERS), { userId: null, method: "unmatched" });
  assert.deepEqual(matchScheduleStaff("Nobody, X", USERS), { userId: null, method: "unmatched" });
});

test("a preferred first name counts, because that is what people are called", () => {
  // the account's legal first name is Joseph; the schedule could say either
  assert.equal(matchScheduleStaff("Gutierrez, J", USERS).userId, "u2");
});

test("one person spelled two ways in the same export is one person", () => {
  // Both of these are on the August 2026 schedule, printed by QSP itself:
  // "Hernandez-Nieves, B" and "Hernandez- Nieves, B". The space after the
  // hyphen is the only difference, and it must not become two staff members.
  assert.deepEqual(
    staffNameParts("Hernandez-Nieves, B"),
    staffNameParts("Hernandez- Nieves, B"),
  );
});

test("the surnames that actually repeat on this schedule stay apart", () => {
  // Real pairs off the August 2026 export. Surname-only matching would route
  // one sibling's clients to the other.
  const people = [
    { id: "s", name: "Sebastian Torres" },
    { id: "j", name: "Jocelyn Torres" },
  ];
  assert.equal(matchScheduleStaff("Torres, S", people).userId, "s");
  assert.equal(matchScheduleStaff("Torres, J", people).userId, "j");
});

test("one person known to two sources under two spellings stays one person", async () => {
  const { staffDirectory: dir2, expandStaffName: exp2 } = await import("../names.js");
  const d = dir2([
    // the portal account, preferred name first - this spelling should win
    { id: "u", name: "Brandon Uribe", preferredFirstName: "Mánu" },
    // the roster's spelling of the same person
    "Uribe, Brandon",
  ]);
  assert.equal(exp2("Uribe, B", d), "Mánu Uribe");
  assert.equal(exp2("Uribe, M", d), "Mánu Uribe");
});

test("two actually different people on one key still poison it", async () => {
  const { staffDirectory: dir2, expandStaffName: exp2 } = await import("../names.js");
  const d = dir2([{ id: "a", name: "Sofia Torres" }, "Torres, Sebastian"]);
  assert.equal(exp2("Torres, S", d), null);
});
