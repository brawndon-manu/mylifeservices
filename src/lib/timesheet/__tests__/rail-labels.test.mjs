// WALKING PAST A DAY IS NOT ANSWERING IT.
//
// Mánu 2026-09-16, Carminia Suarez: "cant proceed with her timesheet and i dont
// know why". She had three days carrying an unanswered meal question and all
// eleven of her days read "Reviewed", because the rail treated the WALK - the
// press that says "I have been here" - as an answer. Generate refused, correctly,
// and nothing on the page pointed at the three days it was waiting for.
//
// It was a per-browser quirk that reset on reload until the walk moved onto the
// sheet on 2026-09-16, which made it permanent.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.join(process.cwd(), "src/app/t/[token]/DayRail.js"), "utf8");

test("only a real answer clears a day that asks something", () => {
  // `d.done` is the server's answer; the walk must not be able to stand in for it
  assert.match(src, /const needsAnswer = !!d\.needs && !d\.done;/);
});

test("the walk still marks a quiet day as reviewed", () => {
  // the press is what says somebody looked at a day with nothing on it, so it
  // has to keep counting for exactly that
  // the provider's walk alone - the tab-only copy the flow kept outlived a reset
  assert.match(src, /const walked = readyOn\(d\.date\);/);
  assert.match(src, /const reviewed = !needsAnswer && \(d\.done \|\| walked\);/);
});

test("the answered count counts answers, not visits", () => {
  assert.match(src, /const done = need\.filter\(\(d\) => d\.done\)\.length;/);
  // the old form ORed the walk in and would read 3 of 3 with nothing answered
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ""), /d\.done \|\| readyOn\(d\.date\)/);
});

// STATUS FIRST. green is a day with nothing on it, yellow is a day with
// something on it: the "!" for an answer still owed, the flag for a problem
// they reported. a quiet day's check is light until they have been through it.
test("an owed answer shows the warning, and only an owed answer", () => {
  assert.match(src, /\{needsAnswer && <CircleAlert size=\{16\} className=\{styles\.issue\} \/>\}/);
  // a report used to raise the same warning, beside a check
  assert.doesNotMatch(src, /\(hasReport \|\| needsAnswer\) && <CircleAlert/);
});

test("a reported day shows the flag alone, never a check beside it", () => {
  assert.match(src, /\{hasReport && <Flag size=\{15\} className=\{styles\.issue\} \/>\}/);
  assert.match(src, /\{!needsAnswer && !hasReport && \(/);
  // read aloud as the report, not as "Reviewed" and the report
  assert.match(src, /\{needsAnswer \? "Needs answers" : hasReport \? "" : reviewed \? "Reviewed" : "Nothing to check"\}/);
  assert.match(src, /\$\{needsAnswer \? " · " : ""\}\$\{flow\.reported \? "Awaiting payroll" : "Report added"\}/);
});

test("a quiet day's check is light until they have been through it", () => {
  assert.match(src, /\$\{reviewed \? styles\.reviewed : styles\.quiet\}/);
  const css = fs.readFileSync(path.join(process.cwd(), "src/app/t/[token]/ReviewFlow.module.css"), "utf8");
  assert.match(css, /\.quiet \{\s*border: 1\.5px solid color-mix\(in srgb, var\(--status-positive\) 55%, transparent\);/);
});
