// AN ANSWER HAS TO SAY WHAT IT IS AGREEING TO.
//
// The off-clock rest card offers a No and a Yes, and the question they answer
// lives in the card TITLE - which the day-by-day view does not render, because
// that view names the fault and stops. So the first option pointed at a time
// with a word for it and the time was not in the sentence.
//
// The time is on the card either way, as the logged fact. This puts it in the
// answer, so the option reads on its own.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const CARD = fs.readFileSync("src/app/t/[token]/TimesheetQuestion.js", "utf8");
const BLOCK = CARD.slice(
  CARD.indexOf('case "restOutsideScheduled"'),
  CARD.indexOf('case "miscTime"'),
);

test("the answer names the time the record holds", () => {
  assert.match(BLOCK, /No - I did take it at \$\{loggedAt\}/);
  // and the confirm panel says the same time back, so the last thing read
  // before committing is not vaguer than the button that got them there
  assert.match(BLOCK, /took your break at <b>\{loggedAt\}<\/b>/);
});

test("it comes off the logged row, not off our own proposal", () => {
  // `wasFrom` is what the record holds. `q.proposed` is where we think it
  // should have been, and agreeing to OUR guess is a different answer.
  assert.match(BLOCK, /const loggedAt = \(q\.row\.detail \|\| \[\]\)\.length === 1/);
  assert.match(BLOCK, /q\.row\.detail\[0\]\?\.wasFrom/);
  assert.doesNotMatch(BLOCK.slice(0, BLOCK.indexOf("shapeShort")), /proposed/);
});

test("a card covering two logged breaks keeps the old wording", () => {
  // naming one time on a card about two would be wrong in a way nobody could
  // see. None exist on either live batch; the guard is for the ones that could.
  assert.match(BLOCK, /: "No - I did take it then"/);
  assert.match(BLOCK, /loggedAt \? `No - I did take it at/);
});

test("the other two options already stand on their own", () => {
  // they name what happened rather than yes or no, which is what the first one
  // now does too
  assert.match(BLOCK, /label: "Yes, the time was entered wrong"/);
  assert.match(BLOCK, /label: "I did not take it at all"/);
});


// AND IT IS SAID OUT LOUD IN THE SENTENCE.
//
// The compact clock the reports use is right on a calendar block and in the
// column of facts, where it is a readout. Inside an answer somebody is about to
// commit to, it asks them to decode a record format.
import { spokenTime } from "../../loose-time.js";

test("the time in the answer is spelled, not the report shorthand", () => {
  assert.match(BLOCK, /spokenTime\(q\.row\.detail\[0\]\?\.wasFrom\)/);
});

test("every shape the rest rows actually hold", () => {
  // taken off the two live batches: on the hour, with minutes, morning and
  // afternoon, and a stray non-round one
  assert.equal(spokenTime("12p"), "12pm");
  assert.equal(spokenTime("7a"), "7am");
  assert.equal(spokenTime("1:30p"), "1:30pm");
  assert.equal(spokenTime("11:10a"), "11:10am");
  assert.equal(spokenTime("3:08p"), "3:08pm");
  assert.equal(spokenTime("12:05p"), "12:05pm");
});

test("it does not double up on one that is already spelled", () => {
  for (const s of ["12pm", "12 PM", "7a.m.", "1:30AM"]) {
    assert.equal(spokenTime(s), s, s);
  }
});

test("and it leaves alone anything it cannot read", () => {
  // a missing row must not become the string "undefinedm" in a button
  assert.equal(spokenTime(null), "");
  assert.equal(spokenTime(undefined), "");
  assert.equal(spokenTime(""), "");
  assert.equal(spokenTime("noon"), "noon");
  assert.equal(spokenTime("12:00"), "12:00");
});


// AND THE HALF WE CANNOT DO FOR THEM.
//
// Saying the break really happened at a time nothing was booked for leaves the
// record still not showing it. Two entries are missing and both are theirs: the
// schedule has to carry the minutes as Misc, and a rest period has to be filed
// against them. Without both, the answer changes what we know and nothing else.
test("confirming the time asks for both QuickSolve entries", () => {
  assert.match(BLOCK, /afterYes:/);
  assert.match(BLOCK, /as <b>Misc<\/b> time/);
  assert.match(BLOCK, /add a <b>rest period<\/b> at that same time/);
});

test("it names the day and both ends of the break", () => {
  // "add it as Misc time" without the minutes is a job somebody has to go and
  // work out again from the card above
  assert.match(BLOCK, /const loggedTo = /);
  assert.match(BLOCK, /\{loggedAt\} to \{loggedTo\}/);
  assert.match(BLOCK, /on <b>\{q\.date\}<\/b>/);
});

test("it only appears once the answer is actually saved", () => {
  // the confirm panel says what the answer DOES; this is a job to go and do, and
  // it has to still be there when they come back to the day
  const answered = CARD.slice(CARD.indexOf("{answered && !editing ? ("), CARD.indexOf("{answered && !editing ? (") + 1400);
  assert.match(answered, /answer === "accepted" && c\.afterYes/);
});

test("and only on the answer that owes it", () => {
  // the two declines move the break or drop it, so neither leaves anything to
  // add at source
  assert.match(BLOCK, /afterYes: loggedAt && loggedTo/);
  const other = CARD.slice(CARD.indexOf('case "miscTime"'));
  assert.doesNotMatch(other.slice(0, other.indexOf("case \"nothingDocumented\"")), /afterYes/);
});


// WHAT "I WAS WORKING" ACTUALLY COVERS.
//
// The other two Misc answers name themselves - paid time off, sick pay. The
// third does not, and somebody who sat through a cancelled visit cannot tell
// whether that is this button or something we have no button for. Getting it
// wrong matters: only this answer puts the hours back into the count that
// decides whether a break was owed.
const MISC = CARD.slice(CARD.indexOf('case "miscTime"'), CARD.indexOf('case "nothingDocumented"'));

test("the working answer says what counts as working", () => {
  assert.match(MISC, /note: "Any Misc service you worked, and time held for a client who cancelled\."/);
});

test("and the note survives the day-by-day view, unlike `why`", () => {
  // `why` is deliberately dropped when terse - the calendar does that explaining.
  // A note is the other thing: what the option MEANS, which no picture can say.
  //
  // AND IT SURVIVES RE-EDITING, which is the case that lost it. These were drawn
  // only while a question was unanswered, which nobody could see while an
  // answered card did not render at all. Once an answered card came back so it
  // could be changed, the options returned stripped of their explanations - and
  // the one option that cannot explain itself from its label is this one.
  assert.match(CARD, /why=\{\(!answered \|\| editing\) && !terse \? c\.third\.why : null\}/);
  assert.match(CARD, /note=\{!answered \|\| editing \? c\.third\.note : null\}/);
  assert.match(CARD, /\{note && <span/);
});

test("all three options can carry one, so this is not a one-off", () => {
  // plain includes, not a built regex: the braces and the ? in this string are
  // both regex syntax and escaping them through a template literal is how the
  // first version of this test came to assert something else entirely
  for (const k of ["yes", "no", "third"]) {
    assert.ok(CARD.includes(`note={!answered || editing ? c.${k}.note : null}`), `${k} cannot carry a note`);
  }
});
