// THREE DOCUMENTS FOR ONE PERSON, and what each of them is allowed to claim.
//
// Mánu 2026-08-09: beside the existing preview there should be the engine's
// projection, the figure without the assumptions, and a third showing where the
// person landed once they answered. They differ by every premium the engine
// assumed away - 14.00 against 684.00 across the live batch - so the danger is
// not that one is wrong, it is that somebody reads the wrong one.
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
  // 2026-08-09 late: `corrected` became the document people are sent and sign,
  // so it explains the model instead of warning anybody off it. The other two
  // are admin readings and have to say so - `ignoring` above all, because it
  // charges every assumption the company is NOT making.
  const ts = sheetFor([ASSUMED, DOCUMENTED]);

  const corrected = await pdfText((await renderSheet(ts, { basis: "corrected" })).bytes);
  assert.match(corrected, /Breaks with nothing on file recording them are assumed taken/);
  assert.ok(!/Not the copy sent for signature/.test(corrected),
    "this IS the copy sent for signature");

  const projected = await pdfText((await renderSheet(ts, { basis: "projected" })).bytes);
  assert.match(projected, /PROJECTED COPY - the engine's proposal/);
  assert.match(projected, /Not the copy sent for signature/);

  const ignoring = await pdfText((await renderSheet(ts)).bytes);
  assert.match(ignoring, /IGNORING ASSUMPTIONS - reference copy, not a payslip/);
  assert.match(ignoring, /Not the copy sent for signature/);
  assert.match(ignoring, /3\.00 hrs/, "and it charges every one of them");
});

test("the projected copy charges the documented penalty and not the assumed one", async () => {
  const ts = sheetFor([ASSUMED, DOCUMENTED]);

  const plain = await pdfText((await renderSheet(ts)).bytes);
  assert.match(plain, /3\.00 hrs/, "meal + rest on the 20th, meal on the 21st");

  const projected = await pdfText((await renderSheet(ts, { basis: "projected" })).bytes);
  assert.match(projected, /1\.00 hrs/, "the late lunch only");
  assert.ok(!/3\.00 hrs/.test(projected), "and not the two it assumed away");
});

test("an assumed day is still a finding on the projected copy, never a clean one", async () => {
  // THE FAILURE THIS EXISTS TO CATCH: clear the violation flags and the row
  // goes quiet and prints "compliant". 359 rows on the live batch would have
  // claimed a clean day for a break nobody verified.
  const projected = await pdfText(
    (await renderSheet(sheetFor([ASSUMED]), { basis: "projected" })).bytes);
  assert.match(projected, /meal \+ rest: to confirm/);
  assert.ok(!/compliant/.test(projected), "the one day on this sheet is not clean");
  assert.match(projected, /GREY BREAK NOTES/, "and the colour is explained in words");
});

test("a copy that charges nothing still accounts for what it left out", async () => {
  // 50 of the 59 people project to 0.00, so on most sheets this paragraph IS
  // the premium section. "No premiums due" standing alone would be a clean bill
  // of health for something nobody checked.
  const projected = await pdfText(
    (await renderSheet(sheetFor([ASSUMED]), { basis: "projected" })).bytes);
  assert.match(projected, /No break premiums are being charged/);
  assert.match(projected, /Assumed taken, not charged: 1 meal period and 1 rest break/);
  assert.match(projected, /nothing on file says these were missed/);

  // THE OPPOSITE: a genuinely clean sheet assumed nothing and must not carry
  // the paragraph at all, or it is an apology for a finding that never existed.
  const clean = await pdfText(
    (await renderSheet(sheetFor([day()]), { basis: "projected" })).bytes);
  assert.match(clean, /No meal or rest break premiums due/);
  assert.ok(!/Assumed taken, not charged/.test(clean));
  assert.ok(!/GREY BREAK NOTES/.test(clean));
});

test("declining moves a premium onto the corrected copy and leaves the projected one alone", async () => {
  const ts = sheetFor([ASSUMED]);
  const answered = {
    confirmed: new Set(["07/20/26:meal", "07/20/26:rest"]),
    answers: { "07/20/26:meal": "owed", "07/20/26:rest": "owed" },
  };

  const corrected = await pdfText((await renderSheet(ts, { basis: "corrected", ...answered })).bytes);
  assert.match(corrected, /2\.00 hrs/, "she said she missed both");
  assert.ok(!/to confirm/.test(corrected), "nothing is left to ask about");

  // the projected copy is the engine's PROPOSAL and does not move. Holding the
  // two side by side is how you see what the asking actually changed.
  const projected = await pdfText((await renderSheet(ts, { basis: "projected", ...answered })).bytes);
  assert.match(projected, /No break premiums are being charged/);
  assert.match(projected, /to confirm/);
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

test("what is charged and what is assumed are different numbers, and both are said", () => {
  const days = [ASSUMED, DOCUMENTED];
  const s = premiumStanding(days, []);
  assert.equal(s.charged, 1, "the late lunch the schedule records");
  assert.equal(s.assumed, 2, "the meal and the rest nobody wrote down");
  assert.equal(s.ignoring, 3, "and the two together are the old headline figure");

  // the email quoted `ignoring` and called it "owed". That is the bug: it is
  // the one figure that is not what anybody is being paid.
  assert.notEqual(s.charged, s.ignoring);
});

test("an answer moves an hour from assumed to charged, on every surface at once", async () => {
  const days = [ASSUMED];
  const answers = [
    { kind: "q_nothingDocumented", date: "07/20/26", status: "declined" },
  ];

  const before = premiumStanding(days, []);
  assert.equal(before.charged, 0);
  assert.equal(before.assumed, 2);

  const after = premiumStanding(days, answers);
  assert.equal(after.charged, 2, "she said she missed both");
  assert.equal(after.assumed, 0, "and nothing is being assumed any more");
  assert.equal(after.ignoring, 2, "the ceiling does not move");

  // and the document she signs carries the same figure the page quotes
  const pdf = await pdfText((await renderSheet(sheetFor(days), {
    basis: "corrected", confirmed: after.confirmed, answers: after.answers,
  })).bytes);
  assert.match(pdf, /2\.00 hrs/);
  assert.ok(!/to confirm/.test(pdf), "nothing left to ask about");
});

test("confirming charges nobody anything, which is the whole point of asking", () => {
  const accepted = premiumStanding([ASSUMED], [
    { kind: "q_nothingDocumented", date: "07/20/26", status: "accepted" },
  ]);
  assert.equal(accepted.charged, 0);
  // the override has not run here, so the day still carries its flags - the
  // standing is what the SHEET will say once it has, and it says zero either way
  assert.equal(accepted.assumed, 2);
});

// ---------------------------------------------------------------------------
// WHAT PAYROLL PAYS, AND WHETHER IT IS FINISHED CHANGING.
//
// Mánu 2026-08-09 late: "have the projected report be the one and it be updated
// as people confirm with a notice when everyone has confirmed new choices."
//
// Until every question has an answer the penalty total can only go UP - a break
// somebody says they missed is a premium coming back - so a payroll document
// that looks final while most of the batch has an open question is the one way
// this model can shortchange somebody.

const sheetRow = (id, days, corrections = []) => ({
  id, sourceName: `Person, ${id}`, data: { days }, corrections,
});

test("the batch standing pays what is charged and counts who has not answered", () => {
  const s = batchPremiumStanding([
    sheetRow("a", [ASSUMED]),
    sheetRow("b", [DOCUMENTED]),
  ]);
  assert.equal(s.charged, 1, "the late lunch, and only it");
  assert.equal(s.assumed, 2, "what could still land");
  assert.equal(s.ignoring, 3, "what both payroll documents printed before");
  assert.equal(s.people, 2);
  assert.equal(s.waiting, 1, "only the assumed sheet raises a question");
  assert.equal(s.settled, false);

  // per person, because the roster prints a row each
  assert.equal(s.byId.a.charged, 0);
  assert.equal(s.byId.b.charged, 1);
});

test("it goes final only when every question has an answer", () => {
  const asked = sheetRow("a", [ASSUMED]);
  assert.equal(batchPremiumStanding([asked]).settled, false);

  const answered = sheetRow("a", [ASSUMED], [
    { kind: "q_nothingDocumented", date: "07/20/26", status: "accepted" },
  ]);
  const s = batchPremiumStanding([answered]);
  assert.equal(s.waiting, 0);
  assert.equal(s.settled, true, "she answered, so nothing else can move it");
  assert.equal(s.charged, 0, "and confirming charged nobody anything");

  // a sheet nobody was ever asked about is settled from the start, or the
  // notice would read "provisional" on a batch with nothing to wait for
  assert.equal(batchPremiumStanding([sheetRow("c", [day()])]).settled, true);
});

test("the payroll documents carry the notice, and it flips when the batch is done", async () => {
  const rows = [{ who: "Person, a", sourceName: "Person, a", premiumHours: 1 }];
  const waiting = { people: 2, waiting: 1, settled: false, assumed: 2, charged: 1 };
  const done = { people: 2, waiting: 0, settled: true, assumed: 0, charged: 1 };

  const provisional = await pdfText(
    (await renderPenaltyRoster({ periodFrom: "07/16/26", periodTo: "07/31/26", rows, standing: waiting })).bytes);
  assert.match(provisional, /PROVISIONAL\. 1 of 2 have not answered yet/);
  assert.match(provisional, /can rise and cannot fall/);

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
