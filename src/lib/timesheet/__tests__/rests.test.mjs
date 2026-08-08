// The Rest Periods Report reader.
//
// Every case here came off the real 07/16-07/31 report. The one that matters
// most is the rounding test: `Total Rest Time` prints a genuine ten minute
// break as 0.16 on 61 rows and 0.17 on 271, so any rule that reads minutes off
// that column marks 61 real breaks deficient and invents premiums.
import { test } from "node:test";
import assert from "node:assert/strict";

import { classifyRest, isSaneRest, REST_KIND_NOTE } from "../rests.js";

const row = (out, back, printed) => ({
  "Rest Period Time Out": out,
  "Rest Period Time In": back,
  "Total Rest Time": printed,
});

test("an ordinary ten minute break counts and is not flagged", () => {
  const c = classifyRest(row("7:00 AM", "7:10 AM", 0.16));
  assert.equal(c.counted, true);
  assert.equal(c.minutes, 10);
  assert.equal(c.kind, null);
  assert.equal(c.reversed, false);
});

test("THE ROUNDING TRAP: 0.16 printed is still an exact ten minutes", () => {
  // 0.16 h is 9.6 minutes. Reading the printed column would call this short and
  // charge a premium. April Martinez has 20-odd rows of exactly this shape.
  const printed = row("7:00 AM", "7:10 AM", 0.16);
  assert.equal(Number(printed["Total Rest Time"]) * 60 < 10, true, "the column really is under ten");
  assert.equal(classifyRest(printed).counted, true, "but the break is not");
  assert.equal(classifyRest(printed).kind, null);
  // and the same break printed the other way rounds up
  assert.equal(classifyRest(row("12:30 PM", "12:40 PM", 0.17)).minutes, 10);
});

test("a reversed row is flipped, and counts", () => {
  // Uribe 07/27, Zuchniak x8, Devine x2 - out and in typed into each other's boxes
  const c = classifyRest(row("12:10 PM", "12:00 PM", -0.17));
  assert.equal(c.counted, true);
  assert.equal(c.minutes, 10);
  assert.equal(c.reversed, true);
  assert.equal(c.kind, "reversed-repaired");
});

test("reversed is a modifier, not a verdict - the flipped LENGTH decides", () => {
  // Jose Martinez 07/23. There is no separate "backwards therefore rejected"
  // case: it flips to 50 minutes and is rejected for being 50 minutes, which is
  // the reason worth telling somebody.
  const c = classifyRest(row("3:50 PM", "3:00 PM", -0.83));
  assert.equal(c.counted, false);
  assert.equal(c.reversed, true);
  assert.equal(c.minutes, 50);
  assert.equal(c.kind, "too-long", "judged on length, not on being backwards");
});

test("the arithmetic behind the printed column is spelled out", () => {
  // "-0.83" to "-50 min" is a jump a reader should not have to take on trust
  assert.equal(classifyRest(row("3:50 PM", "3:00 PM", -0.83)).derivation, "-0.83 hr x 60 = -50 min");
  assert.equal(classifyRest(row("3:30 PM", "4:30 PM", 1)).derivation, "1 hr x 60 = 60 min");
});

test("an obvious single-field misclick is PROPOSED, never applied", () => {
  // Jose Martinez 07/23: the IN hour rolled back. 4:00 PM gives a normal ten.
  const jose = classifyRest(row("3:50 PM", "3:00 PM", -0.83));
  assert.equal(jose.counted, false, "still does not count until somebody says so");
  assert.deepEqual(
    { field: jose.repair.field, to: jose.repair.to, minutes: jose.repair.minutes },
    { field: "in", to: "4:00 PM", minutes: 10 },
  );

  // Rotter 07/27 and Romero-Alba 07/30: the IN time was picked as PM
  const rotter = classifyRest(row("11:20 AM", "11:30 PM", 12.17));
  assert.equal(rotter.repair.to, "11:30 AM");
  assert.equal(rotter.repair.minutes, 10);
  const juanita = classifyRest(row("10:10 AM", "10:20 PM", 12.17));
  assert.equal(juanita.repair.to, "10:20 AM");
});

test("no repair is proposed when no single field explains it", () => {
  // Hatt 07/20, 3:30 PM -> 4:30 PM. Shifting either field by an hour or twelve
  // gives 0, 90 or nonsense. It stays owed and stays a question for a person.
  const hatt = classifyRest(row("3:30 PM", "4:30 PM", 1));
  assert.equal(hatt.counted, false);
  assert.equal(hatt.kind, "too-long");
  assert.equal(hatt.repair, null);

  // Hernadez 07/25, a clean 30 minutes - that is a meal, not a mis-pick
  assert.equal(classifyRest(row("2:00 PM", "2:30 PM", 0.5)).repair, null);
});

test("under ten minutes is a deficient rest and owes the premium", () => {
  const c = classifyRest(row("2:00 PM", "2:04 PM", 0.07));
  assert.equal(c.counted, false);
  assert.equal(c.minutes, 4);
  assert.equal(c.kind, "short");
});

test("eleven to fifteen minutes counts, owes nothing, and is still flagged", () => {
  const c = classifyRest(row("2:00 PM", "2:13 PM", 0.22));
  assert.equal(c.counted, true, "no penalty");
  assert.equal(c.minutes, 13);
  assert.equal(c.kind, "over-ten", "but visible");
  // and it carries the compliance wording, not a penalty
  assert.match(REST_KIND_NOTE[c.kind], /one and a half times the entitlement/);
});

test("the threshold is exclusive above fifteen, inclusive at it", () => {
  assert.equal(classifyRest(row("2:00 PM", "2:15 PM", 0.25)).counted, true);
  assert.equal(classifyRest(row("2:00 PM", "2:16 PM", 0.27)).counted, false);
  assert.equal(classifyRest(row("2:00 PM", "2:16 PM", 0.27)).kind, "too-long");
});

test("thirty and sixty minute rows are too long to be rests", () => {
  // Hernadez 07/25 and 07/26 are exactly 30, Hatt 07/20 is 60
  for (const [o, i] of [["2:00 PM", "2:30 PM"], ["3:30 PM", "4:30 PM"]]) {
    const c = classifyRest(row(o, i, 0.5));
    assert.equal(c.counted, false);
    assert.equal(c.kind, "too-long");
  }
});

test("an AM/PM slip reads as 730 minutes and does not count", () => {
  // Rotter 07/27 and Romero-Alba 07/30
  const c = classifyRest(row("11:20 AM", "11:30 PM", 12.17));
  assert.equal(c.counted, false);
  assert.equal(c.minutes, 730);
  assert.equal(c.kind, "too-long");
});

test("a row with no times at all does not count", () => {
  // Flores 07/29
  const c = classifyRest(row("", "", 0));
  assert.equal(c.counted, false);
  assert.equal(c.minutes, null);
  assert.equal(c.kind, "no-times");
});

test("exactly ten counts; the boundary is inclusive", () => {
  assert.equal(classifyRest(row("9:00 AM", "9:10 AM", 0.17)).counted, true);
  assert.equal(classifyRest(row("9:00 AM", "9:09 AM", 0.15)).counted, false);
});

test("isSaneRest still judges the printed column only", () => {
  // kept as a helper; it is deliberately NOT what decides a break any more
  assert.equal(isSaneRest(0.16), true);
  assert.equal(isSaneRest(-0.17), false);
  assert.equal(isSaneRest(12.17), false);
});

// ---------------------------------------------------- rows that are not rests

test("a pasted timesheet line is not a rest row, however Excel hands it over", async () => {
  const { isRestRow } = await import("../rests.js");

  // the real shape that got through on 2026-08-08: someone hand-worked their
  // own timesheet in the rest report workbook and uploaded it. Excel gives the
  // date as a serial, so 46219 is 07/16/26 and it read as a person's name.
  const pasted = {
    "Employee Name": 46219, "Employee Office": "11a", "Client Name": "1p",
    "Service Type": "1:15p", "Start Date": "3:15p", "Shift Start Time": "3:30p",
    "Rest Period Time Out": null, "Rest Period Time In": null, "Total Rest Time": null,
  };
  assert.equal(isRestRow(pasted), false, "a bare number is a date serial, never a person");

  // and the ordinary row still passes, or the guard has eaten the report
  const real = {
    "Employee Name": "Aranda, Jennifer", "Start Date": "7/16/2026",
    "Rest Period Time Out": "3:00 PM", "Rest Period Time In": "3:10 PM", "Total Rest Time": 0.17,
  };
  assert.equal(isRestRow(real), true);

  // the two ways a row can be incomplete
  assert.equal(isRestRow({ "Employee Name": "", "Start Date": "7/16/2026" }), false);
  assert.equal(isRestRow({ "Employee Name": "Aranda, Jennifer", "Start Date": "" }), false);
});
