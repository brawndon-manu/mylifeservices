// THE HOLES IN A DAY, off the punch pairs.
//
// Two rules meet in here and both are Mánu's, made on real days:
//
//   2026-08-11  a gap is not a rest period, and not a meal either. The SCHEDULE
//               says where a meal is and how long it runs; the gap is cut
//               around it.
//   2026-08-26  two bookings billed over each other are not a hole between
//               them. Devine 08/20: "can you explain to me why it says not
//               scheduled for 10a-11:30a for this overlapping schedule."
import { test } from "node:test";
import assert from "node:assert/strict";
import { gapsOf } from "../day-gaps.js";

const h = (hh, mm = 0) => hh * 60 + mm;
const span = (g) => `${g.from}-${g.to}${g.meal ? " meal" : ""}`;

// Devine 08/20/26 as QSP printed her: the training is booked INSIDE the client
// visit, which is the hour the day is flagged for.
const DEVINE = [
  { from: h(8), to: h(11, 30) },   // Evans, R - ILS Service
  { from: h(9), to: h(10) },       // ILS Training, inside the above
  { from: h(11, 30), to: h(12) },  // ILS Travel
  { from: h(12, 30), to: h(15, 52) },
];
const DEVINE_ROSTER = [
  { from: h(8), to: h(11, 30), meal: false },
  { from: h(9), to: h(10), meal: false },
  { from: h(11, 30), to: h(12), meal: false },
  { from: h(12), to: h(12, 30), meal: true },
  { from: h(12, 30), to: h(15, 52), meal: false },
];

test("an overlapping booking draws no hole where the day was worked", () => {
  const out = gapsOf({}, DEVINE, DEVINE_ROSTER);
  // walked in printed order this compared 10a with 11:30a and drew 90 minutes
  // of "Not scheduled" across time the first pair covers
  assert.equal(
    out.some((g) => g.from === h(10) && g.to === h(11, 30)),
    false,
    "the phantom band is back",
  );
  // the only hole left is her rostered lunch, and it is drawn as one
  assert.deepEqual(out.map(span), ["720-750 meal"]);
});

test("the pairs themselves are untouched", () => {
  // the overlap still has to draw as two lanes - two things really were booked
  // at once - so this must not rewrite what it was handed
  const before = JSON.parse(JSON.stringify(DEVINE));
  gapsOf({}, DEVINE, DEVINE_ROSTER);
  assert.deepEqual(DEVINE, before);
});

test("an ordinary day still gets its gaps", () => {
  const shifts = [{ from: h(9), to: h(12) }, { from: h(13), to: h(17) }];
  assert.deepEqual(gapsOf({}, shifts, []).map(span), ["720-780"]);
});

test("a rostered meal inside a longer gap is cut out of it", () => {
  // 07/31: the roster books 12:20p-12:50p, the punches are out 12p to 1p
  const shifts = [{ from: h(9), to: h(12) }, { from: h(13), to: h(17) }];
  const roster = [{ from: h(12, 20), to: h(12, 50), meal: true }];
  assert.deepEqual(gapsOf({}, shifts, roster).map(span), ["720-740", "740-770 meal", "770-780"]);
});

test("a meal that fills the gap exactly leaves no unscheduled time", () => {
  const shifts = [{ from: h(9), to: h(12) }, { from: h(12, 30), to: h(17) }];
  const roster = [{ from: h(12), to: h(12, 30), meal: true }];
  assert.deepEqual(gapsOf({}, shifts, roster).map(span), ["720-750 meal"]);
});

test("abutting pairs are one stretch of work, not a zero-length hole", () => {
  const shifts = [{ from: h(9), to: h(12) }, { from: h(12), to: h(17) }];
  assert.deepEqual(gapsOf({}, shifts, []), []);
});

test("nothing to walk is no gaps", () => {
  assert.deepEqual(gapsOf({}, [], []), []);
  assert.deepEqual(gapsOf({}, [{ from: h(9), to: h(17) }], []), []);
});
