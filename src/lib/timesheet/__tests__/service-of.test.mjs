import test from "node:test";
import assert from "node:assert/strict";
import { serviceOf, blockTimes } from "../schedule.js";

// Every string here is verbatim from the live 07/16-07/31 schedule export, so
// the parser is measured against the document rather than against a guess at it.

test("the service comes off the end, and the client never comes with it", () => {
  // Mánu 2026-08-12: "Just don't include the client's name."
  assert.equal(serviceOf("10a-12p Rincon, R-ILS Service (2:00)"), "ILS Service");
  assert.equal(serviceOf("1:15p-3:15p Moore, R-ILS Service(2:00)"), "ILS Service");
  assert.equal(serviceOf("3:30p-5:30p Oceguera, R-ILS Service(2:00)"), "ILS Service");
  for (const t of ["10a-12p Rincon, R-ILS Service (2:00)", "1:15p-3:15p Moore, R-ILS Service(2:00)"]) {
    assert.ok(!/Rincon|Moore|R\b/.test(serviceOf(t)), `${serviceOf(t)} still carries a name`);
  }
});

test("a block booked against no client reads the same way", () => {
  // his 07/30, the one that started this
  assert.equal(serviceOf("12p-12:10p -ILS Misc(0:10)"), "ILS Misc");
  assert.equal(serviceOf("10a-2p -ILS Admin(4:00)"), "ILS Admin");
  assert.equal(serviceOf("2:30p-5:30p -ILS Admin(3:00)"), "ILS Admin");
});

test("a meal block says so", () => {
  assert.equal(serviceOf("2p-2:30p -Meal Break(0:30)"), "Meal Break");
});

test("travel, which only the Daily Service report has shown so far", () => {
  assert.equal(serviceOf("12:30p-12:40p -ILS Travel(0:10)"), "ILS Travel");
});

test("the space before the bracket is optional, because the export is inconsistent", () => {
  // "ILS Service (2:00)" and "ILS Service(2:00)" both appear on the same sheet
  assert.equal(serviceOf("10a-12p A, B-ILS Service (2:00)"), "ILS Service");
  assert.equal(serviceOf("10a-12p A, B-ILS Service(2:00)"), "ILS Service");
});

test("a client name holding a hyphen does not eat the service", () => {
  // the last hyphen wins, which is the only one that reliably separates them
  assert.equal(serviceOf("9a-5p Smith-Jones, K-ILS Service(8:00)"), "ILS Service");
});

test("nothing readable comes back null rather than a fragment", () => {
  assert.equal(serviceOf(""), null);
  assert.equal(serviceOf(null), null);
  assert.equal(serviceOf("10a-12p"), null);
});

test("times and service are read off the same string without disturbing each other", () => {
  const text = "12p-12:10p -ILS Misc(0:10)";
  assert.deepEqual(blockTimes(text), { start: 12 * 60, end: 12 * 60 + 10 });
  assert.equal(serviceOf(text), "ILS Misc");
});
