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
import {
  reasonOwedOn, reasonSlotFor, breakFindingKey,
} from "../break-answers.js";

const read = (p) => fs.readFileSync(p, "utf8");
const ACTION = read("src/app/portal/admin/timesheets/actions.js");
const CARD = read("src/app/t/[token]/TimesheetQuestion.js");

test("the action refuses a missed break with no reason", () => {
  assert.match(ACTION, /needreason/, "the action has to have a refusal to give");
  // and it asks the shared rule rather than holding a copy of it
  assert.match(ACTION, /reasonOwedOn\(q\.kind, a\.choice\)/);
  assert.doesNotMatch(ACTION, /const REASON_ON = \{/, "the map moved, a second copy can drift");
});

test("the browser enforces the same rule as the action, from the same map", () => {
  // two gates that disagree means a button that saves nothing, or one that
  // refuses something the server would have taken. They were a copy each; the
  // map lives in break-answers.js now and both import it.
  assert.match(CARD, /reasonOwedOn/);
  assert.match(CARD, /missingReasons/);
  assert.doesNotMatch(CARD, /const REASON_ON = \{/);
});

test("every answer that records a break as not taken owes a why", () => {
  // the rule as stated 2026-08-15: if they did not take something, we need to
  // know why. Read off the real map, so a kind added later has to declare itself.
  for (const kind of ["nothingDocumentedMeal", "nothingDocumentedRest", "repair", "restNoTimes", "restIsMealLength", "shortMealRest"]) {
    assert.equal(reasonOwedOn(kind, "no"), true, kind);
  }
  // A LATE LUNCH HANGS OFF THE OTHER ANSWER. The break happened; confirming it
  // really did start that late is what stands the finding up.
  assert.equal(reasonOwedOn("mealLate", "yes"), true);
  assert.equal(reasonOwedOn("mealLate", "no"), false);
  // A PARTIAL OWES ONE TOO, since 2026-08-15. It was excluded on the grounds
  // that a partial is about the tens they DID get - true of the times it
  // collects, not of the day: one of two taken leaves one nobody took, which is
  // what `stillMissing` has always counted.
  assert.equal(reasonOwedOn("nothingDocumentedRest", "partial"), true);
});

test("and the answers where nothing was lost do not", () => {
  // the check that proves the map is not just "always true". Declining an
  // off-clock rest says the recorded TIME was wrong and gives the real one, so
  // the break happened; none of the two-lunches outcomes moves a break at all.
  for (const pick of ["yes", "no", "partial", "wrongone"]) {
    assert.equal(reasonOwedOn("restOutsideScheduled", pick), false, `restOutsideScheduled/${pick}`);
    assert.equal(reasonOwedOn("restTooLongOffClock", pick), false, `restTooLongOffClock/${pick}`);
  }
});

test("a reason is filed under the break it is about, by one spelling", () => {
  // more than one question can be about the same day and the same break, and
  // they share the row on purpose - the premium is one hour per workday, so the
  // day is the unit. What must not happen is a second spelling of the key.
  assert.equal(reasonSlotFor("repair"), "rest");
  assert.equal(reasonSlotFor("restNoTimes"), "rest");
  assert.equal(reasonSlotFor("shortMealRest"), "rest");
  assert.equal(reasonSlotFor("nothingDocumentedRest"), "rest");
  assert.equal(reasonSlotFor("restIsMealLength"), "meal");
  assert.equal(reasonSlotFor("nothingDocumentedMeal"), "meal");
  // a late meal and a missing meal are different questions about the same day
  // and must not land on one row
  assert.equal(reasonSlotFor("mealLate"), "meal-late");
  assert.notEqual(
    breakFindingKey(reasonSlotFor("mealLate"), "08/07/26"),
    breakFindingKey(reasonSlotFor("nothingDocumentedMeal"), "08/07/26"),
  );
});

test("a reason on record is shown in the box, not hidden behind a refusal", () => {
  // 12 day/slot pairs across the two live batches have two different questions
  // claiming one row. The first version stopped the second question overwriting
  // by refusing to write at all - which also stopped the person who wrote the
  // sentence from correcting it, and gave them a read only panel instead.
  //
  // Seeding the box is the better guarantee: nothing can be replaced without
  // being on screen first, and an untouched answer sends the same words back.
  const write = ACTION.slice(ACTION.indexOf("const writeBreakAnswer"), ACTION.indexOf("const writeBreakAnswer") + 2400);
  assert.doesNotMatch(write, /if \(prior\.confirmedText\) return;/);
  assert.match(CARD, /reasons\[q\.id\] \?\? already \?\? ""/);
  assert.match(CARD, /const reasonText = reason \?\? saidAlready \?\? ""/);
});

test("and both cards say where those words came from", () => {
  // without it, an answer given on another question about the same day looks
  // like something we filled in for them
  const hits = [...CARD.matchAll(/This is what you told us for \{q\.date\} already/g)];
  assert.equal(hits.length, 2, `said on ${hits.length} of the two cards`);
});

test("neither card refuses to ask any more", () => {
  // the suppression is gone from both; one row per day per break is kept by the
  // box being seeded, not by the question being skipped
  assert.doesNotMatch(CARD, /we will not ask again/);
  assert.match(CARD, /const owesReason = \(q, v\) => reasonOwedOn\(q\.kind, v\);/);
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
  assert.match(ACTION, /reasonOwedOn\(q\.kind, pick\)\) await writeBreakAnswer/);
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
  assert.match(CARD, /still needs an answer/);
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


// AND IT DOES NOT READ AS A DEADLINE.
//
// "1 day still to answer" was read as one day REMAINING. Nothing here has a due
// date, and "day" was wrong for a second reason the line beside the button had
// already noted: one day can carry two answers, a meal and its rests.
test("the count is of answers, not of days or of time left", () => {
  const panel = CARD.slice(CARD.indexOf("still needs an answer"), CARD.indexOf("still needs an answer") + 400);
  assert.doesNotMatch(panel, /days? still/);
  assert.match(CARD, /One question here still needs an answer/);
});

test("it is said once, not three times on one row", () => {
  // the label, the line beside it and the panel under it all carried the same
  // count. The button names its action now and the count lives with the
  // sentence that says what it stops.
  const hits = [...CARD.matchAll(/still (?:to answer|needs an answer|need an answer)/g)];
  assert.ok(hits.length <= 2, `said ${hits.length} times`);
});


// THE LATE LUNCH COULD NOT BE ANSWERED AT ALL.
//
// The reason box lived only inside the batched card, which is the one card that
// asks "did you take your breaks". Every other kind is a plain card, and the
// late lunch is a plain card whose reason hangs off its YES - so the browser
// sent no reason, the action refused it, and confirming a late lunch failed for
// everybody. 12 of those on the live batch and 13 in July.
const QUESTIONS = read("src/lib/timesheet/questions.js");

test("the late lunch is a plain card, not part of the batch", () => {
  // this is WHY it was broken: only the batched kind carries `batch`, and only
  // the batched card had a box
  const emit = QUESTIONS.slice(QUESTIONS.indexOf('kind: "mealLate"'), QUESTIONS.indexOf('kind: "mealLate"') + 700);
  assert.doesNotMatch(emit, /batch:/);
  assert.match(QUESTIONS, /batch: "nothingDocumented"/);
});

test("a plain card collects a reason and sends it", () => {
  const one = CARD.slice(CARD.indexOf("function OneQuestion("), CARD.indexOf("export function BatchHeading"));
  // null, not "", so untouched is tellable from cleared on purpose - that is
  // what lets the box seed itself from what is already on record
  assert.match(one, /const \[reason, setReason\] = useState\(null\)/);
  assert.match(one, /reason: needsReason \? reasonText\.trim\(\) \|\| null : null/);
  // and it will not commit without one, the same way it will not commit a
  // missing time
  // the movable meal added a third thing that can hold the commit, so this
  // asserts the reason is still one of them rather than pinning the whole list
  assert.match(one, /if \(!proposed \|\| timeBlocked \|\| reasonBlocked/);
  // the sentence is not worded a second time here
  assert.match(one, /employeeQuestion\(/);
});


// AN ACTION THAT CHANGES THE SHEET HAS TO REFRESH THE PAGE IT IS ABOUT.
//
// Only the answer path revalidated the employee page. A reset and a reason both
// changed what that page shows and told two admin screens about it instead, so
// any tab other than the one that pressed the control kept serving the sheet
// from before - which reads as the write not having happened.
test("every action that moves the sheet revalidates the employee page", () => {
  for (const name of ["resetTimesheetAnswers", "answerBreakReason", "answerTimesheetQuestion"]) {
    const i = ACTION.indexOf(`export async function ${name}`);
    assert.ok(i > -1, `${name} is gone`);
    const end = ACTION.indexOf("export async function", i + 10);
    const body = ACTION.slice(i, end === -1 ? undefined : end);
    assert.match(body, /revalidatePath\(`\/t\//, `${name} does not refresh the page it changed`);
  }
});


