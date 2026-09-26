// A LUNCH THE ROSTER BOOKED SHORT OR INSIDE A CLOCKED SHIFT, ON A DAY WITH A
// FREE HALF HOUR IN IT.
//
// the shape: admin 9a-1p, nothing booked 1p-1:30p, the meal booked 1:30p-2p,
// a client visit from 1:48p. the booked meal has 18 minutes clear, so the day
// owes the hour and used to go straight to the under-thirty card. but nothing
// is punched or rostered from 1p to 1:48p, so a full thirty fit, and the first
// thing asked now is whether the lunch was really taken there. the booked-meal
// card only follows a no.
//
// made-up people and clients. run through the real functions.
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildQuestions, mealFreeWindows, patchesFor, isMandatory,
} from "../questions.js";
import { analyzeDay } from "../parse.js";
import { employeeResolution } from "../corrections.js";
import { QUESTION_NOUN } from "../question-nouns.js";

const DATE = "09/18/26";
const at = (h, m = 0) => ({ min: h * 60 + m, raw: `${h}:${String(m).padStart(2, "0")}` });

// the roster for the day, as the schedule export prints it
const ENTRY = {
  shifts: [
    { text: "9a-1p -ILS Admin(4:00)", meal: false },
    { text: "1:30p-2p -Meal Break(0:30)", meal: true },
    { text: "1:48p-4:41p Rowe, T-ILS Service(2:53)", meal: false },
    { text: "4:41p-6:30p -ILS Admin(1:49)", meal: false },
  ],
};
const PUNCHES = [at(9), at(13), at(13, 48), at(16, 41), at(16, 41), at(18, 30)];

// the stored day as buildQuestions reads it
const DAY = {
  date: DATE, paidHours: 8.7, mealViolation: true, mealLate: false,
  restViolation: false, restRequired: 2, restTaken: 2, punches: PUNCHES,
};

const sheet = (day = DAY, entry = ENTRY) => ({ days: [day], scheduleCheck: { byDate: { [day.date]: entry } } });
const ask = (answers, day = DAY, entry = ENTRY) =>
  buildQuestions(sheet(day, entry), { restRows: [], sourceName: "Lark, Jordan", answers })
    .filter((q) => q.date === day.date);
const kinds = (answers, day, entry) => ask(answers, day, entry).map((q) => q.kind);

test("the engine owes the hour on this day, which is what raises the question", () => {
  const d = analyzeDay({
    date: DATE,
    punches: PUNCHES,
    printed: { daily: 8.7 },
    mealScheduled: true,
    restRecorded: 2,
    scheduleBlocks: [
      { start: 9 * 60, end: 13 * 60, meal: false },
      { start: 13 * 60 + 30, end: 14 * 60, meal: true },
      { start: 13 * 60 + 48, end: 16 * 60 + 41, meal: false },
      { start: 16 * 60 + 41, end: 18 * 60 + 30, meal: false },
    ],
  });
  assert.equal(d.mealBookedShort, true);
  assert.equal(d.mealViolation, true);
});

test("the free time is the stretch nothing is punched or rostered in", () => {
  assert.deepEqual(mealFreeWindows(DAY, ENTRY), [{ from: 13 * 60, to: 13 * 60 + 48 }]);
});

test("a short lunch with free time asks about the move first, and only that", () => {
  const got = kinds([]);
  assert.deepEqual(got, ["mealCouldMove"], `got ${got.join(", ")}`);
  const q = ask([])[0];
  assert.equal(q.row.booked, "short");
  assert.equal(q.row.mealFrom, "1:30p");
  assert.equal(q.row.mealTo, "2p");
  assert.equal(q.row.blockTo, "4:41p");
  assert.equal(q.row.service, "ILS Service");
  assert.deepEqual(q.row.free, [{ from: "1p", to: "1:48p" }]);
  assert.equal(q.needsOn, "yes");
  // the no opens the booked-meal card, so the page stays on the day for it
  assert.equal(q.followsOn, "no");
  assert.equal(q.needs.length, 1);
  assert.equal(q.needs[0].kindOf, "meal");
  assert.equal(q.needs[0].label, "Meal break started");
  assert.deepEqual(q.needs[0].options, ["1p"]);
  assert.deepEqual(q.needs[0].windows, ["1p-1:48p"]);
  // the booked lunch the answer moves, so the sheet stops drawing it and the
  // office's edit line reads "recorded 1:30p to 2p actually happened ..."
  assert.deepEqual(q.needs[0].replaces, { from: "1:30p", to: "2p" });
  assert.equal(q.moves, -1);
  assert.equal(q.movesOnDecline, 0);
});

test("a no opens the booked-meal card after it", () => {
  const got = kinds([{ kind: "q_mealCouldMove", date: DATE, status: "declined" }]);
  assert.deepEqual(got, ["mealCouldMove", "mealShort"], `got ${got.join(", ")}`);
});

test("a booked-meal card answered before the move question existed stays as it was", () => {
  const got = kinds([{ kind: "q_mealShort", date: DATE, status: "declined" }]);
  assert.deepEqual(got, ["mealShort"], `got ${got.join(", ")}`);
  // an answer on another day changes nothing here
  assert.deepEqual(kinds([{ kind: "q_mealShort", date: "09/17/26", status: "declined" }]), ["mealCouldMove"]);
  // an open report row is not an answer
  assert.deepEqual(kinds([{ kind: "q_mealShort", date: DATE, status: "open" }]), ["mealCouldMove"]);
});

test("rostered travel in the hole in the punches is not free time", () => {
  const entry = {
    shifts: [
      { text: "9a-1p -ILS Admin(4:00)", meal: false },
      { text: "1p-1:20p -ILS Travel(0:20)", meal: false },
      ...ENTRY.shifts.slice(1),
    ],
  };
  assert.deepEqual(mealFreeWindows(DAY, entry), [], "1:20p to 1:48p is only 28 minutes");
  assert.deepEqual(kinds([], DAY, entry), ["mealShort"]);
});

test("free time that only opens after the fifth hour is not offered", () => {
  // worked 8a to 1:30p, five and a half hours, before the stretch opens
  const day = {
    ...DAY,
    punches: [at(8), at(13, 30), at(14, 10), at(17)],
  };
  const entry = {
    shifts: [
      { text: "8a-1:30p Rowe, T-ILS Service(5:30)", meal: false },
      { text: "11a-11:30a -Meal Break(0:30)", meal: true },
      { text: "2:10p-5p Rowe, T-ILS Service(2:50)", meal: false },
    ],
  };
  assert.deepEqual(mealFreeWindows(day, entry), []);
  assert.ok(!kinds([], day, entry).includes("mealCouldMove"));
});

test("a lunch booked inside a clocked shift gets the same first question", () => {
  const day = {
    ...DAY,
    punches: [at(8), at(12, 30), at(13), at(16)],
    paidHours: 7.5,
  };
  const entry = {
    shifts: [
      { text: "8a-12:30p Rowe, T-ILS Service(4:30)", meal: false },
      { text: "1p-1:30p -Meal Break(0:30)", meal: true },
      { text: "1p-4p Hale, B-ILS Service(3:00)", meal: false },
    ],
  };
  const q = ask([], day, entry).find((x) => x.kind === "mealCouldMove");
  assert.ok(q, `got ${kinds([], day, entry).join(", ")}`);
  assert.equal(q.row.booked, "inside");
  assert.equal(q.row.blockFrom, "1p");
  assert.equal(q.row.blockTo, "4p");
  assert.deepEqual(q.row.free, [{ from: "12:30p", to: "1p" }]);
  assert.ok(!kinds([], day, entry).includes("mealInShift"), "the booked-meal card waits for a no");
  assert.deepEqual(
    kinds([{ kind: "q_mealCouldMove", date: DATE, status: "declined" }], day, entry),
    ["mealCouldMove", "mealInShift"],
  );
});

test("a lunch inside movable time keeps its own card, which already asks where it was", () => {
  const day = { ...DAY, punches: [at(9), at(12), at(12, 30), at(17)], paidHours: 7.5 };
  const entry = {
    shifts: [
      { text: "9a-12p Rowe, T-ILS Service(3:00)", meal: false },
      { text: "12:30p-5p -ILS Admin(4:30)", meal: false },
      { text: "1p-1:30p -Meal Break(0:30)", meal: true },
    ],
  };
  const got = kinds([], day, entry);
  assert.ok(got.includes("mealMovable"), `got ${got.join(", ")}`);
  assert.ok(!got.includes("mealCouldMove"));
});

test("yes takes the hour off, no leaves it for the card after", () => {
  const q = ask([])[0];
  assert.deepEqual(patchesFor(q, "yes", DAY), { mealViolation: false });
  assert.deepEqual(patchesFor(q, "no", DAY), { mealViolation: null });
});

test("it never blocks a signature, and the office note has a noun", () => {
  assert.equal(isMandatory("mealCouldMove"), false);
  assert.equal(QUESTION_NOUN.mealCouldMove, "meal break that could have been moved to free time");
});

test("their answer reads back in their own words", () => {
  const said = (choice, statedBreaks = null) =>
    employeeResolution({ kind: "q_mealCouldMove", date: DATE, choice, statedBreaks });
  assert.equal(
    said("yes", [{ slot: "meal", kindOf: "meal", from: "1p", to: "1:30p" }]),
    "You said you took your meal break at 1p, when you were free.",
  );
  assert.equal(said("yes"), "You said you took your meal break, when you were free.");
  assert.equal(said("no"), "You said you did not take a 30-minute meal break in the free time.");
});
