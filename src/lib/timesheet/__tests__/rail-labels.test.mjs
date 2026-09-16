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
  assert.match(src, /const walked = readyOn\(d\.date\) \|\| !!flow\?\.reviewedDays\.has\(d\.date\);/);
  assert.match(src, /const reviewed = !needsAnswer && \(d\.done \|\| walked\);/);
});

test("the answered count counts answers, not visits", () => {
  assert.match(src, /const done = need\.filter\(\(d\) => d\.done\)\.length;/);
  // the old form ORed the walk in and would read 3 of 3 with nothing answered
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ""), /d\.done \|\| readyOn\(d\.date\)/);
});
