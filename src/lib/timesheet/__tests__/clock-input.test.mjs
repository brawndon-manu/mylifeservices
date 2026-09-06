// TYPED CLOCK TIMES, pinned: the forgiving forms parse, the ambiguous one
// refuses, and a span exists only when both ends read and run forward.
import { test } from "node:test";
import assert from "node:assert/strict";
import { clockInMin, spanMinutes } from "../clock-input.js";

test("the forms people type all land on the same minute", () => {
  assert.equal(clockInMin("2:30p"), 14 * 60 + 30);
  assert.equal(clockInMin("2:30 PM"), 14 * 60 + 30);
  assert.equal(clockInMin("2:30 p.m."), 14 * 60 + 30);
  assert.equal(clockInMin("14:30"), 14 * 60 + 30);
  assert.equal(clockInMin("2p"), 14 * 60);
  assert.equal(clockInMin("9:00"), 9 * 60);
});

test("noon and midnight land where the clock says", () => {
  assert.equal(clockInMin("12p"), 12 * 60);
  assert.equal(clockInMin("12a"), 0);
  assert.equal(clockInMin("12:30a"), 30);
});

test("what cannot be read parses to nothing", () => {
  assert.equal(clockInMin("9"), null);       // morning or evening - no guess
  assert.equal(clockInMin("25:00"), null);
  assert.equal(clockInMin("2:75p"), null);
  assert.equal(clockInMin("13p"), null);
  assert.equal(clockInMin(""), null);
  assert.equal(clockInMin("soon"), null);
});

test("a span needs both ends, running forward", () => {
  assert.equal(spanMinutes("2:30p", "4:45p"), 135);
  assert.equal(spanMinutes("9:00", "10:30"), 90);
  assert.equal(spanMinutes("2:30p", "2:30p"), null);
  assert.equal(spanMinutes("4:45p", "2:30p"), null); // midnight is not guessed
  assert.equal(spanMinutes("2:30p", ""), null);
  assert.equal(spanMinutes("", "4:45p"), null);
});
