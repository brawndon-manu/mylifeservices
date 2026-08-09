// The rule: the signed sheet colours only official rest periods and meal
// breaks, from the Rest Periods Report and the month schedule. A gap between
// punches is not evidence of a break.
//
// Every case here came off Mánu's own 13 days, where he rebuilt the sheet by
// hand from the two source documents and it disagreed with ours five ways.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  recordedBreaksFor, shortTime, insertRecordedBreaks, withStatedRest,
} from "../recorded-breaks.js";
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

test("a rest inside a worked segment is drawn as a clock-out and a clock-back-in", () => {
  // Mánu 2026-08-09: "it has to be time out and then time in... ten AM clock
  // in, twelve PM clock out, twelve ten PM clock in, two PM clock out."
  const punches = [{ min: 600, raw: "10a" }, { min: 840, raw: "2p" }];
  const { punches: shown } = insertRecordedBreaks(punches, [
    { kindOf: "rest", from: "12p", to: "12:10p", counted: true },
  ]);
  assert.deepEqual(shown.map((x) => x.raw), ["10a", "12p", "12:10p", "2p"]);
  assert.deepEqual(shown.map((x) => x.mark), [null, "rest", "rest", null]);
});

// THE TRADE THIS MAKES, AND IT IS DELIBERATE.
//
// Drawing the break as a gap means the punch pairs no longer add up to the
// Daily Total: 10a-12p and 12:10p-2p is 230 minutes against a paid 240. The ten
// minutes are paid and ARE in the total; they are simply not between a punch
// pair any more, because the person was not clocked in for them.
//
// The previous shape split the segment into three pairs so the arithmetic
// closed, at the cost of printing a row that read as though somebody clocked IN
// at noon to start a break. The colour key carries the explanation: "Hours
// include paid rest break time."
test("the punch pairs come to LESS than the paid day, by exactly the rest", () => {
  const punches = [{ min: 600, raw: "10a" }, { min: 840, raw: "2p" }];
  const { punches: shown } = insertRecordedBreaks(punches, [
    { kindOf: "rest", from: "12p", to: "12:10p", counted: true },
  ]);
  const worked = (p) => { let n = 0; for (let i = 0; i + 1 < p.length; i += 2) n += p[i + 1].min - p[i].min; return n; };
  assert.equal(worked(punches), 240, "paid, and what the Daily Total shows");
  assert.equal(worked(shown), 230, "what the printed pairs come to");
  assert.equal(worked(punches) - worked(shown), 10, "the difference IS the rest");
});

test("a REST inside a longer gap is inserted, striped, and the rest of the gap is left alone", () => {
  // Your 28th: clocked out 12p-12:15p, ten minute rest recorded at 12p-12:10p.
  // Mánu 2026-08-09 - those minutes are being ADDED to the day, so the sheet
  // shows them as their own in and out. The extra five minutes are ordinary
  // rostered unpaid time: "if there are gaps in the schedule, we just don't
  // acknowledge it."
  const punches = [
    { min: 600, raw: "10a" }, { min: 720, raw: "12p" },
    { min: 735, raw: "12:15p" }, { min: 855, raw: "2:15p" },
  ];
  const { punches: shown, unplaced } = insertRecordedBreaks(punches, [
    { kindOf: "rest", from: "12p", to: "12:10p", counted: true },
  ]);
  assert.deepEqual(shown.map((x) => x.raw), ["10a", "12p", "12p", "12:10p", "12:15p", "2:15p"]);
  assert.deepEqual(shown.map((x) => x.mark), [null, null, "added", "added", null, null]);
  assert.equal(unplaced.length, 0, "the colour says it; no per-date sentence");
});

test("a MEAL inside a longer gap gets its own two cells, at its real times", () => {
  // Mánu 2026-08-09: a break with a start and an end always has two cells. The
  // meal used to tint whatever punches bounded the gap and footnote the real
  // times underneath; now the real times ARE the cells.
  const punches = [
    { min: 600, raw: "10a" }, { min: 720, raw: "12p" },
    { min: 780, raw: "1p" }, { min: 900, raw: "3p" },
  ];
  const { punches: shown, unplaced } = insertRecordedBreaks(punches, [
    { kindOf: "meal", from: "12p", to: "12:30p", counted: true },
  ]);
  assert.deepEqual(shown.map((x) => x.raw), ["10a", "12p", "12p", "12:30p", "1p", "3p"]);
  assert.deepEqual(shown.map((x) => x.mark), [null, null, "meal", "meal", null, null]);
  assert.equal(unplaced.length, 0, "the cells say it; no per-date sentence");

  // and the opposite: a meal that IS the gap adds nothing, because both punches
  // are already on the row. Without this the check above would pass for a
  // renderer that inserted a pair every single time.
  const flush = insertRecordedBreaks(punches, [
    { kindOf: "meal", from: "12p", to: "1p", counted: true },
  ]);
  assert.equal(flush.punches.length, punches.length, "nothing inserted");
  assert.deepEqual(flush.punches.map((x) => x.mark), [null, "meal", "meal", null]);
});

test("a rest recorded before the shift starts is inserted ahead of it, striped", () => {
  // April: 7:00-7:10 against an 8:00 start, eleven days running.
  const punches = [
    { min: 480, raw: "8a" }, { min: 660, raw: "11a" },
    { min: 720, raw: "12p" }, { min: 1020, raw: "5p" },
  ];
  const { punches: shown, unplaced } = insertRecordedBreaks(punches, [
    { kindOf: "rest", from: "7a", to: "7:10a", counted: true },
  ]);
  assert.deepEqual(shown.map((x) => x.raw), ["7a", "7:10a", "8a", "11a", "12p", "5p"]);
  assert.deepEqual(shown.map((x) => x.mark), ["added", "added", null, null, null, null]);
  assert.equal(unplaced.length, 0);
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

// MÁNU'S OWN CELL-BY-CELL LAYOUT, 2026-08-09. He gave the colours rather than
// symbols: *** yellow, **** hazard-striped yellow, ***** blue.
test("his 30th: a rest QSP logged as its own entry splits into zero-length pairs", () => {
  // 10a | 12p | 12p | 12p*** | 12:10p*** | 12:10p | 2p | 4p
  //                   ^^^^^^^^^^^^^^^^^^ the break, yellow
  //
  // QSP cannot hold a rest as its own entry, so misc time was logged for exactly
  // its duration. Splitting anyway leaves a zero-length pair either side, which
  // is the honest shape: those punches ARE what QSP holds, and the break is the
  // gap between them.
  const punches = [
    { min: 600, raw: "10a" }, { min: 720, raw: "12p" },
    { min: 720, raw: "12p" }, { min: 730, raw: "12:10p" },
    { min: 840, raw: "2p" }, { min: 960, raw: "4p" },
  ];
  const { punches: shown } = insertRecordedBreaks(punches, [
    { kindOf: "rest", from: "12p", to: "12:10p", counted: true },
  ]);
  assert.deepEqual(shown.map((x) => x.raw),
    ["10a", "12p", "12p", "12p", "12:10p", "12:10p", "2p", "4p"]);
  assert.deepEqual(shown.map((x) => x.mark),
    [null, null, null, "rest", "rest", null, null, null]);
});

test("his 27th: rest yellow on the gap, meal blue on the gap, six cells", () => {
  // 10a | 12p*** | 12:10p*** | 2p***** | 2:30p***** | 5:30p
  const punches = [
    { min: 600, raw: "10a" }, { min: 840, raw: "2p" },
    { min: 870, raw: "2:30p" }, { min: 1050, raw: "5:30p" },
  ];
  const { punches: shown } = insertRecordedBreaks(punches, [
    { kindOf: "rest", from: "12p", to: "12:10p", counted: true },
    { kindOf: "meal", from: "2p", to: "2:30p", counted: true },
  ]);
  assert.deepEqual(shown.map((x) => x.raw), ["10a", "12p", "12:10p", "2p", "2:30p", "5:30p"]);
  assert.deepEqual(shown.map((x) => x.mark), [null, "rest", "rest", "meal", "meal", null]);
});

test("a reversed row is still admitted to, in a footnote", () => {
  // Mánu asked for this by name: a repair nobody is told about is a silent edit
  // to a wage document.
  const punches = [{ min: 600, raw: "10a" }, { min: 840, raw: "2p" }];
  const { unplaced } = insertRecordedBreaks(punches, [
    { kindOf: "rest", from: "12p", to: "12:10p", counted: true, reversed: true },
  ]);
  assert.equal(unplaced[0]?.why, "reversed in the report");

  // and a row that was not reversed says nothing, or the note means nothing
  const clean = insertRecordedBreaks(punches, [
    { kindOf: "rest", from: "12p", to: "12:10p", counted: true },
  ]);
  assert.equal(clean.unplaced.length, 0);
});

test("a meal never repaints a cell an added rest already claimed", () => {
  // Uribe's 31st: punches 10a-12p then 1p-4p, a ten recorded 12p-12:10p inside
  // the clock-out, and the rostered meal 12:20p-12:50p inside what is left of
  // it. The 12:10p cell ends the added rest AND opens the meal's gap. It has to
  // stay striped: that is the colour that means minutes were added to the pay.
  const punches = [
    { min: 600, raw: "10a" }, { min: 720, raw: "12p" },
    { min: 780, raw: "1p" }, { min: 960, raw: "4p" },
  ];
  const { punches: shown } = insertRecordedBreaks(punches, [
    { kindOf: "rest", from: "12p", to: "12:10p", counted: true },
    { kindOf: "meal", from: "12:20p", to: "12:50p", counted: true },
  ]);
  // his layout, cell for cell
  assert.deepEqual(shown.map((x) => x.raw),
    ["10a", "12p", "12p", "12:10p", "12:20p", "12:50p", "1p", "4p"]);
  assert.deepEqual(shown.map((x) => x.mark),
    [null, null, "added", "added", "meal", "meal", null, null]);

  // and with no rest in the way the meal still lands on its own times, or the
  // check above is just asserting that meals never paint.
  const mealOnly = insertRecordedBreaks(punches, [
    { kindOf: "meal", from: "12:20p", to: "12:50p", counted: true },
  ]);
  assert.deepEqual(mealOnly.punches.map((x) => x.raw),
    ["10a", "12p", "12:20p", "12:50p", "1p", "4p"]);
  assert.deepEqual(mealOnly.punches.map((x) => x.mark),
    [null, null, "meal", "meal", null, null]);
});

test("a rest the engine refused is footnoted, not striped", () => {
  // The stripe says minutes were added. `counted:false` means none were, so
  // striping one tells the person we paid them time we did not pay them.
  const punches = [
    { min: 600, raw: "10a" }, { min: 720, raw: "12p" },
    { min: 780, raw: "1p" }, { min: 960, raw: "4p" },
  ];
  const entry = { kindOf: "rest", from: "12p", to: "12:10p", minutes: 10 };

  const refused = insertRecordedBreaks(punches, [{ ...entry, counted: false }]);
  assert.deepEqual(refused.punches.map((x) => x.raw), ["10a", "12p", "1p", "4p"]);
  assert.deepEqual(refused.punches.map((x) => x.mark), [null, null, null, null]);
  assert.equal(refused.unplaced.length, 1);
  assert.equal(refused.unplaced[0].why, "not counted as a rest");

  // the SAME entry counted is still drawn, or the check above passes for a
  // renderer that simply stopped striping anything.
  const kept = insertRecordedBreaks(punches, [{ ...entry, counted: true }]);
  assert.deepEqual(kept.punches.map((x) => x.raw), ["10a", "12p", "12p", "12:10p", "1p", "4p"]);
  assert.deepEqual(kept.punches.map((x) => x.mark),
    [null, null, "added", "added", null, null]);
  assert.equal(kept.unplaced.length, 0);

  // and an entry that never mentions `counted` is drawn, so the guard cannot
  // quietly swallow a caller that does not set the flag.
  const silent = insertRecordedBreaks(punches, [entry]);
  assert.equal(silent.punches.length, 6);
});

test("a 730-minute rest never appends a punch past the end of the day", () => {
  // Romero-Alba's 30th. QSP's report holds 10:10a-10:20p, twelve hours, which
  // fits no worked segment and no unpaid gap. It fell through to the
  // outside-every-punch branch and was appended AFTER the last punch, so the row
  // printed 4p, then 10:10a, then 10:20p - backwards, and ending on a punch she
  // never made. It also swallowed the real meal: the 12:30p-1p entry then fitted
  // inside the phantom 10:10a-10:20p pair and split THAT.
  const punches = [
    { min: 420, raw: "7a" }, { min: 540, raw: "9a" },
    { min: 600, raw: "10a" }, { min: 720, raw: "12p" },
    { min: 780, raw: "1p" }, { min: 960, raw: "4p" },
  ];
  const { punches: shown, unplaced } = insertRecordedBreaks(punches, [
    { kindOf: "rest", from: "10:10a", to: "10:20p", minutes: 730, counted: false },
    { kindOf: "meal", from: "12:30p", to: "1p" },
  ]);

  // the row ends where the day did, and carries only punches QSP holds plus the
  // meal's own two cells (12:30p-1p is flush against the 1p clock-in, so the 1p
  // repeats - see the half-flush note on insertRecordedBreaks)
  assert.deepEqual(shown.map((x) => x.raw),
    ["7a", "9a", "10a", "12p", "12:30p", "1p", "1p", "4p"]);
  assert.ok(shown.every((x) => x.min <= 960), "no punch past the last clock-out");
  assert.ok(shown.every((x, i) => i === 0 || x.min >= shown[i - 1].min),
    "punches never run backwards");
  assert.ok(!shown.some((x) => x.mark === "added"), "nothing striped: nothing was added");

  // and the meal goes back where it belongs. It had been fitting inside the
  // phantom pair; with that gone it lands on the real 12p-1p clock-out, blue on
  // both bounding cells, with its exact times footnoted because the gap is longer
  // than the meal.
  assert.deepEqual(shown.map((x) => x.mark),
    [null, null, null, null, "meal", "meal", null, null]);
  assert.deepEqual(unplaced.map((u) => u.why), ["not counted as a rest"]);
});

// ---------------------------------------------------------------------------
// "yes, but not then" - the employee's own time for a break we guessed wrong
// ---------------------------------------------------------------------------

test("a stated rest goes in by CLOCK ORDER, not on the end", () => {
  // it has to meet the same first-claim-wins marking as everything else. Added
  // last, a stated rest at noon would paint after a 3pm meal and the two would
  // resolve in the wrong order.
  const order = [
    { kindOf: "meal", from: "3p", to: "3:30p" },
    { kindOf: "rest", from: "9a", to: "9:10a", counted: true },
  ];
  const merged = withStatedRest(order, { from: "12p", to: "12:10p", minutes: 10 });
  assert.deepEqual(merged.map((e) => e.from), ["9a", "12p", "3p"]);
  const stated = merged.find((e) => e.stated);
  assert.equal(stated.kindOf, "rest");
  assert.equal(stated.counted, true, "it counts, or the guard would drop it");
});

test("no stated rest leaves the order untouched", () => {
  const order = [{ kindOf: "rest", from: "9a", to: "9:10a", counted: true }];
  assert.equal(withStatedRest(order, null), order);
  assert.deepEqual(withStatedRest(order, { from: "" }), order);
});

test("a stated rest inside worked time is a plain rest; outside it is PAID and striped", () => {
  // Mánu 2026-08-09, on a time the employee gives us that falls in a clock-out:
  // "Accept it, add the minutes" - the same off-clock rule as any other rest.
  const punches = [
    { min: 600, raw: "10a" }, { min: 720, raw: "12p" },
    { min: 780, raw: "1p" }, { min: 960, raw: "4p" },
  ];

  // 11:00-11:10 is inside the worked 10a-12p segment: ordinary paid rest
  const inside = insertRecordedBreaks(
    punches, withStatedRest([], { from: "11a", to: "11:10a", minutes: 10 }),
  );
  assert.deepEqual(inside.punches.map((x) => x.raw),
    ["10a", "11a", "11:10a", "12p", "1p", "4p"]);
  assert.deepEqual(inside.punches.map((x) => x.mark),
    [null, "rest", "rest", null, null, null]);

  // 12:30-12:40 is inside the 12p-1p CLOCK-OUT: those minutes are being added,
  // so they are striped rather than plain yellow
  const outside = insertRecordedBreaks(
    punches, withStatedRest([], { from: "12:30p", to: "12:40p", minutes: 10 }),
  );
  assert.deepEqual(outside.punches.map((x) => x.raw),
    ["10a", "12p", "12:30p", "12:40p", "1p", "4p"]);
  assert.deepEqual(outside.punches.map((x) => x.mark),
    [null, null, "added", "added", null, null]);
});

// every word on a rendered page, so a claim about the document is checked
// against the document rather than against the code that drew it
async function pdfText(bytes) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: bytes, useSystemFonts: false, isEvalSupported: false,
  }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    for (const it of (await (await doc.getPage(i)).getTextContent()).items) {
      if (it.str?.trim()) out.push(it.str.trim());
    }
  }
  return out.join(" ");
}

test("the sheet says a stated time came from the employee", async () => {
  const day = {
    date: "07/27/26", paidHours: 6, rawHours: 6, regularHours: 6, otHours: 0,
    punches: [
      { min: 600, raw: "10a" }, { min: 720, raw: "12p" },
      { min: 780, raw: "1p" }, { min: 960, raw: "4p" },
    ],
    statedRest: { from: "11a", to: "11:10a", minutes: 10 },
  };
  const out = await renderCorrected(
    {
      employee: "Test, Person",
      payPeriod: { from: "07/16/26", to: "07/31/26" },
      days: [day],
      totals: { rawHours: 6, paidHours: 6, regularHours: 6, otHours: 0, doubleHours: 0 },
      premiums: { mealDays: [], restDays: [], mealHours: 0, restHours: 0, totalHours: 0 },
      restsByDate: [],
    },
    { printedBy: "Test, Person", generatedOn: "8/9/2026" },
  );
  const text = await pdfText(out.bytes);
  assert.match(text, /you told us you took this rest break at 11a/,
    "the document has to say where a time no source document holds came from");

  // and a day WITHOUT one says nothing, or the check above passes for a sheet
  // that prints the sentence unconditionally
  const plain = await renderCorrected(
    {
      employee: "Test, Person",
      payPeriod: { from: "07/16/26", to: "07/31/26" },
      days: [{ ...day, statedRest: undefined }],
      totals: { rawHours: 6, paidHours: 6, regularHours: 6, otHours: 0, doubleHours: 0 },
      premiums: { mealDays: [], restDays: [], mealHours: 0, restHours: 0, totalHours: 0 },
      restsByDate: [],
    },
    { printedBy: "Test, Person", generatedOn: "8/9/2026" },
  );
  assert.doesNotMatch(await pdfText(plain.bytes), /you told us/);
});
