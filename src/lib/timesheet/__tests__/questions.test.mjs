// The questions an employee is asked before signing, and what each answer does
// to the figures.
//
// The point of this file is the SHAPE of each question, and above all WHICH WAY
// THE MONEY MOVES. That reversed on 2026-08-11: the sheet now arrives carrying
// every fault with its penalty, so "yes I took it" is what takes pay OFF and
// "no" agrees with what the sheet already says. Getting this backwards would
// quietly hand somebody less than they are owed, which is why the direction is
// asserted rather than just the arithmetic.
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
  // INVERTED BY THE FLIP. The minutes are PAID on her sheet; confirming the
  // mis-click is what takes them off, and declining leaves her alone.
  assert.equal(outside[0].moves, -0.5, "confirming removes the half hour");
  assert.equal(outside[0].movesOnDecline, 0, "declining changes nothing");
});

test("confirming takes April's minutes off; declining leaves her alone", () => {
  const q = { kind: "restOutsideShift" };

  // the stored day now reads 8.17 - the ten minutes she recorded are PAID - so
  // confirming the mis-click has to land back on 8.00.
  const off = patchesFor(q, "yes", day({ paidHours: 8.17, restsMisclickedMin: 10 }));
  assert.equal(off.paidHours, 8, "and the overtime goes with them");

  assert.deepEqual(
    patchesFor(q, "no", day({ paidHours: 8.17, restsMisclickedMin: 10 })),
    { paidHours: null },
    "declining agrees with the sheet, so there is nothing to patch",
  );

  // AND IT CANNOT GO BELOW ZERO. A day whose stored figure is somehow smaller
  // than the minutes being removed must not produce negative pay.
  const floored = patchesFor(q, "yes", day({ paidHours: 0.05, restsMisclickedMin: 10 }));
  assert.equal(floored.paidHours, 0);
});

test("the service-edge break is paid, and confirming is what moves it inside", () => {
  // MÁNU'S OWN THREE. He ruled the minutes are time added, so the assumption
  // that he meant it inside his shift needs his say-so before it does anything.
  const days = ["07/28/26", "07/29/26", "07/31/26"].map((date) =>
    day({ date, restsAtServiceEdge: 1, restsAtServiceEdgeMin: 10 }));
  const qs = buildQuestions({ days }, { restRows: [], sourceName: "Uribe, Brandon" });

  const edge = qs.filter((q) => q.kind === "restAtServiceEdge");
  assert.equal(edge.length, 1, "one card for the habit, not three");
  assert.deepEqual(edge[0].dates, ["07/28/26", "07/29/26", "07/31/26"]);
  assert.equal(edge[0].row.minutes, 30);
  assert.equal(edge[0].moves, -0.5, "confirming moves it inside and removes the time");
  assert.equal(edge[0].movesOnDecline, 0, "declining leaves the pay on");

  const q = { kind: "restAtServiceEdge" };
  const off = patchesFor(q, "yes", day({ paidHours: 8.17, restsAtServiceEdgeMin: 10 }));
  assert.equal(off.paidHours, 8);
  assert.deepEqual(patchesFor(q, "no", day({ paidHours: 8.17, restsAtServiceEdgeMin: 10 })),
    { paidHours: null });
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
  // the meal question now also requires the DAY to be missing its meal, which
  // is exactly Hernadez's shape: nothing rostered, something meal-length logged
  const days = ["07/25/26", "07/26/26"].map((date) => day({ date, mealViolation: true, mealMissing: true }));
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

test("a rest with no times COUNTS, and is asked for its start time", () => {
  const restRows = [{ name: "Flores, Esmeralda", date: "07/29/26", out: "", in: "", minutes: 0 }];
  const owing = day({ date: "07/29/26", restTaken: 0, restRequired: 1, restViolation: true, paidHours: 5.02 });
  const qs = buildQuestions({ days: [owing] }, { restRows, sourceName: "Flores, Esmeralda" });
  const noTimes = qs.find((q) => q.kind === "restNoTimes");
  assert.ok(noTimes, "asked");
  assert.equal(noTimes.canGiveTime, true, "she can tell us when instead");
  assert.deepEqual(patchesFor(noTimes, "yes", owing), { restViolation: false });

  // IT IS ASKED EVEN ONCE THE PREMIUM IS GONE, and that reversal is the point.
  // Mánu 2026-08-10: a blank row still counts as a break taken, so counting it
  // can be exactly what CLEARS the premium - and gating the question on the
  // violation made it vanish the moment it started doing its job. What is
  // missing is the time, and the time is still missing.
  const settled = day({ date: "07/29/26", restTaken: 1, restRequired: 1, restViolation: false });
  const after = buildQuestions({ days: [settled] }, { restRows, sourceName: "Flores, Esmeralda" });
  assert.ok(after.find((q) => q.kind === "restNoTimes"), "still asked, because the time is still blank");

  // it asks for ONE thing: when it started. Both boxes blank is two ? on the
  // sheet but one answer, since a ten minute rest gives the other end.
  assert.deepEqual(noTimes.row.missing, ["out", "in"]);
  assert.equal(noTimes.needs.length, 1);
  assert.equal(noTimes.needs[0].minutes, 10);

  // and a row with BOTH times is never asked
  const complete = [{ name: "Flores, Esmeralda", date: "07/29/26", out: "9:00 AM", in: "9:10 AM", minutes: 10, counted: true }];
  assert.equal(
    buildQuestions({ days: [owing] }, { restRows: complete, sourceName: "Flores, Esmeralda" })
      .find((q) => q.kind === "restNoTimes"),
    undefined,
  );
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
// ONE QUESTION PER BREAK. Mánu 2026-08-09 late, on his own twelve day card:
// "what if only some of them are no? with the way we have it right now, all of
// them are no or all of them are yes." Answered per DAY on 08-09, and split
// again per BREAK on 08-10 - a day short both a lunch and its tens was still
// all-or-nothing, so getting paid for the tens meant claiming the lunch too.

const ndDay = (date, over = {}) => ({
  date, paidHours: 8, mealViolation: false, mealLate: false, restViolation: false,
  restTaken: 0, restRequired: 2, punches: [], breaks: [], ...over,
});

test("the breaks question is one per BREAK, and each is worth one hour", () => {
  const qs = buildQuestions({
    days: [
      ndDay("07/20/26", { mealViolation: true, restViolation: true }),
      ndDay("07/21/26", { restViolation: true }),
      ndDay("07/22/26"),
    ],
  }, { restRows: [], sourceName: "Testperson" });
  const nd = qs.filter((q) => String(q.kind).startsWith("nothingDocumented"));

  // ONE PER BREAK NOW, not one per day. 07/20 is short both a lunch and its
  // rests, so it is two decisions; 07/21 is short only its rests, so it is one.
  assert.equal(nd.length, 3, "two for the day short both, one for the day short rests");
  assert.deepEqual(nd.map((q) => [q.date, q.kind]), [
    ["07/20/26", "nothingDocumentedMeal"],
    ["07/20/26", "nothingDocumentedRest"],
    ["07/21/26", "nothingDocumentedRest"],
  ]);
  // EVERY ONE IS WORTH EXACTLY ONE HOUR, and after the flip that hour comes OFF
  // on a yes. The old combined question was worth two on a day short both, which
  // is what made it all-or-nothing.
  assert.ok(nd.every((q) => q.moves === -1), "one hour off each, on a yes");
  assert.ok(nd.every((q) => q.movesOnDecline === 0), "and nothing on a no");
  // the day's shape still rides along, so the card can group by date
  assert.deepEqual(nd.map((q) => q.row.parts), [2, 2, 1]);
  // distinct ids, or two decisions would share an answer and the split is pointless
  assert.equal(new Set(nd.map((q) => q.id)).size, 3);
  // and they are still marked as one card, committed together
  assert.ok(nd.every((q) => q.batch === "nothingDocumented"));
});

test("a day short both can be answered yes to one and no to the other", () => {
  // THE WHOLE POINT OF THE SPLIT. Mánu 2026-08-10: somebody who got their lunch
  // and worked through their tens had to claim both to be paid for either.
  const days = [ndDay("07/20/26", { mealViolation: true, restViolation: true })];
  const nd = buildQuestions({ days }, { restRows: [], sourceName: "T" })
    .filter((q) => String(q.kind).startsWith("nothingDocumented"));
  assert.equal(nd.length, 2);

  const meal = nd.find((q) => q.kind === "nothingDocumentedMeal");
  const rest = nd.find((q) => q.kind === "nothingDocumentedRest");

  // "I took my lunch" touches only the meal flag...
  assert.deepEqual(patchesFor(meal, "yes", days[0]), { mealViolation: false });
  // ...and "I missed my tens" touches only the rest one, clearing the override
  // so the day's own flag stands and the hour is charged
  assert.deepEqual(patchesFor(rest, "no", days[0]), { restViolation: null });

  // MERGED THE WAY THE REBUILD MERGES THEM: nulls dropped, the rest spread. One
  // hour charged, not two and not none - which no single answer could express.
  const merged = {};
  for (const [q, choice] of [[meal, "yes"], [rest, "no"]]) {
    for (const [k, v] of Object.entries(patchesFor(q, choice, days[0]))) {
      if (v != null) merged[k] = v;
    }
  }
  assert.deepEqual(merged, { mealViolation: false });
  assert.equal(
    (merged.mealViolation === false ? 0 : 1) + (merged.restViolation === false ? 0 : 1),
    1,
    "one hour owed: the tens, not the lunch",
  );
});

test("saying no on one day leaves the others alone", () => {
  const days = [
    ndDay("07/20/26", { mealViolation: true, restViolation: true }),
    ndDay("07/21/26", { restViolation: true }),
  ];
  const nd = buildQuestions({ days }, { restRows: [], sourceName: "T" })
    .filter((q) => String(q.kind).startsWith("nothingDocumented"));

  // the 20th, both parts taken: each clears its own flag and nothing else
  assert.deepEqual(patchesFor(nd[0], "yes", days[0]), { mealViolation: false });
  assert.deepEqual(patchesFor(nd[1], "yes", days[0]), { restViolation: false });
  // the 21st: they missed them, so the override is cleared and the day's own
  // flag - which already says a rest is owed - comes back through
  assert.deepEqual(patchesFor(nd[2], "no", days[1]), { restViolation: null });
  // and answering the 21st cannot reach the 20th
  assert.equal(nd[2].date, "07/21/26");
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

  const one = [{ kind: "q_nothingDocumentedMeal", date: "07/20/26", status: "accepted" }];
  const p1 = answerProgress(qs, one);
  assert.equal(p1.answered, 1, "one of the two, not one KIND of one kind");
  assert.equal(p1.settled, false, "so they still cannot sign");

  const both = [...one, { kind: "q_nothingDocumentedMeal", date: "07/21/26", status: "declined" }];
  const p2 = answerProgress(qs, both);
  assert.equal(p2.answered, 2);
  assert.equal(p2.declined, 1);
  assert.equal(p2.settled, true);

  // an OPEN correction is a reported problem, not an answer
  assert.equal(answerProgress(qs, [
    { kind: "q_nothingDocumentedMeal", date: "07/20/26", status: "open" },
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
    .filter((q) => String(q.kind).startsWith("nothingDocumented"));

  assert.equal(qs.length, 1, "the day is asked about, for its REST");
  assert.equal(qs[0].row.meal, false, "the late lunch is not what is being asked");
  assert.equal(qs[0].row.rest, true);
  assert.equal(qs[0].moves, -1, "one hour comes off, the rest - not two");

  // yes clears the rest and CANNOT REACH the documented meal - since the split
  // the rest question only ever touches restViolation, which is a stronger
  // guarantee than the old "clear meal only if it was asked about"
  assert.deepEqual(patchesFor(qs[0], "yes", days[0]), { restViolation: false });
  assert.ok(!("mealViolation" in patchesFor(qs[0], "yes", days[0])));

  // THE OPPOSITE: a day whose meal is undocumented IS asked about and cleared by
  // yes, or the question would charge for something nobody is claiming.
  const undoc = [ndDay("07/20/26", { mealViolation: true, restViolation: true })];
  const q2 = buildQuestions({ days: undoc }, { restRows: [], sourceName: "T" })
    .filter((q) => String(q.kind).startsWith("nothingDocumented"));
  assert.equal(q2.length, 2, "two decisions now, one per break");
  assert.ok(q2.every((q) => q.moves === -1), "one hour each");
  assert.deepEqual(patchesFor(q2[0], "yes", undoc[0]), { mealViolation: false });
  assert.deepEqual(patchesFor(q2[1], "yes", undoc[0]), { restViolation: false });
});

test("a day answered yes asks for a time for every break it is short", () => {
  // Mánu 2026-08-10: required, "because we need a record of this."
  const days = [ndDay("07/20/26", {
    mealViolation: true, restViolation: true, restTaken: 0, restRequired: 2,
  })];
  const qs = buildQuestions({ days }, { restRows: [], sourceName: "T" })
    .filter((x) => String(x.kind).startsWith("nothingDocumented"));

  // THE TIMES FOLLOW THE SPLIT, which is the quiet win in it: answering "I took
  // my lunch" now asks for ONE time, not three. Before, a both-day demanded all
  // three before it would submit, even from somebody claiming only the lunch.
  const meal = qs.find((q) => q.kind === "nothingDocumentedMeal");
  const rest = qs.find((q) => q.kind === "nothingDocumentedRest");
  assert.deepEqual(meal.needs.map((n) => n.slot), ["meal"]);
  assert.deepEqual(meal.needs.map((n) => n.minutes), [30]);
  assert.deepEqual(rest.needs.map((n) => n.slot), ["rest1", "rest2"]);
  assert.deepEqual(rest.needs.map((n) => n.minutes), [10, 10]);
  // and between them they still account for every break the day is short
  assert.equal(meal.needs.length + rest.needs.length, 3);
  // NOTHING is pre-filled without a real time behind it. The schedule cannot
  // roster a rest period at all, so a ten is never proposed.
  assert.ok(
    [...meal.needs, ...rest.needs].every((n) => !n.prefill),
    "no schedule here, so nothing to propose",
  );

  // one already taken means one still to account for
  const partial = [ndDay("07/21/26", { restViolation: true, restTaken: 1, restRequired: 2 })];
  const q3 = buildQuestions({ days: partial }, { restRows: [], sourceName: "T" })
    .filter((x) => String(x.kind).startsWith("nothingDocumented"))[0];
  assert.deepEqual(q3.needs.map((n) => n.slot), ["rest1"]);

  // a clean day is asked nothing at all, or the card would demand times for
  // breaks nobody says are missing
  assert.equal(
    buildQuestions({ days: [ndDay("07/22/26")] }, { restRows: [], sourceName: "T" })
      .filter((x) => String(x.kind).startsWith("nothingDocumented")).length,
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
  // the day's slots now live across two questions, so gather them
  const slots = buildQuestions(data, { restRows: [], sourceName: "T" })
    .filter((x) => String(x.kind).startsWith("nothingDocumented"))
    .flatMap((x) => x.needs);

  const meal = slots.find((n) => n.slot === "meal");
  assert.equal(meal.prefill, "3p", "the roster booked it, so it is a time and not a guess");
  assert.equal(meal.source, "schedule");

  const rest = slots.find((n) => n.slot === "rest1");
  assert.equal(rest.prefill, null, "never pre-filled");
  assert.equal(rest.suggest, "12p", "the 15 minute hole between two bookings");
  assert.match(rest.hint, /gap 12p-12:15p/);

  // AND THE OPPOSITE: a day with one unbroken booking has no hole to point at,
  // so there is nothing to suggest and the hint says so.
  const solid = buildQuestions(
    { days, scheduleCheck: { byDate: { "07/20/26": { shifts: [{ text: "9a-5p Rincon" }] } } } },
    { restRows: [], sourceName: "T" },
  ).filter((x) => String(x.kind).startsWith("nothingDocumented")).flatMap((x) => x.needs);
  assert.equal(solid.find((n) => n.slot === "rest1").suggest, null);
  assert.match(solid.find((n) => n.slot === "rest1").hint, /no gap on your schedule/);
});
