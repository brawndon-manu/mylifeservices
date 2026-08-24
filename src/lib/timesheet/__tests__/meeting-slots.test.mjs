// HOW MANY PEOPLE A TIME SLOT HOLDS.
//
// Mánu 2026-08-22, on HR asking for a week of 30-minute office visits to sign
// the updated handbook: "we need to cap the time slots at 10 max" - ten people
// per slot. A Company Meeting's sessions never had a capacity, which was right
// for the meetings they were built for: an all-hands on Zoom does not run out
// of room. An in-person visit does.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  capacityOf, remainingFor, isFull, canTake, slotLabel, takenByOption,
} from "../../meeting-slots.js";

const slot = (capacity) => ({ id: "mon-9", label: "Mon 9:00", capacity });

// ---- what counts as a cap ----

test("a positive whole number is the cap", () => {
  assert.equal(capacityOf(slot(10)), 10);
  assert.equal(capacityOf(slot(1)), 1);
});

// NULL IS THE DEFAULT AND IT MEANS EVERYBODY. Every meeting written before this
// existed has no capacity key at all, and must go on holding the whole company.
test("no capacity means no limit, not no room", () => {
  assert.equal(capacityOf(slot(undefined)), null);
  assert.equal(capacityOf({ id: "x", label: "y" }), null);
  assert.equal(capacityOf(null), null);
  assert.equal(isFull(slot(undefined), 999), false);
});

// zero would be a slot nobody can ever take, which is not a thing anybody means
// to publish
test("zero and nonsense are read as no limit, never as a closed slot", () => {
  for (const bad of [0, -3, "ten", NaN, 2.5, true]) {
    assert.equal(capacityOf(slot(bad)), null, `${String(bad)} should not be a cap`);
  }
});

// ---- the counting ----

test("remaining counts down and stops at nothing left", () => {
  assert.equal(remainingFor(slot(10), 0), 10);
  assert.equal(remainingFor(slot(10), 7), 3);
  assert.equal(remainingFor(slot(10), 10), 0);
});

// a cap lowered under people who already picked reads as full, not as minus two
test("an over-subscribed slot is full rather than negative", () => {
  assert.equal(remainingFor(slot(10), 12), 0);
  assert.equal(isFull(slot(10), 12), true);
});

test("an uncapped slot never reports a remainder", () => {
  assert.equal(remainingFor(slot(null), 40), null);
  assert.equal(slotLabel(slot(null), 40), null);
});

// ---- THE ONE THAT MATTERS MOST ----
//
// Re-confirming a pick you already hold must not fail because the slot filled
// around you. The picker has a Change button and the emailed link can be opened
// twice; both re-submit choices the person already has.
test("somebody already in a full slot is never turned away from it", () => {
  assert.equal(canTake(slot(10), 10, true), true);
  assert.equal(canTake(slot(10), 12, true), true);
});

test("but a new pick on a full slot is refused", () => {
  assert.equal(canTake(slot(10), 10, false), false);
  assert.equal(canTake(slot(10), 9, false), true);
});

test("an uncapped slot takes anybody", () => {
  assert.equal(canTake(slot(null), 500, false), true);
});

// ---- what the picker reads ----

test("the label says the cap, not only what is left", () => {
  assert.equal(slotLabel(slot(10), 3), "3 of 10 taken");
  assert.equal(slotLabel(slot(10), 10), "Full");
});

test("an over-subscribed slot still reads Full rather than 12 of 10", () => {
  assert.equal(slotLabel(slot(10), 12), "Full");
});

test("taken counts come off the rows the roster already reads", () => {
  const t = takenByOption([
    { optionId: "mon-9", userId: "a" },
    { optionId: "mon-9", userId: "b" },
    { optionId: "tue-9", userId: "c" },
    { optionId: null, userId: "d" },
  ]);
  assert.equal(t.get("mon-9"), 2);
  assert.equal(t.get("tue-9"), 1);
  assert.equal(t.size, 2, "a row with no option is not a slot");
});

test("nothing to count is an empty map rather than a throw", () => {
  assert.equal(takenByOption(null).size, 0);
  assert.equal(takenByOption([]).size, 0);
});

// ---- and the cap is enforced where it has to be ----
//
// A greyed-out button is a suggestion. Both write paths - the portal toggle and
// the bulk submit the emailed link posts through - have to count and refuse on
// the server, or the cap only holds for whoever used the nicer route.
const ACT = fs.readFileSync(
  new URL("../../../app/portal/announcements/actions.js", import.meta.url), "utf8");

test("both ways of picking check the cap on the server", () => {
  const uses = [...ACT.matchAll(/canTake\(/g)].length;
  assert.ok(uses >= 2, `expected the cap on both write paths, found ${uses}`);
});

test("a refused pick says which slot filled rather than failing silently", () => {
  assert.match(ACT, /error: "full"/);
  assert.match(ACT, /is full now|That time is full/);
});
