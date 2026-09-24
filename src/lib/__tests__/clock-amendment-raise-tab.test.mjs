// THE CARDS THAT CAN RAISE AN ADDENDUM, AS ONE LIST.
//
// the audit's "Can raise an addendum" tab lists exactly the cards whose footer
// offers the button, whatever the review says, cut by what the clock has wrong.
// one rule decides both, so a card in the list always has the button and a
// card with the button is always in the list.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { raisable, RAISE_CASES, punchIssue, hasIssue } from "../clock-amendment/rules.js";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// a shift the export has, both punches on time with a location
const clean = { inClockExport: true, noIn: false, noOut: false, startDelta: 0, gpsIn: "yes", gpsOut: "yes" };

test("a card can raise only when the export has the shift, the clock has it wrong, and nothing is out or approved", () => {
  assert.equal(raisable(clean), false);
  assert.equal(raisable({ ...clean, startDelta: 1 }), true);
  assert.equal(raisable({ ...clean, noOut: true }), true);
  assert.equal(raisable({ ...clean, noIn: true, noOut: true }), true);
  assert.equal(raisable({ ...clean, gpsOut: "no" }), true);
  // no row in the export: nothing to raise from
  assert.equal(raisable({ ...clean, noOut: true, inClockExport: false }), false);
  assert.equal(raisable({ ...clean, noOut: true, inClockExport: undefined }), false);
  // one out or one approved already stands for the shift
  assert.equal(raisable({ ...clean, noOut: true, pending: { line: "Waiting on them" } }), false);
  assert.equal(raisable({ ...clean, noOut: true, amendment: { min: 120 } }), false);
  assert.equal(raisable(null), false);
  assert.equal(raisable(undefined), false);
});

test("the cases cut the list once each, heaviest first, and add up to it", () => {
  assert.deepEqual(RAISE_CASES.map((c) => c.key), ["none", "noIn", "noOut", "lateIn", "noGps"]);
  assert.deepEqual(RAISE_CASES.map((c) => c.label), ["No clock in or out", "No clock in", "No clock out", "Late clock-in", "No location"]);
  // every end the clock can have: in fine, late, no location, late and no
  // location, or missing; out fine, no location, or missing
  const ins = [{}, { startDelta: 12 }, { gpsIn: "no" }, { startDelta: 12, gpsIn: "no" }, { noIn: true, gpsIn: null, startDelta: null }];
  const outs = [{}, { gpsOut: "no" }, { noOut: true, gpsOut: null }];
  const keys = new Set(RAISE_CASES.map((c) => c.key));
  const seen = new Set();
  let listed = 0;
  for (const i of ins) for (const o of outs) {
    const row = { ...clean, ...i, ...o };
    if (!raisable(row)) { assert.equal(hasIssue(row), false); continue; }
    listed++;
    const k = punchIssue(row);
    assert.ok(keys.has(k), `${JSON.stringify(row)} reads as ${k}`);
    seen.add(k);
  }
  // fourteen cases, the clean shift the fifteenth
  assert.equal(listed, 14);
  assert.deepEqual([...seen].sort(), [...keys].sort());
  // a late clock-in beside a missing clock-out counts as no clock out
  assert.equal(punchIssue({ ...clean, startDelta: 12, noOut: true }), "noOut");
});

test("the tab is the card's own rule, offered only where the card could raise, and a sent card stays until the tab is left", () => {
  const cards = read("src/app/portal/admin/audit/[id]/AuditCards.js");
  assert.match(cards, /\{ key: "raise", label: "Can raise an addendum", match: raisable \}/);
  assert.match(cards, /\["open", "flagged", "approved", "amended", \.\.\.\(canRaise \? \["raise"\] : \[\]\), "all"\]/);
  assert.match(cards, /onClick=\{\(\) => changeDecision\(key\)\}/);
  // the list keeps what was sent from it; the counts read the rule alone
  assert.match(cards, /\? \(r\) => raisable\(r\) \|\| sentHere\.has\(r\.shiftKey\)/);
  assert.match(cards, /if \(!raisable\(r\)\) continue;\s*const k = punchIssue\(r\);/);
  assert.match(cards, /Every case<span>\{decisionCounts\.raise\}<\/span>/);
  assert.match(cards, /setSentHere\(\(s\) => new Set\(s\)\.add\(shiftKey\)\)/);
  assert.match(cards, /if \(key !== decision\) setSentHere\(new Set\(\)\);/);
  // the case row narrows its own tab and nothing else
  assert.match(cards, /if \(decision === "raise" && raiseCase !== "all" && punchIssue\(r\) !== raiseCase\) return false;/);
  assert.match(cards, /RAISE_CASES\.filter\(\(c\) => raiseCaseCounts\[c\.key\] \|\| raiseCase === c\.key\)/);
  // nothing left calls the bare setter, so no way off the tab skips the reset
  assert.equal((cards.match(/setDecision\(/g) || []).length, 1);
});
