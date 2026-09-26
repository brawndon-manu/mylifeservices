// THE DAYS STILL TO ANSWER, BACK UNDER THE DAY LIST.
//
// the list of days still owing an answer lived in the Save my answers panel and
// went when the panel did, leaving only the hold line after the last day. it is
// back as a strip: every day of the period with the rail's own mark, the ones
// still owing an answer in amber, a day opening from its pill, gone once nothing
// is owed. it reads the rail's own status rule and draws the rail's own marks,
// so the two cannot come to disagree.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const rail = read("src/app/t/[token]/DayRail.js");
const flow = read("src/app/t/[token]/ReviewFlow.js");
const days = read("src/app/t/[token]/DayByDay.js");
const css = read("src/app/t/[token]/ReviewFlow.module.css");
const strip = rail.slice(rail.indexOf("export function DaysLeftStrip"));

test("the rail and the strip read one status rule and draw one mark", () => {
  assert.match(rail, /function railStatus\(d, readyOn, flow\) \{/);
  // the rail
  assert.match(rail, /const status = railStatus\(d, readyOn, flow\);/);
  assert.match(rail, /<StatusMark \{\.\.\.status\} \/>\n\s*<StatusWords \{\.\.\.status\} flow=\{flow\} \/>/);
  // the strip
  assert.match(strip, /status: railStatus\(d, readyOn, flow\)/);
  assert.match(strip, /<StatusMark \{\.\.\.status\} \/>/);
  assert.match(strip, /<StatusWords \{\.\.\.status\} flow=\{flow\} \/>/);
  // and no second copy of the rule inside the strip
  assert.doesNotMatch(strip, /!!d\.needs/);
});

test("it shows only while a day still owes an answer", () => {
  assert.match(strip, /if \(!flow \|\| flow\.readOnly\) return null;/);
  assert.match(strip, /if \(!rows\.some\(\(\{ status \}\) => status\.needsAnswer\)\) return null;/);
});

test("every day gets a pill, the owed ones marked, and a pill opens its day", () => {
  assert.match(strip, /\{rows\.map\(\(\{ d, status \}\) => \(/);
  assert.match(strip, /data-open=\{status\.needsAnswer \? "" : undefined\}/);
  assert.match(strip, /onClick=\{\(\) => flow\.openDay\(d\.date\)\}/);
  // "Wed 16": the weekday short, the day of the month
  assert.match(strip, /<b>\{String\(d\.weekday \|\| ""\)\.slice\(0, 3\)\}<\/b> \{Number\(String\(d\.date\)\.split\("\/"\)\[1\]\)\}/);
});

test("the sentence is the reports step's, said once", () => {
  assert.match(flow, /export const REMAINING_QUESTIONS = "Answer the remaining questions to generate your document\.";/);
  assert.match(flow, /&& !ready \? REMAINING_QUESTIONS/);
  assert.match(strip, /\{REMAINING_QUESTIONS\}/);
  const all = [rail, flow, days].join("\n");
  assert.equal(all.split("Answer the remaining questions to generate your document.").length - 1, 1);
});

test("it sits under the day list in both views", () => {
  assert.match(days, /<DayRail days=\{railDays\} stacked=\{stacked\}>\{panes\}<\/DayRail>\n(\s*\{\/\*[\s\S]*?\*\/\}\n)?\s*<DaysLeftStrip days=\{railDays\} \/>/);
});

test("an owed day's pill keeps its contrast in light", () => {
  assert.match(css, /\.stripDay\[data-open\] \{\n\s*background: color-mix\(in srgb, var\(--status-caution\) 13%, transparent\);\n\s*color: color-mix\(in srgb, var\(--status-caution\) 80%, var\(--foreground\)\);/);
  assert.match(css, /\.stripDay:focus-visible \{\n\s*outline: 2px solid var\(--accent\);/);
});
