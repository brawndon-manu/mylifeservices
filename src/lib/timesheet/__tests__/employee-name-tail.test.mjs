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
import { buildWhoKey } from "../people.js";

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

// ---------------------------------------------------------------------------
// THE NAMES THIS ACTUALLY PRODUCED, taken off the database on 2026-09-15.
//
// 44 stored sheets were found carrying one of these. The reader had already
// been fixed by then and every one of the 44 predates the fixed code reaching
// them - two of the batches were uploaded ELEVEN MINUTES after the fix went
// live, from a page that had been open since before it, so the server action
// posted back to the deployment it was born on. Nothing here was wrong; what
// ran was old.
//
// They are pinned anyway, with their real figures, because they are the only
// sample of this that will ever exist: paid sick time was switched on in
// QuickSolve once, and these are the strings it produced.
const FROM_THE_DATABASE = [
  ["Colon, Lori Paid Sick Time Used this Period: 6.50", "Colon, Lori", 6.5],
  ["Rodriguez, Nathalie Paid Sick Time Used this Period: 39.00", "Rodriguez, Nathalie", 39],
  ["Salinas, Carlos Paid Sick Time Used this Period: 4.50", "Salinas, Carlos", 4.5],
  ["Suarez, Carminia Paid Sick Time Used this Period: 6.25", "Suarez, Carminia", 6.25],
  ["Urena, Marilyn Paid Sick Time Used this Period: 10.00", "Urena, Marilyn", 10],
  ["Malacova, Katerina Paid Sick Time Used this Period: 8.00", "Malacova, Katerina", 8],
  // thirds and sixtieths of an hour, which a tidier fixture would never have
  ["Macareno, Allan Paid Sick Time Used this Period: 3.33", "Macareno, Allan", 3.33],
  ["McCulley, Morgan Paid Sick Time Used this Period: 4.87", "McCulley, Morgan", 4.87],
  ["Solorzano, Ilean Paid Sick Time Used this Period: 8.17", "Solorzano, Ilean", 8.17],
  // a hyphenated surname AND a tail. The clean version is pinned above and the
  // tail is pinned above, and neither one covers the pair.
  ["Romero-Alba, Juanita Paid Sick Time Used this Period: 8.00", "Romero-Alba, Juanita", 8],
];

test("every name this produced in the live database comes apart correctly", () => {
  for (const [raw, name, sick] of FROM_THE_DATABASE) {
    const r = splitEmployeeName(raw);
    assert.equal(r.name, name, `"${raw}" should leave "${name}"`);
    assert.equal(r.timeOff?.sick, sick, `and keep ${sick} sick hours`);
  }
});

test("a cleaned name resolves to the person, and the corrupted one resolves to nobody", () => {
  // THIS IS WHAT THE BUG ACTUALLY COST, and stripping the tail is only the
  // means. A name carrying the tail matches no account, so the sheet cannot be
  // sent, the rest attestation cannot find their signed notes, and the premium
  // lands on somebody who does not owe it. Lori Colon is the case that proved
  // it: she works both payrolls, her day program sheet stored the tail, and she
  // read as somebody who had never signed a service note in her life.
  const whoKey = buildWhoKey([{ name: "Lori Colon" }, { name: "Juanita Romero-Alba" }]);
  for (const [raw, name] of FROM_THE_DATABASE) {
    assert.equal(
      whoKey(splitEmployeeName(raw).name), whoKey(name),
      `"${raw}" must resolve the way "${name}" does`,
    );
    // and the check can fail: the raw string resolves somewhere else entirely
    assert.notEqual(
      whoKey(raw), whoKey(name),
      `"${raw}" left alone must NOT resolve to the person - if it does, this test proves nothing`,
    );
  }
});
