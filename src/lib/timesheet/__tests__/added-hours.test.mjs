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

// A SMOKE TEST, AND HONEST ABOUT BEING ONE.
//
// The ADDED paragraph was appended without asking for vertical room first, so
// on the longest sheet in the batch it ran into the footer and the layout guard
// threw. Brandon Uribe's was the only one of 59 that could not be built on the
// 2026-08-09 re-upload: 13 days and 4 footnotes left 31.1pt where the footer
// starts at 40.
//
// THIS TEST DOES NOT REPRODUCE THAT. Three attempts tried - one fixed length,
// then footnotes added, then a sweep of every length from 6 to 16 days - and
// all three passed with the fix REMOVED. The overflow window is narrower than
// synthetic days reach: it needs his real mix of continuation rows and a
// premium table whose date list wraps. Building a fixture faithful enough would
// mean committing a real person's hours to a PUBLIC repo, which is not worth
// it.
//
// So this covers the ordinary case only, and the REAL check for this class is
// `docs/week9/scratch/render-all.mjs`, which renders all 59 sheets of the live
// batch and is what both found the bug and proved the fix. Run it after any
// change to render.js.
test("sheets of every ordinary length render with the added paragraph on them", async () => {
  const build = (n) => {
    const days = [];
    for (let i = 0; i < n; i++) {
      const date = `07/${String(16 + i).padStart(2, "0")}/26`;
      days.push({
        date,
        punches: [at(8), at(12), at(12, 30), at(17)],
        printed: null,
        restRecorded: 1,
        restsAlreadyPaid: true,
        restTimes: [{ out: 10 * 60, in: 10 * 60 + 10 }, { out: 17 * 60 + 30, in: 17 * 60 + 40 }],
      });
    }
    return analyzeTimesheet({
      employee: "Uribe, Brandon",
      payPeriod: { from: "07/16/26", to: "07/31/26" },
      days,
    });
  };

  const failures = [];
  for (let n = 6; n <= 16; n++) {
    const sheet = build(n);
    assert.ok(sheet.totals.addedHours > 0, `n=${n} must carry the paragraph`);
    // the footnotes are half the reason his sheet was long: each rest that
    // cannot be placed against a punch adds a line under the table.
    const restsByDate = sheet.days.map((d) => ({
      name: "Uribe, Brandon", date: d.date, counted: true, out: "5:30 PM", in: "5:40 PM",
    }));
    const scheduleByDate = Object.fromEntries(
      sheet.days.map((d) => [d.date, { shifts: [{ start: "8:00 AM", end: "5:00 PM", client: "A client" }] }]),
    );
    try {
      const { bytes } = await renderCorrected(
        { ...sheet, restsByDate, scheduleByDate },
        { printedBy: "Uribe, Brandon", generatedOn: "8/9/2026" },
      );
      if (!(bytes?.length > 0)) failures.push(`${n} days: empty`);
    } catch (e) {
      failures.push(`${n} days: ${e.message}`);
    }
  }
  assert.deepEqual(failures, [], "every length must produce a sheet");
});

// THE SHEET AN EMPLOYEE ACTUALLY OPENS is built on demand from stored days by
// renderSheet, NOT by the upload. It assembles its own totals, and it was
// assembling them without addedHours - so every affected day printed
// "+0.17 added" and nothing on the page said what that meant. The explanation
// existed only in the test above, which rendered from a fresh parse.
test("the on-demand sheet carries the added paragraph too, not just the day marks", async () => {
  const { renderSheet } = await import("../render-sheet.js");
  const sheet = analyzeTimesheet({
    employee: "Test, Person",
    payPeriod: { from: "07/16/26", to: "07/31/26" },
    days: [OFF_CLOCK_DAY, { ...OFF_CLOCK_DAY, date: "07/21/26" }],
  });
  // stored days are what renderSheet is handed, so hand it those
  const { storedDay } = await import("../stored.js");
  const ts = {
    sourceName: "Test, Person",
    data: {
      days: sheet.days.map(storedDay),
      payPeriod: { from: "07/16/26", to: "07/31/26" },
      premiums: sheet.premiums,
    },
    batch: { periodFrom: "07/16/26", periodTo: "07/31/26", restsByDate: [] },
  };
  const out = await renderSheet(ts);
  const words = await pdfWords(out.bytes);
  assert.ok(/\+0\.17 added/.test(words), "the day marks");
  assert.ok(/ADDED:/.test(words), "AND the sentence explaining them");
  assert.ok(/paid as overtime/.test(words), "including the overtime split");
});

// THE SHEET WINS. Mánu 2026-08-09.
//
// A timesheet is signed by somebody who will add up the daily column, so the
// printed total has to equal that column. It did not: April's eleven days of
// 8.1667 print as 8.17 and sum to 89.87, while rounding the unrounded sum once
// gives 89.83. Her sheet showed 89.87 against a stored 89.83, in three places
// at once - the Totals row, the overtime column and the ADDED line - and 15 of
// 59 sheets in the batch disagreed with themselves the same way.
test("stored totals equal the sum of the days as printed, not the rounded true sum", async () => {
  const { totalsFromDays } = await import("../stored.js");
  const { storedDay } = await import("../stored.js");
  // eleven eight-hour days, each gaining a ten-minute off-clock rest
  const day = (date) => ({
    date, punches: [at(8), at(16)], printed: { daily: 8 },
    restRecorded: 2, restsAlreadyPaid: true,
    restTimes: [{ out: 7 * 60, in: 7 * 60 + 10 }, { out: 12 * 60, in: 12 * 60 + 10 }],
  });
  const dates = ["07/16/26","07/17/26","07/20/26","07/21/26","07/22/26","07/23/26",
                 "07/24/26","07/27/26","07/28/26","07/29/26","07/30/26"];
  const sheet = analyzeTimesheet({
    payPeriod: { from: "07/16/26", to: "07/31/26" }, days: dates.map(day),
  });
  const days = sheet.days.map(storedDay);
  const printed = totalsFromDays(days);

  // every day prints 8.17, and eleven of them is 89.87
  assert.deepEqual([...new Set(days.map((d) => d.paidHours))], [8.17]);
  assert.equal(printed.paidHours, 89.87, "what the column adds up to");

  // and that is NOT the same as rounding the unrounded sum once, which is the
  // figure that used to be stored. If these ever match, this test is asleep.
  assert.equal(Math.round(sheet.totals.paidHours * 100) / 100, 89.83);
  assert.notEqual(printed.paidHours, Math.round(sheet.totals.paidHours * 100) / 100);
});
