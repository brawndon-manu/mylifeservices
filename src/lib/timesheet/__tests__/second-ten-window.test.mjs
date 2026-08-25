// THE WINDOW THE CARD OFFERS AND THE WINDOW THE SERVER CHECKS HAVE TO BE ONE.
//
// A day owed two rest periods and already holding one asks for its SECOND ten
// in the FIRST offered slot. The slot is named by POSITION - `rest1` - and the
// break it is about is number two. The label and the hint were both built from
// the ordinal; the server parsed the number back out of the slot name.
//
// So the card said "has to be inside 1:30p-2p or 2:30p-5:30p", somebody typed
// 5p, and it came back "that has to sit inside a shift you worked" - measured
// against 10a-2p, the FIRST ten's window, which they had never been shown.
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildQuestions, restTimeFits, restWindow } from "../questions.js";

// 07/27: 10a-2p and 2:30p-5:30p, one ten already on record at 12:10p
const day = {
  date: "07/27/26",
  punches: [{ min: 600 }, { min: 840 }, { min: 870 }, { min: 1050 }],
  paidHours: 7, restRequired: 2, restTaken: 1, restViolation: true,
  mealScheduled: true, mealViolation: false,
};

const qs = () => buildQuestions(
  { days: [day], scheduleCheck: { byDate: {} } },
  { sourceName: "Uribe, Mánu", restRows: [] },
);

test("the slot asking for the second ten says which ten it is", () => {
  const q = qs().find((x) => x.kind === "nothingDocumentedRest");
  assert.ok(q, "a day one rest short still raises the question");
  const slot = (q.needs || []).find((n) => n.kindOf === "rest");
  assert.equal(slot.slot, "rest1", "it is the first slot OFFERED");
  assert.equal(slot.ordinal, 2, "and it is the SECOND ten");
  assert.match(slot.label, /Second/);
});

test("5p is inside the window the card offers", () => {
  const q = qs().find((x) => x.kind === "nothingDocumentedRest");
  const slot = (q.needs || []).find((n) => n.kindOf === "rest");
  // the hint the person reads
  assert.ok(slot.window.some((w) => w.includes("5:30p")), `offered ${slot.window.join(", ")}`);
  // and the check, run with the ordinal the slot carries
  assert.equal(restTimeFits(day, slot.ordinal, 17 * 60, 10).ok, true, "5p must be accepted");
});

// THE ASSERTION THAT WOULD HAVE CAUGHT IT. Parsing the ordinal out of the slot
// name gives 1, and the first ten's window is the first four hours - 10a-2p -
// which 5p is nowhere near.
test("reading the ordinal off the slot name is what refused it", () => {
  const parsed = Number("rest1".replace(/\D/g, ""));
  assert.equal(parsed, 1);
  assert.equal(restTimeFits(day, parsed, 17 * 60, 10).ok, false, "this is the bug, pinned");
  assert.deepEqual(
    restWindow(day, 1).map((w) => [w.from, w.to]),
    [[600, 840]],
    "the first ten's window is 10a-2p, which is never shown on this card",
  );
});

// AND A ROW THE SOURCE HOLDS WRONG IS ON THE RIGHT, NOT ONLY IN THE COLOUR.
//
// The calendar marks it amber and the chip above the column quotes the record.
// Neither is where somebody looks for what to DO - the right column is the list
// of things the day needs, and a fix that appears only as a colour is a fix
// nobody is being asked for.
import fs from "node:fs";
const DBD = fs.readFileSync("src/app/t/[token]/DayByDay.js", "utf8");

test("a backwards row gets a panel in the work column", () => {
  assert.match(DBD, /function NeedsFixing/);
  assert.match(DBD, /<NeedsFixing\s/);
  // driven by the same flag the calendar colours from, so the two cannot
  // disagree about which rows need fixing
  assert.match(DBD, /\.filter\(\(b\) => b\.attention\)/);
});

test("it says what it should read FROM and TO, not just that it is wrong", () => {
  // "the times are the other way round" is a verdict. The pair of times is
  // what the office retypes into QuickSolve, and the panel states it without
  // telling the employee to do it - the office corrects the record now.
  assert.match(DBD, /QuickSolve has/);
  assert.match(DBD, /It should read/);
  assert.match(DBD, /b\.recorded\?\.from/);
});

// THE REASSURANCE LINE CAME OUT on Mánu's instruction. It read "your timesheet
// already counts this break at the corrected time, so nothing is missing from
// your hours" - true, and one sentence too many on a panel whose job is to say
// what to retype. The panel is the instruction; the pair of times is the whole
// of it.
test("the panel says what to change and stops there", () => {
  assert.doesNotMatch(DBD, /already counts this break at the corrected time/);
  assert.match(DBD, /QuickSolve has/);
});

test("a day whose only item is a fix no longer says nothing to check", () => {
  assert.match(DBD, /b\.attention && !ackOn/);
});

test("and it stops counting once somebody has taken it on", () => {
  // there is nothing to ANSWER on a backwards entry - the engine already reads
  // it the right way round - so without a way to say "seen" the row sat there
  // for ever and the panel could never tick it off
  assert.match(DBD, /<AcknowledgeFix/);
  assert.match(DBD, /ackOn\?\.has\?\.\(`\$\{day\.date\}\|\$\{b\.min\}`\)/);
});

test("the acknowledgement is keyed to the SHEET, not the period", () => {
  // a break reason is keyed to the period so it survives a re-upload. This must
  // not: if the next export still holds the times backwards it has to ask again,
  // and a new upload is a new sheet with no acknowledgement on it.
  const ACT = fs.readFileSync("src/app/portal/admin/timesheets/actions.js", "utf8");
  const body = ACT.slice(ACT.indexOf("export async function acknowledgeSpan"),
    ACT.indexOf("export async function submitSignedTimesheet"));
  assert.match(body, /timesheetId: ts\.id/);
  assert.doesNotMatch(body, /periodFrom/);
  // and it moves no figure, so nothing is rebuilt
  assert.doesNotMatch(body, /rebuildSheetFor/);
});

// WHY IT IS A PROBLEM, IN ONE LINE, ON BOTH VIEWS.
//
// The card said what the record holds and what we make of it and never said what
// RULE the day broke - so three answer options read as a form rather than as a
// question about something that matters.
const CARD_SRC = fs.readFileSync("src/app/t/[token]/TimesheetQuestion.js", "utf8");

test("the off-clock card says the rule and the way out of breaking it", () => {
  assert.match(CARD_SRC, /rule: "A rest break has to be taken inside a shift/);
  assert.match(CARD_SRC, /tell your supervisor at the time/);
});

test("it names no premium and no penalty", () => {
  // the standing rule for anything an employee reads. What is owed is admin's
  // business; what the person needs is the rule and the way out.
  const i = CARD_SRC.indexOf('rule: "A rest break');
  const line = CARD_SRC.slice(i, CARD_SRC.indexOf('",', i));
  assert.doesNotMatch(line, /premium|penalty|hour of pay|owed/i);
});

test("both views show the same sentence", () => {
  // somebody switching between Day by day and All questions must not be told two
  // different things about one day
  assert.match(CARD_SRC, /\{c\.rule && \(\s*<p className="mt-1\.5/);
  assert.match(CARD_SRC, /\{c\.rule && !allAnswered && \(/);
});


// AND THE SAME TREATMENT ON THE OTHER TWO CARDS.
//
// The missed-break card names the entitlement; the late-lunch one names the
// TIMING, because on that day the break happened and only its start is in
// question. Both end with the same way out, which is the half that makes the
// rule usable rather than just true.
test("the missed-break and late-lunch cards state their rule too", () => {
  assert.match(CARD_SRC, /rule: "You are due a ten minute rest break for every four hours/);
  assert.match(CARD_SRC, /rule: "Your meal break has to start before the end of your fifth hour/);
});

test("every rule ends with somewhere to go", () => {
  // A RULE WITH NO WAY OUT OF BREAKING IT IS A FINDING, NOT GUIDANCE.
  //
  // The way out used to be one sentence - tell your supervisor at the time - so
  // this matched that word. The two meal-booked-inside-a-block rules have a
  // different and better one: the schedule is what is wrong, and fixing it is
  // something the reader can actually do. So this asks whether a rule offers a
  // route at all, and still fails for one that only states a prohibition.
  //
  // Split on the key rather than matched with a pattern: a rule can be a plain
  // string or several concatenated across lines, and the regex that tried to
  // cover both was wrong in a way the test could not see.
  const chunks = CARD_SRC.split("rule:").slice(1).map((c) => c.slice(0, 420));
  assert.ok(chunks.length >= 5, `expected at least five rules, found ${chunks.length}`);
  const WAY_OUT = /supervisor|schedule needs|can be moved|moved outside/;
  for (const c of chunks) {
    assert.match(c, WAY_OUT, `no way out of breaking it: ${c.slice(0, 60)}`);
    assert.doesNotMatch(c.slice(0, 200), /premium|penalty|hour of pay/i, `premium language: ${c.slice(0, 60)}`);
  }
});

test("the example is one somebody would recognise from their own day", () => {
  const BA = fs.readFileSync("src/lib/timesheet/break-answers.js", "utf8");
  assert.match(BA, /appointments with clients that did not make room for the break/);
  assert.doesNotMatch(BA, /back-to-back clients, no cover to step away/);
});

// A REPAIRED ROW WHOSE RAW SPAN RUNS BACKWARDS STILL HAS TO SAY SO.
//
// Two repairs fail two different ways and only one of them was covered:
//
//   2:50a -> 3p    +730 min, starts before the axis -> an edge chip
//   11:30p -> 11:40a  -710 min, ends before it begins -> nothing to draw
//
// The chip for the second was removed when the red outline arrived, on the
// grounds that the BLOCK carries the recorded times now. That is only true where
// it does: `attention` is set on a backwards row and NOT on a repair, because a
// repair has a card asking about it. So the -710 case lost its chip, gained no
// outline, and the times the record holds were stated nowhere on the day.
const CAL = fs.readFileSync("src/app/t/[token]/DayCalendar.js", "utf8");

test("the chip is suppressed only where the block carries the times itself", () => {
  const branch = CAL.slice(CAL.indexOf("if (a == null || z == null || z <= a)"), CAL.indexOf("if (a == null || z == null || z <= a)") + 1400);
  assert.match(branch, /if \(!r\.attention\)/, "it must depend on whether the block shows them");
  assert.match(branch, /said\.notes\.push/, "and still push a note when it does not");
});

test("a repair never gets the outline, so it always needs the chip", () => {
  // pinned together because the two decisions are one decision: if `attention`
  // ever starts covering repairs, this branch has to change with it
  const RB = fs.readFileSync("src/lib/timesheet/recorded-breaks.js", "utf8");
  assert.match(RB, /attention: !row\.repair && !!row\.reversed/);
});

// THE REPAIR CARD HAS TO SAY WHICH TIME IT MEANS.
//
// "Yes, that is when I took it" sat under a heading saying the entry looks
// mis-entered, beside a record reading 11:30 PM, our reading of 11:30 AM and a
// block drawn at 11:30a. Four times on screen and one word - "that" - pointing
// at none of them. Read one way it confirms the time we are calling wrong.
test("the repair card names the time in the answer", () => {
  // a node rather than a string now, so the AM/PM can be marked - see
  // `markMeridiem`. Every repair on both batches is an AM/PM slip, so those two
  // characters are the whole of the correction.
  assert.match(CARD_SRC, /label: <>Yes, I took it at \{markMeridiem\(q\.proposed\.from\)\}<\/>/);
  assert.match(CARD_SRC, /function markMeridiem/);
  assert.doesNotMatch(CARD_SRC, /"Yes, that is when I took it"/);
});

test("and its heading asks rather than states the finding", () => {
  // a heading that names the fault reads as though the answer is already
  // settled, which is the opposite of what a question is for
  assert.match(CARD_SRC, /title: "Did you take a break at this time\?"/);
});

// EVERY QUESTION KIND HAS TO GET ITS OWN COPY.
//
// `nothingDocumented` and `nothingDocumentedMeal` were listed one case too
// early in `copyFor` and fell through to the Misc card. So a missed LUNCH
// rendered as "Time on your schedule marked as Misc", printing the day's paid
// hours as hours of Misc - both kinds carry `row.hours` and it means a different
// thing on each. Verduzco 08/12 read "6.18 hours down as Misc" on a sheet with
// no Misc time on any day of any upload, and as the batched card's heading it
// sat above the entire day list.
test("the nothing-documented kinds do not fall through to the Misc card", () => {
  const at = (k) => CARD_SRC.indexOf(`case "${k}":`);
  const meal = at("nothingDocumentedMeal");
  const rest = at("nothingDocumentedRest");
  const misc = at("miscTime");
  assert.ok(meal > 0 && rest > 0 && misc > 0, "all three cases still exist");
  // the meal label has to sit with the rest case, not before miscTime
  assert.ok(meal < rest, "the meal label falls into the rest case");
  assert.ok(meal > misc, `the meal label is still above miscTime at ${misc}`);
  // and nothing between them but the labels themselves
  const between = CARD_SRC.slice(meal, rest);
  assert.doesNotMatch(between, /return \{/, "something returns before it reaches the rest copy");
});
