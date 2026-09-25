// A SAVED ANSWER STAYS ON SCREEN. Both cards on the employee's page used to
// clear their local state the moment the save returned and then wait for the
// page to re-render, so the answer visibly came undone for the length of the
// round trip and came back. Measured 2026-09-15 on the dev server, warm: the
// single card's answer gone at 1.4s, back at 1.9s; the batched card the same
// shape with every toggle. The cards are client components, so the rule is
// pinned as text: each holds what it just saved until the refreshed props
// carry it, and every save button says it is saving while the action runs.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(new URL("../../../app/t/[token]/TimesheetQuestion.js", import.meta.url), "utf8");

test("the single card holds the choice it just saved and reads it before the props", () => {
  assert.match(src, /setHeld\(\{ choice: proposed\.choice, answerThen: answer, savedThen: savedChoice \}\);/);
  assert.match(src, /: held \? held\.choice\n\s+: savedChoice \? savedChoice/);
  assert.match(src, /const answered = answerNow === "accepted" \|\| answerNow === "declined";/);
});

test("the single card drops the hold only when the props move", () => {
  assert.match(src, /if \(held && \(answer !== held\.answerThen \|\| savedChoice !== held\.savedThen\)\) setHeld\(null\);/);
});

test("the batched card holds every pick it just saved, counts them as answered, and is not dirty against them", () => {
  // each save merges into the hold rather than replacing it, so two answers
  // saved a moment apart both stay on screen until the page catches up
  assert.match(src, /picked: \{ \.\.\.\(h\?\.picked \|\| \{\}\), \.\.\.Object\.fromEntries\(qs\.map\(\(q\) => \[q\.id, valueFor\(q\)\]\)\) \},/);
  assert.match(src, /held && q\.id in held\.picked \? held\.picked\[q\.id\] : savedValue\(q\)/);
  // a question the hold carries is not waiting on a save against the old props
  assert.match(src, /if \(waiting\?\.has\?\.\(q\.id\) \|\| held\?\.ids\?\.has\?\.\(q\.id\)\) return false;/);
});

test("the batched card drops the hold, and the typed copies of what it saved, when a refresh hands it new answers", () => {
  assert.match(src, /if \(!held \|\| answers === held\.answersThen\) return;/);
  assert.match(src, /setPicked\(drop\);\s*setTimes\(drop\);\s*setReasons\(drop\);\s*setHeld\(null\);/);
});

test("every save button says it is saving while the action runs", () => {
  // the batched answer's own button, the single card's, and the day's
  assert.match(src, /\{saving \? "Saving…" : "Save answer"\}/);
  assert.match(src, /\{pending \? "Saving…" : "Save answer"\}/);
  assert.match(src, /const nextLabel = saving \? "Saving…" :/);
});
