// A STATED BREAK MAY NOT LAND ON A TEN ALREADY RECORDED. Pinned off
// Romero-Alba 08/21: the Second-ten card showed the recorded 10:50a, she
// typed 10:50a, and the office email told QuickSolve to log a break it
// already held. `known` times arrive in the card's own short-clock spelling.
import { test } from "node:test";
import assert from "node:assert/strict";
import { collidesWithRecorded } from "../questions.js";

const KNOWN = [{ from: "10:50a", corrected: false }];
const at = (h, m) => h * 60 + m;

test("the exact recorded time collides", () => {
  assert.equal(collidesWithRecorded(KNOWN, at(10, 50), 10), true);
});

test("any overlap collides, touching does not", () => {
  assert.equal(collidesWithRecorded(KNOWN, at(10, 45), 10), true);
  assert.equal(collidesWithRecorded(KNOWN, at(10, 59), 10), true);
  // 11:00 starts the minute the recorded ten ends - a different break
  assert.equal(collidesWithRecorded(KNOWN, at(11, 0), 10), false);
  assert.equal(collidesWithRecorded(KNOWN, at(10, 40), 10), false);
});

test("afternoon spellings read the workday way", () => {
  assert.equal(collidesWithRecorded([{ from: "3p" }], at(15, 5), 10), true);
  assert.equal(collidesWithRecorded([{ from: "3p" }], at(15, 10), 10), false);
});

test("nothing recorded, nothing readable, nothing stated - no collision", () => {
  assert.equal(collidesWithRecorded([], at(10, 50), 10), false);
  assert.equal(collidesWithRecorded(null, at(10, 50), 10), false);
  assert.equal(collidesWithRecorded([{ from: "" }, { from: null }], at(10, 50), 10), false);
  assert.equal(collidesWithRecorded(KNOWN, null, 10), false);
  assert.equal(collidesWithRecorded(KNOWN, at(10, 50), 0), false);
});
