// THREE DOCUMENTS FOR ONE PERSON, and what each of them is allowed to claim.
//
// Mánu 2026-08-09: beside the existing preview there should be the engine's
// reading, the figure without the assumptions, and a third showing where the
// person landed once they answered. They differ by every premium an assumption
// would remove - 678.00 against 14.00 across the live batch - so the danger is
// not that one is wrong, it is that somebody reads the wrong one.
//
// THE DEFAULT MOVED ON 2026-08-11 AND SO DID THE NAMES. `projected` is now the
// full figure and the copy people sign; `assumed` was the reduced reading that
// used to be called projected. Every assertion below ran the other way before
// the flip.
//
// AND THERE ARE TWO DOCUMENTS NOW, not three. `assumed` was removed on
// 2026-08-12 with the engine behaviour it described - once an off-clock ten
// stopped being paid on sight, the engine assumed nothing of its own and that
// copy became the projected one with a second name. The assertions it carried
// were not thrown away: they were about `applyAssumptions`, which `corrected`
// still runs, so they moved onto that basis. The file keeps its name because
// the history above is the part worth being able to find.
//
// These tests are about what the PAGE SAYS, not what the arithmetic does.
// premium-split.test.mjs covers the arithmetic.
import { test } from "node:test";
import assert from "node:assert/strict";

import { renderSheet } from "../render-sheet.js";
import { premiumStanding, batchPremiumStanding } from "../premium-split.js";
import { renderPenaltyRoster } from "../penalty-roster.js";
import { renderPayoutReport } from "../payout-pdf.js";

async function pdfText(bytes) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes), useSystemFonts: false, isEvalSupported: false,
  }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    for (const item of content.items) if (item.str?.trim()) out.push(item.str.trim());
  }
  return out.join("\n");
}

const at = (h, m = 0) => ({ min: h * 60 + m });

// One assumed day and one documented one, which is the shape the whole question
// turns on: a rostered lunch taken too late is charged on every copy, a lunch
// nobody recorded is charged on one of them.
const sheetFor = (days) => ({
  id: "t1",
  sourceName: "Testperson, Casey",
  data: {
    payPeriod: { from: "07/16/26", to: "07/31/26" },
    generatedOn: "8/9/2026",
    days,
    premiums: {
      mealDays: days.filter((d) => d.mealViolation).map((d) => d.date),
      restDays: days.filter((d) => d.restViolation).map((d) => d.date),
      mealHours: days.filter((d) => d.mealViolation).length,
      restHours: days.filter((d) => d.restViolation).length,
      totalHours: days.filter((d) => d.mealViolation).length
        + days.filter((d) => d.restViolation).length,
    },
  },
  batch: { periodFrom: "07/16/26", periodTo: "07/31/26", restsByDate: [] },
});

const day = (over = {}) => ({
  date: "07/20/26", punches: [at(8), at(16, 30)],
  paidHours: 8, rawHours: 8, regularHours: 8, otHours: 0, doubleHours: 0,
  addedHours: 0, breaks: [], restTaken: 0, restRequired: 2,
  mealViolation: false, mealLate: false, restViolation: false,
  ...over,
});

const ASSUMED = day({ mealViolation: true, restViolation: true, restTaken: 1 });
const DOCUMENTED = day({ date: "07/21/26", mealViolation: true, mealLate: true });

test("each copy says which one it is, and only the signed one reads as a payslip", async () => {
  // THE SIGNED COPY IS THE DEFAULT ONE NOW. It explains the model instead of
  // warning anybody off it, because there is nothing to warn them off: it is
  // their timesheet and it carries every hour the engine could find for them.
  // The other two are admin readings of an open question and have to say so.
  const ts = sheetFor([ASSUMED, DOCUMENTED]);

  // THE DEFAULT COPY CARRIES NO BANNER AT ALL. Mánu 2026-08-11 had the amber box
  // removed: it is their own timesheet, there is nothing to warn them off, and
  // drawing it on every page put a hazard stripe over the header and then over
  // the attestation. The sentence moved to the premium section, in grey.
  const projected = await pdfText((await renderSheet(ts)).bytes);
  assert.ok(!/Not the copy sent for signature/.test(projected),
    "this IS the copy sent for signature");
  assert.ok(!/reference copy|AS CORRECTED/.test(projected), "and it carries no banner");
  assert.match(projected, /paid as missed/, "the sentence survives, beside the premium table");
  assert.match(projected, /3\.00 hrs/, "and it charges every one of them");

  const assumed = await pdfText((await renderSheet(ts, { basis: "corrected" })).bytes);
  assert.match(assumed, /AS CORRECTED/);
  assert.match(assumed, /Not the copy sent for signature/);

  const corrected = await pdfText((await renderSheet(ts, { basis: "corrected" })).bytes);
  assert.match(corrected, /AS CORRECTED/);
  assert.match(corrected, /Not the copy sent for signature/);
});

test("the default copy charges everything and the assumed one charges what survives", async () => {
  const ts = sheetFor([ASSUMED, DOCUMENTED]);

  // THE SHEET THAT GOES OUT. This is the assertion the whole flip turns on.
  const projected = await pdfText((await renderSheet(ts)).bytes);
  assert.match(projected, /3\.00 hrs/, "meal + rest on the 20th, meal on the 21st");

  const assumed = await pdfText((await renderSheet(ts, { basis: "corrected" })).bytes);
  assert.match(assumed, /1\.00 hrs/, "the late lunch, which no assumption can reach");
  assert.ok(!/3\.00 hrs/.test(assumed), "and not the two it assumed away");
});

test("an assumed day is still a finding on the assumed copy, never a clean one", async () => {
  // THE FAILURE THIS EXISTS TO CATCH: clear the violation flags and the row
  // goes quiet and prints "compliant". 359 rows on the live batch would have
  // claimed a clean day for a break nobody verified.
  const assumed = await pdfText(
    (await renderSheet(sheetFor([ASSUMED]), { basis: "corrected" })).bytes);
  assert.match(assumed, /meal \+ rest: to confirm/);
  assert.ok(!/compliant/.test(assumed), "the one day on this sheet is not clean");
  assert.match(assumed, /GREY BREAK NOTES/, "and the colour is explained in words");
});

test("a copy that charges nothing still accounts for what it left out", async () => {
  // On the ASSUMED copy most people fall to 0.00, so this paragraph IS the
  // premium section there. "No premiums due" standing alone would be a clean
  // bill of health for something nobody checked.
  const assumed = await pdfText(
    (await renderSheet(sheetFor([ASSUMED]), { basis: "corrected" })).bytes);
  assert.match(assumed, /No break premiums are being charged/);
  assert.match(assumed, /Assumed taken, not charged: 1 meal period and 1 rest break/);
  assert.match(assumed, /nothing on file says these were missed/);

  // THE OPPOSITE: a genuinely clean sheet assumed nothing and must not carry
  // the paragraph at all, or it is an apology for a finding that never existed.
  const clean = await pdfText(
    (await renderSheet(sheetFor([day()]), { basis: "corrected" })).bytes);
  assert.match(clean, /No meal or rest break premiums due/);
  assert.ok(!/Assumed taken, not charged/.test(clean));
  assert.ok(!/GREY BREAK NOTES/.test(clean));
});

test("declining holds a premium onto the corrected copy, and never moves the signed one", async () => {
  const ts = sheetFor([ASSUMED]);
  const answered = {
    confirmed: new Set(["07/20/26:meal", "07/20/26:rest"]),
    answers: { "07/20/26:meal": "owed", "07/20/26:rest": "owed" },
  };

  // she said she missed both, so no assumption is allowed to take them off
  const corrected = await pdfText((await renderSheet(ts, { basis: "corrected", ...answered })).bytes);
  assert.match(corrected, /2\.00 hrs/, "the hours survive on the corrected copy");
  assert.ok(!/to confirm/.test(corrected), "nothing is left to ask about");

  // THE ASSUMED COPY USED TO BE COMPARED HERE and is gone with the basis, on
  // 2026-08-12. It was the engine's alternative reading, blind to the answers on
  // purpose, and holding it beside the corrected one showed what the asking had
  // changed. The engine no longer applies an assumption of its own, so that
  // document had become the projected one under another name - and the same
  // comparison is made below against the copy she actually signs, which is the
  // one that matters anyway.

  // THE SHEET SHE ACTUALLY SIGNS NEVER MOVED AT ALL. Under the old default
  // this answer is what put the two hours ON; now it only stops them coming off.
  const projected = await pdfText((await renderSheet(ts, { ...answered })).bytes);
  assert.match(projected, /2\.00 hrs/, "charged before she answered and after");
});

test("after the deadline the corrected copy stops asking and says what it assumed", async () => {
  // Mánu 2026-08-09: "if they don't sign off on it, then the form will be our
  // assumption." Not a new charge - a different claim about the same zero.
  const ts = sheetFor([ASSUMED]);
  const late = await pdfText((await renderSheet(ts, { basis: "corrected", pastDue: true })).bytes);
  assert.match(late, /meal \+ rest: assumed taken/);
  assert.ok(!/to confirm/.test(late));
  assert.match(late, /The date for replying has passed/);
  assert.match(late, /acknowledgment you signed/);

  const early = await pdfText((await renderSheet(ts, { basis: "corrected", pastDue: false })).bytes);
  assert.match(early, /meal \+ rest: to confirm/);
  assert.ok(!/assumed taken,/.test(early));
});

// ---------------------------------------------------------------------------
// THE THREE SURFACES AGREEING. Mánu 2026-08-09 late, reading his own email:
// it said "Break premium hours owed: 17 hrs" and "you are owed an extra hour of
// pay for each one", the page under it said the breaks were assumed taken and
// no penalty pay added, and the PDF charged all 17. Two of the three sat above
// a signature. They read from one function now.

test("what is charged and what could come off are different numbers, and both are said", () => {
  const days = [ASSUMED, DOCUMENTED];
  const s = premiumStanding(days, []);
  assert.equal(s.charged, 3, "everything: both undocumented breaks and the late lunch");
  assert.equal(s.assumptions, 2, "the meal and the rest nobody wrote down could come off");
  assert.equal(s.ifAssumptionsHold, 1, "leaving the late lunch, which no answer can reach");

  // the two are still different numbers and the surfaces still have to print
  // both - what changed is which one payroll pays.
  assert.notEqual(s.charged, s.ifAssumptionsHold);
});

test("saying you MISSED a break settles it in place, on every surface at once", async () => {
  const days = [ASSUMED];
  const answers = [
    { kind: "q_nothingDocumented", date: "07/20/26", status: "declined" },
  ];

  const before = premiumStanding(days, []);
  assert.equal(before.charged, 2, "paid before she says anything");
  assert.equal(before.assumptions, 2, "and both are still assumable");

  const after = premiumStanding(days, answers);
  assert.equal(after.charged, 2, "the same two hours - her answer agreed with the sheet");
  assert.equal(after.assumptions, 0, "but nothing can assume them away now");
  assert.equal(after.ifAssumptionsHold, 2, "so the floor rose to meet what is charged");

  // and the document she signs carries the same figure the page quotes
  const pdf = await pdfText((await renderSheet(sheetFor(days), {
    basis: "corrected", confirmed: after.confirmed, answers: after.answers,
  })).bytes);
  assert.match(pdf, /2\.00 hrs/);
  assert.ok(!/to confirm/.test(pdf), "nothing left to ask about");
});

test("confirming is the only thing that takes an hour off, which is the point of asking", () => {
  // THE OVERRIDE HAS NOT RUN HERE, so the day still carries its flags and the
  // standing still reads 2.00. That is not the bug it looks like: accepting
  // rebuilds the sheet, and this function reports what the STORED days say.
  // What it proves is the direction - an accept is not treated as a settled
  // premium the way a decline is.
  const accepted = premiumStanding([ASSUMED], [
    { kind: "q_nothingDocumented", date: "07/20/26", status: "accepted" },
  ]);
  assert.equal(accepted.confirmed.size, 0, "an accept settles nothing in place");
  assert.equal(accepted.assumptions, 2, "so both hours are still reachable");

  // and once the rebuild HAS cleared the flags, both figures fall together
  const rebuilt = premiumStanding(
    [day({ mealViolation: false, restViolation: false, restTaken: 1 })], []);
  assert.equal(rebuilt.charged, 0, "the hours came off");
  assert.equal(rebuilt.assumptions, 0);
});

// ---------------------------------------------------------------------------
// WHAT PAYROLL PAYS, AND WHETHER IT IS FINISHED CHANGING.
//
// Mánu 2026-08-09 late: "have the projected report be the one and it be updated
// as people confirm with a notice when everyone has confirmed new choices."
//
// THE DIRECTION INVERTED ON 2026-08-11. Until every question has an answer the
// penalty total can only come DOWN - every fault is charged from the start and
// confirming one is what removes it. A payroll document that looks final while
// most of the batch has an open question now over-states what payroll owes,
// rather than shortchanging an employee.

const sheetRow = (id, days, corrections = []) => ({
  id, sourceName: `Person, ${id}`, data: { days }, corrections,
});

test("the batch standing pays what is charged and counts who has not answered", () => {
  const s = batchPremiumStanding([
    sheetRow("a", [ASSUMED]),
    sheetRow("b", [DOCUMENTED]),
  ]);
  assert.equal(s.charged, 3, "every fault across both sheets - what payroll pays");
  assert.equal(s.assumptions, 2, "what could still come off");
  assert.equal(s.ifAssumptionsHold, 1, "the floor if everyone confirms");
  assert.equal(s.people, 2);
  assert.equal(s.waiting, 1, "only the assumable sheet raises a question");
  assert.equal(s.settled, false);

  // per person, because the roster prints a row each
  assert.equal(s.byId.a.charged, 2, "the undocumented meal and rest, both paid");
  assert.equal(s.byId.b.charged, 1, "the late lunch");
});

test("it goes final only when every question has an answer", () => {
  const asked = sheetRow("a", [ASSUMED]);
  assert.equal(batchPremiumStanding([asked]).settled, false);

  // BOTH PARTS, since the split. The assumed day is short a meal and its rests,
  // so it is two decisions and answering one leaves the sheet still waiting -
  // which is the assertion below doing its job.
  const halfAnswered = sheetRow("a", [ASSUMED], [
    { kind: "q_nothingDocumentedMeal", date: "07/20/26", status: "accepted" },
  ]);
  assert.equal(batchPremiumStanding([halfAnswered]).settled, false, "one of two is not answered");

  const answered = sheetRow("a", [ASSUMED], [
    { kind: "q_nothingDocumentedMeal", date: "07/20/26", status: "accepted" },
    { kind: "q_nothingDocumentedRest", date: "07/20/26", status: "accepted" },
  ]);
  const s = batchPremiumStanding([answered]);
  assert.equal(s.waiting, 0);
  assert.equal(s.settled, true, "she answered, so nothing else can move it");
  // the override that clears the flags has not run in this fixture, so the
  // figure is still 2.00. What matters is that the batch stopped waiting.
  assert.equal(s.assumptions, 2, "nothing was settled in place by accepting");

  // a sheet nobody was ever asked about is settled from the start, or the
  // notice would read "provisional" on a batch with nothing to wait for
  assert.equal(batchPremiumStanding([sheetRow("c", [day()])]).settled, true);
});

test("the payroll documents carry the notice, and it flips when the batch is done", async () => {
  const rows = [{ who: "Person, a", sourceName: "Person, a", premiumHours: 1 }];
  const waiting = { people: 2, waiting: 1, settled: false, assumptions: 2, charged: 3 };
  const done = { people: 2, waiting: 0, settled: true, assumptions: 0, charged: 1 };

  const provisional = await pdfText(
    (await renderPenaltyRoster({ periodFrom: "07/16/26", periodTo: "07/31/26", rows, standing: waiting })).bytes);
  assert.match(provisional, /PROVISIONAL\. 1 of 2 have not answered yet/);
  // THE SENTENCE THAT INVERTED LITERALLY. It read "can rise and cannot fall"
  // until 2026-08-11 and it sits on a document payroll budgets from.
  assert.match(provisional, /can fall and cannot rise/);
  assert.ok(!/can rise and cannot fall/.test(provisional));
  assert.match(provisional, /2\.00 hours come off/, "and it says how much");

  const final = await pdfText(
    (await renderPenaltyRoster({ periodFrom: "07/16/26", periodTo: "07/31/26", rows, standing: done })).bytes);
  assert.match(final, /FINAL\. Everyone has answered/);
  assert.ok(!/PROVISIONAL/.test(final));

  // and the payout report says the same thing about the same column
  const payRows = [{
    who: "Person, a", matched: true, regularHours: 8, otHours: 0, doubleHours: 0,
    paidHours: 8, premiumHours: 1, partialWeek: false, disputed: false,
  }];
  const payout = await pdfText(
    (await renderPayoutReport({ periodFrom: "07/16/26", periodTo: "07/31/26", rows: payRows, standing: waiting })).bytes);
  assert.match(payout, /PROVISIONAL\. 1 of 2 have not answered yet/);
});

// ---------------------------------------------------------------------------
// THE DOCUMENT ABOVE THE SIGNATURE HAS TO BE THE ONE THE PAGE IS QUOTING.
//
// This has now been got wrong in both directions. On 2026-08-09 the page said
// the breaks were assumed taken while the PDF charged all 17. On 2026-08-11 the
// flip reversed the page and left the route rendering `corrected`, so Aranda's
// page read 19.00 and the sheet under it read 2.00 - seventeen hours short, on
// the document she signs. The build passed and every test passed both times.
//
// So the shape is asserted here rather than trusted to a route: whatever
// `premiumStanding` says is charged is what the signed copy has to print.

test("the copy an employee signs prints exactly what their page says is charged", async () => {
  const days = [ASSUMED, DOCUMENTED];
  const ts = sheetFor(days);
  const standing = premiumStanding(days, []);
  assert.equal(standing.charged, 3, "the page will quote this");

  // what /t/[token]/pdf renders
  const signed = await pdfText((await renderSheet(ts, { basis: "projected" })).bytes);
  assert.match(signed, /3\.00 hrs/, "and the document has to agree with it");
  assert.ok(!/Not the copy sent for signature/.test(signed));

  // AND THE ADMIN READING MUST NOT BE IT. It under a signature is the defect
  // this test exists for. `assumed` was checked here too and went with the basis
  // on 2026-08-12 - see the note in render-sheet.js.
  const other = await pdfText((await renderSheet(ts, { basis: "corrected" })).bytes);
  assert.match(other, /Not the copy sent for signature/,
    "corrected must say so - it charges 1.00 against a page saying 3.00");
  assert.ok(!new RegExp(`${standing.charged}\\.00 hrs`).test(other),
    "corrected prints a different figure from the page, which is why it is not signable");

  // A STALE `?basis=assumed` URL FALLS BACK TO THE SIGNED COPY, rather than
  // rendering the projected days under the old "IF EVERY ASSUMPTION HOLDS"
  // banner - which is what it did for a few minutes while the basis was being
  // taken out, and is the worse of the two failures by a long way.
  const stale = await pdfText((await renderSheet(ts, { basis: "assumed" })).bytes);
  assert.ok(!/IF EVERY ASSUMPTION HOLDS/.test(stale), "no banner for a basis that no longer exists");
  assert.ok(!/Not the copy sent for signature/.test(stale), "it IS the signed copy now");
  assert.match(stale, /3\.00 hrs/, "and it prints what the page says");
});
