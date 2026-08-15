// SAYING YOU MISSED A BREAK NEEDS A REASON.
//
// The why is the one half no QSP export has a field for, and a "no" IS the
// violation - so an answer without it records that a break was missed and
// cannot say what caused it, which is the hole this work exists to close.
// Mánu 2026-08-14 chose required over optional.
//
// Enforced in the browser AND in the action. These read the action as text,
// which is crude and is the same trick question-coverage.test.mjs uses: the
// alternative is standing up Prisma for a server action.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const ACTION = read("src/app/portal/admin/timesheets/actions.js");
const CARD = read("src/app/t/[token]/TimesheetQuestion.js");

test("the action refuses a missed break with no reason", () => {
  assert.match(ACTION, /needreason/, "the action has to have a refusal to give");
  // and it is scoped to the two kinds whose "no" is a missed break, not to
  // every decline - `restOutsideScheduled`'s decline is "the time was wrong"
  // and has nothing to explain
  assert.match(ACTION, /REASON_ON/);
  const set = ACTION.slice(ACTION.indexOf("const REASON_ON"), ACTION.indexOf("const REASON_ON") + 240);
  assert.match(set, /nothingDocumentedMeal: "no"/);
  assert.match(set, /nothingDocumentedRest: "no"/);
  // AND THE ONE THAT HANGS OFF THE OTHER ANSWER. On a late lunch the break
  // happened; confirming it really was that late is what stands the violation
  // up, so the sentence goes on the "yes". A set keyed on "no" asked the wrong
  // half of that card.
  assert.match(set, /mealLate: "yes"/);
  assert.doesNotMatch(set, /restOutsideScheduled/);
  assert.doesNotMatch(set, /partial/, "a partial is about the tens they DID get");
});

test("the browser enforces the same rule as the action, on the same kinds", () => {
  // two gates that disagree means a button that saves nothing, or one that
  // refuses something the server would have taken
  assert.match(CARD, /REASON_ON/);
  assert.match(CARD, /missingReasons/);
  const set = CARD.slice(CARD.indexOf("const REASON_ON"), CARD.indexOf("const REASON_ON") + 240);
  assert.match(set, /nothingDocumentedMeal: "no"/);
  assert.match(set, /nothingDocumentedRest: "no"/);
  assert.match(set, /mealLate: "yes"/, "the two maps have to agree, or the button saves nothing");
});

test("the reason is only ever sent on the answer that owes it", () => {
  // and not on every answer: a partial is telling us about the tens they DID
  // get, and it carries none
  assert.match(CARD, /reason: owesReason\(q, v\)/);
});

test("the row is keyed through the shared spelling, not a second one", () => {
  // a reason taken on a call and a reason they typed are the same fact about
  // the same day. Two spellings would be two rows that can disagree, and
  // `formatBreakComments` would print both.
  assert.match(ACTION, /breakFindingKey/);
  assert.doesNotMatch(ACTION, /`break-\$\{/, "the key must not be rebuilt inline here");
});

test("the period is SELECTed, because the answer is keyed on it", () => {
  // a break answer is keyed on the PERIOD, not the batch, so an answer given
  // against one export is still the answer on the next. Left out of the select
  // it arrives undefined - which is the failure `restsUrl` and `status` have
  // each caused before, and it looks like a missing field rather than a bug.
  const sel = ACTION.slice(
    ACTION.indexOf("export async function answerTimesheetQuestion"),
    ACTION.indexOf("const questions = buildQuestions"),
  );
  assert.match(sel, /periodFrom: true/);
  assert.match(sel, /periodTo: true/);
});

test("answering yes does not delete a reason a reviewer recorded", () => {
  // a reviewer's record of a phone call is not the employee's to erase, and the
  // two genuinely disagreeing is a thing for a person to settle
  assert.match(ACTION, /REASON_ON\[q\.kind\] === pick\) await writeBreakAnswer/);
});

// ---------------------------------------------------------------------------
// THE REASONS, ON THE DAYS THEY ARE ABOUT.
//
// They rendered as one lump below everything, attached to nothing: a reason
// about the 4th sat under a reason about the 11th with no picture and no day
// between them. On All employees the admin control sits on the day it is about,
// so the two screens now read the same way round.
const DAYBYDAY = read("src/app/t/[token]/DayByDay.js");
const PAGE = read("src/app/t/[token]/page.js");

test("the reasons reach the day-by-day view", () => {
  assert.match(PAGE, /breakAsks=\{breakAsks\}/, "the prop has to be handed over");
  assert.match(DAYBYDAY, /asksByDate/);
  assert.match(DAYBYDAY, /<BreakReason/);
});

test("nothing can silently stop being asked", () => {
  // A break answer is keyed on the PERIOD, so it outlives the upload it was
  // taken against. A re-upload that drops a day would leave its reason pointing
  // at a day that is no longer on the sheet - and dropping it on the floor
  // means a question that stops being asked without anybody being told.
  assert.match(DAYBYDAY, /orphanAsks/);
  const orphan = DAYBYDAY.slice(DAYBYDAY.indexOf("const orphanAsks"), DAYBYDAY.indexOf("const orphanAsks") + 120);
  assert.match(orphan, /!dayDates\.has/, "an ask off the sheet has to be caught");
  // and rendered, not merely counted
  assert.match(DAYBYDAY, /orphanAsks\.map/);
});

test("the other view keeps them too", () => {
  // "All questions" has no days to hang them on, so it keeps the list - and
  // moving them into the day view WITHOUT this would have deleted them from
  // that half of the page entirely.
  assert.match(PAGE, /detailed=\{\[/);
  assert.match(PAGE, /things to check before we can put your timesheet together/);
});

// NOTHING SAVES WHILE A DAY IS STILL OPEN, 2026-08-14.
//
// The card commits every one of its days in a single write - that is what makes
// it one card and not thirteen - so a half-answered set is not a partial save,
// it is a set somebody has not finished.
//
// IT REVERSES A DELIBERATE CALL and keeps that call's reasoning. The confirm was
// made never-greyed-out on 2026-08-12 because a dead button put the explanation
// somewhere off screen. So this blocks without going dead: the label counts what
// is left and a line above says the same thing.
test("the batch confirm will not open while a day is unanswered", () => {
  assert.match(CARD, /if \(!undecided\.length\) setConfirming\(true\)/);
});

test("and it says so rather than going dead", () => {
  // the 2026-08-12 objection was never to the block, it was to a control that
  // looked broken with its reason elsewhere
  assert.match(CARD, /still to answer/);
  assert.match(CARD, /aria-disabled=\{undecided\.length > 0\}/);
  // `disabled` stays for the in-flight save alone, which is what keeps the
  // label readable and the reason on screen
  assert.match(CARD, /disabled=\{pending\}/);
});

// AND THE SHEET DOES NOT GENERATE UNTIL EVERY QUESTION HAS AN ANSWER.
//
// `signingGate.canSign` has been unconditionally true since 2026-08-12 - after
// the flip, silence KEPT the pay, so blocking on it held a timesheet hostage to
// a question whose safe answer had already been given by not touching it.
//
// What changed is that silence is no longer the only safe answer. A "no" now
// records WHY, the one half no export carries, and that only exists if somebody
// answers. A sheet generated over fifteen untouched cards is a document with
// fifteen unexplained findings on it.
test("generate is gated on the whole sheet, not on the mandatory ones", () => {
  assert.match(PAGE, /canSign=\{progress\.settled/);
  // `answerProgress` and not a count of KINDS: every screen that counted
  // `new Set(kinds).size` was wrong the moment one kind emitted two questions
  assert.match(PAGE, /answerProgress\(questions, ts\.corrections\)/);
});

test("what is holding it is counted per question", () => {
  // `gate.blocking` is 0 by design since the gate stopped deciding, so using it
  // would have said "0 questions" beside a sheet that would not generate
  assert.match(PAGE, /blocking=\{\(progress\.asked - progress\.answered\)/);
  assert.doesNotMatch(PAGE, /blocking=\{\(gate\.blocking/);
});


// EVERY WAY THE SAVE CAN BE REFUSED HAS WORDS FOR IT.
//
// The action refuses eleven different ways and the card had sentences for
// three. The other eight came out as "That didn't save. Refresh the page and
// try again" - advice that cannot work, because the refusal is a judgement
// about what was sent and refreshing sends it again. That is what a missing
// reason looked like from the outside.
test("no refusal falls through to the generic message", () => {
  const ACT = read("src/app/portal/admin/timesheets/actions.js");
  const body = ACT.slice(
    ACT.indexOf("export async function answerTimesheetQuestion"),
    ACT.indexOf("export async function", ACT.indexOf("export async function answerTimesheetQuestion") + 10),
  );
  const codes = [...new Set([...body.matchAll(/error: "([a-z]+)"/g)].map((m) => m[1]))];
  assert.ok(codes.length >= 10, `expected the full refusal set, found ${codes.length}`);
  const map = CARD.slice(CARD.indexOf("const REFUSALS = {"), CARD.indexOf("const refusalText"));
  const missing = codes.filter((c) => !map.includes(`${c}:`));
  assert.deepEqual(missing, [], `refusals with no words: ${missing.join(", ")}`);
});


// A REFUSAL HAS TO SAY WHERE, NOT JUST WHAT.
//
// The batch card commits every day it holds in ONE write, so "needs a reason"
// on its own points at thirteen days at once. Every refusal that is about a
// PARTICULAR answer carries the day, the slot and - where the answer had to
// land inside something - the hours it had to land inside.
test("the refusals that are about one answer say which one", () => {
  const ACT = read("src/app/portal/admin/timesheets/actions.js");
  // EVERY occurrence, not the first. `badtime` is returned from two different
  // paths and checking `indexOf` alone passed on the one that was already fixed
  // while the other still refused blind.
  for (const code of ["needreason", "missingtime", "badtime", "outsideshift", "nolunchgap"]) {
    const hits = [...ACT.matchAll(new RegExp(`error: "${code}"`, "g"))].map((m) => m.index);
    assert.ok(hits.length > 0, `${code} is not returned any more`);
    for (const i of hits) {
      const near = ACT.slice(i, i + 200);
      assert.match(near, /at: |at: \{|badAt/, `a ${code} refusal does not say where`);
    }
  }
});

test("and the ones that take a typed time quote it back", () => {
  // "that time is outside your shift" is a verdict; "you typed 11:50a, it has to
  // be inside 1:30p-2p" is something somebody can act on
  const ACT = read("src/app/portal/admin/timesheets/actions.js");
  for (const code of ["badtime", "outsideshift", "nolunchgap"]) {
    for (const m of ACT.matchAll(new RegExp(`error: "${code}"`, "g"))) {
      assert.match(ACT.slice(m.index, m.index + 200), /given: /, `a ${code} refusal does not quote what was typed`);
    }
  }
  assert.match(CARD, /you typed/);
  assert.match(CARD, /It has to be inside/);
});
