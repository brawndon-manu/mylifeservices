// A MARK HAS TO OUTLIVE THE UPLOAD IT WAS MADE ON.
//
// `rowKey` carries the timesheet id, and timesheet rows are remade by every
// upload, so anything hanging off one dies the next morning - 70 marks did
// exactly that when the 08/12 export landed on top of the 08/09 one. So every
// entry now also carries `personKey` (the account, stable across uploads) and
// `findingKey` (what the finding is, with no id in it).
//
// These pin the property rather than the shapes: a finding type added later
// without a key would be silently unmarkable, and nothing else would complain.
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildFindings } from "../findings.js";

// enough of a batch to reach every branch of the builder: a punch issue that is
// an overlap, one that is not, a rest report row, a violation, a tacked rest.
const day = (date, extra = {}) => ({
  date, paidHours: 8, worked: 480, punches: [], ...extra,
});
const batch = {
  restsByDate: [
    { name: "Test, Person", date: "08/03/26", out: "10:30 AM", in: "10:40 AM",
      kind: "short", minutes: 10, counted: true, shift: "9:00 AM to 5:00 PM", offOwnShift: true },
  ],
  timesheets: [
    {
      id: "cktimesheetidaaaaaaaaaaaa",
      userId: "ckuseridaaaaaaaaaaaaaaaaa",
      sourceName: "Test, Person",
      premiumHours: 2,
      signedAt: null,
      approvedAt: null,
      overrides: {},
      data: {
        days: [
          day("08/03/26", { mealViolation: true, restViolations: 1, restTackedOn: true }),
          day("08/04/26", { restViolations: 1 }),
        ],
        punchIssues: [{ date: "08/04/26", hoursNow: 7.89 }],
        scheduleCheck: {
          matched: true,
          byDate: {
            "08/04/26": { shifts: [
              { text: "9:00 AM - 1:00 PM", minutes: 240 },
              { text: "12:00 PM - 4:00 PM", minutes: 240 },
            ] },
          },
        },
      },
    },
  ],
};

const { entries } = buildFindings(batch);

test("the fixture actually produces findings, or the rest of this proves nothing", () => {
  assert.ok(entries.length >= 3, `only ${entries.length} findings built`);
});

test("every finding carries a findingKey, and no key hides a timesheet id", () => {
  for (const e of entries) {
    assert.ok(e.findingKey, `${e.kind} on ${e.date || "the sheet"} has no findingKey`);
    assert.ok(
      !/c[a-z0-9]{24}/.test(e.findingKey),
      `${e.kind}: findingKey "${e.findingKey}" still carries an id, so it dies on the next upload`,
    );
  }
});

test("every finding that belongs to a sheet names the person behind it", () => {
  for (const e of entries) {
    if (!e.timesheetId) continue;
    assert.equal(
      e.personKey, "ckuseridaaaaaaaaaaaaaaaaa",
      `${e.kind} on ${e.date || "the sheet"} lost its person`,
    );
  }
});

// the pair is what has to be unique, and a duplicate would mean two different
// findings quietly sharing one mark
test("person and finding together identify a row uniquely", () => {
  const seen = new Set();
  for (const e of entries) {
    const k = `${e.personKey}|${e.findingKey}`;
    assert.ok(!seen.has(k), `two findings share the key ${k}`);
    seen.add(k);
  }
});

// the five overlap marks were stored back to front because the checks page was
// minting keys the builder never gave it
test("overlap and punch rows are keyed here, not invented by the page", () => {
  const punchy = entries.filter((e) => e.kind === "overlap" || e.kind === "punch");
  assert.ok(punchy.length, "fixture built no punch or overlap row");
  for (const e of punchy) {
    assert.ok(e.rowKey, `${e.kind} still has no rowKey, so the page would mint one`);
    assert.ok(
      e.rowKey.startsWith(`${e.kind}-`),
      `${e.kind} rowKey "${e.rowKey}" is not in the builder's own shape`,
    );
    assert.equal(e.findingKey, `${e.kind}-${e.date}`);
  }
});

test("an unmatched rest row keeps a null person rather than borrowing one", () => {
  const orphan = buildFindings({
    ...batch,
    restsByDate: [{ ...batch.restsByDate[0], name: "Nobody, Atall" }],
  }).entries.filter((e) => e.who === "Nobody, Atall");
  assert.ok(orphan.length, "the unmatched row produced no finding at all");
  for (const e of orphan) assert.equal(e.personKey, null);
});
