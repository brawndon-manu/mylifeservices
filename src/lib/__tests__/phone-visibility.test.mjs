// WHO CAN SEE A COLLEAGUE'S PHONE NUMBER.
//
// One scenario, one test, every one of them through the real `canSeePhones` and
// `phoneVisibleTo` rather than reading any source as text. This is a privacy
// rule, so the case that matters most is the one that must FAIL: a staff member
// looking at another staff member.
//
// The first test walks every role in ROLES, so adding a role to the system
// fails here until somebody decides which side of this line it sits on. A rule
// that silently defaults a new role to "can see" is how a privacy rule rots.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLES, canSeePhones, phoneVisibleTo } from "../roles.js";

const CAN = ["SUPER", "IT_ADMIN", "ADMIN", "MANAGER", "HR", "SUPERVISOR"];
const CANNOT = ["STAFF"];

const person = (over = {}) => ({ id: "u_other", role: "STAFF", phone: "(562) 555-0134", ...over });
const viewer = (role, id = "u_me") => ({ id, role });

test("every role in the system is on one side of the line, and only one", () => {
  assert.deepEqual([...CAN, ...CANNOT].sort(), [...ROLES].sort(), "a role was added and nobody decided about phone numbers");
  for (const r of CAN) assert.equal(canSeePhones(r), true, `${r} should see phone numbers`);
  for (const r of CANNOT) assert.equal(canSeePhones(r), false, `${r} should not see phone numbers`);
});

test("a staff member cannot see another staff member's number", () => {
  assert.equal(phoneVisibleTo(viewer("STAFF"), person()), null);
});

test("a staff member cannot see a manager's number either", () => {
  // the rule is about who is LOOKING, not who is being looked at. 2 of the 8
  // numbers on file today belong to Supers.
  assert.equal(phoneVisibleTo(viewer("STAFF"), person({ role: "SUPER" })), null);
});

test("your own number is always yours to see", () => {
  const me = viewer("STAFF", "u_me");
  assert.equal(phoneVisibleTo(me, person({ id: "u_me" })), "(562) 555-0134");
});

test("a supervisor can see a staff number", () => {
  // the boundary Mánu drew: everyone above plain Staff
  assert.equal(phoneVisibleTo(viewer("SUPERVISOR"), person()), "(562) 555-0134");
});

test("the oversight tier can see it", () => {
  for (const r of ["HR", "MANAGER", "ADMIN", "IT_ADMIN", "SUPER"]) {
    assert.equal(phoneVisibleTo(viewer(r), person()), "(562) 555-0134", `${r} should see it`);
  }
});

test("no number on file reads as no number, for everyone", () => {
  // "hidden from you" and "never filled in" must not be told apart by the
  // caller: 65 of the 73 active accounts have no phone at all, so the empty
  // case is the common one and it has to look identical to the refused one.
  for (const r of ROLES) {
    assert.equal(phoneVisibleTo(viewer(r), person({ phone: null })), null);
    assert.equal(phoneVisibleTo(viewer(r), person({ phone: "" })), null);
  }
});

test("a missing viewer or person is refused rather than throwing", () => {
  // server components call this with whatever the query returned, and a page
  // that 500s on a null is worse than one that shows no number
  assert.equal(phoneVisibleTo(null, person()), null);
  assert.equal(phoneVisibleTo(viewer("SUPER"), null), null);
  assert.equal(phoneVisibleTo(undefined, undefined), null);
});

test("an unknown role is refused", () => {
  // a typo in a role string must not open the door
  assert.equal(canSeePhones("SUPERVISOR "), false);
  assert.equal(canSeePhones("staff"), false);
  assert.equal(canSeePhones(undefined), false);
  assert.equal(phoneVisibleTo(viewer("ADMINISTRATOR"), person()), null);
});
