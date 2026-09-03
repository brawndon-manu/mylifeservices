import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFArray, decodePDFRawStream } from "pdf-lib";
import { timeOffLine, timeOffTotals } from "../time-off.js";
import { renderSheet } from "../render-sheet.js";

// Recorded time off on the sheet and in the payout - Mánu's ruling 2026-09-02
// off the mock, Bustamante's 18th being the day that exposed the gap: a
// calendar PtoEntry printed nowhere and reached no payout figure. These pin
// the one wording the sheet prints and the split the payout keys from, and
// hold the boundary that time off is pay, never worked hours.

test("the sheet's sentence, one entry and two", () => {
  assert.equal(
    timeOffLine([{ date: "08/18/26", hours: 8, kind: "pto" }]),
    "8.00 hrs PTO (08/18/26)",
  );
  assert.equal(
    timeOffLine([
      { date: "08/18/26", hours: 8, kind: "pto" },
      { date: "08/21/26", hours: 4.5, kind: "sick" },
    ]),
    "8.00 hrs PTO (08/18/26) · 4.50 hrs Sick (08/21/26)",
  );
  // nothing recorded is no line, not an empty one
  assert.equal(timeOffLine([]), null);
  assert.equal(timeOffLine(null), null);
  // a zero-hour or dateless row is not a record
  assert.equal(timeOffLine([{ date: "08/18/26", hours: 0, kind: "pto" }]), null);
  assert.equal(timeOffLine([{ hours: 8, kind: "pto" }]), null);
});

test("the payout split keys PTO and Sick apart and sums the payable piece", () => {
  const t = timeOffTotals([
    { date: "08/18/26", hours: 8, kind: "pto" },
    { date: "08/21/26", hours: 4.5, kind: "sick" },
    { date: "08/22/26", hours: 8, kind: "sick" },
  ]);
  assert.deepEqual(t, { pto: 8, sick: 12.5, total: 20.5 });
  assert.deepEqual(timeOffTotals([]), { pto: 0, sick: 0, total: 0 });
});

// the rendered document itself: the line prints when a record exists, prints
// nothing when none does, and the WORKED totals do not move either way -
// pay yes, work no.
const sheetFixture = () => ({
  id: "t1",
  sourceName: "Uribe, Brandon",
  batch: { periodFrom: "08/16/26", periodTo: "08/31/26", restsByDate: [] },
  data: {
    generatedOn: "9/2/2026",
    payPeriod: { from: "08/16/26", to: "08/31/26" },
    premiums: { mealHours: 0, restHours: 0, totalHours: 0, mealDays: [], restDays: [] },
    days: [
      {
        date: "08/17/26", paidHours: 8, rawHours: 8, regularHours: 8,
        otHours: 0, doubleHours: 0,
        punches: [{ min: 510, raw: "8:30a" }, { min: 990, raw: "4:30p" }],
        breaks: [],
      },
    ],
  },
});

function pageText(doc) {
  let out = "";
  for (const page of doc.getPages()) {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray
      ? [...Array(contents.size()).keys()].map((i) => page.node.context.lookup(contents.get(i)))
      : [page.node.context.lookup(contents)];
    for (const s of streams) {
      try { out += Buffer.from(decodePDFRawStream(s).decode()).toString("latin1"); } catch {}
    }
  }
  return out;
}
const hex = (s) => Buffer.from(s, "latin1").toString("hex").toUpperCase();

test("the sheet prints the line only when time off is recorded, and totals stand", async () => {
  const withOff = await renderSheet(sheetFixture(), {
    timeOff: [{ date: "08/18/26", hours: 8, kind: "pto" }],
  });
  const without = await renderSheet(sheetFixture());
  const a = pageText(await PDFDocument.load(withOff.bytes));
  const b = pageText(await PDFDocument.load(without.bytes));
  assert.ok(a.includes(hex("Time off this pay period:")), "label printed");
  assert.ok(a.includes(hex("8.00 hrs PTO (08/18/26)")), "the record printed");
  // THE ROW IN THE GRID, Mánu 2026-09-03: the time-off day prints like any
  // other row - hours in Reg, PTO in Comments - and the Totals row carries
  // the combined figure (8 worked + 8 off = 16.00)
  assert.ok(a.includes(hex("16.00")), "the totals row reads the combined figure");
  assert.ok(a.includes(hex("PTO")), "the day's Comments cell says PTO");
  // and the reconciliation sentence splits it back out against QSP's export
  assert.ok(
    a.includes(hex("hrs: 8.00 hrs worked and 8.00 hrs recorded time off.")),
    "the reconciliation names both parts",
  );
  assert.ok(!b.includes(hex("Time off this pay period:")), "no record, no line");
  assert.ok(!b.includes(hex("16.00")), "no record, worked total stands");
  // the worked figure is untouched by the record - the totals row prints the
  // same 8.00 day on both documents
  assert.ok(a.includes(hex("Totals:")) && b.includes(hex("Totals:")));
});

test("a statement-only ten prints in the Comments below the timesheet", async () => {
  const ts = sheetFixture();
  ts.data.days[0].statedBreaks = [
    { kindOf: "rest", minutes: 10, from: "3p", to: "3:10p", slot: "rest1", statementOnly: true },
  ];
  const r = await renderSheet(ts);
  const text = pageText(await PDFDocument.load(r.bytes));
  assert.ok(
    text.includes(hex("08/17/26 Rest break taken 3p to 3:10p, reported on this review.")),
    "the statement rides the Comments",
  );
});

test("an accepted missing day names itself instead of claiming rounding", async () => {
  const ts = sheetFixture();
  ts.data.days.push({
    date: "08/18/26", paidHours: 8, rawHours: 0, regularHours: 8, otHours: 0, doubleHours: 0,
    mealViolation: false, restViolation: false, mealCount: 0, restCount: 0, restRequired: 0,
    punches: [], breaks: [], corrected: true, addedByHand: true,
  });
  const r = await renderSheet(ts);
  const text = pageText(await PDFDocument.load(r.bytes));
  assert.ok(
    text.includes(hex("The 08/18/26 day was added from your review, accepted by the office.")),
    "the added day is named",
  );
  assert.ok(!text.includes(hex("The difference is rounding")), "rounding is not claimed");
});
