// THE NAME LINE CARRIES MORE THAN THE NAME NOW.
//
// With paid sick time and PTO switched on in QuickSolve (2026-09-09), the
// timesheet export prints the period's totals on the employee's OWN name line:
//
//   Employee Name: Aranda, Jennifer Paid Sick Time Used this Period: 15.00
//
// The parser took everything to the end of that line, so the whole string became
// the person's name. 22 stored sheets across 8 people matched no account and
// could not be sent. Every one of them matched immediately once the tail came
// off, so this is the only thing that was wrong.
//
// What the tail carried is KEPT rather than dropped: the sheet prints it, and
// the payroll report's own SickHr / PTO columns are preferred where that file
// was uploaded. Time off is still PAID from the calendar the office records.
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitEmployeeName } from "../parse.js";

test("the sick-time total comes off the name and is kept", () => {
  const r = splitEmployeeName("Aranda, Jennifer Paid Sick Time Used this Period: 15.00");
  assert.equal(r.name, "Aranda, Jennifer", "the name must stop at the label");
  assert.equal(r.timeOff.sick, 15, "and the figure must survive - the sheet prints it");
});

test("PTO comes off too, and a line can carry both", () => {
  assert.equal(splitEmployeeName("Doe, Jane PTO Used this Period: 8.00").timeOff.pto, 8);
  const both = splitEmployeeName(
    "Doe, Jane Paid Sick Time Used this Period: 4.00 PTO Used this Period: 8.00",
  );
  assert.equal(both.name, "Doe, Jane");
  assert.equal(both.timeOff.sick, 4);
  assert.equal(both.timeOff.pto, 8);
});

test("an ordinary name is left exactly alone", () => {
  for (const n of [
    "Adams, Taylor",
    "Delgado Pineda, Ruth",
    "O'Brien-Smith, Mary Jo",
    "Romero-Alba, Juanita",
  ]) {
    const r = splitEmployeeName(n);
    assert.equal(r.name, n, `"${n}" must survive untouched`);
    assert.equal(r.timeOff, null);
  }
});

test("only a time-off label is stripped, never anything else", () => {
  // a name that loses a real part of itself is the bug being fixed, pointed the
  // other way, so anything the parser does not recognise stays on the name
  const r = splitEmployeeName("Smith, John Employee Number: 4021");
  assert.equal(r.name, "Smith, John Employee Number: 4021");
  assert.equal(r.timeOff, null);
});

test("no hours means nothing is taken off", () => {
  const r = splitEmployeeName("Smith, John Paid Sick Time Used this Period:");
  assert.equal(r.name, "Smith, John Paid Sick Time Used this Period:");
  assert.equal(r.timeOff, null);
});
