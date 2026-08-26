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
  // THE ROSTER LEAVES A HOLE FOR IT. A lunch booked on top of a booking is a
  // different finding entirely - `mealBookedInside` - and this fixture used to
  // book one across "8a-4:30p" and rely on that block being unreadable to fall
  // through to this question. Every named service is worked time as of
  // 2026-08-26, so the block has to actually make room for the lunch, which is
  // what the 20 live days this is about look like.
  const entry = { shifts: [
    { text: "8a-12p Rincon-ILS Service(4:00)" },
    { text: "12p-12:30p lunch", meal: true },
    { text: "12:30p-4:30p Rincon-ILS Service(4:00)" },
  ] };
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

test("a rest slot points at the shifts worked, never at the gaps between them", () => {
  // REVERSED 2026-08-11. A 5-to-20 minute hole between two bookings is
  // unscheduled time, and this employer does not accept a rest period there -
  // it is the whole subject of the `restOutsideScheduled` question. Offering it
  // as a one-tap was the same fault by a different route, on 506 of the 597
  // rest slots in the batch. Mánu: "instead of showing me where the gaps are it
  // should show me my ins and outs of each shift for the day."
  const entry = { shifts: [{ text: "8a-12p A" }, { text: "12:15p-4p B" }] };
  // the gap is still computable - nothing else changed about the roster - it
  // just is not somewhere a break may be put
  assert.deepEqual(scheduleGaps(entry), [{ from: 720, to: 735 }]);

  const needs = buildQuestions(
    { days: [DAY], scheduleCheck: { byDate: { "07/20/26": entry } } },
    { restRows: [], sourceName: "T" },
  ).filter((x) => String(x.kind).startsWith("nothingDocumented")).flatMap((x) => x.needs);

  for (const n of needs.filter((x) => x.kindOf === "rest")) {
    assert.equal(n.suggest, null, "no gap is ever offered");
    assert.equal(n.prefill, null, "and nothing is filled in for them");
    assert.ok(!/gap/.test(n.hint || ""), "nor named in the hint");
    // what it DOES carry: the day's own punches, and the half of the shift this
    // particular ten belongs in
    assert.ok(Array.isArray(n.shifts), "the shifts worked travel with the slot");
    assert.ok(n.window || !n.shifts.length, "and the window it has to land in");
  }
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
  // THE PREMIUM TABLE IS NO LONGER PRINTED ON THE SIGNABLE SHEET, 2026-08-14.
  // Neither word appears anywhere an employee reads. See render.js.
  assert.doesNotMatch(text, /premium|penalty/i);
  // the fact the sentence carried SURVIVES - it is their own account of the day
  assert.match(text, /your own account of the day/);
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
