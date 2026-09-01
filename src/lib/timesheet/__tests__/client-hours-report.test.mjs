// THE CLIENT HOURS REPORT'S ARITHMETIC: billable is the billed figure with
// the reviewer's corrections in place, remaining is the monthly authorization
// minus it, and the detailed breakdown groups per employee in date order.
import { test } from "node:test";
import assert from "node:assert/strict";
import { clientHoursModel } from "../client-hours-report.js";

const row = (client, who, date, billedMin, extra = {}) => ({
  client,
  authKey: client.toLowerCase().replace(/[^a-z]+/g, " ").trim(),
  who,
  date,
  startMin: 540,
  billedMin,
  review: null,
  ...extra,
});

const base = {
  periodFrom: "08/16/26",
  periodTo: "08/31/26",
  monthLabel: "August 2026",
  generatedOn: "9/1/2026",
};

test("billable takes the corrected figure where one exists", () => {
  const m = clientHoursModel({
    ...base,
    rows: [
      row("Acuna, Jacob", "Gutierrez, Joseph", "08/17/26", 120),
      row("Acuna, Jacob", "Gutierrez, Joseph", "08/19/26", 120, {
        review: { billableMin: 90 },
      }),
    ],
    authorized: { "acuna jacob": { hours: 15 } },
  });
  const c = m.clients[0];
  assert.equal(c.billableMin, 210);
  assert.equal(c.authorizedMin, 900);
  assert.equal(c.remainingMin, 690);
  assert.equal(c.adjusted, 1);
});

test("a client with no authorization gets empty columns, not zeros", () => {
  const m = clientHoursModel({ ...base, rows: [row("Lee, Alyssa", "Beall, Allyson", "08/18/26", 60)], authorized: {} });
  assert.equal(m.clients[0].authorizedMin, null);
  assert.equal(m.clients[0].remainingMin, null);
});

test("billing past the authorization goes negative rather than clamping", () => {
  const m = clientHoursModel({
    ...base,
    rows: [row("Munoz, Omar", "Torres, Sebastian", "08/17/26", 16 * 60)],
    authorized: { "munoz omar": { hours: 15 } },
  });
  assert.equal(m.clients[0].remainingMin, -60);
});

test("the detailed breakdown groups per employee in date order", () => {
  const m = clientHoursModel({
    ...base,
    detailed: true,
    rows: [
      row("Acuna, Jacob", "Torres, Sebastian", "08/20/26", 60),
      row("Acuna, Jacob", "Gutierrez, Joseph", "08/19/26", 120),
      row("Acuna, Jacob", "Gutierrez, Joseph", "08/17/26", 120, { review: { billableMin: 90 } }),
    ],
    authorized: null,
  });
  const emps = m.clients[0].employees;
  assert.deepEqual(emps.map((e) => e.who), ["Gutierrez, Joseph", "Torres, Sebastian"]);
  assert.equal(emps[0].totalMin, 210);
  assert.equal(emps[0].entries[0].when.startsWith("08/17/26"), true);
  assert.match(emps[0].entries[0].figure, /adjusted by the reviewer/);
  assert.equal(emps[0].entries[1].figure, "2.00h");
});

test("a detail line carries the whole billed window, not just where it starts", () => {
  const m = clientHoursModel({
    ...base,
    detailed: true,
    rows: [
      row("Buchanan, Jake", "Cain, Ashley", "08/21/26", 120, { schedFrom: 750, schedTo: 870 }),
      // a shift with no end still prints its start rather than nothing
      row("Buchanan, Jake", "Cain, Ashley", "08/25/26", 60, { schedFrom: 990, schedTo: null }),
    ],
  });
  const entries = m.clients[0].employees[0].entries;
  assert.equal(entries[0].when, "08/21/26 · 12:30p-2:30p");
  assert.equal(entries[1].when, "08/25/26 · 4:30p");
});

test("the summary counts clients and flags the missing capture report", () => {
  const withAuth = clientHoursModel({
    ...base,
    rows: [row("Acuna, Jacob", "G", "08/17/26", 60)],
    authorized: { "acuna jacob": { hours: 15 } },
  });
  assert.match(withAuth.summary[1], /August 2026 Budget Capture Report/);
  const without = clientHoursModel({ ...base, rows: [row("Acuna, Jacob", "G", "08/17/26", 60)], authorized: null });
  assert.match(without.summary[1], /No Budget Capture Report/);
});

test("summary clients are alphabetical and the detail flag names the title", () => {
  const m = clientHoursModel({
    ...base,
    rows: [row("Zed, A", "G", "08/17/26", 60), row("Abel, B", "G", "08/17/26", 60)],
    detailed: true,
  });
  assert.deepEqual(m.clients.map((c) => c.name), ["Abel, B", "Zed, A"]);
  assert.equal(m.title, "Client Billable Hours - Detailed");
});
