// WHAT A REPORT ROW LOOKS LIKE ON A CALENDAR.
//
// Every screen that draws a day built this list for itself and each dropped a
// different set of rows on the floor. `drawnRest` is the one answer now, and
// these are the rows it used to lose.
import test from "node:test";
import assert from "node:assert/strict";

import { drawnRest } from "../recorded-breaks.js";
import { classifyRest } from "../rests.js";
import { buildQuestions } from "../questions.js";

const row = (over = {}) => ({
  name: "Hatt, Kristy", date: "07/20/26",
  out: "11:00 AM", in: "11:10 AM", minutes: 10, counted: true, ...over,
});

test("an ordinary rest draws at the time the report holds", () => {
  const at = drawnRest(row());
  assert.deepEqual(at, { min: 11 * 60, minutes: 10, kind: "rest", label: null, filed: null });
});

test("a rest filed against a shift it does not sit in carries the tether", () => {
  // Solorzano 08/04: 9:40-9:50 filed under an 8:00-9:30 shift, taken in the
  // 9:30-9:50 booking instead. Mánu 2026-08-12 wanted "a visual of where it was
  // supposed to be in", and the tether needs the service window to point at.
  const at = drawnRest(row({
    out: "9:40 AM", in: "9:50 AM",
    "Shift Start Time": "8:00 AM", "Shift End Time": "9:30 AM",
  }));
  assert.deepEqual(at.filed, { from: 8 * 60, to: 9 * 60 + 30 });

  // a rest sitting INSIDE its own service needs no line drawn to itself
  const inside = drawnRest(row({
    out: "8:30 AM", in: "8:40 AM",
    "Shift Start Time": "8:00 AM", "Shift End Time": "9:30 AM",
  }));
  assert.equal(inside.filed, null);

  // and a REPAIRED row is not misfiled - the repair already moved it to where
  // the service says it belongs, so a tether would point at itself
  const fixed = drawnRest(row({
    out: "3:50 PM", in: "3:00 PM", minutes: 50, counted: false,
    "Shift Start Time": "1:40 PM", "Shift End Time": "4:10 PM",
    repair: { field: "in", to: "4:00 PM", minutes: 10, why: "the IN hour was rolled back an hour" },
  }));
  assert.equal(fixed.filed, null);
});

test("a REPAIRED row draws where the repair puts it, not where the row reads", () => {
  // Martinez 07/23: out 3:50 PM, in 3:00 PM, filed against the 1:40-4:10 shift.
  // Read literally it runs backwards, so the checks screen's `in > out` guard
  // threw it away and the employee's page drew Math.min - a fifty minute rest
  // starting at 3p, on a day whose only break was a ten at 3:50.
  const at = drawnRest(row({
    out: "3:50 PM", in: "3:00 PM", minutes: 50, counted: false,
    repair: { field: "in", to: "4:00 PM", minutes: 10, why: "the IN hour was rolled back an hour" },
  }));
  assert.equal(at.min, 15 * 60 + 50, "3:50p, the recorded OUT");
  assert.equal(at.minutes, 10, "ten minutes, not fifty");
  assert.equal(at.kind, "rest");
  assert.equal(at.label, "Rest (fixed)", "and it says it was moved");
});

test("a meal-length row on a day with NO rostered lunch is the lunch, unconfirmed", () => {
  // Hernadez 07/25: thirty minutes, nothing rostered. The sheet draws it blue
  // with hazard stripes; `provisional` is what the calendar draws that with.
  const at = drawnRest(
    row({ out: "2:00 PM", in: "2:30 PM", minutes: 30, counted: false }),
    { mealScheduled: false },
  );
  assert.equal(at.kind, "meal");
  assert.equal(at.provisional, true);
  assert.equal(at.label, "Meal?");
});

test("a meal-length row on a day that HAS a lunch draws plain - two lunches, and you can see both", () => {
  // Hatt 07/20: sixty minutes at 3:30 with her lunch rostered at noon. Mánu
  // 2026-08-12: "it needs to be drawn so they can see the issue." Striping one
  // of the two would nominate which is wrong before anybody has been asked.
  const at = drawnRest(
    row({ out: "3:30 PM", in: "4:30 PM", minutes: 60, counted: false }),
    { mealScheduled: true },
  );
  assert.equal(at.kind, "meal");
  assert.equal(at.provisional, false, "plain blue, exactly like the rostered one");
  assert.equal(at.label, null);
});

test("a row with no times, or one still backwards after repair, draws nothing", () => {
  assert.equal(drawnRest(row({ out: "", in: "", minutes: null })), null);
  assert.equal(drawnRest(row({ out: "5:00 PM", in: "4:00 PM", minutes: 60, counted: false, repair: null })), null);
  assert.equal(drawnRest(null), null);
});

test("two lunches raise a question that knows it is about two lunches", () => {
  const day = {
    date: "07/20/26", paidHours: 9, rawHours: 9, regularHours: 9, otHours: 0,
    doubleHours: 0, addedHours: 0, punches: [], breaks: [],
    restTaken: 0, restRequired: 2, restViolation: false,
    // her lunch WAS rostered and taken, so the meal reading cannot claim the row
    mealScheduled: true, mealMissing: false, mealViolation: false, mealLate: false,
  };
  const qs = buildQuestions({ days: [day] }, {
    sourceName: "Hatt, Kristy",
    restRows: [row({ out: "3:30 PM", in: "4:30 PM", minutes: 60, counted: false, kind: "too-long" })],
  });
  const q = qs.find((x) => x.kind === "restTooLongOffClock");
  assert.ok(q, "the day still gets asked about it");
  assert.equal(q.row.twoLunches, true, "and the card knows to talk about two lunches");
  assert.equal(q.moves, 0, "no answer moves a figure");

  // the same row on a day with no lunch rostered is NOT two lunches - it is one
  // long entry, and the card that says "two lunches" would be inventing one
  const alone = buildQuestions({ days: [{ ...day, mealScheduled: false }] }, {
    sourceName: "Hatt, Kristy",
    restRows: [row({ out: "3:30 PM", in: "4:30 PM", minutes: 60, counted: false, kind: "too-long" })],
  }).find((x) => x.kind === "restTooLongOffClock");
  assert.equal(alone?.row.twoLunches, false);
});

// --------------------------------------------------------------- Paulin 08/07

test("a whole-row AM/PM swap is repaired, and only where the shift proves it", () => {
  // Paulin 08/07: a rest of 11:00 PM to 11:10 PM filed against a 10:00 AM to
  // 12:00 PM shift. Mánu 2026-08-12: "I thought the engine auto fixed issues
  // like this. that's an am/pm swap."
  //
  // Every other repair moves ONE field, which breaks the length - so a row whose
  // length is already a perfect ten was offered nothing at all and sailed
  // through as a counted rest sitting twelve hours from its own service.
  const swapped = classifyRest({
    "Employee Name": "Paulin, Kevin",
    "Start Date": "08/07/26",
    "Rest Period Time Out": "11:00 PM",
    "Rest Period Time In": "11:10 PM",
    "Shift Start Time": "10:00 AM",
    "Shift End Time": "12:00 PM",
    "Total Rest Time": 0.17,
  });
  assert.equal(swapped.kind, "repaired");
  assert.equal(swapped.repair.field, "both");
  assert.equal(swapped.repair.outTo, "11:00 AM");
  assert.equal(swapped.repair.inTo, "11:10 AM");
  assert.equal(swapped.repair.minutes, 10);
  assert.match(swapped.repair.why, /both times were picked as PM/);

  // and it draws where the repair puts it, not where the row reads
  const at = drawnRest({
    date: "08/07/26", name: "Paulin, Kevin",
    out: "11:00 PM", in: "11:10 PM", minutes: 10,
    repair: swapped.repair,
  });
  assert.equal(at.min, 11 * 60, "11:00 AM");
  assert.equal(at.minutes, 10);
  assert.equal(at.label, "Rest (fixed)");
});

test("a swap is NOT proposed for a rest that is simply filed against the wrong shift", () => {
  // Aranda 07/16: a 3:00-3:10 PM rest hung on a 1:00-2:30 PM shift. She really
  // was working 2:30-5:00, so the BREAK is right and the ROW is misfiled -
  // shifting it twelve hours would land it at 3:00 AM and fit nothing.
  //
  // This is the guard that matters: a both-field shift preserves the length, so
  // without it every well-formed row on the sheet could be "explained" as a
  // swap. The evidence is that the shifted version lands INSIDE its own service.
  const misfiled = classifyRest({
    "Employee Name": "Aranda, Jennifer",
    "Start Date": "07/16/26",
    "Rest Period Time Out": "3:00 PM",
    "Rest Period Time In": "3:10 PM",
    "Shift Start Time": "1:00 PM",
    "Shift End Time": "2:30 PM",
    "Total Rest Time": 0.17,
  });
  assert.equal(misfiled.repair, null, "nothing mechanical explains it");
  assert.equal(misfiled.counted, true, "the break still counts");

  // and an ordinary rest sitting inside its own shift is never touched
  const fine = classifyRest({
    "Employee Name": "Aranda, Jennifer",
    "Start Date": "07/16/26",
    "Rest Period Time Out": "1:30 PM",
    "Rest Period Time In": "1:40 PM",
    "Shift Start Time": "1:00 PM",
    "Shift End Time": "2:30 PM",
    "Total Rest Time": 0.17,
  });
  assert.equal(fine.repair, null);
  assert.equal(fine.kind, null, "an unremarkable ten");
});
