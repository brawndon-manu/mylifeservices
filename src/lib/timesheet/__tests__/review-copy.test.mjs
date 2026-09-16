// THE REPORTS PANEL SAYS THE TRUE THING IN BOTH CASES.
//
// On an ILS sheet it named a step ILS does not have - the PTO stage has been the
// day program's alone since 7581540 - and with nothing reported it put "review
// these" above "No problems reported", which reads as a list you have to work
// through when there is nothing on it. Mánu 2026-09-16, off his own sheet, and
// the three sentences below are his.
//
// Client component, so the copy is pinned as text the way the rest of this
// screen's rules are.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(new URL("../../../app/t/[token]/ReportProblem.js", import.meta.url), "utf8");
const flow = fs.readFileSync(new URL("../../../app/t/[token]/ReviewFlow.js", import.meta.url), "utf8");

test("an empty list says so and says nothing else", () => {
  assert.match(src, /items\.length === 0\s*\n?\s*\? "Nothing reported on this timesheet\."/);
  // the old second line is gone, or the panel says it twice
  assert.doesNotMatch(src, /No problems reported\./);
});

test("a list points at the step that actually comes next, per program", () => {
  assert.match(src, /flow\?\.leave\s*\n?\s*\? "Review these before moving to PTO & sick pay\."/);
  assert.match(src, /: "Review these before you generate your document\."/);
});

test("the panel can tell the two programs apart, or it would guess", () => {
  // `leave` is what carries the difference and it has to be on the context
  assert.match(flow, /const value = enabled \? \{ stage, go, items, setItems, reported, setReported, readOnly, leave,/);
});

test("the strip is one row for three steps and a square for four", () => {
  assert.match(flow, /const stripClass = steps\.length > 3 \? "grid grid-cols-2 gap-2" : "flex gap-3";/);
});
