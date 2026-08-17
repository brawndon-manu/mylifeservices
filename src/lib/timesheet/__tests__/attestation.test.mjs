// WHAT PEOPLE PUT THEIR NAME TO. Changed 2026-08-17 on Mánu's approved wording:
// the breaks sentence now covers the periods they did NOT take, and mileage got
// its own sentence because the sheet now carries the figure.
//
// Read as SOURCE. Building the whole PDF here would test pdf-lib; what must not
// drift is the sentence itself and the rule that gates it.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const SRC = fs.readFileSync(new URL("../render.js", import.meta.url), "utf8");
const BLOCK = SRC.slice(SRC.indexOf("const attest ="), SRC.indexOf("wrapCentered(page, attest"));

test("the breaks sentence covers the ones they did not take", () => {
  assert.match(BLOCK, /every meal and rest period I did not take is[\s\S]*accurately reported above/);
});

test("it still attests to hours, periods received, and injuries", () => {
  assert.match(BLOCK, /the actual hours I worked on each day/);
  assert.match(BLOCK, /received all my meal, rest and recovery periods/);
  assert.match(BLOCK, /reported every injury sustained on/);
});

test("mileage has its own sentence", () => {
  assert.match(BLOCK, /the miles recorded above are the actual miles I drove for work/);
});

// THE ONE THAT MATTERS. A July sheet carries no mileage line, and the paragraph
// asked people to swear that "the miles recorded above" were accurate anyway -
// attesting to a figure that is not on the page. Gated on the same value the
// line is, so the two can never disagree.
test("the mileage sentence is gated on there being mileage", () => {
  assert.match(BLOCK, /sheet\.milesDriven != null[\s\S]*the miles recorded above[\s\S]*:\s*""/);
});

test("nothing in it promises pay for a break", () => {
  assert.doesNotMatch(BLOCK, /premium|penalt/i);
});
