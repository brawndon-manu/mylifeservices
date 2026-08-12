// ONE PERSON, TWO NAMES, AND THE DISPLAYS THAT LOST HER BREAKS.
//
// QSP does not spell everybody the same way across its own exports. Ruth Delgado
// Pineda's Simple Timesheet says "Delgado Pineda, Ruth"; her Rest Periods Report
// says "Delgado Pineda, Angel", which is her preferred name. Her portal account
// carries both, so `lookupAcross` bridges them at UPLOAD and her hours and
// premium have always been right.
//
// Every DISPLAY then matched rest rows on the raw timesheet name and found
// nothing. The one that mattered: the Breaks column on her SIGNED SHEET came out
// empty while the engine had counted the break and charged her no premium - a
// payroll document contradicting itself. Her own timesheet page drew no rest
// blocks, and the checks screen printed a card about a rest with no times on it.
//
// The spelling was already stored - upload writes `lookupAcross`'s match into
// `readAs.rests` - so `restNameFor` reads it back and nothing needs re-uploading.
// These tests are about that one bridge holding in each place that draws.
import { test } from "node:test";
import assert from "node:assert/strict";

import { restNameFor, restRowTimes, serviceFit, restOffOwnShift } from "../rests.js";
import { recordedBreaksFor } from "../recorded-breaks.js";
import { buildQuestions } from "../questions.js";
import { buildEmployeeChecks } from "../employee-checks.js";
import { renderCorrected } from "../render.js";

// her three rows on 08/01-08/15, under the name only the rest report uses
const RESTS = [
  { name: "Delgado Pineda, Angel", date: "08/05/26", out: "12:00 PM", in: "12:10 PM", minutes: 10, counted: true, reversed: false, kind: null },
];

const SCHED = {
  "08/05/26": {
    shifts: [{ meal: false, text: "10a-2p Rincon, R-ILS Service (4:00)" }],
  },
};

// a stored sheet in her shape: the timesheet's spelling on the row, the rest
// report's spelling in the block upload wrote.
const DATA = {
  premiumSupport: {
    readAs: { clock: null, schedule: null, rests: { name: "Delgado Pineda, Angel", exact: true, confidence: 100 } },
  },
  days: [
    {
      date: "08/05/26",
      paidHours: 4, rawHours: 4, regularHours: 4, otHours: 0, doubleHours: 0,
      mealScheduled: false, mealRequired: false, mealViolation: false,
      restRequired: 1, restTaken: 1, restViolation: false, restCount: 1,
      punches: [{ raw: "10a", min: 600 }, { raw: "2p", min: 840 }],
      breaks: [],
    },
  ],
  scheduleCheck: { byDate: SCHED },
};

test("the stored spelling is what the rest report used, not what the sheet prints", () => {
  assert.equal(restNameFor("Delgado Pineda, Ruth", DATA), "Delgado Pineda, Angel");
});

test("a person QSP spells consistently keeps their own name", () => {
  // 117 of the 119 sheets across the two live batches. `readAs.rests` is null
  // for them, because `lookupAcross` only reports a spelling it had to reach for.
  const data = { premiumSupport: { readAs: { rests: null } } };
  assert.equal(restNameFor("Uribe, Brandon", data), "Uribe, Brandon");
});

test("a batch stored before readAs existed falls back to the sheet's name", () => {
  assert.equal(restNameFor("Uribe, Brandon", { days: [] }), "Uribe, Brandon");
  assert.equal(restNameFor("Uribe, Brandon", null), "Uribe, Brandon");
});

test("THE SIGNED SHEET DRAWS HER BREAK - the defect this file exists for", async () => {
  const sheet = {
    employee: "Delgado Pineda, Ruth",
    restName: restNameFor("Delgado Pineda, Ruth", DATA),
    payPeriod: { from: "08/01/26", to: "08/15/26" },
    days: DATA.days,
    totals: { rawHours: 4, paidHours: 4, regularHours: 4, otHours: 0, doubleHours: 0 },
    premiums: { totalHours: 0, meal: [], rest: [] },
    restsByDate: RESTS,
    scheduleByDate: SCHED,
  };
  const withName = await renderCorrected(sheet, { printedBy: sheet.employee, generatedOn: "08/12/2026" });
  assert.ok(withName.bytes?.length > 0);

  // and the column it fills is empty without the bridge, which is what her
  // signed sheet actually printed
  const recorded = recordedBreaksFor(sheet.restName, RESTS, SCHED);
  assert.equal(recorded.get("08/05/26").rests.length, 1);
  assert.equal(recorded.get("08/05/26").rests[0].from, "12p");
  assert.equal(recorded.get("08/05/26").rests[0].counted, true);

  // the old behaviour, kept as the thing being fixed: matched on the printed
  // name, the report has nothing to say about her at all.
  assert.equal(recordedBreaksFor(sheet.employee, RESTS, SCHED).size, 0);
});

test("her questions and her email find the same rows the sheet draws", () => {
  // both resolve the spelling themselves off `data`, so no caller has to know
  const rows = [
    ...RESTS,
    // a meal-length row is what `restIsMealLength` asks about, and it was
    // unreachable for her under either name
    { name: "Delgado Pineda, Angel", date: "08/05/26", out: "1:00 PM", in: "1:30 PM", minutes: 30, counted: false, reversed: false, kind: "too-long" },
  ];
  const checks = buildEmployeeChecks(DATA, { restRows: rows, sourceName: "Delgado Pineda, Ruth" });
  assert.ok(checks.some((c) => c.kind === "restIsMealLength"), "the meal-length row reaches her email");

  // buildQuestions must not throw and must see her rows as hers
  const asked = buildQuestions(DATA, { restRows: rows, sourceName: "Delgado Pineda, Ruth" });
  assert.ok(Array.isArray(asked));
  const askedUnbridged = buildQuestions(
    { ...DATA, premiumSupport: { readAs: { rests: null } } },
    { restRows: rows, sourceName: "Delgado Pineda, Ruth" },
  );
  assert.ok(
    asked.length > askedUnbridged.length,
    "matching on the printed name asks her fewer questions than the report supports",
  );
});

// ONE ROW, ONE READING - the engine's and the document's.
//
// The repair was applied everywhere a break is DRAWN and nowhere it is
// MEASURED. `restRowTimes` is now the single expression, so the window that
// feeds analyzeDay is the same window the sheet prints.
//
// Espinoza 08/05 is the case that found it: a 4:00 AM rest the classifier
// repairs to 4:00 PM precisely because that lands inside the 3:40-5:10 PM shift
// the row names. Measured raw it was "outside the shift", so his sheet drew the
// break inside his shift while the cards beside it said it was outside one, and
// he was asked to explain a time the engine had already decided was a typo.
const REPAIRED = {
  out: "4:00 AM", in: "4:10 AM", minutes: 10, counted: true, reversed: false, kind: "repaired",
  shiftFrom: "3:40 PM", shiftTo: "5:10 PM", shift: "3:40 PM to 5:10 PM",
  repair: { field: "both", outTo: "4:00 PM", inTo: "4:10 PM", to: "4:00 PM to 4:10 PM", minutes: 10, fits: true },
};

test("a repaired row is read at its corrected time, not the one that was typed", () => {
  assert.deepEqual(restRowTimes(REPAIRED), { from: "4:00 PM", to: "4:10 PM" });
});

test("a reversed row is read the right way round", () => {
  const rev = { out: "12:10 PM", in: "12:00 PM", reversed: true };
  assert.deepEqual(restRowTimes(rev), { from: "12:00 PM", to: "12:10 PM" });
});

test("an ordinary row is untouched, and so is a raw report row", () => {
  assert.deepEqual(restRowTimes({ out: "3:00 PM", in: "3:10 PM" }), { from: "3:00 PM", to: "3:10 PM" });
  assert.deepEqual(
    restRowTimes({ "Rest Period Time Out": "3:00 PM", "Rest Period Time In": "3:10 PM" }),
    { from: "3:00 PM", to: "3:10 PM" },
  );
});

test("the repaired break lands INSIDE the shift it was filed against", () => {
  // which is why the repair was believed at all - `fits: true`
  assert.equal(serviceFit(REPAIRED).where, "inside");
  // and so it is no longer reported as filed against the wrong shift. Measured
  // on the two live batches this clears 11 rows, every one of them `repaired`,
  // and flags nothing new.
  assert.equal(
    restOffOwnShift({
      "Shift Start Time": REPAIRED.shiftFrom, "Shift End Time": REPAIRED.shiftTo,
      "Rest Period Time Out": REPAIRED.out, "Rest Period Time In": REPAIRED.in,
      repair: REPAIRED.repair,
    }),
    false,
  );
});

test("a break genuinely outside its own shift is still reported", () => {
  // April Martinez's 7:00-7:10 against an 8:00 start, eleven days running. No
  // repair explains it, so nothing about this change touches it.
  assert.equal(
    restOffOwnShift({
      "Shift Start Time": "8:00 AM", "Shift End Time": "11:00 AM",
      "Rest Period Time Out": "7:00 AM", "Rest Period Time In": "7:10 AM",
    }),
    true,
  );
});
