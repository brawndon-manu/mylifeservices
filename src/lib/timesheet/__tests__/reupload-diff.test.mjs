// WHAT A RE-UPLOAD WOULD CHANGE, before anything is changed.
//
// The feature this serves is the one Mánu described: people fix their records in
// QSP, the period is exported again, and the sheet reconciles itself rather than
// starting over. Nothing about that is safe to build until "what would this do"
// can be answered, and these tests pin the answering.
import { test } from "node:test";
import assert from "node:assert/strict";

import { diffDay, diffSheet, diffBatch, classifyAnswers } from "../reupload-diff.js";

const day = (date, extra = {}) => ({
  date,
  paidHours: 8,
  restRequired: 2,
  mealRequired: true,
  restTaken: 0,
  restViolation: true,
  mealViolation: true,
  ...extra,
});

// ------------------------------------------------------------------- one day

test("a day nobody changed reports nothing", () => {
  const d = diffDay(day("08/03/26"), day("08/03/26"));
  assert.deepEqual(d.changes, []);
  assert.equal(d.premiumBefore, 2);
  assert.equal(d.premiumAfter, 2);
});

test("paid hours moving is marked GRAVE, because a rule change cannot do it", () => {
  const d = diffDay(day("08/03/26"), day("08/03/26", { paidHours: 8.17 }));
  const p = d.changes.find((c) => c.field === "paidHours");
  assert.ok(p);
  assert.equal(p.grave, true, "the caller has to be able to find this one first");
  assert.equal(p.was, 8);
  assert.equal(p.now, 8.17);
});

test("a violation clearing is reported as charging, and counted in the premium", () => {
  const d = diffDay(day("08/03/26"), day("08/03/26", { restViolation: false, mealViolation: false }));
  assert.equal(d.premiumBefore, 2);
  assert.equal(d.premiumAfter, 0);
  for (const c of d.changes) assert.equal(c.charges, true);
});

test("a false-to-null change is not mistaken for a change", () => {
  // `mealRequired` is false on most days and undefined on days the engine never
  // reached. Reporting that as a movement would fill the diff with noise.
  const d = diffDay(day("08/03/26", { mealRequired: false }), day("08/03/26", { mealRequired: false }));
  assert.deepEqual(d.changes, []);
});

// ----------------------------------------------------------------- one person

test("only the days that moved are listed, and the premium totals both sides", () => {
  const stored = [day("08/03/26"), day("08/04/26"), day("08/05/26")];
  const fresh = [
    day("08/03/26"),
    day("08/04/26", { restViolation: false, mealViolation: false }),
    day("08/05/26"),
  ];
  const d = diffSheet({ storedDays: stored, freshDays: fresh });
  assert.equal(d.changedDays, 1);
  assert.equal(d.days[0].date, "08/04/26");
  assert.equal(d.premiumBefore, 6);
  assert.equal(d.premiumAfter, 4);
  assert.equal(d.premiumDelta, -2);
});

test("a day that vanished from the fresh export is never silent", () => {
  const d = diffSheet({ storedDays: [day("08/03/26"), day("08/04/26")], freshDays: [day("08/03/26")] });
  const gone = d.days.find((x) => x.gone);
  assert.ok(gone, "a paid day disappearing is either a QSP correction or the wrong file");
  assert.equal(gone.date, "08/04/26");
  assert.equal(d.premiumAfter, 2, "its premium comes off the after side");
});

test("a day the fresh export ADDS is reported too", () => {
  const d = diffSheet({ storedDays: [day("08/03/26")], freshDays: [day("08/03/26"), day("08/04/26")] });
  const added = d.days.find((x) => x.added);
  assert.ok(added);
  assert.equal(added.date, "08/04/26");
  assert.equal(d.premiumDelta, 2);
});

// ------------------------------------------------------------------- answers

test("an answer whose question still exists is carried", () => {
  const c = classifyAnswers(
    [{ id: "a", kind: "q_nothingDocumentedRest", date: "08/03/26", status: "accepted" }],
    [{ kind: "nothingDocumentedRest", date: "08/03/26" }],
  );
  assert.equal(c.stillAsked, 1);
  assert.equal(c.answers[0].outcome, "still-asked");
});

test("an answer whose question is gone is SETTLED, not deleted", () => {
  // they said they took the break, somebody logged it in QSP, the fresh export
  // shows it. The answer is why a figure moved between two versions of one
  // document, so it is kept and they are not asked again.
  const c = classifyAnswers(
    [{ id: "a", kind: "q_nothingDocumentedRest", date: "08/03/26", status: "accepted" }],
    [{ kind: "nothingDocumentedMeal", date: "08/03/26" }],
  );
  assert.equal(c.settled, 1);
  assert.equal(c.answers[0].outcome, "settled");
});

test("two questions sharing the stored key are refused, not guessed at", () => {
  // a stored answer keeps kind and date but NOT `at`, which questionId carries.
  // No live batch has a collision today, and that is measured rather than
  // assumed - so this is the behaviour for the day one appears.
  const c = classifyAnswers(
    [{ id: "a", kind: "q_restOutsideScheduled", date: "08/03/26", status: "accepted" }],
    [
      { kind: "restOutsideScheduled", date: "08/03/26", at: "12:00 PM" },
      { kind: "restOutsideScheduled", date: "08/03/26", at: "4:00 PM" },
    ],
  );
  assert.equal(c.ambiguous, 1);
  assert.equal(c.answers[0].outcome, "ambiguous");
});

test("the q_ prefix is stripped so answers and questions can be compared at all", () => {
  const c = classifyAnswers(
    [{ id: "a", kind: "q_repair", date: "08/03/26", status: "accepted" }],
    [{ kind: "repair", date: "08/03/26" }],
  );
  assert.equal(c.answers[0].kind, "repair");
  assert.equal(c.stillAsked, 1);
});

// --------------------------------------------------------------- whole batch

test("the batch report puts the grave changes first", () => {
  const quiet = {
    who: "Quiet, Person",
    storedDays: [day("08/03/26")],
    freshDays: [day("08/03/26", { restViolation: false })],
    answers: [],
    freshQuestions: [],
  };
  const bad = {
    who: "Paid, Differently",
    storedDays: [day("08/03/26")],
    freshDays: [day("08/03/26", { paidHours: 9 })],
    answers: [],
    freshQuestions: [],
  };
  const out = diffBatch([quiet, bad]);
  assert.equal(out.rows[0].who, "Paid, Differently", "a moved paid hour outranks a moved premium");
  assert.equal(out.graveChanges, 1);
  assert.equal(out.people, 2);
});

test("somebody with no changes and no answers is left out of the report", () => {
  const out = diffBatch([
    { who: "Clean, Person", storedDays: [day("08/03/26")], freshDays: [day("08/03/26")], answers: [], freshQuestions: [] },
  ]);
  assert.equal(out.people, 0, "a report of 60 people where 3 moved is not a report");
  assert.equal(out.premiumDelta, 0);
});

test("nothing in, nothing out, no throw", () => {
  assert.equal(diffBatch().people, 0);
  assert.deepEqual(diffSheet().days, []);
  assert.equal(classifyAnswers().settled, 0);
});

// ------------------------------- deleting the shift is not fixing the problem

// The case a real re-upload is most likely to produce: it is far easier to
// delete an awkward shift in QSP than to correct it, and both make the question
// disappear.

test("a vanished day is GRAVE, not just listed", () => {
  const d = diffSheet({ storedDays: [day("08/03/26"), day("08/04/26")], freshDays: [day("08/03/26")] });
  // it was always in `days`. the count is what a summary reads, and it stayed
  // at 0 while somebody lost a full day's pay.
  assert.equal(d.graveChanges, 1);
  assert.equal(d.days.find((x) => x.gone).grave, true);
});

test("a clean fix stays SETTLED - the question went and the hours did not move", () => {
  const c = classifyAnswers(
    [{ id: "a1", kind: "q_mealNotRecorded", date: "08/03/26", status: "accepted" }],
    [],
    { "08/03/26": { gone: false, grave: false } },
  );
  assert.equal(c.answers[0].outcome, "settled");
  assert.equal(c.settled, 1);
  assert.equal(c.settledByRemoval, 0);
});

test("the same question going because the DAY went is not the same answer", () => {
  const c = classifyAnswers(
    [{ id: "a1", kind: "q_mealNotRecorded", date: "08/03/26", status: "accepted" }],
    [],
    { "08/03/26": { gone: true, grave: true } },
  );
  assert.equal(c.answers[0].outcome, "settled-by-removal");
  assert.equal(c.answers[0].dayGone, true);
  assert.equal(c.settledByRemoval, 1);
  assert.equal(c.settled, 0, "it must not be counted as settled as well as removed");
});

test("hours dropping off a day that still exists counts too", () => {
  const c = classifyAnswers(
    [{ id: "a1", kind: "q_mealNotRecorded", date: "08/03/26", status: "accepted" }],
    [],
    { "08/03/26": { gone: false, grave: true } },
  );
  assert.equal(c.answers[0].outcome, "settled-by-removal");
  assert.equal(c.answers[0].dayGone, false);
  assert.equal(c.answers[0].dayGrave, true);
});

test("a question still being asked is never upgraded, whatever the day did", () => {
  const c = classifyAnswers(
    [{ id: "a1", kind: "q_mealNotRecorded", date: "08/03/26", status: "accepted" }],
    [{ kind: "mealNotRecorded", date: "08/03/26" }],
    { "08/03/26": { gone: true, grave: true } },
  );
  assert.equal(c.answers[0].outcome, "still-asked", "nothing has been settled by anything");
  assert.equal(c.settledByRemoval, 0);
});

test("given no day information it behaves exactly as it did before", () => {
  const answers = [{ id: "a1", kind: "q_mealNotRecorded", date: "08/03/26", status: "accepted" }];
  const c = classifyAnswers(answers, []);
  assert.equal(c.answers[0].outcome, "settled");
  assert.equal(c.settledByRemoval, 0);
});

test("the batch report joins the two halves, which nothing did before", () => {
  const out = diffBatch([
    {
      // fixed it properly: the meal is punched, the hours are untouched
      who: "Fixed, Properly",
      storedDays: [day("08/03/26")],
      freshDays: [day("08/03/26", { mealViolation: false })],
      answers: [{ id: "a1", kind: "q_mealNotRecorded", date: "08/03/26", status: "accepted" }],
      freshQuestions: [],
    },
    {
      // deleted the shift: same question gone, four and a half hours with it
      who: "Deleted, Theirs",
      storedDays: [day("08/03/26")],
      freshDays: [day("08/03/26", { mealViolation: false, paidHours: 3.5 })],
      answers: [{ id: "a2", kind: "q_mealNotRecorded", date: "08/03/26", status: "accepted" }],
      freshQuestions: [],
    },
  ]);
  assert.equal(out.settledByRemoval, 1, "one of these two is not like the other");
  assert.equal(out.graveChanges, 1);
  const fixed = out.rows.find((r) => r.who === "Fixed, Properly");
  const deleted = out.rows.find((r) => r.who === "Deleted, Theirs");
  assert.equal(fixed.answers.answers[0].outcome, "settled");
  assert.equal(deleted.answers.answers[0].outcome, "settled-by-removal");
  // and the premium moved identically on both, which is why the premium column
  // alone could never have told them apart
  assert.equal(fixed.premiumDelta, deleted.premiumDelta);
});
