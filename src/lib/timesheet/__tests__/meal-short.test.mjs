// A LUNCH THE SCHEDULE BOOKED FOR LESS THAN THIRTY MINUTES.
//
// Mánu 2026-08-25, looking at Garcia 08/21 on the checks screen: "why is this
// lunch break counted if its under 30 minutes?" It was counted because the only
// meal test the engine ran was `mealTaken` - is one ROSTERED, and is it clear of
// a booking - and the length of the block was never looked at. QSP had booked
// her "11:35a-12p -Meal Break(0:25)", so the schedule itself offered 25 minutes
// where §512 asks for thirty uninterrupted.
//
// HIS RULING, 2026-08-26: "for the short lunches it should be counted the same
// way lunches are counted when they are overlapping." So this is the sibling of
// meal-in-shift.test.mjs and asserts the same three things: the day stops
// counting the block as a meal, the reviewer is told what the roster did, and
// the employee gets the card instead of the generic "did you take your lunch?".
//
// Run through the real functions. Nothing here greps source as text.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildQuestions, mealBookedShort, mealBookedInside, patchesFor, isMandatory,
} from "../questions.js";
import { analyzeDay, RULES } from "../parse.js";
import { dayViolations, VIOLATION_KINDS } from "../violations.js";
import { employeeResolution } from "../corrections.js";

const at = (h, m = 0) => ({ min: h * 60 + m, raw: `${h}:${String(m).padStart(2, "0")}` });

// Garcia 08/21/26, client names removed. 7.53 hours, and the roster's only
// meal block is 11:35a-12p - twenty-five minutes, clear of every shift.
const ENTRY = {
  shifts: [
    { text: "8:04a-11:30a Client-ILS Service(3:26)", meal: false },
    { text: "11:30a-11:35a -ILS Travel(0:05)", meal: false },
    { text: "11:35a-12p -Meal Break(0:25)", meal: true },
    { text: "12p-2p Client-ILS Service (2:00)", meal: false },
    { text: "2:10p-4:10p Client-ILS Service(2:00)", meal: false },
  ],
};

// the same day as the engine sees it, with the roster's blocks in minutes
const dayWith = (mealStart, mealEnd) => analyzeDay({
  date: "08/21/26",
  punches: [at(8, 4), at(11, 30), at(12), at(14), at(14, 10), at(16, 10)],
  printed: { daily: 7.53 },
  mealScheduled: true,
  restRecorded: 2,
  scheduleBlocks: [
    { start: 8 * 60 + 4, end: 11 * 60 + 30, meal: false },
    { start: mealStart, end: mealEnd, meal: true },
    { start: 12 * 60, end: 14 * 60, meal: false },
    { start: 14 * 60 + 10, end: 16 * 60 + 10, meal: false },
  ],
});

const SHORT_DAY = dayWith(11 * 60 + 35, 12 * 60);      // 25 minutes
const FULL_DAY = dayWith(11 * 60 + 30, 12 * 60);       // 30 minutes

const build = (day, entry = ENTRY) => buildQuestions(
  { days: [day], scheduleCheck: { byDate: { [day.date]: entry } } },
  { sourceName: "Test, Person" },
);
const kindsOn = (day) => build(day).map((q) => q.kind);
const questionOn = (day, kind) => build(day).find((q) => q.kind === kind) || null;

test("a twenty-five minute lunch stops counting as a meal period", () => {
  assert.equal(SHORT_DAY.mealRequired, true);
  assert.equal(SHORT_DAY.mealBookedShort, true);
  assert.equal(SHORT_DAY.mealViolation, true, "the day owes the premium, like an overlap");
});

test("thirty minutes exactly is a lawful meal and changes nothing", () => {
  assert.equal(RULES.mealFullMin, 30);
  assert.equal(FULL_DAY.mealBookedShort, false);
  assert.equal(FULL_DAY.mealViolation, false);
  assert.equal(dayWith(11 * 60 + 31, 12 * 60).mealBookedShort, true, "29 is short");
});

test("a block short enough to be a rest is not judged as a short meal", () => {
  // Bucio's midnight ten is credited as her rest period. Charging it as a
  // too-short meal as well would bill the same ten minutes twice.
  assert.equal(RULES.mealAsRestMaxMin, 15);
  assert.equal(mealBookedShort({ shifts: [{ text: "12a-12:10a -Meal Break(0:10)", meal: true }] }), null);
  assert.ok(mealBookedShort({ shifts: [{ text: "12a-12:16a -Meal Break(0:16)", meal: true }] }));
});

test("the classifier reports the block and how far under thirty it is", () => {
  const hit = mealBookedShort(ENTRY);
  assert.ok(hit);
  assert.equal(hit.minutes, 25);
  assert.equal(hit.short, 5);
});

test("no rostered meal at all is a different finding entirely", () => {
  assert.equal(mealBookedShort({ shifts: ENTRY.shifts.filter((s) => !s.meal) }), null);
});

test("the reviewer is told what the roster did, not to chase a punch", () => {
  const v = dayViolations(SHORT_DAY, ENTRY).find((x) => x.kind === "meal-short");
  assert.ok(v, `got ${dayViolations(SHORT_DAY, ENTRY).map((x) => x.kind).join(", ")}`);
  assert.equal(v.detail, "11:35a-12p, booked for 25 minutes");
  assert.match(VIOLATION_KINDS["meal-short"].label, /less than thirty minutes/i);
  assert.match(VIOLATION_KINDS["meal-short"].ask, /thirty/i);
  assert.match(VIOLATION_KINDS["meal-short"].ask, /schedule/i);
});

test("it replaces the generic meal question rather than adding a second one", () => {
  const kinds = kindsOn(SHORT_DAY);
  assert.ok(kinds.includes("mealShort"), `got ${kinds.join(", ")}`);
  assert.ok(!kinds.includes("nothingDocumentedMeal"), "two cards for one half hour");
  assert.ok(!kinds.includes("mealInShift"), "this one does not overlap anything");
});

test("its answer leaves the premium where it is, like the overlap", () => {
  const q = questionOn(SHORT_DAY, "mealShort");
  assert.equal(q.moves, -1, "saying they took it takes the hour off");
  assert.equal(q.movesOnDecline, 0, "confirming it was missed leaves the hour on");
  assert.equal(q.row.minutes, 25);
  assert.equal(q.row.mealFrom, "11:35a");
  assert.equal(q.row.mealTo, "12p");
  assert.deepEqual(patchesFor(q, "yes", SHORT_DAY), { mealViolation: false });
  assert.deepEqual(patchesFor(q, "no", SHORT_DAY), { mealViolation: null });
});

test("it never blocks a signature", () => {
  assert.equal(isMandatory("mealShort"), false);
});

test("their answer reads back in their own words", () => {
  const said = (choice) => employeeResolution({ kind: "q_mealShort", date: "08/21/26", choice });
  assert.match(said("yes"), /thirty minutes/);
  assert.match(said("no"), /did not get/);
});

// ------------------------------------------------ THE OTHER WAY IT GOES SHORT
// Aranda 08/21/26. The roster books a full half hour and then runs an ILS
// Service six minutes into the front of it. Mánu 2026-08-26: "what about if
// they have overlapping part of their meal which makes their meal break less
// than 30 ... if the overlapping takes the entirety of the meal break then it
// wont have that option."
const EATEN = {
  shifts: [
    { text: "9a-10a -ILS Misc(1:00)", meal: false },
    { text: "10a-1:36p Client-ILS Service (3:36)", meal: false },
    { text: "1:30p-2p -Meal Break(0:30)", meal: true },
    { text: "2p-2:30p -ILS Travel(0:30)", meal: false },
    { text: "2:30p-4:46p Client-ILS Service(2:16)", meal: false },
  ],
};

test("a booking running into the meal leaves it short, not buried", () => {
  const hit = mealBookedShort(EATEN);
  assert.ok(hit, "the overlap is being read as all or nothing again");
  assert.equal(hit.minutes, 24, "24 of the 30 minutes are clear");
  assert.equal(hit.eaten, 6, "and six were eaten by the booking");
  assert.equal(hit.service, "ILS Service");
});

test("the finding names the booking that ate into it", () => {
  const day = { ...SHORT_DAY, date: "08/21/26" };
  const v = dayViolations(day, EATEN).find((x) => x.kind === "meal-short");
  assert.ok(v);
  assert.equal(v.detail, "1:30p-2p, 24 minutes clear - ILS Service runs 6 min into it");
});

test("a meal a booking swallows whole is the other finding entirely", () => {
  // his line: "if the overlapping takes the entirety of the meal break then it
  // wont have that option"
  const swallowed = { shifts: [
    { text: "9a-5p Client-ILS Service(8:00)", meal: false },
    { text: "12p-12:30p -Meal Break(0:30)", meal: true },
  ] };
  assert.equal(mealBookedShort(swallowed), null);
  assert.equal(mealBookedInside(swallowed)?.kind, "clocked");
});
