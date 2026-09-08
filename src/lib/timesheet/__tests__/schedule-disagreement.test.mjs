// THE MISASSEMBLED-EXPORT GUARD, pinned. QSP once printed every calendar
// under the previous employee's header (09/07/26) and the audit read 300
// phantom double-billings out of it. The guard's judgement: most people
// wrong on most of their own days = the file, not the people.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scheduleDisagreement } from "../schedule.js";

// a person whose sheet and calendar agree: 8h worked, 8h scheduled
const person = (name, hours) => ({
  sheet: {
    employee: name,
    days: [
      { date: "09/01/26", paidHours: hours },
      { date: "09/02/26", paidHours: hours },
      { date: "09/03/26", paidHours: hours },
    ],
  },
  schedule: (h) => ({
    employee: name,
    days: [
      { date: "09/01/26", workHours: h },
      { date: "09/02/26", workHours: h },
      { date: "09/03/26", workHours: h },
    ],
  }),
});

const roster = (n, hoursOf, schedHoursOf) => {
  const sheets = [];
  const people = [];
  for (let i = 0; i < n; i++) {
    const p = person(`Person ${String.fromCharCode(65 + i)}`, hoursOf(i));
    sheets.push(p.sheet);
    people.push(p.schedule(schedHoursOf(i)));
  }
  return { sheets, people };
};

test("an export that matches its own timesheets passes the door", () => {
  const { sheets, people } = roster(12, () => 8, () => 8);
  const out = scheduleDisagreement(sheets, people);
  assert.equal(out.compared, 12);
  assert.equal(out.off, 0);
  assert.equal(out.misassembled, false);
});

test("calendars shifted onto the wrong names read as misassembled", () => {
  // alternating 3h and 8h people, each calendar printed under the previous
  // name - so every comparison reads 3 against 8, five hours out, every day
  const { sheets, people } = roster(12, (i) => (i % 2 ? 8 : 3), (i) => ((i + 1) % 2 ? 8 : 3));
  const out = scheduleDisagreement(sheets, people);
  assert.equal(out.compared, 12);
  assert.ok(out.off > 6);
  assert.equal(out.misassembled, true);
  assert.ok(out.samples.length > 0);
  assert.match(out.samples[0], /of 3 days/);
});

test("one person off is a person question, not the file", () => {
  const { sheets, people } = roster(12, () => 8, (i) => (i === 0 ? 2 : 8));
  const out = scheduleDisagreement(sheets, people);
  assert.equal(out.off, 1);
  assert.equal(out.misassembled, false);
});

test("a tiny upload never calls the whole export misassembled", () => {
  const { sheets, people } = roster(4, () => 8, () => 2);
  const out = scheduleDisagreement(sheets, people);
  assert.equal(out.misassembled, false);
});

// THE GUARD RUNS BEFORE ANALYSIS - a freshly parsed day carries only QSP's
// printed figures, no paidHours. Read through paidHours alone it compared
// every calendar against zero and refused a good export 49 to 49
// (2026-09-09, his first blocked upload).
test("a freshly parsed sheet speaks through QSP's printed daily figure", () => {
  const sheets = [];
  const people = [];
  for (let i = 0; i < 12; i++) {
    const name = `Person ${String.fromCharCode(65 + i)}`;
    sheets.push({
      employee: name,
      days: [
        { date: "09/01/26", printed: { daily: 8, regular: 8 } },
        { date: "09/02/26", printed: { daily: 8, regular: 8 } },
        { date: "09/03/26", printed: { daily: 8, regular: 8 } },
      ],
    });
    people.push({
      employee: name,
      days: [
        { date: "09/01/26", workHours: 8 },
        { date: "09/02/26", workHours: 8 },
        { date: "09/03/26", workHours: 8 },
      ],
    });
  }
  const out = scheduleDisagreement(sheets, people);
  assert.equal(out.compared, 12);
  assert.equal(out.off, 0);
  assert.equal(out.misassembled, false);
});

test("people with no schedule page or too little overlap stay out of the count", () => {
  const { sheets, people } = roster(12, () => 8, () => 8);
  sheets.push({ employee: "No Calendar", days: [{ date: "09/01/26", paidHours: 8 }] });
  const out = scheduleDisagreement(sheets, people);
  assert.equal(out.compared, 12);
});
