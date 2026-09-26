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

// WORDED AS A QUESTION ABOUT WHAT HAPPENED:
// the card states the unscheduled stretch and the recorded meal, then asks
// whether a full break was taken in that stretch; the old "could it have been
// moved" asked whether it was possible while its yes said it was done.
test("the card asks the question and offers both answers word for word", () => {
  assert.ok(from > -1, "the card has a case for the kind");
  assert.match(spec, /title: "Confirm your meal period",/);
  assert.match(spec, /short: "Confirm your meal period",/);
  assert.match(spec, /ask: `Did you take an uninterrupted \$\{minutes\}-minute meal break at any time \$\{between\}\?`,/);
  assert.match(spec, /label: `Yes, I took a \$\{minutes\}-minute meal break during this time`,\s*why: "What time did your meal break start\?",/);
  assert.match(spec, /label: `No, I did not take a \$\{minutes\}-minute meal break during this time`,\s*why: "Then we ask about the meal break as it was booked\.",/);
  assert.match(spec, /yesEffect: <>Your record says you took your meal break, and your schedule needs changing to match\.<\/>,/);
  assert.match(spec, /noEffect: <>Nothing changes yet\. The next question asks about the meal break as it was booked\.<\/>,/);
});

test("the body says the unscheduled stretch and the recorded meal, and the hint says where a full break fits", () => {
  assert.match(spec, /const unscheduled = windows\.map\(\(w\) => `from \$\{longClock\(w\.from\)\} to \$\{longClock\(w\.to\)\}`\)\.join\(" and "\);/);
  assert.match(spec, /const between = windows\.map\(\(w\) => `between \$\{longClock\(w\.from\)\} and \$\{longClock\(w\.to\)\}`\)\.join\(" or "\);/);
  assert.match(spec, /You had an unscheduled period \{unscheduled\}\./);
  // the second line says what cut the meal short: a block that began inside
  // it, one that ran into it, a shift around it, or a roster that booked it
  // short. one builder, shared with the short-meal card
  assert.match(spec, /const recorded = recordedMealLine\(q\.row, minutes\);/);
  assert.match(card, /bf > mf && bf < mt\n\s*\? `Your recorded meal period was scheduled for \$\{booked\}, but work began again at \$\{longClock\(row\?\.blockFrom\)\}\.`/);
  assert.match(card, /bt > mf && bt < mt\n\s*\? `Your recorded meal period was scheduled for \$\{booked\}, but work ran until \$\{longClock\(row\?\.blockTo\)\}\.`/);
  assert.match(card, /row\?\.booked === "inside"\n\s*\? `Your recorded meal period was scheduled for \$\{booked\}, inside a shift you worked from \$\{longClock\(row\?\.blockFrom\)\} to \$\{longClock\(row\?\.blockTo\)\}\.`/);
  assert.match(card, /: `Your recorded meal period was scheduled for \$\{booked\}, shorter than \$\{minutes\} minutes\.`/);
  assert.match(spec, /timeHint: `What time did your meal break start\? It must be a \$\{minutes\}-minute period within \$\{within\}\. For example, valid start times would be \$\{examples\}\.`/);
  // the day card says the sentences too, not a label-and-value readout
  assert.match(spec, /prose: true,/);
  assert.match(card, /\) : c\.prose && c\.body \? \(/);
  assert.doesNotMatch(spec, /facts:/);
  assert.match(spec, /`\$\{longClock\(w\.from\)\} through \$\{clockMinus\(w\.to, minutes\)\} because a full \$\{minutes\} minutes has to fit before \$\{longClock\(w\.to\)\}`/);
  // the minutes come from the question's own need, never a number typed here
  assert.match(spec, /const minutes = q\.needs\?\.\[0\]\?\.minutes \|\| 30;/);
  // the clocks read in full, "1:48 PM", off the row's compact "1:48p"
  assert.match(card, /const longClock = \(compact\) => \{\n\s*const hhmm = parseLooseTime\(compact \|\| "", \{ assumeWorkday: true \}\);\n\s*return hhmm \? formatTimeDisplay\(hhmm\)\.replace\(\/\^0\/, ""\) : compact;/);
});

test("saving the no stays on the day, where the booked-meal card opens", () => {
  // the card reports that its no opens another card; the day's button then
  // saves it and stays, reading Save answer rather than Save and next
  assert.match(card, /stays=\{!!q\.followsOn && proposed\?\.choice === q\.followsOn\}/);
  assert.match(card, /const staying = waiting\.some\(\(e\) => e\.stays\);/);
  assert.match(card, /staying \? "Save answer" : waiting\.length \? "Save and next" : "Next"/);
  assert.match(card, /if \(staying\) return;/);
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
  assert.match(note, /"Employee says no 30-minute meal break was taken in the free time\. Their answer on the booked meal break decides the premium\."/);
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
