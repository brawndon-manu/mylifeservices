// THE SHORT-LUNCH CARD PUTS THE QUESTION AND OFFERS BOTH ANSWERS.
//
// a lunch under thirty minutes, booked short or with a booking running into
// it, used to offer one answer, the missed meal. it asks now whether the
// chance at a full uninterrupted thirty was there: yes takes the hour off the
// day, no keeps it and asks why. the card is a client component, so its words
// are read off the source; what the answers do is pinned by the real functions
// in timesheet/__tests__/meal-short.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { REASON_ON } from "../timesheet/break-answers.js";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const card = read("src/app/t/[token]/TimesheetQuestion.js");
const spec = card.slice(card.indexOf('case "mealShort":'), card.indexOf('case "mealShort":') + 2600);

test("the card puts the question in so many words and offers both answers word for word", () => {
  assert.ok(spec.startsWith('case "mealShort":'), "the card spec is where it was");
  assert.match(spec, /short: "Your meal period was less than 30 minutes",/);
  assert.match(spec, /ask: "Were you provided the opportunity to take a full, uninterrupted 30-minute meal period\?",/);
  assert.match(spec, /label: "Yes\. I was provided the opportunity to take a full 30-minute meal period but voluntarily chose to return early\.",/);
  assert.match(spec, /label: "No\. I was not provided the opportunity to take a full, uninterrupted 30-minute meal period\.",/);
  assert.match(spec, /yesEffect: <>Your record says you were given a full meal break and chose to come back early\.<\/>,/);
  assert.match(spec, /noEffect: <>Your record says the meal break was cut short, with your reason on it\.<\/>,/);
  // the one-answer card and its line that the lunch could not have been taken
  // are gone from this card (the lunch inside a shift keeps its single answer)
  assert.doesNotMatch(spec, /I understand, I did not get a meal break that day/);
  assert.doesNotMatch(spec, /not a break you\s+could have taken/);
  assert.match(card, /case "mealInShift":[\s\S]{0,4000}I understand, I did not get a meal break that day/);
});

test("the question line shows in the day view and in the full card", () => {
  assert.match(card, /\{c\.ask && \(\s*<p className="mt-2 text-sm font-semibold leading-snug text-foreground">\{c\.ask\}<\/p>\s*\)\}/);
  assert.match(card, /\{c\.ask && !allAnswered && \(\s*<p className="mt-2 text-sm font-semibold leading-snug text-foreground">\{c\.ask\}<\/p>\s*\)\}/);
});

test("a reason is still asked on the no and only there", () => {
  assert.deepEqual(REASON_ON.mealShort, ["no"]);
});

test("payroll's note on the answer says which way the hour went", () => {
  const actions = read("src/app/portal/admin/timesheets/actions.js");
  const note = actions.slice(actions.indexOf("function resolutionFor("), actions.indexOf("function resolutionFor(") + 12000);
  assert.match(note, /case "mealShort":\s*return yes\s*\? "Employee says a full thirty minutes was offered and they chose to come back early\. Meal premium removed for this day\."\s*: "Employee says a full, uninterrupted thirty minutes was not offered\. Meal premium stands\.";/);
});
