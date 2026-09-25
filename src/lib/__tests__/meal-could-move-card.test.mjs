// THE LUNCH-MOVE CARD, IN THE WORDS IT WAS APPROVED WITH.
//
// asked first on a day whose lunch the roster booked short or inside a
// clocked shift while a free half hour sat somewhere else in the day. the card
// is a client component, so its words are read off the source; what the
// answers do is pinned by the real functions in
// timesheet/__tests__/meal-could-move.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { REASON_ON, reasonOwedOn } from "../timesheet/break-answers.js";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const card = read("src/app/t/[token]/TimesheetQuestion.js");
const from = card.indexOf('case "mealCouldMove": {');
const spec = card.slice(from, card.indexOf("default:", from));

test("the card asks the question and offers both answers word for word", () => {
  assert.ok(from > -1, "the card has a case for the kind");
  assert.match(spec, /title: "Your meal break could have been moved",/);
  assert.match(spec, /short: "Your meal break could have been moved",/);
  assert.match(spec, /ask: "Could your meal break have been moved to when you were free\?",/);
  assert.match(spec, /label: "Yes, I took it then",\s*why: "Tell us when your meal break started\.",/);
  assert.match(spec, /label: "No, it could not have been moved",\s*why: "Then we ask about the meal break as it was booked\.",/);
  assert.match(spec, /yesEffect: <>Your record says you took your meal break, and your schedule needs changing to match\.<\/>,/);
  assert.match(spec, /noEffect: <>Nothing changes yet\. The next question asks about the meal break as it was booked\.<\/>,/);
});

test("the facts are the booked lunch, what it ran into, and the free time", () => {
  assert.match(spec, /label: "Booked at", value: `\$\{q\.row\?\.mealFrom\} to \$\{q\.row\?\.mealTo\}`/);
  assert.match(spec, /label: "Your shift", value: `\$\{q\.row\?\.blockFrom\}-\$\{q\.row\?\.blockTo\}, \$\{q\.row\?\.service\}`/);
  assert.match(spec, /label: "Worked until", value: `\$\{q\.row\?\.blockTo\}, \$\{q\.row\?\.service\}`/);
  assert.match(spec, /label: "Free", value: free/);
  assert.match(spec, /timeHint: `Has to be a half hour inside/);
});

test("confirming the no stays on the day, where the booked-meal card opens", () => {
  assert.match(card, /const movesOn =\s*!!proposed && proposed\.choice !== null\s*&& proposed\.choice !== q\.followsOn\s*&& !!nav\?\.go/);
});

test("no reason is asked on either answer: a no goes on to the booked-meal card, which asks it", () => {
  assert.equal(REASON_ON.mealCouldMove, undefined);
  assert.equal(reasonOwedOn("mealCouldMove", "no"), false);
  assert.equal(reasonOwedOn("mealCouldMove", "yes"), false);
});

test("payroll's note says which way it went", () => {
  const actions = read("src/app/portal/admin/timesheets/actions.js");
  const at = actions.indexOf("function resolutionFor(");
  const note = actions.slice(at, at + 14000);
  assert.match(note, /case "mealCouldMove": \{/);
  assert.match(note, /`Employee says the meal break was taken\$\{at \? ` at \$\{at\}` : ""\}, in time they were free\. Meal premium removed for this day\.`/);
  assert.match(note, /"Employee says the meal break could not have been moved into the free time\. Their answer on the booked meal break decides the premium\."/);
});

test("the answer has to land in the free time the card offered", () => {
  const actions = read("src/app/portal/admin/timesheets/actions.js");
  assert.match(actions, /q\.kind === "mealCouldMove" && d\s*\?\s*mealFreeWindows\(d, ts\.data\?\.scheduleCheck\?\.byDate\?\.\[need\.date \|\| q\.date\]\)/);
  assert.match(actions, /if \(outsideFree \|\| \(d && mealTimeFits\(d, start, need\.minutes\)\.why === "window"\)\)/);
});

test("taking the no back, or turning it to a yes, clears the booked-meal answer it opened", () => {
  const actions = read("src/app/portal/admin/timesheets/actions.js");
  assert.match(
    actions,
    /if \(q\.kind === "mealCouldMove" && pick !== "no"\) \{\s*await tx\.timesheetCorrection\.deleteMany\(\{\s*where: \{\s*timesheetId: ts\.id,\s*kind: \{ in: \["q_mealShort", "q_mealInShift"\] \},\s*date: \{ in: dates \},\s*status: \{ not: "open" \},/,
  );
});

test("a yes takes the rostered lunch off the day's picture, where they said it wasn't", () => {
  const page = read("src/app/t/[token]/page.js");
  assert.match(page, /if \(q\.kind === "mealCouldMove" && picked === "yes"\) droppedRosteredMeal\.add\(q\.date\);/);
});

test("every place that builds the question list hands it the answers", () => {
  const sites = [
    "src/app/t/[token]/page.js",
    "src/app/portal/admin/timesheets/[id]/page.js",
    "src/lib/timesheet/premium-split.js",
  ];
  for (const p of sites) {
    // each call up to the close of its options object
    const calls = [...read(p).matchAll(/buildQuestions\([\s\S]*?\}\)/g)].map((m) => m[0]);
    assert.ok(calls.length > 0, `${p}: no call found - this test needs updating`);
    for (const call of calls) assert.match(call, /answers: /, `${p}: a call without the answers:\n${call}`);
  }
  const actions = read("src/app/portal/admin/timesheets/actions.js");
  assert.match(actions, /const asked = buildQuestions\(ts\.data, \{[^}]*answers: ts\.corrections,/s);
  assert.match(actions, /const questions = buildQuestions\(ts\.data, \{[^}]*answers: onRecord,/s);
});
