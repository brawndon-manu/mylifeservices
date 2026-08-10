// The five questions an employee must answer before signing, and what each
// answer does to the figures. Mánu 2026-08-09.
//
// The point of this file is the SHAPE of each question, and above all which way
// the money moves. Two of the five arrive with the correction already applied,
// so for those it is DECLINING that changes a number, and getting that backwards
// would quietly hand somebody less than they are owed.
import test from "node:test";
import assert from "node:assert/strict";
import { buildQuestions, patchesFor, answerProgress } from "../questions.js";

const day = (over = {}) => ({
  date: "07/20/26", paidHours: 8.17, restTaken: 2, restRequired: 2,
  restViolation: false, mealViolation: false, punches: ["8a", "5p"], ...over,
});

// ---------------------------------------------------------------- April's shape

test("rests recorded outside the rostered day become ONE question, not eleven", () => {
  const days = ["07/16/26", "07/17/26", "07/20/26"].map((date) =>
    day({ date, restsMisclicked: 1, restsMisclickedMin: 10 }));
  const qs = buildQuestions({ days }, { restRows: [], sourceName: "Martinez, April" });

  const outside = qs.filter((q) => q.kind === "restOutsideShift");
  assert.equal(outside.length, 1, "one card, or eleven identical ones on the real batch");
  assert.deepEqual(outside[0].dates, ["07/16/26", "07/17/26", "07/20/26"]);
  assert.equal(outside[0].row.minutes, 30);
  assert.equal(outside[0].moves, 0, "confirming our correction changes nothing");
  assert.equal(outside[0].movesOnDecline, 0.5, "declining puts the minutes back");
});

test("confirming leaves April alone; declining pays the minutes back", () => {
  const d = day({ restsMisclicked: 1, restsMisclickedMin: 10 });
  const q = { kind: "restOutsideShift" };

  assert.deepEqual(patchesFor(q, "yes", d), { paidHours: null }, "nothing to patch");
  // 8.17 was the figure BEFORE the engine withheld the minutes; the stored day
  // now reads 8.00, so declining has to land back on 8.17 rather than on 8.00.
  const back = patchesFor(q, "no", day({ paidHours: 8, restsMisclickedMin: 10 }));
  assert.equal(back.paidHours, 8.17, "and the overtime that comes with it");
});

// -------------------------------------------------------------- Bucio / Devine

test("a credited short meal block is one question, and declining restores the premium", () => {
  const days = [
    day({ date: "07/29/26", restsFromShortMeals: 2, restTaken: 2, restRequired: 2, restViolation: false }),
  ];
  const qs = buildQuestions({ days }, { restRows: [], sourceName: "Devine, Jennifer" });
  const short = qs.find((q) => q.kind === "shortMealRest");
  assert.ok(short, "asked");
  assert.equal(short.movesOnDecline, 1, "Devine 07/29 is the one hour this ruling costs");

  const declined = patchesFor({ kind: "shortMealRest" }, "no", days[0]);
  assert.equal(declined.restTaken, 0, "both credits come off");
  assert.equal(declined.restViolation, true, "so the premium goes back on");

  // THE OPPOSITE: Bucio, where the credit never cleared anything, so declining
  // moves no money. Without this the assertion above is just measuring that a
  // patch exists.
  const bucio = day({ restsFromShortMeals: 1, restTaken: 1, restRequired: 2, restViolation: true });
  const bq = buildQuestions({ days: [bucio] }, { restRows: [], sourceName: "Bucio, Mary" });
  assert.equal(bq.find((q) => q.kind === "shortMealRest").movesOnDecline, 0, "no premium to restore");
});

// ------------------------------------------------------------------- Hernadez

test("two thirty minute entries are two questions, so each hour is answered on its own", () => {
  const restRows = ["07/25/26", "07/26/26"].map((date) => ({
    name: "Hernadez, Joseph", date, out: "2:00 PM", in: "2:30 PM",
    minutes: 30, counted: false,
  }));
  const days = ["07/25/26", "07/26/26"].map((date) => day({ date, mealViolation: true }));
  const qs = buildQuestions({ days }, { restRows, sourceName: "Hernadez, Joseph" });

  const meals = qs.filter((q) => q.kind === "restIsMealLength");
  assert.equal(meals.length, 2, "grouped into one card by the component, answered per day");
  assert.equal(meals[0].group, "restIsMealLength");
  assert.equal(meals[0].moves, -1);
  assert.notEqual(meals[0].id, meals[1].id, "or one answer would resolve both days");

  assert.deepEqual(patchesFor(meals[0], "yes", days[0]), { mealViolation: false });
  assert.deepEqual(patchesFor(meals[0], "no", days[0]), { mealViolation: null });
});

// --------------------------------------------------------------------- Flores

test("a rest with no times is asked only while the day still owes a premium", () => {
  const restRows = [{ name: "Flores, Esmeralda", date: "07/29/26", out: "", in: "", minutes: 0 }];
  const owing = day({ date: "07/29/26", restTaken: 0, restRequired: 1, restViolation: true, paidHours: 5.02 });
  const qs = buildQuestions({ days: [owing] }, { restRows, sourceName: "Flores, Esmeralda" });
  const noTimes = qs.find((q) => q.kind === "restNoTimes");
  assert.ok(noTimes, "asked");
  assert.equal(noTimes.canGiveTime, true, "she can tell us when instead");
  assert.deepEqual(patchesFor(noTimes, "yes", owing), { restViolation: false });

  // once the premium is gone there is nothing to ask about, or the question
  // would keep appearing after it had been answered
  const settled = day({ date: "07/29/26", restTaken: 1, restRequired: 1, restViolation: false });
  const after = buildQuestions({ days: [settled] }, { restRows, sourceName: "Flores, Esmeralda" });
  assert.equal(after.find((q) => q.kind === "restNoTimes"), undefined);
});

// ---------------------------------------------------------------- other people

test("a question only ever belongs to the person whose sheet it is", () => {
  const restRows = [{ name: "Hernadez, Joseph", date: "07/25/26", out: "2:00 PM", in: "2:30 PM", minutes: 30, counted: false }];
  const qs = buildQuestions(
    { days: [day({ date: "07/25/26" })] },
    { restRows, sourceName: "Bucio, Mary" },
  );
  assert.equal(qs.length, 0, "Bucio is never asked about Hernadez's break");
});

test("ids are stable across a rebuild, so an answer still matches its question", () => {
  const days = [day({ restsMisclicked: 1, restsMisclickedMin: 10 })];
  const a = buildQuestions({ days }, { restRows: [], sourceName: "X" });
  const b = buildQuestions({ days: [{ ...days[0], paidHours: 8 }] }, { restRows: [], sourceName: "X" });
  assert.equal(a[0].id, b[0].id, "the sheet is rebuilt on every answer");
});

// ---------------------------------------------------------------------------
// ONE QUESTION PER DAY. Mánu 2026-08-09 late, on his own twelve day card: "what
// if only some of them are no? with the way we have it right now, all of them
// are no or all of them are yes."

const ndDay = (date, over = {}) => ({
  date, paidHours: 8, mealViolation: false, mealLate: false, restViolation: false,
  restTaken: 0, restRequired: 2, punches: [], breaks: [], ...over,
});

test("the breaks question is one per day, and each day carries its own hours", () => {
  const qs = buildQuestions({
    days: [
      ndDay("07/20/26", { mealViolation: true, restViolation: true }),
      ndDay("07/21/26", { restViolation: true }),
      ndDay("07/22/26"),
    ],
  }, { restRows: [], sourceName: "Testperson" });
  const nd = qs.filter((q) => q.kind === "nothingDocumented");

  assert.equal(nd.length, 2, "one per day that is short something, and no more");
  assert.deepEqual(nd.map((q) => q.date), ["07/20/26", "07/21/26"]);
  // a day short both a lunch and its rests is two hours; a day short only its
  // rests is one. Under the old single question both were folded into one total.
  assert.equal(nd[0].movesOnDecline, 2);
  assert.equal(nd[1].movesOnDecline, 1);
  assert.deepEqual(
    nd.map((q) => [q.row.meal, q.row.rest]),
    [[true, true], [false, true]],
  );
  // distinct ids, or two days would share an answer and the split is pointless
  assert.equal(new Set(nd.map((q) => q.id)).size, 2);
  // and they are marked as one card, committed together
  assert.ok(nd.every((q) => q.batch === "nothingDocumented"));
});

test("saying no on one day leaves the others alone", () => {
  const days = [
    ndDay("07/20/26", { mealViolation: true, restViolation: true }),
    ndDay("07/21/26", { restViolation: true }),
  ];
  const nd = buildQuestions({ days }, { restRows: [], sourceName: "T" })
    .filter((q) => q.kind === "nothingDocumented");

  // the 20th: they took them, so the engine's reading stands and stays cleared
  assert.deepEqual(patchesFor(nd[0], "yes", days[0]), {
    mealViolation: false, restViolation: false,
  });
  // the 21st: they missed them, so the override is cleared and the day's own
  // flags - which already say a rest is owed - come back through
  assert.deepEqual(patchesFor(nd[1], "no", days[1]), {
    mealViolation: null, restViolation: null,
  });
});

test("progress is counted per question, not per kind", () => {
  // THE BUG THIS FIXES: every screen used to count distinct kinds against the
  // number of questions. That agrees only while a kind is a single question, and
  // it was already wrong for a two-day restIsMealLength card.
  const days = [
    ndDay("07/20/26", { mealViolation: true }),
    ndDay("07/21/26", { mealViolation: true }),
  ];
  const qs = buildQuestions({ days }, { restRows: [], sourceName: "T" });
  assert.equal(qs.length, 2);

  const one = [{ kind: "q_nothingDocumented", date: "07/20/26", status: "accepted" }];
  const p1 = answerProgress(qs, one);
  assert.equal(p1.answered, 1, "one of the two, not one KIND of one kind");
  assert.equal(p1.settled, false, "so they still cannot sign");

  const both = [...one, { kind: "q_nothingDocumented", date: "07/21/26", status: "declined" }];
  const p2 = answerProgress(qs, both);
  assert.equal(p2.answered, 2);
  assert.equal(p2.declined, 1);
  assert.equal(p2.settled, true);

  // an OPEN correction is a reported problem, not an answer
  assert.equal(answerProgress(qs, [
    { kind: "q_nothingDocumented", date: "07/20/26", status: "open" },
  ]).answered, 0);
});

test("a grouped question is still settled by any one of its dates", () => {
  // April's eleven 7:00-7:10 entries are one habit and one answer. Counting
  // those per date would leave her permanently ten answers short.
  const days = [
    ndDay("07/20/26", { restsMisclicked: 1, restsMisclickedMin: 10 }),
    ndDay("07/21/26", { restsMisclicked: 1, restsMisclickedMin: 10 }),
  ];
  const qs = buildQuestions({ days }, { restRows: [], sourceName: "T" })
    .filter((q) => q.kind === "restOutsideShift");
  assert.equal(qs.length, 1, "one question over both days");
  assert.equal(
    answerProgress(qs, [
      { kind: "q_restOutsideShift", date: "07/20/26", status: "accepted" },
    ]).settled,
    true,
  );

  // AND THE COUNT DOES NOT DOUBLE. One answer to a grouped question writes a
  // correction row PER DATE, so counting rows rather than questions reports two
  // answers to a card that has one - and the batch list would read "2 of 1".
  // This is the assertion that discriminates; the settled check above passes
  // either way.
  const p = answerProgress(qs, [
    { kind: "q_restOutsideShift", date: "07/20/26", status: "accepted" },
    { kind: "q_restOutsideShift", date: "07/21/26", status: "accepted" },
  ]);
  assert.equal(p.asked, 1);
  assert.equal(p.answered, 1, "two rows, one question, one answer");
  assert.equal(p.declined, 0);
});


test("saying yes never clears a premium the schedule documented", () => {
  // THE ONE THAT MOVES MONEY THE WRONG WAY. A day can owe a rest under the
  // breaks question AND carry a meal premium the schedule witnessed - a lunch
  // rostered and punched that began after the fifth hour. Clearing both flags on
  // "yes" took that documented hour off too: 9 hours across 7 people, Aranda
  // 19.00 -> 0.00 when the honest answer is 2.00. Found 2026-08-10.
  const days = [
    ndDay("07/29/26", { mealViolation: true, mealLate: true, restViolation: true }),
  ];
  const qs = buildQuestions({ days }, { restRows: [], sourceName: "T" })
    .filter((q) => q.kind === "nothingDocumented");

  assert.equal(qs.length, 1, "the day is asked about, for its REST");
  assert.equal(qs[0].row.meal, false, "the late lunch is not what is being asked");
  assert.equal(qs[0].row.rest, true);
  assert.equal(qs[0].movesOnDecline, 1, "one hour, the rest - not two");

  // yes clears the rest and LEAVES the documented meal alone
  assert.deepEqual(patchesFor(qs[0], "yes", days[0]), {
    mealViolation: null,
    restViolation: false,
  });

  // THE OPPOSITE: a day whose meal is undocumented IS cleared by yes, or the
  // question would charge for something nobody is claiming.
  const undoc = [ndDay("07/20/26", { mealViolation: true, restViolation: true })];
  const q2 = buildQuestions({ days: undoc }, { restRows: [], sourceName: "T" })
    .filter((q) => q.kind === "nothingDocumented")[0];
  assert.equal(q2.movesOnDecline, 2);
  assert.deepEqual(patchesFor(q2, "yes", undoc[0]), {
    mealViolation: false,
    restViolation: false,
  });
});

test("a day answered yes asks for a time for every break it is short", () => {
  // Mánu 2026-08-10: required, "because we need a record of this."
  const days = [ndDay("07/20/26", {
    mealViolation: true, restViolation: true, restTaken: 0, restRequired: 2,
  })];
  const q = buildQuestions({ days }, { restRows: [], sourceName: "T" })
    .filter((x) => x.kind === "nothingDocumented")[0];

  assert.deepEqual(q.needs.map((n) => n.slot), ["meal", "rest1", "rest2"]);
  assert.deepEqual(q.needs.map((n) => n.minutes), [30, 10, 10]);
  // NOTHING is pre-filled without a real time behind it. The schedule cannot
  // roster a rest period at all, so a ten is never proposed.
  assert.ok(q.needs.every((n) => !n.prefill), "no schedule here, so nothing to propose");

  // one already taken means one still to account for
  const partial = [ndDay("07/21/26", { restViolation: true, restTaken: 1, restRequired: 2 })];
  const q3 = buildQuestions({ days: partial }, { restRows: [], sourceName: "T" })
    .filter((x) => x.kind === "nothingDocumented")[0];
  assert.deepEqual(q3.needs.map((n) => n.slot), ["rest1"]);

  // a clean day is asked nothing at all, or the card would demand times for
  // breaks nobody says are missing
  assert.equal(
    buildQuestions({ days: [ndDay("07/22/26")] }, { restRows: [], sourceName: "T" })
      .filter((x) => x.kind === "nothingDocumented").length,
    0,
  );
});

test("a rostered lunch is proposed, and a schedule gap is only suggested", () => {
  const days = [ndDay("07/20/26", {
    mealViolation: true, restViolation: true, restTaken: 0, restRequired: 1,
  })];
  const data = {
    days,
    scheduleCheck: {
      byDate: {
        "07/20/26": {
          // two bookings 15 minutes apart, and a lunch rostered elsewhere in
          // the day. The hole AROUND a rostered lunch is not a rest gap - it is
          // the lunch - so the two have to be separate to test either.
          shifts: [
            { text: "9a-12p Rincon" },
            { text: "12:15p-5p Rincon" },
            { text: "3p-3:30p", meal: true },
          ],
        },
      },
    },
  };
  const q = buildQuestions(data, { restRows: [], sourceName: "T" })
    .filter((x) => x.kind === "nothingDocumented")[0];

  const meal = q.needs.find((n) => n.slot === "meal");
  assert.equal(meal.prefill, "3p", "the roster booked it, so it is a time and not a guess");
  assert.equal(meal.source, "schedule");

  const rest = q.needs.find((n) => n.slot === "rest1");
  assert.equal(rest.prefill, null, "never pre-filled");
  assert.equal(rest.suggest, "12p", "the 15 minute hole between two bookings");
  assert.match(rest.hint, /gap 12p-12:15p/);

  // AND THE OPPOSITE: a day with one unbroken booking has no hole to point at,
  // so there is nothing to suggest and the hint says so.
  const solid = buildQuestions(
    { days, scheduleCheck: { byDate: { "07/20/26": { shifts: [{ text: "9a-5p Rincon" }] } } } },
    { restRows: [], sourceName: "T" },
  ).filter((x) => x.kind === "nothingDocumented")[0];
  assert.equal(solid.needs.find((n) => n.slot === "rest1").suggest, null);
  assert.match(solid.needs.find((n) => n.slot === "rest1").hint, /no gap on your schedule/);
});
