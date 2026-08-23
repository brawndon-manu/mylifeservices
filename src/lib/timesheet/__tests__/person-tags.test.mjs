// TAGS ON ONE PERSON'S CARD, for the all-employees screen.
//
// The screen exists because the checks list only shows people something is
// wrong with, so the clean ones appear nowhere. These tests mostly pin that the
// tags READ the existing definitions rather than restating them, and that a
// person with nothing on them comes back genuinely empty rather than
// accidentally empty.
import { test } from "node:test";
import assert from "node:assert/strict";

import { tagsForPerson, isClean } from "../person-tags.js";

const sheet = (days, extra = {}) => ({
  sourceName: "Test, Person",
  premiumHours: 0,
  paidHours: 8,
  data: { days, ...extra },
  ...extra.sheet,
});

const keys = (tags) => tags.map((t) => t.key);
const byKey = (tags, k) => tags.find((t) => t.key === k);

test("somebody with nothing on them gets no tags, and reads as clean", () => {
  const tags = tagsForPerson(sheet([{ date: "08/03/26", paidHours: 8 }]));
  assert.deepEqual(tags, []);
  assert.equal(isClean(tags), true);
});

test("violations come through by kind, counted, from violationsFor", () => {
  const tags = tagsForPerson(
    sheet([
      { date: "08/03/26", paidHours: 8, restViolation: true, restRequired: 2, restTaken: 0 },
      { date: "08/04/26", paidHours: 8, restViolation: true, restRequired: 2, restTaken: 0 },
      { date: "08/05/26", paidHours: 8, mealViolation: true },
    ]),
  );
  assert.equal(byKey(tags, "rest-not-taken").n, 2);
  assert.equal(byKey(tags, "meal-not-recorded").n, 1);
  assert.equal(isClean(tags), false);
});

test("a late meal is its own tag, not folded into the missing one", () => {
  const tags = tagsForPerson(
    sheet([{ date: "08/03/26", paidHours: 8, mealViolation: true, mealLate: true, mealStartedAfterMin: 330 }]),
  );
  assert.ok(byKey(tags, "meal-late"));
  assert.ok(!byKey(tags, "meal-not-recorded"));
});

test("the premium tag carries the figure, and only when there is one", () => {
  const none = tagsForPerson({ ...sheet([]), premiumHours: 0 });
  assert.ok(!byKey(none, "premium"));
  const some = tagsForPerson({ ...sheet([]), premiumHours: 5 });
  assert.equal(byKey(some, "premium").n, 5);
  assert.equal(byKey(some, "premium").figure, true, "so the card prints 5.00 rather than 5");
});

// ------------------------------------------------------------------ conflicts

test("an overlapping booking is a billing conflict, not a punch that does not read", () => {
  // Mánu 2026-08-12: "I don't like that Garcia is under punches that do not
  // read." Her punches are exactly what QSP wrote; two blocks were sold over
  // each other. The split asks the same `overlapInfo` the checks list asks.
  const overlapping = tagsForPerson(
    sheet([{ date: "08/03/26", paidHours: 8 }], {
      punchIssues: [{ date: "08/03/26" }],
      scheduleCheck: {
        byDate: {
          "08/03/26": {
            shifts: [
              { text: "9a-12p Smith, J-ILS Service (3:00)" },
              { text: "11a-1p -ILS Travel(2:00)" },
            ],
          },
        },
      },
    }),
  );
  assert.ok(byKey(overlapping, "overlap"), "the schedule shows two blocks over each other");
  assert.ok(!byKey(overlapping, "punch"));

  const plain = tagsForPerson(
    sheet([{ date: "08/03/26", paidHours: 8 }], {
      punchIssues: [{ date: "08/03/26" }],
      scheduleCheck: { byDate: { "08/03/26": { shifts: [{ text: "9a-5p Smith, J-ILS Service (8:00)" }] } } },
    }),
  );
  assert.ok(byKey(plain, "punch"));
  assert.ok(!byKey(plain, "overlap"));
});

// ------------------------------------------------------- how it was scheduled

// THE UNDERCOUNT, 2026-08-22. The overlap tag counted days that overlapped AND
// produced a punch issue. A clean overlap raises no punch issue at all, so it
// was invisible - 31 days tagged against the 77 that actually overlap, and
// Cain's 08/01 card read zero while ten of her days had bookings over each
// other. Those minutes bill twice whether or not a punch looks odd.
test("an overlap is counted even when the punches are fine", () => {
  const tags = tagsForPerson(
    sheet([{ date: "08/03/26", paidHours: 8 }], {
      // no punchIssues at all
      scheduleCheck: {
        byDate: {
          "08/03/26": {
            shifts: [
              { text: "9a-12p Smith, J-ILS Service (3:00)", minutes: 180 },
              { text: "11a-1p -ILS Travel(2:00)", minutes: 120 },
            ],
          },
        },
      },
    }),
  );
  assert.equal(byKey(tags, "overlap").n, 1);
});

test("a booking past the cap gets its own tag, counted", () => {
  const tags = tagsForPerson(
    sheet([{ date: "08/03/26", paidHours: 8 }], {
      scheduleCheck: {
        byDate: {
          "08/03/26": { shifts: [{ text: "9a-5p Smith, J-ILS Service (8:00)", minutes: 480 }] },
          "08/04/26": { shifts: [{ text: "9a-3p Wood, A-Self Determination Program(6:00)", minutes: 360 }] },
        },
      },
    }),
  );
  assert.equal(byKey(tags, "over-cap").n, 2);
});

test("a long travel block is not one", () => {
  const tags = tagsForPerson(
    sheet([{ date: "08/03/26", paidHours: 8 }], {
      scheduleCheck: {
        byDate: { "08/03/26": { shifts: [{ text: "8a-4p -ILS Travel(8:00)", minutes: 480 }] } },
      },
    }),
  );
  assert.equal(byKey(tags, "over-cap"), undefined);
});

// THE POINT OF THE SEPARATE TONE. A booking was rostered before this person
// clocked into it, so dressing it in the same colour as a punch that does not
// read - or worse, as a premium - puts somebody else's decision on them.
test("scheduling tags carry their own tone, never a violation or premium one", () => {
  const tags = tagsForPerson(
    sheet([{ date: "08/03/26", paidHours: 8 }], {
      scheduleCheck: {
        byDate: {
          "08/03/26": {
            shifts: [
              { text: "9a-5p Smith, J-ILS Service (8:00)", minutes: 480 },
              { text: "11a-1p -ILS Travel(2:00)", minutes: 120 },
            ],
          },
        },
      },
    }),
  );
  for (const key of ["over-cap", "overlap"]) {
    assert.equal(byKey(tags, key).tone, "scheduling", `${key} must not borrow another tone`);
  }
});

test("schedule flags collapse to one tag per kind, counted", () => {
  // all three are zero on both live batches, so this is the only place the
  // behaviour is pinned at all
  const tags = tagsForPerson(
    sheet([], {
      scheduleCheck: {
        byDate: {},
        flagged: [
          { date: "08/03/26", kind: "missing-from-timesheet" },
          { date: "08/04/26", kind: "missing-from-timesheet" },
          { date: "08/05/26", kind: "not-on-schedule" },
        ],
      },
    }),
  );
  assert.equal(byKey(tags, "flag-missing-from-timesheet").n, 2);
  assert.equal(byKey(tags, "flag-missing-from-timesheet").label, "Scheduled but never worked");
  assert.equal(byKey(tags, "flag-not-on-schedule").n, 1);
});

// -------------------------------------------------------------------- missing

test("rest report rows are counted from the caller, since they live on the batch", () => {
  const tags = tagsForPerson(sheet([]), { restRowCount: 3 });
  assert.equal(byKey(tags, "rest-rows").n, 3);
});

test("not being in the Rest Periods Report is a tag with no number", () => {
  // a person's fact, not a day's - printed per day it was the identical
  // sentence five times down Aranda's page
  const tags = tagsForPerson(
    sheet([
      { date: "08/03/26", paidHours: 8, restViolation: true, restRequired: 2, restTaken: 0, restSource: "none" },
      { date: "08/04/26", paidHours: 8, restViolation: true, restRequired: 2, restTaken: 0, restSource: "none" },
    ]),
  );
  const t = byKey(tags, "no-report");
  assert.ok(t);
  assert.equal(t.n, null, "the count belongs to the rest tag, not to this one");
});

test("every tag names a tone the card can actually colour", () => {
  // Tailwind v4 compiles only what it can see, so a tone with no literal behind
  // it renders as no colour at all rather than as an error.
  const TONES = new Set(["violation", "premium", "conflict", "anomaly", "missing"]);
  const tags = tagsForPerson(
    sheet([{ date: "08/03/26", paidHours: 8, restViolation: true, restRequired: 1, restTaken: 0, restSource: "none" }], {
      punchIssues: [{ date: "08/03/26" }],
      scheduleCheck: { byDate: {}, flagged: [{ date: "08/04/26", kind: "mismatch" }] },
      sheet: { premiumHours: 2 },
    }),
    { restRowCount: 1 },
  );
  assert.ok(tags.length >= 4, `expected several tags, got ${keys(tags).join(",")}`);
  for (const t of tags) assert.ok(TONES.has(t.tone), `${t.key} has unknown tone ${t.tone}`);
});

test("no data at all does not throw", () => {
  assert.deepEqual(tagsForPerson(null), []);
  assert.deepEqual(tagsForPerson({}), []);
});
