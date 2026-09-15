// WHICH SCHEDULED BLOCK LABELS A DRAWN ONE.
//
// The day calendar names each block it draws after whichever scheduled block
// overlaps it most. A block sitting wholly inside another overlaps by exactly
// as much as the one containing it, so the comparison has to say what happens
// on a tie - and until it did, array order said it instead.
import test from "node:test";
import assert from "node:assert/strict";
import { blockFor } from "../block-label.js";

// Espinoza, 09/14/26, exactly as the schedule holds it
const ESPINOZA = [
  { from: 540, to: 720, service: "ILS Service", client: "Wade, C" },      // 9a-12p
  { from: 660, to: 685, service: "ILS Travel", client: "" },              // 11a-11:25a
  { from: 870, to: 960, service: "ILS Service", client: "Scrofini, O" },  // 2:30p-4p
];
const TRAVEL = { from: 660, to: 685 };

test("a block inside another is labelled by itself, not by the one containing it", () => {
  // THE BUG: both overlap that window by 25 minutes, so `>` alone kept whichever
  // came first - and the picture called a travel block "ILS Service" for a
  // client, beside a finding that correctly said a travel block.
  assert.equal(blockFor(ESPINOZA, TRAVEL).service, "ILS Travel");
  assert.equal(blockFor(ESPINOZA, TRAVEL).client, "");
});

test("array order cannot change the answer, which is what proves it is decided", () => {
  const forward = blockFor(ESPINOZA, TRAVEL);
  const reversed = blockFor([...ESPINOZA].reverse(), TRAVEL);
  assert.deepEqual(forward, reversed);
  // and the old rule DID depend on order - pinned so a revert is visible
  const oldRule = (scheduled, shift) => {
    let best = null; let bestOverlap = 0;
    for (const b of scheduled) {
      if (b.meal) continue;
      const o = Math.min(b.to, shift.to) - Math.max(b.from, shift.from);
      if (o > bestOverlap) { bestOverlap = o; best = b; }
    }
    return bestOverlap > 0 ? best : null;
  };
  assert.notEqual(
    oldRule(ESPINOZA, TRAVEL).service,
    oldRule([...ESPINOZA].reverse(), TRAVEL).service,
    "if this stops differing, the fixture no longer reproduces the bug",
  );
});

test("a containing block still wins its own window", () => {
  // the tie-break must not hand every long shift to whatever short thing sits
  // inside it - the nested block only wins the window it actually covers
  assert.equal(blockFor(ESPINOZA, { from: 540, to: 720 }).service, "ILS Service");
  assert.equal(blockFor(ESPINOZA, { from: 540, to: 720 }).client, "Wade, C");
  assert.equal(blockFor(ESPINOZA, { from: 870, to: 960 }).client, "Scrofini, O");
});

test("the larger overlap still wins outright when there is no tie", () => {
  const blocks = [
    { from: 0, to: 60, service: "Short" },
    { from: 0, to: 600, service: "Long" },
  ];
  // a window mostly covered by the long block takes the long block, even though
  // the short one is tighter - tightness only breaks a tie, it does not outrank
  assert.equal(blockFor(blocks, { from: 0, to: 500 }).service, "Long");
});

test("meal blocks are skipped, so a shift across a lunch is not called Meal Break", () => {
  const blocks = [
    { from: 540, to: 720, service: "Meal Break", meal: true },
    { from: 540, to: 720, service: "ILS Service" },
  ];
  assert.equal(blockFor(blocks, { from: 600, to: 660 }).service, "ILS Service");
  assert.equal(blockFor([{ from: 0, to: 60, service: "Meal Break", meal: true }], { from: 0, to: 60 }), null);
});

test("nothing overlapping is null rather than a nearest guess", () => {
  assert.equal(blockFor(ESPINOZA, { from: 1200, to: 1260 }), null);
  assert.equal(blockFor([], { from: 0, to: 60 }), null);
  assert.equal(blockFor(null, { from: 0, to: 60 }), null);
  // touching at a boundary is not overlapping
  assert.equal(blockFor([{ from: 0, to: 60, service: "X" }], { from: 60, to: 120 }), null);
});
