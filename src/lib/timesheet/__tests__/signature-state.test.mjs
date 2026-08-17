// OUT FOR SIGNATURE, AND HOW MUCH OF IT IS BACK.
//
// The badge this drives is the only thing on the reviewer screens that blinks,
// and it sits over a payroll figure, so the two ways it can lie both matter: a
// light on a period nobody has been asked about, and a light still going after
// everybody has signed.
//
// Real functions, no source read as text.
import test from "node:test";
import assert from "node:assert/strict";
import { signatureState, versionState, BATCH_STATES } from "../batch-state.js";

// NOTHING SENT IS NOT A STATE. Every one of the twelve batches was in exactly
// this position until 2026-08-17 - 0 sent, 0 signed - so this is the common
// case and not an edge one.
test("nothing sent means no badge at all", () => {
  assert.equal(signatureState(0, 0), null);
  assert.equal(signatureState(), null);
  assert.equal(signatureState(0, 5), null, "a signature with nothing sent still shows nothing");
});

test("out and unsigned reads LIVE and blinks", () => {
  const s = signatureState(3, 0);
  assert.equal(s.label, "LIVE");
  assert.equal(s.detail, "0 of 3 signed");
  assert.equal(s.pulses, true);
});

// THE LIGHT HAS TO GO OFF. A pulse that never stops is a pulse nobody reads,
// which is the rule the old LIVE state was written under and the reason it was
// the only blinking thing on the page.
test("everybody signed stops the blinking and changes the word", () => {
  const s = signatureState(3, 3);
  assert.equal(s.label, "ALL SIGNED");
  assert.equal(s.pulses, false);
  assert.equal(s.detail, "3 of 3 signed");
});

// COUNTED AGAINST SENT, NOT THE BATCH - Mánu's call. July on the day this was
// built: 3 of 59 sent, 0 signed. "0 of 59" would describe 56 people who have
// not been asked anything.
test("the fraction is out of what was SENT, not out of the batch", () => {
  assert.equal(signatureState(3, 0).detail, "0 of 3 signed");
  assert.equal(signatureState(3, 1).detail, "1 of 3 signed");
});

// A signature on a sheet that is somehow not marked sent must not produce
// "4 of 3 signed" on a payroll screen.
test("more signed than sent is clamped rather than printed", () => {
  const s = signatureState(3, 9);
  assert.equal(s.detail, "3 of 3 signed");
  assert.equal(s.label, "ALL SIGNED");
  assert.equal(s.pulses, false);
});

test("rubbish counts do not throw or print NaN", () => {
  assert.equal(signatureState(null, null), null);
  assert.equal(signatureState("3", "1").detail, "1 of 3 signed");
  assert.equal(signatureState(-4, -2), null);
});

test("the version badge says which upload this is, and only that", () => {
  assert.equal(versionState(false).label, "MOST RECENT VERSION");
  assert.equal(versionState(true).label, "SUPERSEDED");
  assert.equal(versionState().label, "MOST RECENT VERSION");
});

// THE WORD LIVE MOVED OFF THE LIFECYCLE PILL. It used to mean "the export has
// not reached the end of the fortnight", which is not what anybody reads it as.
// If it ever comes back there will be two lights meaning different things.
test("no lifecycle state calls itself LIVE any more, and none of them blink", () => {
  for (const [key, s] of Object.entries(BATCH_STATES)) {
    assert.notEqual(s.label, "LIVE", `${key} must not be labelled LIVE`);
    assert.equal(s.pulses, false, `${key} must not pulse - the signature badge owns the blink`);
  }
});

test("the export-incomplete state says what it actually means", () => {
  assert.equal(BATCH_STATES.live.label, "STILL COMING IN");
  // and the KEY is untouched, because canSendAll and five branches read it
  assert.equal(BATCH_STATES.live.key, "live");
  assert.equal(BATCH_STATES.final.key, "final");
});
