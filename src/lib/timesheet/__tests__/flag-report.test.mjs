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

// ---- the detail line ----

test("a joined flag prints punches, GPS and the set billable on one line", () => {
  const m = model([flag({
    punchIn: "10:30a", punchOut: "10:45a", noIn: false, noOut: false,
    gpsIn: "yes", gpsOut: "no", clockAvailable: true, inClockExport: true,
    billableMin: 60,
  })]);
  assert.equal(
    m.groups[0].entries[0].detail,
    "in 10:30a GPS yes · out 10:45a GPS no · billable set 1.00h",
  );
});

test("a missed punch says so and a blank GPS says nothing", () => {
  const m = model([flag({
    punchIn: null, punchOut: "10:45a", noIn: true, noOut: false,
    gpsIn: null, gpsOut: null, clockAvailable: true, inClockExport: true,
    billableMin: null,
  })]);
  assert.equal(m.groups[0].entries[0].detail, "no clock-in · out 10:45a");
});

test("a shift the clock export has no row for states that instead of punches", () => {
  const m = model([flag({
    punchIn: null, punchOut: null, noIn: false, noOut: false,
    gpsIn: null, gpsOut: null, clockAvailable: true, inClockExport: false,
    billableMin: null,
  })]);
  assert.equal(m.groups[0].entries[0].detail, "no clock row for this shift");
});

test("a flag with no joined row prints no detail line at all", () => {
  const m = model([flag()]);
  assert.equal(m.groups[0].entries[0].detail, null);
});

// ---- the detailed model ----

import { flagReportDetailModel, ampmLabel, minsWords } from "../flag-report.js";

const dflag = (over = {}) => ({
  who: "Allyson Beall", title: "Independent Living Instructor",
  date: "08/21/26", startMin: 600, client: "Antoine, Tremayne", service: "ILS Service",
  billedMin: 240, clockedMin: 220, billableMin: null,
  reason: "Over billed", decidedByName: "Mánu Uribe",
  punchIn: 620, punchOut: 840, noIn: false, noOut: false, gpsIn: "yes", gpsOut: "yes",
  clockAvailable: true, inClockExport: true,
  schedFrom: 600, schedTo: 840, originalFrom: 600, originalTo: 840,
  serviceNote: "Staff assisted the client.", scheduleNote: null,
  ...over,
});

const dmodel = (flags) =>
  flagReportDetailModel({ periodFrom: "08/16/26", periodTo: "08/31/26", generatedOn: "09/04/26", flags });

test("round hours carry no minutes wording and uneven ones spell it out", () => {
  assert.equal(minsWords(240), null);
  assert.equal(minsWords(220), "3 hr 40 min");
  assert.equal(minsWords(20), "20 min");
});

test("times print as full clock labels", () => {
  assert.equal(ampmLabel(600), "10:00 AM");
  assert.equal(ampmLabel(872), "2:32 PM");
});

test("an entry carries the scheduled range, stacked figures and the delta", () => {
  const e = dmodel([dflag()]).groups[0].entries[0];
  assert.equal(e.dateLine, "08/21/26   10:00 AM - 2:00 PM");
  assert.deepEqual(e.figures[0], { label: "Billed", h: "4.00h", mins: null });
  assert.deepEqual(e.figures[1], { label: "Scheduled", h: "4.00h", mins: null });
  assert.deepEqual(e.figures[2], { label: "Clocked", h: "3.67h", mins: "3 hr 40 min" });
  assert.deepEqual(e.delta, { h: "0.33h", mins: "20 min", word: "above the clock", over: true });
  assert.deepEqual(e.clock.rows[0], { end: "in", mark: "yes", time: "10:20 AM", gps: "yes" });
});

test("the group header holds the role and the count", () => {
  const g = dmodel([dflag(), dflag({ date: "08/22/26" })]).groups[0];
  assert.equal(g.who, "Allyson Beall");
  assert.equal(g.title, "Independent Living Instructor");
  assert.equal(g.count, "2 shifts");
});

test("no corrected figure reads TBD and a set one reads before and after", () => {
  assert.deepEqual(dmodel([dflag()]).groups[0].entries[0].billing, { tbd: true });
  assert.deepEqual(
    dmodel([dflag({ billableMin: 220 })]).groups[0].entries[0].billing,
    { set: "3.67h", mins: "3 hr 40 min", was: "4.00h" },
  );
});

test("the flag note signs off with who said it", () => {
  const e = dmodel([dflag()]).groups[0].entries[0];
  assert.equal(e.flagNote.text, '"Over billed" - Mánu Uribe');
});

test("a flag with no joined shift prints heading and billing but no clock block", () => {
  const e = dmodel([dflag({
    punchIn: undefined, punchOut: undefined, schedFrom: undefined, schedTo: undefined,
    serviceNote: undefined, scheduleNote: undefined,
  })]).groups[0].entries[0];
  assert.equal(e.dateLine, "08/21/26   10:00 AM");
  assert.equal(e.clock, null);
  assert.deepEqual(e.billing, { tbd: true });
});

test("a DSN-sourced note is labeled DSN on the detailed report", () => {
  assert.equal(dmodel([dflag({ serviceNoteSource: "dsn" })]).groups[0].entries[0].serviceNoteLabel, "DSN");
  assert.equal(dmodel([dflag({ serviceNoteSource: "xls" })]).groups[0].entries[0].serviceNoteLabel, "Service note");
  assert.equal(dmodel([dflag()]).groups[0].entries[0].serviceNoteLabel, "Service note");
});

test("a corrected figure rides the Billed row of the detailed model", () => {
  const e = dmodel([dflag({ billableMin: 220 })]).groups[0].entries[0];
  assert.deepEqual(e.figures[0].corrected, { h: "3.67h", mins: "3 hr 40 min" });
  assert.equal(dmodel([dflag()]).groups[0].entries[0].figures[0].corrected, undefined);
});
