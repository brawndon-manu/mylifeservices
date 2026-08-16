// THE CHARACTER THAT COST FOUR BATCHES, PUT THROUGH THE REAL CHECK.
//
// ONE SCENARIO, ONE TEST, and every one of them calls `unstorable` on a row
// shaped like a real sheet's `data` rather than reading any source as text.
// The shape matters: the NUL that actually happened was not on a top-level
// field, it was buried in a day inside an array inside the record, and a check
// that only looked at the name would have passed it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { unstorable, unstorableRows } from "../storable.js";

// a sheet record cut down to the parts that carry text off a document: the
// employee, the client names on each day, and the free-text notes
const sheet = (over = {}) => ({
  generatedOn: "8/15/2026",
  payPeriod: { from: "08/01/26", to: "08/15/26" },
  comments: ["1) Missed lunch on 08/04, corrected in QSP"],
  days: [
    { date: "08/03/26", shifts: [{ text: "9a-1p Client-ILS Service(4:00)" }], note: null },
    { date: "08/04/26", shifts: [{ text: "1p-1:15p -ILS Travel(0:15)" }], note: null },
  ],
  ...over,
});

const NUL = "\u0000";

test("an ordinary sheet stores", () => {
  assert.equal(unstorable(sheet()), null);
});

test("the character that broke it is found wherever it sits", () => {
  // page 30, item 322: beside the print date in the footer, on one person's
  // page. it reached the record through the day rows, not the name.
  const d = sheet();
  d.days[1].note = `printed 8/15/2026${NUL}`;
  const bad = unstorable(d);
  assert.ok(bad, "a NUL inside a day went through");
  assert.equal(bad.what, "a NUL (U+0000)");
  // the surrounding text is the point of the report - it is what says WHERE
  assert.match(bad.near, /printed 8\/15\/2026/);
});

test("an accented name is not a problem", () => {
  // the sheets carry Uribe, Mánu and Delgado Pineda. a check that refused
  // anything non-ascii would refuse most of a real upload.
  assert.equal(unstorable(sheet({ employee: "Uribe, Mánu" })), null);
});

test("the C0 characters Postgres accepts are not refused here", () => {
  // NOT the same rule as the parser's. `stripControl` takes every C0 character
  // off the page because they are noise in a printed cell; the database only
  // ever refused two of them, and refusing the rest here would fail uploads
  // Postgres would have taken.
  //
  // The escaped pair matter more than the tab: JSON.stringify writes \n and \t
  // in their short form, so a check widened to "any \u escape" would still let
  // those through and only bite on a character nobody thought to test with.
  // Every one put to the real database: docs/week10/scratch/jsonb-refuses.mjs.
  const d = sheet();
  d.comments = ["1) two lines\n\tand a tab"];
  d.days[0].note = "start of heading \u0001 and a unit separator \u001f";
  assert.equal(unstorable(d), null);
});

test("half a surrogate pair is refused and a whole one is not", () => {
  const half = sheet();
  half.days[0].note = `odd \ud83d`;
  assert.ok(unstorable(half), "a lone high surrogate went through");

  const whole = sheet();
  whole.days[0].note = "done 😀";
  assert.equal(unstorable(whole), null, "a complete emoji is ordinary text");
});

test("every person is named, not just the first", () => {
  // the upload died on the 25th of 60 and nobody found out about anybody after
  // her. a report that stops at the first is the same failure in a nicer coat.
  const rows = [
    { sourceName: "Cain, Ashley", data: sheet() },
    { sourceName: "Lambert, McKenzie", data: sheet({ footer: `8/15/2026${NUL}` }) },
    { sourceName: "Rison, Kamilah", data: sheet() },
    { sourceName: "Devine, Brian", data: sheet({ footer: `8/15/2026${NUL}` }) },
  ];
  const found = unstorableRows(rows);
  assert.deepEqual(found.map((f) => f.name), ["Lambert, McKenzie", "Devine, Brian"]);
});

test("a clean upload reports nobody", () => {
  // the check has to be able to say yes, or the refusal above proves nothing
  const rows = [
    { sourceName: "Cain, Ashley", data: sheet() },
    { sourceName: "Uribe, Mánu", data: sheet({ employee: "Uribe, Mánu" }) },
  ];
  assert.deepEqual(unstorableRows(rows), []);
});
