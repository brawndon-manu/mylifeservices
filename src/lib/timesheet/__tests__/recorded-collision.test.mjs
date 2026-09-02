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

// ONE TEN PER SHIFT - QuickSolve holds one 10-minute rest per shift (Mánu
// 2026-09-02), so a stated ten inside a shift already holding one is refused
// even at a different time. Two punch-pair shifts: 9a-11a and 1p-3p.
import { shiftAlreadyHasTen } from "../questions.js";

const DAY = { punches: [{ min: 540 }, { min: 660 }, { min: 780 }, { min: 900 }] };

test("a second ten in the same shift is refused even at a new time", () => {
  // recorded ten at 10:50 in the 9-11 shift; 9:15 is a different time, same shift
  assert.equal(shiftAlreadyHasTen(DAY, [650], at(9, 15), 10), true);
});

test("a ten in the other shift is fine", () => {
  assert.equal(shiftAlreadyHasTen(DAY, [650], at(13, 30), 10), false);
});

test("no recorded tens, no punches, no time - nothing refused", () => {
  assert.equal(shiftAlreadyHasTen(DAY, [], at(9, 15), 10), false);
  assert.equal(shiftAlreadyHasTen({ punches: [] }, [650], at(9, 15), 10), false);
  assert.equal(shiftAlreadyHasTen(DAY, [650], null, 10), false);
});

test("a stated ten outside every shift is another rule's problem", () => {
  // restTimeFits already refuses it as outside; this one stays quiet
  assert.equal(shiftAlreadyHasTen(DAY, [650], at(12, 0), 10), false);
});
