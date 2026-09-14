// GOING BACK TO A PLACEMENT - Mánu 2026-09-13: "is there a way we can make it
// so we can go back and edit the certificate placement and regenerate them".
//
// A batch stores points. The editor needs a marker. If the two conversions
// disagree by even a little, reopening a batch and saving it again without
// touching anything would walk the name across the page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { toPoints, toSpot } from "../placement.js";

// the landscape template the run was proved on
const LAND = { pdfW: 792, pdfH: 612 };

test("a click halfway across lands on the middle of the page", () => {
  const at = toPoints({ xPct: 0.5, yPct: 0.5, ...LAND });
  assert.equal(at.x, 396);
  assert.equal(at.y, 306);
});

test("the y axis flips, because the picture counts down and the PDF counts up", () => {
  // a marker near the TOP of the picture is a HIGH y in points
  const top = toPoints({ xPct: 0.5, yPct: 0, ...LAND });
  assert.equal(top.y, 612);
  const bottom = toPoints({ xPct: 0.5, yPct: 1, ...LAND });
  assert.equal(bottom.y, 0);
});

test("the stored placement comes back to the marker it was made from", () => {
  // the real one from the shipped run: clicked 396,331 against a line at y=330
  const spot = toSpot({ page: 0, x: 396, y: 330.6, ...LAND });
  const back = toPoints({ ...spot, ...LAND });
  assert.ok(Math.abs(back.x - 396) < 1e-9);
  assert.ok(Math.abs(back.y - 330.6) < 1e-9);
});

test("reopening and saving without touching anything does not move the name", () => {
  // the whole point: editor -> record -> editor -> record has to be a no-op
  const first = { xPct: 0.37, yPct: 0.82 };
  const points = toPoints({ ...first, ...LAND });
  const reopened = toSpot({ ...points, ...LAND });
  const again = toPoints({ ...reopened, ...LAND });
  assert.ok(Math.abs(again.x - points.x) < 1e-9);
  assert.ok(Math.abs(again.y - points.y) < 1e-9);
  assert.ok(Math.abs(reopened.xPct - first.xPct) < 1e-9);
  assert.ok(Math.abs(reopened.yPct - first.yPct) < 1e-9);
});

test("a portrait page keeps its own dimensions", () => {
  // the run included one, and its name landed at x=306, half of 612
  const at = toPoints({ xPct: 0.5, yPct: 0.5, pdfW: 612, pdfH: 792 });
  assert.equal(at.x, 306);
  assert.equal(at.y, 396);
});

test("the page a spot sits on is carried through", () => {
  assert.equal(toSpot({ page: 2, x: 10, y: 10, ...LAND }).page, 2);
  // and defaults to the first, because a one-page template has no other
  assert.equal(toSpot({ x: 10, y: 10, ...LAND }).page, 0);
});
