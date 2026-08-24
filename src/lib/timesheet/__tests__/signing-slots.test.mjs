// AN IN-PERSON SIGNING'S SLOTS, GENERATED FROM THE RULE THAT DESCRIBES THEM.
//
// Mánu 2026-08-22: "this needs to be its own type of meeting format. We can
// call it in person signing... it should be way easier to set up. TIme slots as
// its own unique setup." Twenty session cards described by hand was the
// failure; one rule - days, hours, length, capacity - is the fix.
//
// Built around HR's actual ask: Monday to Friday, 8:00 AM to 6:00 PM,
// about 30 minutes each, ten people per slot.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  minutesOfDay, clockLabel, datesBetween, slotsPerDay,
  generateSigningSlots, describeSetup,
} from "../../signing-slots.js";

// Kristy's week, exactly
const WEEK = {
  from: "2026-08-24", to: "2026-08-28",
  startTime: "08:00", endTime: "18:00",
  lengthMin: 30, capacity: 10,
};

test("a clock time reads and prints the way a person says it", () => {
  assert.equal(minutesOfDay("08:00"), 480);
  assert.equal(minutesOfDay("18:00"), 1080);
  assert.equal(clockLabel(480), "8:00 AM");
  assert.equal(clockLabel(750), "12:30 PM");
  assert.equal(clockLabel(0), "12:00 AM");
});

test("half a time is no time, and generates nothing", () => {
  assert.equal(minutesOfDay("8"), null);
  assert.equal(minutesOfDay("25:00"), null);
  assert.equal(minutesOfDay(""), null);
  assert.deepEqual(generateSigningSlots({ ...WEEK, startTime: "8" }), []);
});

// ---- the days ----

test("Monday to Friday is five days", () => {
  const days = datesBetween("2026-08-24", "2026-08-28");
  assert.equal(days.length, 5);
  assert.equal(days[0].dayName, "Monday");
  assert.equal(days[4].dayName, "Friday");
});

// the whole reason for the UTC-noon anchor: local-midnight day-walking crosses
// a DST boundary and a Sunday appears in a weekday week
test("a range spanning weekends keeps only the weekdays", () => {
  const days = datesBetween("2026-08-21", "2026-08-25");
  assert.deepEqual(days.map((d) => d.dayName), ["Friday", "Monday", "Tuesday"]);
});

test("a backwards or unreadable range is empty rather than infinite", () => {
  assert.deepEqual(datesBetween("2026-08-28", "2026-08-24"), []);
  assert.deepEqual(datesBetween("soon", "later"), []);
});

// ---- the slots ----

test("8 to 6 at 30 minutes is 20 slots a day", () => {
  assert.equal(slotsPerDay(480, 1080, 30), 20);
});

test("a visit that does not fit before closing is not offered", () => {
  // 8:00-9:00 at 45min: the 8:45 slot would run past 9:00
  assert.equal(slotsPerDay(480, 540, 45), 1);
});

test("the full week generates every slot, capped and labelled", () => {
  const slots = generateSigningSlots(WEEK);
  assert.equal(slots.length, 100);
  assert.equal(slots[0].label, "Monday 8:00 AM");
  assert.equal(slots.at(-1).label, "Friday 5:30 PM");
  assert.ok(slots.every((s) => s.capacity === 10));
  assert.ok(slots.every((s) => s.durationFromMin === 30));
});

// somebody's pick must survive the author fixing a typo elsewhere in the
// announcement - a regenerate that renames every id would orphan every choice
test("regenerating the same rule produces the same ids", () => {
  const a = generateSigningSlots(WEEK).map((s) => s.id);
  const b = generateSigningSlots(WEEK).map((s) => s.id);
  assert.deepEqual(a, b);
  assert.equal(a[0], "s-2026-08-24-0800");
});

test("the shape is an ordinary meeting option", () => {
  const [s] = generateSigningSlots(WEEK);
  for (const k of ["id", "label", "at", "tz", "durationFromMin", "capacity"]) {
    assert.ok(k in s, `missing ${k}`);
  }
  // and nothing a Zoom session would carry
  assert.equal(s.zoomLink, null);
  assert.equal(s.seriesId, null);
});

test("no capacity means uncapped slots, not zero-person ones", () => {
  const slots = generateSigningSlots({ ...WEEK, capacity: null });
  assert.ok(slots.every((s) => s.capacity === null));
});

// ---- what the screen says before publishing ----

test("the summary states the arithmetic out loud", () => {
  const d = describeSetup(WEEK);
  assert.equal(d.days, 5);
  assert.equal(d.perDay, 20);
  assert.equal(d.total, 100);
  assert.equal(d.places, 1000);
});

// the numbers carry no judgement: a `tooMany` flag used to ride here and the
// screen turned it into advice at the author - cut on Mánu's read of it,
// 2026-08-22. If the count ever earns a verdict again it belongs in the
// picker's layout, not in a sentence at whoever set the hours.
test("the summary is numbers only, no verdict", () => {
  assert.equal("tooMany" in describeSetup(WEEK), false);
});
