// THE AUDIT REVIEW CONTROLS - Mánu 2026-09-03: flag without comments, a
// reset-all behind an are-you-sure, and deciding with corrected hours from
// the main list, not just the deck.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

test("a flag needs no words, on the server and in the deck", () => {
  const actions = read("src/app/portal/admin/audit/actions.js");
  assert.doesNotMatch(actions, /noreason/, "the server refusal is gone");
  assert.match(actions, /reason: decision === "flagged" \? reason \|\| null : null/);
  const deck = read("src/app/portal/admin/audit/[id]/StudyMode.js");
  assert.doesNotMatch(deck, /disabled=\{!reason\.trim\(\) \|\| busy\}/, "Flag it no longer waits on a note");
});

test("reset-all is period-scoped and counted before it deletes", () => {
  const actions = read("src/app/portal/admin/audit/actions.js");
  assert.match(actions, /export async function auditResetImpact/);
  assert.match(actions, /export async function resetAllReviews/);
  // both read the period's own date list - never a bare deleteMany
  const scoped = actions.match(/date: \{ in: periodDates\(batch\.periodFrom, batch\.periodTo\) \}/g);
  assert.equal(scoped?.length, 2, "impact and delete share the period scope");
});

test("the cards decide with the same action and the same chips as the deck", () => {
  const cards = read("src/app/portal/admin/audit/[id]/AuditCards.js");
  assert.match(cards, /import \{ reviewShift, resetAllReviews, auditResetImpact \} from "\.\.\/actions"/);
  assert.match(cards, /function DecideBar/);
  for (const label of ["Nothing billable", "Actually billable, in minutes", "Flag it"]) {
    assert.ok(cards.includes(label), `card panel carries "${label}"`);
  }
  assert.match(cards, /There is no undo\./, "the reset dialog says what it destroys");
});
