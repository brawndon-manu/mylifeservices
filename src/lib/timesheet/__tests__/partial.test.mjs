import test from "node:test";
import assert from "node:assert/strict";
import { sheetDate, isoDate, futureDates, trimDays } from "../partial.js";

// A FIXED "NOW", because a test that reads the clock passes in August and fails
// in September. Wednesday 08/12/26, which is the day Mánu hit this.
const NOW = new Date(2026, 7, 12, 10, 30);

const day = (date, paidHours = 6) => ({ date, paidHours, punches: [], breaks: [] });
const sheet = (employee, dates) => ({
  employee,
  payPeriod: { from: "08/01/26", to: "08/15/26" },
  days: dates.map((d) => day(d)),
});

test("a date is future only when it is after today, so today's own shifts survive", () => {
  assert.equal(futureDates([sheet("A", ["08/12/26"])], NOW).size, 0);
  assert.equal(futureDates([sheet("A", ["08/11/26"])], NOW).size, 0);
  assert.deepEqual([...futureDates([sheet("A", ["08/13/26"])], NOW)], ["08/13/26"]);
});

test("the guard and the trim agree on every date, which is the whole point", () => {
  const sheets = [sheet("A", ["08/10/26", "08/12/26", "08/13/26", "08/14/26"])];
  const future = futureDates(sheets, NOW);
  const { sheets: kept, dropped } = trimDays(sheets, { now: NOW });
  const survived = new Set(kept.flatMap((s) => s.days.map((d) => d.date)));
  for (const d of future) assert.ok(!survived.has(d), `${d} should have been dropped`);
  for (const d of dropped) assert.ok(future.has(d), `${d} was cut but is not future`);
  assert.deepEqual([...survived].sort(), ["08/10/26", "08/12/26"]);
});

// ---- the typed window, because QSP ignores the range it is asked for --------

test("a typed range keeps only the days inside it, both ends included", () => {
  // Mánu asked QSP for 08/01-08/09 and it returned the whole period anyway
  const sheets = [sheet("Uribe, Brandon", [
    "07/31/26", "08/01/26", "08/05/26", "08/09/26", "08/10/26", "08/14/26",
  ])];
  const { sheets: kept, dropped, from, through } = trimDays(sheets, {
    now: NOW,
    from: new Date(2026, 7, 1),
    to: new Date(2026, 7, 9),
  });
  assert.deepEqual(kept[0].days.map((d) => d.date), ["08/01/26", "08/05/26", "08/09/26"]);
  assert.deepEqual(dropped, ["07/31/26", "08/10/26", "08/14/26"]);
  assert.equal(from, "08/01/26");
  assert.equal(through, "08/09/26");
});

test("an end date in the future is pulled back to today and says so", () => {
  // otherwise a typed date quietly re-admits the scheduled shifts the whole
  // check exists to keep out
  const sheets = [sheet("A", ["08/10/26", "08/12/26", "08/14/26", "08/20/26"])];
  const { sheets: kept, clamped, through } = trimDays(sheets, {
    now: NOW,
    to: new Date(2026, 7, 31),
  });
  assert.equal(clamped, true);
  assert.deepEqual(kept[0].days.map((d) => d.date), ["08/10/26", "08/12/26"]);
  assert.equal(through, "08/12/26");
});

test("an end date on or before today is honoured exactly and not flagged", () => {
  const sheets = [sheet("A", ["08/09/26", "08/12/26"])];
  const { sheets: kept, clamped } = trimDays(sheets, { now: NOW, to: new Date(2026, 7, 9) });
  assert.equal(clamped, false);
  assert.deepEqual(kept[0].days.map((d) => d.date), ["08/09/26"]);
});

test("a start on its own trims the front and still refuses the future", () => {
  const sheets = [sheet("A", ["07/28/26", "08/05/26", "08/14/26"])];
  const { sheets: kept } = trimDays(sheets, { now: NOW, from: new Date(2026, 7, 1) });
  assert.deepEqual(kept[0].days.map((d) => d.date), ["08/05/26"]);
});

test("no window at all still drops everything after today", () => {
  const sheets = [sheet("A", ["08/03/26", "08/10/26", "08/14/26"])];
  const { sheets: kept, through, dropped } = trimDays(sheets, { now: NOW });
  assert.deepEqual(kept[0].days.map((d) => d.date), ["08/03/26", "08/10/26"]);
  assert.equal(through, "08/10/26");
  assert.deepEqual(dropped, ["08/14/26"]);
});

test("somebody who worked nothing inside the window gets no timesheet at all", () => {
  const sheets = [sheet("Worked, Some", ["08/05/26"]), sheet("Future, Only", ["08/13/26", "08/14/26"])];
  const { sheets: kept, droppedPeople, dropped } = trimDays(sheets, { now: NOW });
  assert.deepEqual(kept.map((s) => s.employee), ["Worked, Some"]);
  assert.equal(droppedPeople, 1);
  assert.ok(dropped.includes("Future, Only (no days in range)"));
});

test("`from` and `through` span everyone, not just the first sheet", () => {
  const sheets = [sheet("A", ["08/03/26"]), sheet("B", ["08/01/26", "08/11/26"])];
  const r = trimDays(sheets, { now: NOW });
  assert.equal(r.from, "08/01/26");
  assert.equal(r.through, "08/11/26");
});

test("a date it cannot read is kept, because guessing would delete real work", () => {
  const sheets = [{ employee: "A", days: [day(""), day("not a date"), day("08/13/26")] }];
  const { sheets: kept, dropped } = trimDays(sheets, { now: NOW });
  assert.equal(kept[0].days.length, 2);
  assert.deepEqual(dropped, ["08/13/26"]);
  assert.equal(sheetDate("not a date"), null);
});

test("a period that has fully ended is returned exactly as it came in", () => {
  const sheets = [sheet("A", ["07/16/26", "07/31/26"])];
  const { sheets: kept, dropped, droppedPeople } = trimDays(sheets, { now: NOW });
  assert.deepEqual(kept[0].days.map((d) => d.date), ["07/16/26", "07/31/26"]);
  assert.deepEqual(dropped, []);
  assert.equal(droppedPeople, 0);
  assert.equal(futureDates(sheets, NOW).size, 0);
});

test("the date field is read in local time, not pulled back a day by UTC", () => {
  // `new Date("2026-08-09")` is midnight UTC, which is the 8th here - and would
  // silently drop a whole day off the front of every window
  const d = isoDate("2026-08-09");
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 7);
  assert.equal(d.getDate(), 9);
  assert.equal(isoDate(""), null);
  assert.equal(isoDate("09/08/2026"), null);
});
