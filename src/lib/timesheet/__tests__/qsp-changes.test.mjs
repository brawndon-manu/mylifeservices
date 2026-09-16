import test from "node:test";
import assert from "node:assert/strict";
import { qspChanges, reviewChoices } from "../qsp-changes.js";
import { signedCopySubject, reviewCorrectionsSubject } from "../../timesheet-subjects.js";

// THE QUICKSOLVE CHANGES LIST, derived from the correction rows and nothing
// else. A line is an EDIT to the record; an answer that agrees with the
// record gets none. This is what the signed-copy email states and the office
// corrections email instructs, so the rules are pinned here before any inbox
// sees them. Each edit is a FACT (both emails) and an ACTION (office only).

const stated = (over = {}) => ({
  from: "12p", to: "12:10p", kindOf: "rest", minutes: 10,
  slot: "rest1", source: "typed", date: null, replaces: null, ...over,
});

test("a break they logged nowhere becomes a 'log it' line", () => {
  const out = qspChanges([
    { kind: "q_nothingDocumentedRest", date: "07/28/26", status: "accepted", statedBreaks: [stated()] },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].date, "07/28/26");
  assert.match(out[0].text, /The rest break taken from 12p to 12:10p has nothing recorded/);
  assert.match(out[0].text, /Log it\./);
});

test("a stated time that supersedes a recorded row becomes a 'change it' line", () => {
  const out = qspChanges([
    {
      kind: "q_restOutsideScheduled", date: "07/29/26", status: "declined",
      statedBreaks: [stated({ from: "10a", to: "10:10a", replaces: { from: "7:50a", to: "8a" } })],
    },
  ]);
  assert.equal(out.length, 1);
  assert.match(out[0].text, /recorded 7:50a to 8a actually happened 10a to 10:10a/);
  assert.match(out[0].text, /Change the entry/);
});

test("a stated lunch says lunch, not rest break", () => {
  const out = qspChanges([
    { kind: "q_nothingDocumentedMeal", date: "07/30/26", status: "accepted",
      statedBreaks: [stated({ kindOf: "meal", from: "12p", to: "12:30p", minutes: 30 })] },
  ]);
  assert.match(out[0].text, /The lunch taken from 12p to 12:30p/);
});

test("declining the late lunch is a punch fix; confirming it is nothing", () => {
  const declined = qspChanges([
    { kind: "q_mealLate", date: "07/28/26", status: "declined", choice: "no", statedBreaks: null },
  ]);
  assert.equal(declined.length, 1);
  assert.match(declined[0].text, /punched starting later than it did/);

  const confirmed = qspChanges([
    { kind: "q_mealLate", date: "07/28/26", status: "accepted", choice: "yes", statedBreaks: null },
  ]);
  assert.equal(confirmed.length, 0, "a late lunch that really was late needs no record fix");
});

test("the acknowledged backwards entry names its time", () => {
  const out = qspChanges([
    { kind: "fix_reversed_735", date: "07/28/26", status: "accepted", statedBreaks: null },
  ]);
  assert.equal(out.length, 1);
  assert.match(out[0].text, /around 12:15p/);
  assert.match(out[0].text, /recorded backwards/);
});

test("accepted reports map to their edits, and agreeing answers to none", () => {
  const rows = [
    { kind: "meal_taken", date: "07/20/26", status: "accepted" },
    { kind: "rest_taken", date: "07/21/26", status: "accepted" },
    { kind: "day_missing", date: "07/22/26", status: "accepted" },
    { kind: "day_extra", date: "07/23/26", status: "accepted" },
    // agreeing with the record: nothing to edit
    { kind: "rest_missed", date: "07/24/26", status: "accepted" },
    // declined reports change nothing either
    { kind: "day_missing", date: "07/25/26", status: "declined" },
  ];
  const out = qspChanges(rows);
  assert.deepEqual(out.map((c) => c.date), ["07/20/26", "07/21/26", "07/22/26", "07/23/26"]);
  assert.match(out[0].text, /never punched/);
  assert.match(out[2].text, /missing its punches/);
  assert.match(out[3].text, /should not be there/);
});

test("open rows say nothing yet", () => {
  const out = qspChanges([
    { kind: "day_missing", date: "07/22/26", status: "open" },
  ]);
  assert.equal(out.length, 0);
});

test("a break's own date outranks the row's, and duplicates collapse", () => {
  const row = {
    kind: "q_nothingDocumentedRest", date: "07/28/26", status: "accepted",
    statedBreaks: [stated({ date: "07/29/26" })],
  };
  const out = qspChanges([row, { ...row }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].date, "07/29/26");
});

test("the list comes back in date order", () => {
  const out = qspChanges([
    { kind: "day_missing", date: "07/30/26", status: "accepted" },
    { kind: "day_missing", date: "07/18/26", status: "accepted" },
  ]);
  assert.deepEqual(out.map((c) => c.date), ["07/18/26", "07/30/26"]);
});

// ---------------------------------------------------------------------------
// the review record: each edit under the choice that produced it

test("every change carries the choice behind it", () => {
  const out = reviewChoices([
    { kind: "q_nothingDocumentedRest", date: "07/28/26", status: "accepted", choice: "yes",
      statedBreaks: [stated()] },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].date, "07/28/26");
  assert.match(out[0].said, /You said you took your rest periods/);
  assert.match(out[0].said, /12p to 12:10p/);
  assert.equal(out[0].changes.length, 1);
  // the fact reaches both emails; the action reaches only the office's
  assert.match(out[0].changes[0].fact, /The rest break taken from 12p to 12:10p/);
  assert.equal(out[0].changes[0].action, "Log it.");
});

test("a choice that changes nothing is still in the record", () => {
  const rows = [
    { kind: "q_nothingDocumentedRest", date: "07/29/26", status: "declined", choice: "no",
      statedBreaks: null },
  ];
  assert.equal(qspChanges(rows).length, 0, "declining agrees with the record");
  const out = reviewChoices(rows);
  assert.equal(out.length, 1);
  assert.match(out[0].said, /You said you did not get your rest periods/);
  assert.deepEqual(out[0].changes, []);
});

test("a change with no receipt sentence stands alone", () => {
  const out = reviewChoices([
    { kind: "fix_reversed_735", date: "07/30/26", status: "accepted", statedBreaks: null },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].said, null);
  assert.match(out[0].changes[0].fact, /recorded backwards/);
  assert.match(out[0].changes[0].action, /Swap them/);
});

test("the record sorts by date and never repeats an edit", () => {
  const row = {
    kind: "q_nothingDocumentedRest", date: "07/28/26", status: "accepted", choice: "yes",
    statedBreaks: [stated()],
  };
  const out = reviewChoices([
    { kind: "fix_reversed_735", date: "07/30/26", status: "accepted", statedBreaks: null },
    row,
    { ...row },
  ]);
  assert.deepEqual(out.map((x) => x.date), ["07/28/26", "07/28/26", "07/30/26"]);
  // the duplicate row keeps its receipt but grew no second copy of the edit
  assert.equal(out[0].changes.length + out[1].changes.length, 1);
});

test("the subject is uniform, and a redirected copy says so", () => {
  assert.equal(
    signedCopySubject({ periodLabel: "07/16/26 to 07/31/26" }),
    "Your signed timesheet for 07/16/26 to 07/31/26",
  );
  assert.equal(
    signedCopySubject({ periodLabel: "07/16/26 to 07/31/26", redirectedFrom: "a@b.c" }),
    "[TEST -> a@b.c] Your signed timesheet for 07/16/26 to 07/31/26",
  );
});

test("the office corrections subject names the person and the period", () => {
  assert.equal(
    reviewCorrectionsSubject({ employeeName: "Mira, Gabriela", periodLabel: "07/16/26 to 07/31/26" }),
    "Timesheet corrections from Mira, Gabriela - 07/16/26 to 07/31/26",
  );
  assert.equal(
    reviewCorrectionsSubject({
      employeeName: "Mira, Gabriela",
      periodLabel: "07/16/26 to 07/31/26",
      redirectedFrom: "a@b.c",
    }),
    "[TEST -> a@b.c] Timesheet corrections from Mira, Gabriela - 07/16/26 to 07/31/26",
  );
});

test("a statement-only ten grows no edit line at all", () => {
  // the day program's second ten: QuickSolve holds one rest per shift and a
  // DP day is one shift, so there is no entry anyone could make. Mánu
  // 2026-09-02: "them telling us then thats enough, we add it to the
  // comments below the timesheet and call it a day." The sheet's Comments
  // carry the statement (see render-sheet.js); this list stays silent.
  const row = {
    kind: "q_nothingDocumentedRest", date: "08/27/26", status: "accepted", choice: "yes",
    statedBreaks: [
      { kindOf: "rest", minutes: 10, from: "3p", to: "3:10p", statementOnly: true },
      { kindOf: "rest", minutes: 10, from: "10a", to: "10:10a" },
    ],
  };
  const out = qspChanges([row]);
  assert.equal(out.length, 1);
  // the first ten still has a QSP home, so its line still says to log it
  assert.equal(
    out[0].text,
    "The rest break taken from 10a to 10:10a has nothing recorded for it. Log it.",
  );
});

// A BREAK WE HEARD WAS TAKEN, AND THEY SAY IT WAS NOT (Mánu 2026-09-15). The
// office recorded "took it" off a call; the employee answered Missed it on
// their link. The correction already charges the hour, but a "no" is no edit
// on its own, and the office's row still read "needs punching" - so the desk
// said nothing and the punch that would erase the premium on the next export
// had nothing telling the office not to make it. The office list carries it
// now; the employee's own list stays silent, because from their side a missed
// break needs no edit.
const tookIt = (slot, date) => [{ findingKey: `break-${slot}-${date}`, answer: "took-it", reason: "test" }];

test("their missed over our took-it is a change on the office list, in the approved words", () => {
  const rows = [{ id: "c1", kind: "q_nothingDocumentedRest", date: "07/24/26", status: "declined", choice: "no" }];
  const [it] = reviewChoices(rows, tookIt("rest", "07/24/26"));
  assert.equal(it.correctionId, "c1");
  assert.equal(it.changes.length, 1);
  assert.equal(it.changes[0].fact, "The rest break we recorded as taken was not taken.");
  assert.equal(it.changes[0].action, "Do not punch it in. If it was punched in off the call, take it out.");
});

test("a lunch says lunch", () => {
  const rows = [{ id: "c2", kind: "q_nothingDocumentedMeal", date: "07/17/26", status: "declined", choice: "no" }];
  const [it] = reviewChoices(rows, tookIt("meal", "07/17/26"));
  assert.equal(it.changes[0].fact, "The lunch we recorded as taken was not taken.");
});

test("without a took-it on record, or with a yes, a no is still no edit", () => {
  const no = [{ id: "c3", kind: "q_nothingDocumentedRest", date: "07/24/26", status: "declined", choice: "no" }];
  assert.equal(reviewChoices(no, []).flatMap((it) => it.changes).length, 0);
  assert.equal(reviewChoices(no, tookIt("rest", "07/25/26")).flatMap((it) => it.changes).length, 0, "a different day's row does not count");
  const yes = [{ id: "c4", kind: "q_nothingDocumentedRest", date: "07/24/26", status: "accepted", choice: "yes" }];
  assert.equal(reviewChoices(yes, tookIt("rest", "07/24/26")).flatMap((it) => it.changes).length, 0);
});

test("the employee's own list never carries it", () => {
  const rows = [{ id: "c5", kind: "q_nothingDocumentedRest", date: "07/24/26", status: "declined", choice: "no" }];
  assert.equal(qspChanges(rows).length, 0);
});
