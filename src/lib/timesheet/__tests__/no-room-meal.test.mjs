// A DAY WITH NOWHERE TO PUT A LUNCH MUST NOT OFFER "I TOOK IT".
//
// The card offered the option and then, in the box it opened, said there is no
// gap in this day long enough to have taken one. Picking it led nowhere: the
// time is required and no time passes, so the only way out was to go back and
// pick the other one.
//
// 9 meal slots on the live batch over 6 people, 143 in July over 42.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildQuestions } from "../questions.js";

const CARD = fs.readFileSync("src/app/t/[token]/TimesheetQuestion.js", "utf8");
const QUESTIONS = fs.readFileSync("src/lib/timesheet/questions.js", "utf8");

// TAKEN OFF REAL DAYS, not invented. A punch is `{min, raw}` and the engine
// pairs them in and out - the first version of this fixture used strings, which
// it could not read at all, so BOTH days came out with no room and the test
// that was meant to prove the flag can be false passed on a broken day.
//
// Aranda 07/16 is the no-room shape: five pairs end to end, no gap between any
// of them. Her 07/23 is the other: the same day with a half hour actually open.
const punch = (...mins) => mins.map((min) => ({ min, raw: String(min) }));
const dayBase = {
  date: "07/17/26",
  paidHours: 8,
  mealViolation: true,
  mealRequired: true,
  restRequired: 2,
  restTaken: 0,
  restViolation: true,
  scheduleBlocks: [],
};
// 9a-10a, 10a-12:30p, 12:30p-1p, 1p-2:30p, 2:30p-5p, straight through
const tight = { days: [{ ...dayBase, punches: punch(540, 600, 600, 750, 750, 780, 780, 870, 870, 1020) }] };
// the same day with 12:15p-12:45p and 3p-3:30p actually open
const roomy = { days: [{ ...dayBase, punches: punch(540, 600, 600, 735, 765, 900, 930, 990) }] };

test("the engine marks a meal slot with nowhere to go", () => {
  const qs = buildQuestions(tight, { restRows: [], sourceName: "Test, Person" });
  const meal = qs.flatMap((q) => q.needs || []).filter((n) => n.kindOf === "meal");
  assert.ok(meal.length, "no meal slot was asked for at all");
  for (const n of meal) {
    assert.equal(n.noRoom, true, "the slot has windows it should not have");
    assert.equal((n.options || []).length, 0);
  }
});

test("and it can be false, or the flag proves nothing", () => {
  const meal = buildQuestions(roomy, { restRows: [], sourceName: "Test, Person" })
    .flatMap((q) => q.needs || []).filter((n) => n.kindOf === "meal");
  assert.ok(meal.length, "the roomy day asks nothing, so it proves nothing either");
  assert.ok(meal.some((n) => !n.noRoom), "no meal slot ever gets room, so the flag is meaningless");
  assert.ok(meal.some((n) => (n.options || []).length), "a day with a gap offers no time to pick");
});

test("the card offers only the one answer that exists", () => {
  assert.match(CARD, /if \(noRoom\(q\)\) return \["no"\];/);
});

test("and it does not render buttons at all", () => {
  // one option is still a control somebody has to press to get to the reason
  assert.match(CARD, /\) : noRoom\(q\) \? null : \(/);
});

test("the sentence sits beside the finding, not in the control's slot", () => {
  // every decision is one titled section since 2026-09-08, so the sentence
  // renders once, directly under the finding it explains - never in the
  // slot the segmented control uses
  const hits = [...CARD.matchAll(/There is no gap in this day long enough to have taken one/g)];
  assert.equal(hits.length, 1, "once, in the per-decision section");
  const before = CARD.slice(Math.max(0, hits[0].index - 600), hits[0].index);
  assert.match(before, /\{missingLabel\(q\)\}/, "it sits under the finding line");
  assert.doesNotMatch(before.slice(-260), /renderToggle/, "and not in the control's slot");
});

test("the answer is settled, so the confirm is not held waiting for it", () => {
  // `undecided` gates the whole card's confirm on every day having a value
  assert.match(CARD, /if \(noRoom\(q\)\) return "no";/);
});

test("it is a fact off the slot, not a sentence matched on the screen", () => {
  assert.match(QUESTIONS, /noRoom: !m && !asText\.length/);
  // and the hint that says it out loud is built from the same windows
  assert.match(QUESTIONS, /"there is no gap in this day long enough to have taken one"/);
});

test("a rostered lunch is never noRoom, however tight the day", () => {
  // the roster booked a time, so there IS one to put against "I took it"
  assert.match(QUESTIONS, /noRoom: !m &&/);
});


// AND EACH BOX SITS UNDER THE FLAG IT BELONGS TO.
//
// A day short both a lunch and its tens has two rows, and the time and reason
// boxes for both rendered after both toggles - so the lunch's reason appeared
// below the rest question, and a day with both answered showed two identical
// "Can you tell us why?" boxes with nothing saying which was which.
test("a two-decision day renders each box inside its own row", () => {
  // one titled section per decision since 2026-09-08 - the boxes render
  // inside the per-item map, so a day's two decisions can never share or
  // swap their follow-ups
  const block = CARD.slice(CARD.indexOf("{items.map((item) => {"), CARD.indexOf("</li>", CARD.indexOf("{items.map((item) => {")));
  assert.match(block, /\{renderTimes\(item\)\}/);
  assert.match(block, /\{renderReason\(item\)\}/);
});

test("and nothing renders them over the whole list any more", () => {
  assert.doesNotMatch(CARD, /\{items\.map\(\(\{ q, v \}\) => \(/);
});


// AND THE REVIEWER'S SCREEN HAS TO AGREE ABOUT THE DAY.
//
// It said "if they took it, it needs punching in QuickSolve" on every no-meal
// day, which on a day with no gap long enough is pointing somebody at work that
// does not exist - and it offered "they took it, needs punching" beside it,
// which is a claim the day cannot support.
import { dayViolations } from "../violations.js";
import { VIOLATION_KINDS } from "../violations.js";
import { answerOptionsFor } from "../break-answers.js";

test("the finding carries whether the day ever had room", () => {
  const tightDay = { ...tight.days[0] };
  const roomyDay = { ...roomy.days[0] };
  const noRoom = dayViolations(tightDay).find((v) => v.kind === "meal-not-recorded");
  const hasRoom = dayViolations(roomyDay).find((v) => v.kind === "meal-not-recorded");
  assert.ok(noRoom, "the tight day raises no meal finding at all");
  assert.equal(noRoom.noRoom, true);
  assert.ok(hasRoom, "the roomy day raises no meal finding at all");
  assert.equal(hasRoom.noRoom, false, "every day reads as no room, so the flag says nothing");
});

test("it stops telling them to go and punch something that cannot exist", () => {
  const k = VIOLATION_KINDS["meal-not-recorded"];
  assert.match(k.ask, /needs punching in QuickSolve/);
  assert.ok(k.askNoRoom, "no sentence for the day that had no room");
  assert.doesNotMatch(k.askNoRoom, /punching in QuickSolve/);
  assert.match(k.askNoRoom, /reason rather than a correction/);
});

test("and only the answer the day allows is offered", () => {
  const opts = answerOptionsFor({ kind: "meal", missing: 1, noRoom: true });
  assert.equal(opts.length, 1);
  assert.equal(opts[0].answer, "not-taken");
  assert.equal(opts[0].asksReason, true);
});

test("a normal day keeps both, or the guard is just deleting a button", () => {
  const opts = answerOptionsFor({ kind: "meal", missing: 1, noRoom: false });
  assert.equal(opts.length, 2);
  assert.ok(opts.some((o) => o.answer === "took-it"));
});

test("the rests are untouched, because a ten fits almost anywhere", () => {
  const opts = answerOptionsFor({ kind: "rest", missing: 2, noRoom: true });
  assert.equal(opts.length, 3, "a packed day is still a day they could have taken tens on");
  assert.ok(opts.some((o) => o.answer === "took-it"));
});

test("both screens read one fact about the day, not two", () => {
  const v = fs.readFileSync("src/lib/timesheet/violations.js", "utf8");
  assert.match(v, /noRoom: !mealWindows\(d\)\.length/);
  assert.match(QUESTIONS, /noRoom: !m && !asText\.length/);
});
