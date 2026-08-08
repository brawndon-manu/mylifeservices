// The rule: the signed sheet colours only official rest periods and meal
// breaks, from the Rest Periods Report and the month schedule. A gap between
// punches is not evidence of a break.
//
// Every case here came off Mánu's own 13 days, where he rebuilt the sheet by
// hand from the two source documents and it disagreed with ours five ways.
import { test } from "node:test";
import assert from "node:assert/strict";

import { recordedBreaksFor, shortTime } from "../recorded-breaks.js";
import { renderCorrected } from "../render.js";

const SCHED = {
  // 07/31: an 8a-9:30a block, a 10a-12p booking, a rostered meal, then misc.
  // The punches that day are 8a 9:30a 10a 12p 1p 4p, so the meal sits INSIDE
  // the 12p-1p gap and the 9:30a-10a gap is a booking transition, not a meal.
  "07/31/26": {
    shifts: [
      { meal: false, text: "8a-9:30a -ILS Admin(1:30)" },
      { meal: false, text: "10a-12p Rincon, R-ILS Service (2:00)" },
      { meal: true, text: "12:20p-12:50p -Meal Break(0:30)" },
      { meal: false, text: "1p-4p -ILS Misc(3:00)" },
    ],
  },
  "07/16/26": {
    shifts: [
      { meal: false, text: "11a-1p Rincon, R-ILS Service (2:00)" },
      { meal: false, text: "1:15p-3:15p Moore, R-ILS Service(2:00)" },
    ],
  },
};

const RESTS = [
  { name: "Uribe, Brandon", date: "07/31/26", out: "12:00 PM", in: "12:10 PM", minutes: 10, counted: true, reversed: false, kind: null },
  { name: "Uribe, Brandon", date: "07/27/26", out: "12:10 PM", in: "12:00 PM", minutes: 10, counted: true, reversed: true, kind: "reversed-repaired" },
  { name: "Martinez, Jose", date: "07/23/26", out: "3:50 PM", in: "3:00 PM", minutes: 50, counted: false, reversed: true, kind: "too-long" },
];

test("a meal comes from the SCHEDULE's times, not from a punch gap", () => {
  const m = recordedBreaksFor("Uribe, Brandon", RESTS, SCHED);
  // the punches that day gap 12p-1p; the roster says 12:20p-12:50p
  assert.deepEqual(m.get("07/31/26").meals, [{ from: "12:20p", to: "12:50p" }]);
});

test("a booking transition is NOT a meal", () => {
  // 07/16 rosters two bookings with a 1p-1:15p gap between them. The old
  // renderer coloured that gap; nothing rostered it, so nothing is recorded.
  const m = recordedBreaksFor("Uribe, Brandon", RESTS, SCHED);
  assert.equal(m.get("07/16/26")?.meals.length ?? 0, 0);
  assert.equal(m.get("07/16/26")?.rests.length ?? 0, 0);
});

test("a rest comes from the report, on a day with no punch gap at all", () => {
  // 204 of the 226 days carrying a logged rest have no gap - a properly taken
  // rest is paid and stays on the clock. This is the whole reason for the column.
  const m = recordedBreaksFor("Uribe, Brandon", RESTS, SCHED);
  assert.deepEqual(m.get("07/27/26").rests[0].from, "12p");
  assert.equal(m.get("07/27/26").rests[0].counted, true);
});

test("a REVERSED row is flipped for display", () => {
  // 07/27 is stored out 12:10 PM, in 12:00 PM. Printed in stored order it read
  // "12:10p-12p" - a break ending before it starts, in the column that is
  // supposed to be the trustworthy one.
  const m = recordedBreaksFor("Uribe, Brandon", RESTS, SCHED);
  const r = m.get("07/27/26").rests[0];
  assert.equal(`${r.from}-${r.to}`, "12p-12:10p");
});

test("a row that did not count is present but not marked as taken", () => {
  const m = recordedBreaksFor("Martinez, Jose", RESTS, SCHED);
  const r = m.get("07/23/26").rests[0];
  assert.equal(r.counted, false, "so the renderer leaves it uncoloured and marks it");
  assert.equal(r.kind, "too-long");
});

test("entries are ordered by CLOCK TIME, not meals-then-rests", () => {
  // Mánu's 07/27 listed the 2p meal above the 12p rest because meals were
  // collected first, which reads as though the day happened in that order.
  const sched = { "07/27/26": { shifts: [{ meal: true, text: "2p-2:30p -Meal Break(0:30)" }] } };
  const m = recordedBreaksFor("Uribe, Brandon", RESTS, sched);
  assert.deepEqual(
    m.get("07/27/26").order.map((e) => `${e.kindOf} ${e.from}`),
    ["rest 12p", "meal 2p"],
  );
});

test("shortTime normalises the report's clock format to the sheet's", () => {
  assert.equal(shortTime("3:50 PM"), "3:50p");
  assert.equal(shortTime("12:00 PM"), "12p");
  assert.equal(shortTime("11:20 AM"), "11:20a");
});

test("the sheet is PORTRAIT and draws breaks on the punch cells", async () => {
  // Portrait because most people open this on a phone. It fits because the
  // Breaks column is gone: a recorded break is drawn on the cell it happened
  // in, which is where somebody looks for it.
  const out = await renderCorrected(
    {
      employee: "Uribe, Brandon",
      payPeriod: { from: "07/16/26", to: "07/31/26" },
      days: [
        {
          // clocked in 10a-2p straight through, with a rest logged 12:00-12:10.
          // there is no punch gap, so the rest has to SPLIT the worked segment.
          date: "07/27/26", paidHours: 7, rawHours: 7, regularHours: 7, otHours: 0, doubleHours: 0,
          punches: [{ min: 600, raw: "10a" }, { min: 840, raw: "2p" }],
          breaks: [], restRequired: 2, restTaken: 1, restViolation: true, mealViolation: false,
        },
      ],
      totals: { rawHours: 7, paidHours: 7, regularHours: 7, otHours: 0, doubleHours: 0 },
      premiums: { mealHours: 0, restHours: 1, totalHours: 1, mealDays: [], restDays: ["07/27/26"] },
      restsByDate: [
        { name: "Uribe, Brandon", date: "07/27/26", out: "12:00 PM", in: "12:10 PM",
          minutes: 10, counted: true, reversed: false, kind: null },
      ],
      scheduleByDate: null,
    },
    { printedBy: "Uribe, Brandon", generatedOn: "8/8/2026" },
  );

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: out.bytes, useSystemFonts: false, isEvalSupported: false }).promise;
  const page = await doc.getPage(1);
  const vp = page.getViewport({ scale: 1 });
  assert.ok(vp.height > vp.width, `portrait, got ${vp.width}x${vp.height}`);

  const words = (await page.getTextContent()).items.map((i) => i.str).join(" ");
  assert.match(words, /July 2nd Half 2026/, "the month is said once, above the table");
  assert.match(words, /27th/, "the date column holds a day, not a whole date");
  // the premium table below still names the days in full - "Workdays with
  // Violation" is a legal statement and 27th on its own is not a date - so the
  // full form is expected to appear, just not in the date column.
  assert.match(words, /Reg/, "Reg Hours, not Regular Hours");
  assert.match(words, /Over/, "Over Time is always present");
  assert.doesNotMatch(words, /Breaks/, "the Breaks column is gone");
  // the rest was inserted INTO the punch row, so its times are punches now
  assert.match(words, /12:10p/, "the recorded rest appears in the punch cells");
});

test("inserting a rest into a worked segment does not move the day total", async () => {
  // 10a-2p is four hours. Splitting it at 12:00-12:10 gives 10a-12p, 12p-12:10p,
  // 12:10p-2p, which is still four hours. If this ever stops being true, the
  // punch row and the Daily Total on the same line disagree.
  const { insertRecordedBreaks } = await import("../recorded-breaks.js");
  const punches = [{ min: 600, raw: "10a" }, { min: 840, raw: "2p" }];
  const { punches: shown, unplaced } = insertRecordedBreaks(punches, [
    { kindOf: "rest", from: "12p", to: "12:10p", counted: true },
  ]);
  const worked = (p) => { let n = 0; for (let i = 0; i + 1 < p.length; i += 2) n += p[i + 1].min - p[i].min; return n; };
  assert.equal(worked(shown), worked(punches), "240 minutes before and after");
  assert.equal(unplaced.length, 0);
  assert.deepEqual(shown.map((x) => x.raw), ["10a", "12p", "12p", "12:10p", "12:10p", "2p"]);
  assert.deepEqual(shown.map((x) => x.mark), [null, null, "rest", "rest", null, null]);
});

test("a break inside a LONGER gap colours the gap and is not inserted", async () => {
  // 07/28: the gap is 12p-12:15p and the rest is 12:00-12:10. Inserting punches
  // inside unpaid time would claim hours nobody worked.
  const { insertRecordedBreaks } = await import("../recorded-breaks.js");
  const punches = [
    { min: 600, raw: "10a" }, { min: 720, raw: "12p" },
    { min: 735, raw: "12:15p" }, { min: 855, raw: "2:15p" },
  ];
  const { punches: shown, unplaced } = insertRecordedBreaks(punches, [
    { kindOf: "rest", from: "12p", to: "12:10p", counted: true },
  ]);
  assert.equal(shown.length, punches.length, "nothing inserted");
  assert.deepEqual(shown.map((x) => x.mark), [null, "rest", "rest", null], "the gap is coloured");
  assert.equal(unplaced[0]?.why, "inside a longer gap", "and it says so in a footnote");
});

// The claim the whole render-on-demand change rests on: the unsigned sheet is a
// pure function of what the database holds, so building it at download time
// gives the SAME document as building it at upload time. If that is not true,
// the sheet somebody signs is not the sheet we generated.
test("rendering the same stored sheet twice produces identical bytes", async () => {
  const { renderSheet } = await import("../render-sheet.js");
  const ts = {
    id: "t1",
    sourceName: "Uribe, Brandon",
    batch: { periodFrom: "07/16/26", periodTo: "07/31/26", restsByDate: RESTS },
    data: {
      generatedOn: "8/7/2026",
      payPeriod: { from: "07/16/26", to: "07/31/26" },
      premiums: { mealHours: 0, restHours: 1, totalHours: 1, mealDays: [], restDays: ["07/31/26"] },
      scheduleCheck: { byDate: SCHED },
      days: [
        {
          date: "07/31/26", paidHours: 6.5, rawHours: 6.5, regularHours: 6.5, otHours: 0, doubleHours: 0,
          punches: [{ min: 480, raw: "8a" }, { min: 720, raw: "12p" }],
          breaks: [], restRequired: 2, restTaken: 1, restViolation: true, mealViolation: false,
        },
      ],
    },
  };

  const a = await renderSheet(ts);
  const b = await renderSheet(ts);
  assert.equal(Buffer.compare(Buffer.from(a.bytes), Buffer.from(b.bytes)), 0, "byte-identical");
  assert.deepEqual(a.approvalRect, b.approvalRect);
});

test("the generation date is frozen, not taken from the clock", async () => {
  const { renderSheet } = await import("../render-sheet.js");
  const base = {
    id: "t1", sourceName: "Uribe, Brandon",
    batch: { periodFrom: "07/16/26", periodTo: "07/31/26", restsByDate: [] },
    data: {
      payPeriod: { from: "07/16/26", to: "07/31/26" },
      premiums: { mealHours: 0, restHours: 0, totalHours: 0, mealDays: [], restDays: [] },
      days: [{ date: "07/31/26", paidHours: 6.5, rawHours: 6.5, regularHours: 6.5, otHours: 0, doubleHours: 0, punches: [], breaks: [] }],
    },
  };
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const wordsOf = async (bytes) => {
    const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: false, isEvalSupported: false }).promise;
    let w = "";
    for (let i = 1; i <= doc.numPages; i++) w += (await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(" ");
    return w;
  };
  const stamped = await wordsOf((await renderSheet({ ...base, data: { ...base.data, generatedOn: "1/2/2020" } })).bytes);
  assert.match(stamped, /1\/2\/2020/, "prints the stored date");

  // and WITHOUT a stored stamp it falls back to today - which is the bug this
  // guards: 59 sheets had no generatedOn, so every download would have carried
  // a different date from the last one.
  const today = new Date().toLocaleDateString("en-US");
  const unstamped = await wordsOf((await renderSheet(base)).bytes);
  assert.match(unstamped, new RegExp(today.replace(/\//g, "\/")), "falls back to today when unstamped");
});
