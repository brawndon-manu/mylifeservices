// Hours we ADDED, and the sheet saying so.
//
// Mánu 2026-08-09: a ten recorded while somebody was off the clock is paid time
// nobody paid for, so the minutes are added rather than a premium charged. His
// instruction on the document: it has to be distinguishable that hours were
// added, both for the rest minutes and for the overtime they create.
//
// The interesting case is that the added minutes are NOT always hours gained.
// QSP's printed daily is a floor, so on a day already being floored up the
// minutes are already inside the figure and nothing is added. Saying "added"
// there would be a claim about somebody's pay that is not true.
import { test } from "node:test";
import assert from "node:assert/strict";

import { analyzeDay, analyzeTimesheet } from "../parse.js";
import { renderCorrected } from "../render.js";

async function pdfWords(bytes) {
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
// eight hours on the clock, one rest taken after clocking out
const OFF_CLOCK_DAY = {
  date: "07/20/26",
  punches: [at(8), at(16)],
  printed: null,
  restRecorded: 2,
  restsAlreadyPaid: true,
  restTimes: [
    { out: 10 * 60, in: 10 * 60 + 10 },          // on the clock, already paid
    { out: 16 * 60 + 30, in: 16 * 60 + 40 },     // after clock-out, not paid
  ],
};

test("a rest taken off the clock adds its minutes, and the day says how many", () => {
  const d = analyzeDay(OFF_CLOCK_DAY);
  assert.equal(d.restsOffClock, 1);
  assert.equal(d.restsOffClockMin, 10);
  // unrounded here, like paidHours. Ten minutes is 0.1667, and rounding each
  // day to 0.17 before summing is what made April's sheet claim 1.87 added
  // against 1.83 of added overtime.
  assert.equal(Number(d.addedHours.toFixed(4)), 0.1667);
  assert.equal(Number(d.paidHours.toFixed(2)), 8.17);

  // THE OPPOSITE: both rests on the clock, nothing added
  const onClock = analyzeDay({
    ...OFF_CLOCK_DAY,
    restTimes: [
      { out: 10 * 60, in: 10 * 60 + 10 },
      { out: 14 * 60, in: 14 * 60 + 10 },
    ],
  });
  assert.equal(onClock.addedHours, 0);
  assert.equal(onClock.paidHours, 8);
});

test("minutes swallowed by QSP's floor are NOT reported as added", () => {
  // the day is being floored up to QSP's printed 8.50 anyway, so the ten
  // minutes are already inside the figure. Claiming "added" here would be
  // telling somebody they gained pay they did not gain.
  const d = analyzeDay({ ...OFF_CLOCK_DAY, printed: { daily: 8.5 } });
  assert.equal(d.restsOffClockMin, 10, "the rest is still off the clock");
  assert.equal(d.paidHours, 8.5, "and the floor still wins");
  assert.equal(d.addedHours, 0, "so nothing was actually added");

  // and just past the floor, the part that clears it IS added
  const partly = analyzeDay({ ...OFF_CLOCK_DAY, printed: { daily: 8.1 } });
  assert.equal(Number(partly.paidHours.toFixed(2)), 8.17);
  assert.equal(Number(partly.addedHours.toFixed(4)), 0.0667, "8.1667 against a floor of 8.10");
});

test("added minutes past the eighth hour are counted as added OVERTIME", () => {
  const sheet = analyzeTimesheet({
    payPeriod: { from: "07/16/26", to: "07/31/26" },
    days: [OFF_CLOCK_DAY],
  });
  assert.equal(sheet.totals.addedHours, 0.17);   // totals ARE rounded, once
  assert.equal(sheet.totals.addedOtHours, 0.17, "the whole addition is past eight");
  assert.equal(Number(sheet.totals.otHours.toFixed(2)), 0.17);

  // THE OPPOSITE: the same addition on a SHORT day is straight time, so none of
  // it is added overtime. Without this the check above would pass on any sheet
  // that happens to have overtime in it.
  const short = analyzeTimesheet({
    payPeriod: { from: "07/16/26", to: "07/31/26" },
    days: [{ ...OFF_CLOCK_DAY, punches: [at(8), at(13)] }],
  });
  assert.equal(short.totals.addedHours, 0.17);
  assert.equal(short.totals.addedOtHours, 0, "nowhere near eight hours");
  assert.equal(short.totals.otHours, 0);
});

test("the SHEET says added, on the day and in the summary", async () => {
  const sheet = analyzeTimesheet({
    employee: "Test, Person",
    payPeriod: { from: "07/16/26", to: "07/31/26" },
    days: [OFF_CLOCK_DAY],
  });
  const { bytes } = await renderCorrected(sheet, { printedBy: "Test", generatedOn: "8/9/2026" });
  const words = await pdfWords(bytes);

  assert.ok(words.includes("+0.17 added"), "the day is marked");
  assert.ok(/ADDED: 0\.17 hrs on top of the export/.test(words), "and the total is explained");
  assert.ok(/paid as overtime/.test(words), "including that it is overtime");
  assert.ok(/clocked out/.test(words), "and why the minutes were owed");
});

test("a sheet with nothing added says nothing about adding", async () => {
  // otherwise the paragraph above is just always on the page and proves nothing
  const sheet = analyzeTimesheet({
    employee: "Test, Person",
    payPeriod: { from: "07/16/26", to: "07/31/26" },
    days: [{
      ...OFF_CLOCK_DAY,
      restTimes: [
        { out: 10 * 60, in: 10 * 60 + 10 },
        { out: 14 * 60, in: 14 * 60 + 10 },
      ],
    }],
  });
  assert.equal(sheet.totals.addedHours, 0);
  const { bytes } = await renderCorrected(sheet, { printedBy: "Test", generatedOn: "8/9/2026" });
  const words = await pdfWords(bytes);
  assert.ok(!/ADDED:/.test(words), "no claim of added hours");
  assert.ok(!/added/.test(words.split("\n").filter((l) => l.includes("+")).join("\n")));
});

// APRIL'S SHEET, THE CASE THAT CAUGHT THE ROUNDING. Eleven days of exactly
// 8.00 with a ten-minute rest recorded before each shift started. Every one of
// those minutes is past the eighth hour, so the added hours and the added
// overtime must be the SAME number. They read 1.87 against 1.83 while
// analyzeDay rounded each day to 0.17 before they were summed.
test("eleven ten-minute additions on eight-hour days are all overtime, and say so", () => {
  const day = (date) => ({
    date, punches: [at(8), at(16)], printed: { daily: 8 },
    restRecorded: 2, restsAlreadyPaid: true,
    restTimes: [
      { out: 7 * 60, in: 7 * 60 + 10 },        // before clock-in, like hers
      { out: 12 * 60 + 30, in: 12 * 60 + 40 }, // on the clock
    ],
  });
  const dates = ["07/16/26","07/17/26","07/20/26","07/21/26","07/22/26","07/23/26",
                 "07/24/26","07/27/26","07/28/26","07/29/26","07/30/26"];
  const t = analyzeTimesheet({
    payPeriod: { from: "07/16/26", to: "07/31/26" },
    days: dates.map(day),
  });
  assert.equal(t.totals.addedHours, 1.83);
  assert.equal(t.totals.addedOtHours, 1.83, "all of it is past eight hours");
  assert.equal(t.totals.addedHours, t.totals.addedOtHours);
});
