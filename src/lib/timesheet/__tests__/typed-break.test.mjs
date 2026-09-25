// A TYPED BREAK THE SERVER WOULD REFUSE HAS TO BE REFUSED ON THE CARD TOO.
//
// the card only checked rests, so a lunch typed into the middle of a service
// shift went green with Save answer under it and came back refused on save.
// typed-break.js is the card's side of mealTimeFits / restTimeFits, read off
// the stretches each question carries as text. these hold it to the server's
// own answer for every minute of the day, on the engine's own questions.
//
// made-up people, run through the real functions.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildQuestions, mealTimeFits, restTimeFits, mealFreeWindows, MEAL_MIN_MINUTES,
} from "../questions.js";
import { lunchOutside, restOutside, minutesOf, spansOf } from "../typed-break.js";

const at = (h, m = 0) => ({ min: h * 60 + m });
const MINUTES = Array.from({ length: 24 * 60 - MEAL_MIN_MINUTES }, (_, i) => i);

// 9a-10a, 11:15a-2:15p, 3p-7p: two gaps a lunch fits in, 10a-11:15a and 2:15p-3p
const DAY = {
  date: "09/17/26",
  punches: [at(9), at(10), at(11, 15), at(14, 15), at(15), at(19)],
  paidHours: 8, restRequired: 2, restTaken: 0, restViolation: true,
  mealScheduled: false, mealViolation: true, mealLate: false,
};
const ask = (day, entry = null) => buildQuestions(
  { days: [day], scheduleCheck: { byDate: entry ? { [day.date]: entry } : {} } },
  { sourceName: "Lark, Jordan", restRows: [], answers: [] },
);

test("the undocumented lunch: the card refuses exactly what mealTimeFits refuses", () => {
  const q = ask(DAY).find((x) => x.kind === "nothingDocumentedMeal");
  assert.ok(q, "the day asks about its lunch");
  const need = q.needs.find((n) => n.kindOf === "meal");
  assert.deepEqual(need.windows, ["10a-11:15a", "2:15p-3p"]);
  for (const m of MINUTES) {
    const server = mealTimeFits(DAY, m, need.minutes).why === "window";
    assert.equal(lunchOutside(need, m), server, `minute ${m}`);
  }
});

test("1p is inside the service shift and is refused; the gaps are taken to the last half hour", () => {
  const need = ask(DAY).find((x) => x.kind === "nothingDocumentedMeal").needs[0];
  assert.equal(lunchOutside(need, minutesOf("1")), true);
  assert.equal(lunchOutside(need, minutesOf("10")), false);
  assert.equal(lunchOutside(need, minutesOf("10:45")), false);
  assert.equal(lunchOutside(need, minutesOf("10:46")), true, "only 29 minutes left before 11:15a");
  assert.equal(lunchOutside(need, minutesOf("2:30")), false);
  assert.equal(lunchOutside(need, minutesOf("2:31")), true);
});

test("a day with no gap takes any time, as the server does", () => {
  const day = { ...DAY, punches: [at(9), at(17)] };
  const need = { kindOf: "meal", minutes: 30, windows: [] };
  for (const m of MINUTES) {
    assert.equal(mealTimeFits(day, m).why === "window", false);
    assert.equal(lunchOutside(need, m), false, `minute ${m}`);
  }
});

test("each rest: the card refuses exactly what restTimeFits refuses", () => {
  const q = ask(DAY).find((x) => x.kind === "nothingDocumentedRest");
  assert.ok(q, "the day asks about its rests");
  for (const need of q.needs) {
    for (const m of MINUTES) {
      const server = !restTimeFits(DAY, need.ordinal, m, need.minutes).ok;
      assert.equal(restOutside(need, m) != null, server, `${need.slot} minute ${m}`);
    }
  }
});

test("a ten in the last minutes of its window no longer passes as text", () => {
  // what the card did: "11:55" + 10 is "11:5510", which sorts before "12:00"
  assert.equal("11:55" + 10 <= "12:00", true);
  const need = { kindOf: "rest", minutes: 10, shifts: ["10a-12p"], window: ["10a-12p"] };
  assert.equal(restOutside(need, minutesOf("11:55")), "outside");
  assert.equal(restOutside(need, minutesOf("11:50")), null);
});

test("the lunch-move card: refused where the answer action refuses it", () => {
  // admin 9a-1p, nothing 1p-1:48p, the meal booked 1:30p-2p, a visit from 1:48p
  const entry = {
    shifts: [
      { text: "9a-1p -ILS Admin(4:00)", meal: false },
      { text: "1:30p-2p -Meal Break(0:30)", meal: true },
      { text: "1:48p-4:41p Rowe, T-ILS Service(2:53)", meal: false },
      { text: "4:41p-6:30p -ILS Admin(1:49)", meal: false },
    ],
  };
  const day = {
    date: "09/18/26", paidHours: 8.7, mealViolation: true, mealLate: false,
    restViolation: false, restRequired: 2, restTaken: 2,
    punches: [at(9), at(13), at(13, 48), at(16, 41), at(16, 41), at(18, 30)],
  };
  const q = ask(day, entry).find((x) => x.kind === "mealCouldMove");
  assert.ok(q, "the day asks whether the lunch could have moved");
  const need = q.needs[0];
  const free = mealFreeWindows(day, entry);
  for (const m of MINUTES) {
    // the action's own condition, word for word
    const outsideFree = !free.some((w) => m >= w.from && m + need.minutes <= w.to);
    const server = outsideFree || mealTimeFits(day, m, need.minutes).why === "window";
    assert.equal(lunchOutside(need, m), server, `minute ${m}`);
  }
});

test("the movable meal: refused where mealTimeFits refuses it", () => {
  const day = { ...DAY, date: "09/18/26", punches: [at(9), at(12), at(12, 30), at(17)], paidHours: 7.5, restRequired: 2, restTaken: 2, restViolation: false };
  const entry = {
    shifts: [
      { text: "9a-12p Rowe, T-ILS Service(3:00)", meal: false },
      { text: "12:30p-5p -ILS Admin(4:30)", meal: false },
      { text: "1p-1:30p -Meal Break(0:30)", meal: true },
    ],
  };
  const q = ask(day, entry).find((x) => x.kind === "mealMovable");
  assert.ok(q, "the day asks about the movable meal");
  const need = q.needs[0];
  for (const m of MINUTES) {
    assert.equal(lunchOutside(need, m), mealTimeFits(day, m, need.minutes).why === "window", `minute ${m}`);
  }
});

test("times are read once, the way the box reads them", () => {
  assert.equal(minutesOf("1"), 13 * 60, "a bare 1 is the afternoon");
  assert.equal(minutesOf("1a"), 60, "and 1a stays the morning");
  assert.equal(minutesOf(""), null);
  assert.equal(minutesOf("lunch"), null);
  assert.deepEqual(spansOf(["10a-11:15a", "2:15p-3p", "nonsense"]), [{ from: 600, to: 675 }, { from: 855, to: 900 }]);
  // a lunch or a rest with nothing typed is not refused, it is just not given
  assert.equal(lunchOutside({ kindOf: "meal", windows: ["10a-11:15a"] }, null), false);
  assert.equal(restOutside({ kindOf: "rest", window: ["10a-12p"] }, null), null);
  // and each rule stays with its own kind of break
  assert.equal(lunchOutside({ kindOf: "rest", windows: ["10a-11:15a"] }, 13 * 60), false);
  assert.equal(restOutside({ kindOf: "meal", window: ["10a-12p"] }, 13 * 60), null);
});

// THE CARD ITSELF. the batched card and the single cards both have to ask.
const card = fs.readFileSync("src/app/t/[token]/TimesheetQuestion.js", "utf8");

test("the batched card checks a lunch as well as a rest, in minutes read once", () => {
  assert.match(card, /import \{ lunchOutside, restOutside \} from "@\/lib\/timesheet\/typed-break";/);
  assert.match(card, /const badTime = \(q, need\) => \{\n\s*const raw = rawAt\(q, need\.slot\);\n\s*const m = toMin\(raw\.trim\(\) \? raw : need\.prefill\);\n\s*if \(m == null\) return null;\n\s*if \(need\.kindOf === "meal"\) return lunchOutside\(need, m\) \? "lunch" : null;\n\s*return restOutside\(need, m\);\n\s*\};/);
  // the old text arithmetic is gone
  assert.doesNotMatch(card, /m \+ \(need\.minutes \|\| 10\) <= b/);
});

test("the batched card's gaps line turns red on a lunch outside them", () => {
  assert.match(card, /<p className=\{`mt-2 text-\[13px\] \$\{badTime\(q, q\.needs\[0\]\) === "lunch" \? "text-rose-600 dark:text-rose-400" : "text-muted"\}`\}>\n\s*\{q\.needs\[0\]\.hint\}/);
});

test("a single card will not save a lunch outside its gaps", () => {
  assert.match(card, /const slotOutside = \(need\) => lunchOutside\(need, toMin\(slotAt\[need\.slot\]\)\);/);
  assert.match(card, /const timeBlocked = timeRequired\n\s*\? slots\.some\(\(need\) => !slotMin\(need\)\) \|\| timeOutside/);
  assert.match(card, /mins && !slotOutside\(need\) \? "border-emerald-400\/80"/);
  assert.match(card, /<p className=\{`mt-1 text-xs \$\{timeOutside \? "text-rose-600 dark:text-rose-400" : "text-muted"\}`\}>/);
});

test("the movable meal names its gaps, and a dateless slot gets the plain sentence", () => {
  assert.match(card, /timeHint: q\.needs\?\.\[0\]\?\.windows\?\.length\n\s*\? `Has to be a half hour inside \$\{q\.needs\[0\]\.windows\.join\(" or "\)\}\.`\n\s*: undefined,/);
  assert.match(card, /: "Put the time in above first\."\n\s*: timeRequired && !at\.trim\(\)/);
});
