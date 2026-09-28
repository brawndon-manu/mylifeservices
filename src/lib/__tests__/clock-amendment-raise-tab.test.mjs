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
import { raisable, raiseCase, RAISE_CASES, punchIssue, hasIssue } from "../clock-amendment/rules.js";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// a shift the export has, both punches on time with a location, in a period
// that has an export
const clean = { clockAvailable: true, inClockExport: true, noIn: false, noOut: false, startDelta: 0, gpsIn: "yes", gpsOut: "yes" };
// a booking the export has no row for: no punch flags to carry at all
const noRow = { clockAvailable: true, inClockExport: false, noIn: false, noOut: false, startDelta: null, gpsIn: null, gpsOut: null };

test("a card can raise when the export has the shift wrong or has no row for it at all, and nothing is out or approved", () => {
  assert.equal(raisable(clean), false);
  assert.equal(raisable({ ...clean, startDelta: 1 }), true);
  assert.equal(raisable({ ...clean, noOut: true }), true);
  assert.equal(raisable({ ...clean, noIn: true, noOut: true }), true);
  assert.equal(raisable({ ...clean, gpsOut: "no" }), true);
  // no row in the export: the booking itself, with neither punch
  assert.equal(raisable(noRow), true);
  assert.equal(raiseCase(noRow), "notInClock");
  // but not where the period has no export at all, and not when the row is unknown
  assert.equal(raisable({ ...noRow, clockAvailable: false }), false);
  assert.equal(raisable({ ...clean, noOut: true, inClockExport: undefined }), false);
  assert.equal(raisable({ ...noRow, pending: { line: "Waiting on them" } }), false);
  assert.equal(raisable({ ...noRow, amendment: { min: 120 } }), false);
  // one out or one approved already stands for the shift
  assert.equal(raisable({ ...clean, noOut: true, pending: { line: "Waiting on them" } }), false);
  assert.equal(raisable({ ...clean, noOut: true, amendment: { min: 120 } }), false);
  assert.equal(raisable(null), false);
  assert.equal(raisable(undefined), false);
});

test("the cases cut the list once each, heaviest first, and add up to it", () => {
  assert.deepEqual(RAISE_CASES.map((c) => c.key), ["notInClock", "none", "noIn", "noOut", "lateIn", "noGps"]);
  assert.deepEqual(RAISE_CASES.map((c) => c.label), ["Not in the clock export", "No clock in or out", "No clock in", "No clock out", "Late clock-in", "No location"]);
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
    const k = raiseCase(row);
    assert.equal(k, punchIssue(row), "a row the export has sits under its heaviest problem");
    assert.ok(keys.has(k), `${JSON.stringify(row)} reads as ${k}`);
    seen.add(k);
  }
  // and the booking the export has no row for, under its own case
  assert.equal(raisable(noRow), true);
  listed++;
  seen.add(raiseCase(noRow));
  // fourteen cases and the missing row, the clean shift the sixteenth
  assert.equal(listed, 15);
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
  assert.match(cards, /import \{ raisable, raiseCase as raiseCaseOf, RAISE_CASES \} from "@\/lib\/clock-amendment\/rules";/);
  assert.match(cards, /if \(!raisable\(r\)\) continue;\s*const k = raiseCaseOf\(r\);/);
  assert.match(cards, /Every case<span>\{decisionCounts\.raise\}<\/span>/);
  assert.match(cards, /setSentHere\(\(s\) => new Set\(s\)\.add\(shiftKey\)\)/);
  assert.match(cards, /if \(key !== decision\) setSentHere\(new Set\(\)\);/);
  // the case row narrows its own tab and nothing else
  assert.match(cards, /if \(decision === "raise" && raiseCase !== "all" && raiseCaseOf\(r\) !== raiseCase\) return false;/);
  assert.match(cards, /RAISE_CASES\.filter\(\(c\) => raiseCaseCounts\[c\.key\] \|\| raiseCase === c\.key\)/);
  // nothing left calls the bare setter, so no way off the tab skips the reset
  assert.equal((cards.match(/setDecision\(/g) || []).length, 1);
});

test("focused review offers the same raise by the same rule, and the run keeps what was sent", () => {
  const cards = read("src/app/portal/admin/audit/[id]/AuditCards.js");
  assert.match(cards, /<StudyMode rows=\{queue\} .*canRaise=\{canRaise\} onPending=\{notePending\} \/>/);
  const study = read("src/app/portal/admin/audit/[id]/StudyMode.js");
  assert.match(study, /import \{ raisable \} from "@\/lib\/clock-amendment\/rules";/);
  assert.match(study, /\{canRaise && !flagging && !comparing\(row\) && raisable\(row\) && \(/);
  assert.match(study, /setPendingOverrides\(\(v\) => \(\{ \.\.\.v, \[row\.shiftKey\]: p \}\)\);\s*onPending\?\.\(row\.shiftKey, p\);/);
  assert.match(study, /\.\.\.\(pending !== undefined \? \{ pending \} : \{\}\),/);
  // deciding, skipping, undoing and narrowing each close the form
  assert.ok((study.match(/setRaising\(false\);/g) || []).length >= 5, "every move closes the form");
});
