// WHEN THEY SAY THEY TOOK IT, AND WHERE THAT ENDS UP.
//
// Mánu 2026-08-10: "we also need to add in the ability for them to pick the
// times if yes. so the new generated time sheet can reflect their answers.
// which is the one that will be the one they signed." Required, "because we
// need a record of this".
//
// So a time typed into the card has to survive: the classifier asking for it,
// the recompute that rebuilds the day, and the renderer that draws the sheet
// they sign. Every one of those is a place it has silently gone missing before.
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildQuestions } from "../questions.js";
import { recomputeSheet } from "../corrections.js";
import { applyOvertime } from "../parse.js";
import { renderCorrected } from "../render.js";
import { withStatedBreaks, scheduleGaps, rosteredMeal } from "../recorded-breaks.js";

async function pdfText(bytes) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes), useSystemFonts: false, isEvalSupported: false,
  }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    for (const it of (await (await doc.getPage(i)).getTextContent()).items) {
      if (it.str?.trim()) out.push(it.str.trim());
    }
  }
  return out.join("\n");
}

// a real punch carries the text QSP printed as well as the minute, and the
// renderer draws that text - a fixture without it prints "undefined" in the cell
const at = (h, m = 0) => ({
  min: h * 60 + m,
  raw: `${h % 12 === 0 ? 12 : h % 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "a" : "p"}`,
});
const DAY = {
  date: "07/20/26",
  punches: [at(8), at(16, 30)],
  paidHours: 8, rawHours: 8, regularHours: 8, otHours: 0, doubleHours: 0,
  addedHours: 0, breaks: [], restTaken: 0, restRequired: 2,
  mealViolation: true, mealLate: false, restViolation: true,
  printed: null, repaired: false,
};

test("a day that owes a meal and two rests asks for three times", () => {
  // SPLIT ACROSS TWO QUESTIONS since 2026-08-10: the lunch is one decision and
  // its own time, the tens are another with theirs. Between them the day still
  // accounts for all three, but claiming only the lunch now costs one time.
  const qs = buildQuestions({ days: [DAY] }, { restRows: [], sourceName: "T" })
    .filter((x) => String(x.kind).startsWith("nothingDocumented"));
  assert.equal(qs.length, 2);
  const q = { needs: qs.flatMap((x) => x.needs) };
  assert.deepEqual(qs[0].needs.map((n) => n.slot), ["meal"]);
  assert.deepEqual(qs[1].needs.map((n) => n.slot), ["rest1", "rest2"]);
  assert.deepEqual(q.needs.map((n) => n.slot), ["meal", "rest1", "rest2"]);
  assert.deepEqual(q.needs.map((n) => n.minutes), [30, 10, 10]);

  // NOTHING IS PRE-FILLED HERE, and that is the point. This question is by
  // definition the days where nothing was recorded, so a value in the box would
  // be the engine inventing a time on a document somebody signs. Mánu: "we
  // cannot assume."
  assert.ok(q.needs.every((n) => !n.prefill));

  // a day owing only rests asks only about rests
  const restOnly = buildQuestions(
    { days: [{ ...DAY, mealViolation: false }] }, { restRows: [], sourceName: "T" },
  ).find((x) => String(x.kind).startsWith("nothingDocumented"));
  assert.deepEqual(restOnly.needs.map((n) => n.slot), ["rest1", "rest2"]);
});

test("a rostered meal nobody punched IS pre-filled, and a rest never is", () => {
  // the one honest pre-fill: the roster booked the lunch, so it is a real time
  // rather than a guess. 20 of 855 slots on the live batch.
  const entry = { shifts: [{ text: "8a-4:30p Rincon" }, { text: "12p-12:30p lunch", meal: true }] };
  assert.deepEqual(rosteredMeal(entry), { from: 720, to: 750 });

  const q = { needs: buildQuestions(
    { days: [DAY], scheduleCheck: { byDate: { "07/20/26": entry } } },
    { restRows: [], sourceName: "T" },
  ).filter((x) => String(x.kind).startsWith("nothingDocumented")).flatMap((x) => x.needs) };
  assert.equal(q.needs[0].slot, "meal");
  assert.equal(q.needs[0].prefill, "12p");
  assert.equal(q.needs[0].source, "schedule");
  // the schedule cannot roster a rest period at all, so these stay empty
  assert.ok(q.needs.slice(1).every((n) => !n.prefill));
});

test("a gap in the roster is offered, not filled in", () => {
  // 5 to 20 minutes between two consecutive bookings. 84 of them across the
  // batch, covering 79 of the 597 rest slots - the rest are typed from memory.
  const entry = { shifts: [{ text: "8a-12p A" }, { text: "12:15p-4p B" }] };
  assert.deepEqual(scheduleGaps(entry), [{ from: 720, to: 735 }]);

  const q = { needs: buildQuestions(
    { days: [DAY], scheduleCheck: { byDate: { "07/20/26": entry } } },
    { restRows: [], sourceName: "T" },
  ).filter((x) => String(x.kind).startsWith("nothingDocumented")).flatMap((x) => x.needs) };
  const rest1 = q.needs.find((n) => n.slot === "rest1");
  assert.equal(rest1.suggest, "12p", "offered as a one-tap");
  assert.equal(rest1.prefill, null, "but never as a value");
  // only one gap, so the second ten has nothing to point at and says so
  const rest2 = q.needs.find((n) => n.slot === "rest2");
  assert.equal(rest2.suggest, null);
  assert.match(rest2.hint, /you will have to remember/);

  // a 4 hour hole is not a rest break and is not offered as one
  assert.deepEqual(scheduleGaps({ shifts: [{ text: "8a-12p A" }, { text: "4p-6p B" }] }), []);
});

test("the times survive a rebuild, because they live on the answer", () => {
  // THE FAILURE THIS GUARDS. `answerTimesheetQuestion` rebuilds every override
  // from every stored answer on each reply, so a time held only in the override
  // blob is dropped the moment somebody answers a different question.
  const statedBreaks = [
    { slot: "meal", kindOf: "meal", from: "12p", to: "12:30p", minutes: 30, source: "typed" },
    { slot: "rest1", kindOf: "rest", from: "10a", to: "10:10a", minutes: 10, source: "gap" },
  ];
  const out = recomputeSheet(
    {
      days: [DAY],
      payPeriod: { from: "07/16/26", to: "07/31/26" },
      overrides: { "07/20/26": { mealViolation: false, restViolation: false, statedBreaks } },
    },
    applyOvertime,
  );
  assert.deepEqual(out.days[0].statedBreaks, statedBreaks, "carried onto the day row");
  assert.equal(out.premiums.totalHours, 0, "and the day stops owing a premium");

  // THE OPPOSITE: no override, no times, and the premium stands
  const bare = recomputeSheet(
    { days: [DAY], payPeriod: { from: "07/16/26", to: "07/31/26" }, overrides: {} },
    applyOvertime,
  );
  assert.equal(bare.days[0].statedBreaks, undefined);
  assert.equal(bare.premiums.totalHours, 2);
});

test("both a stated meal and a stated rest reach the punch row", () => {
  // withStatedRest takes ONE rest, which is all the repair question needed. A
  // day answered here can owe a lunch AND up to three tens.
  const merged = withStatedBreaks([], [
    { kindOf: "rest", from: "2p", to: "2:10p" },
    { kindOf: "meal", from: "12p", to: "12:30p" },
  ]);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map((b) => b.from), ["12p", "2p"], "clock order, not input order");
  assert.ok(merged.every((b) => b.stated && b.counted));
  assert.deepEqual(merged.map((b) => b.kindOf), ["meal", "rest"]);

  // nothing in, nothing added - or every sheet would gain a phantom break
  assert.deepEqual(withStatedBreaks([], []), []);
  assert.deepEqual(withStatedBreaks([], [{ kindOf: "rest", from: "2p" }]), [], "half a time is no time");
});

test("the sheet they sign says the times came from them", async () => {
  const days = [{
    ...DAY,
    mealViolation: false,
    restViolation: false,
    statedBreaks: [
      { slot: "meal", kindOf: "meal", from: "12p", to: "12:30p", minutes: 30, source: "typed" },
      { slot: "rest1", kindOf: "rest", from: "10a", to: "10:10a", minutes: 10, source: "gap" },
    ],
  }];
  const text = await pdfText((await renderCorrected(
    {
      employee: "Testperson, Casey",
      payPeriod: { from: "07/16/26", to: "07/31/26" },
      days,
      totals: { rawHours: 8, paidHours: 8, regularHours: 8, otHours: 0, doubleHours: 0, addedHours: 0, addedOtHours: 0 },
      premiums: { mealDays: [], restDays: [], mealHours: 0, restHours: 0, totalHours: 0 },
      restsByDate: [],
    },
    { printedBy: "T", generatedOn: "8/10/2026" },
  )).bytes);

  assert.match(text, /you told us you took a meal at 12p and a rest break at 10a/);
  // the punch row draws them where they say they happened
  assert.match(text, /10a\n10:10a\n12p\n12:30p/);
  // A BREAK NOBODY RECORDED IS THE EMPLOYEE'S OWN ACCOUNT, and the document has
  // to say so rather than presenting it as something the clock witnessed.
  assert.match(text, /this is your own account of the day/);
  assert.match(text, /no premium is charged/);
  // and it distinguishes a time they typed from one they accepted off the roster
  assert.match(text.replace(/\n/g, " "), /One of those times came from your schedule/);

  // THE OPPOSITE: a day with nothing stated says none of it
  const plain = await pdfText((await renderCorrected(
    {
      employee: "Testperson, Casey",
      payPeriod: { from: "07/16/26", to: "07/31/26" },
      days: [{ ...DAY, mealViolation: false, restViolation: false }],
      totals: { rawHours: 8, paidHours: 8, regularHours: 8, otHours: 0, doubleHours: 0, addedHours: 0, addedOtHours: 0 },
      premiums: { mealDays: [], restDays: [], mealHours: 0, restHours: 0, totalHours: 0 },
      restsByDate: [],
    },
    { printedBy: "T", generatedOn: "8/10/2026" },
  )).bytes);
  assert.ok(!/your own account of the day/.test(plain));
});
