// THE FLAGGED SHIFTS AS A DOCUMENT.
//
// The model is tested rather than the PDF: everything the document says is
// computed here, and a test that parses drawn text pins the renderer instead
// of the words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { flagReportModel } from "../flag-report.js";

const flag = (over = {}) => ({
  who: "Marilyn Urena", date: "08/20/26", startMin: 630,
  client: "Elder. Morton, Susan", service: "ILS Service",
  billedMin: 120, clockedMin: 15,
  reason: "Over billed services hours. Clock in time doesn't make sense",
  decidedByName: "Mánu Uribe", decidedOn: "08/28/26",
  ...over,
});

const model = (flags) =>
  flagReportModel({ periodFrom: "08/16/26", periodTo: "08/31/26", generatedOn: "08/28/26", flags });

// ---- the summary ----

test("over, under, level and unclocked are counted apart", () => {
  const m = model([
    flag(),                                                        // 105 over
    flag({ date: "08/21/26", billedMin: 180, clockedMin: 200 }),   // 20 under
    flag({ date: "08/18/26", billedMin: 93, clockedMin: 93 }),     // level
    flag({ date: "08/17/26", clockedMin: null }),                  // no clock
  ]);
  assert.equal(m.summary[0], "4 shifts flagged on review.");
  assert.equal(
    m.summary[1],
    "1 bill above their clock, 1.75h in total; 1 bill below it, 0.33h; 1 matches the clock; 1 has no clock to compare.",
  );
});

test("a period with nothing flagged says so instead of printing an empty document", () => {
  assert.deepEqual(model([]).summary, ["No shifts are flagged in this period."]);
});

// ---- the entries ----

test("an entry names the shift, the figures as decided, and quotes the reason", () => {
  const e = model([flag()]).groups[0].entries[0];
  assert.equal(e.when, "08/20/26 · 10:30a · Elder. Morton, Susan · ILS Service");
  assert.equal(e.figures, "billed 2.00h · clocked 0.25h · 1.75h above the clock");
  assert.equal(e.quote, "Over billed services hours. Clock in time doesn't make sense");
});

test("billing below the clock says below, and matching says neither", () => {
  const m = model([
    flag({ billedMin: 180, clockedMin: 200 }),
    flag({ date: "08/21/26", billedMin: 93, clockedMin: 93 }),
  ]);
  const [a, b] = m.groups[0].entries.map((e) => e.figures).sort();
  assert.equal(b, "billed 3.00h · clocked 3.33h · 0.33h below the clock");
  assert.equal(a, "billed 1.55h · clocked 1.55h");
});

test("a shift with no clock reads not clocked rather than inventing a zero", () => {
  const e = model([flag({ clockedMin: null })]).groups[0].entries[0];
  assert.equal(e.figures, "billed 2.00h · not clocked");
});

// ---- grouping ----

test("one group per person, people alphabetical, their days in order", () => {
  const m = model([
    flag({ who: "Marilyn Urena", date: "08/24/26", startMin: 1020 }),
    flag({ who: "Ashley Cain", date: "08/17/26" }),
    flag({ who: "Marilyn Urena", date: "08/19/26", startMin: 465 }),
  ]);
  assert.deepEqual(m.groups.map((g) => g.who), ["Ashley Cain", "Marilyn Urena"]);
  assert.deepEqual(m.groups[1].entries.map((e) => e.when.slice(0, 8)), ["08/19/26", "08/24/26"]);
});

// ---- the approved, compact ----

test("the approved section is a count, the hours, and a name-and-count run", () => {
  const m = flagReportModel({
    periodFrom: "08/16/26", periodTo: "08/31/26", generatedOn: "08/28/26",
    flags: [flag()],
    approved: [
      { who: "Marilyn Urena", billedMin: 120 },
      { who: "Ashley Cain", billedMin: 60 },
      { who: "Marilyn Urena", billedMin: 60 },
    ],
  });
  assert.equal(m.approved.line, "3 shifts · 4.00h billed");
  assert.deepEqual(m.approved.names, ["Ashley Cain 1", "Marilyn Urena 2"]);
});

test("a report with nothing approved has no approved section", () => {
  assert.equal(model([flag()]).approved, null);
});

// ---- the footer ----

test("one reviewer over one day is a plain sentence", () => {
  assert.equal(model([flag()]).footer, "Flags recorded by Mánu Uribe on 08/28/26.");
});

// his two accounts read "Mánu" and "Mánu Uribe" - one person, and the footer
// must not report two reviewers
test("a name that is the start of another is the same person once", () => {
  const m = model([
    flag({ decidedByName: "Mánu" }),
    flag({ date: "08/21/26", decidedByName: "Mánu Uribe" }),
  ]);
  assert.equal(m.footer, "Flags recorded by Mánu Uribe on 08/28/26.");
});

test("two accounts and a span of days are both spelled out", () => {
  const m = model([
    flag({ decidedByName: "Brandon Uribe", decidedOn: "08/26/26" }),
    flag({ date: "08/21/26" }),
  ]);
  assert.equal(m.footer, "Flags recorded by Brandon Uribe and Mánu Uribe between 08/26/26 and 08/28/26.");
});
