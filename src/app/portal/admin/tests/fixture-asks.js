// THE REASONS THE TESTS CARD PUTS ON DAYS.
//
// The same rows `fixture.js` exports for the Break reasons tab, re-dated onto
// days the fabricated sheet actually has - a reason whose day is not on the
// sheet renders in the orphan list instead, which is worth being able to see
// but is not what this tab is for.
//
// Three, not seven: this tab is showing PLACEMENT, and seven reasons over nine
// days is the lump this work exists to get rid of, reproduced.
export const BREAK_ASKS = [
  {
    findingKey: "break-meal-07/16/26", date: "07/16/26", kind: "meal",
    answer: "not-taken", missingCount: 1, takenCount: 0,
    reason: null, confirmedAt: null, confirmedText: null, lateMinutes: null,
    mode: "write",
  },
  {
    findingKey: "break-rest-07/18/26", date: "07/18/26", kind: "rest",
    answer: "not-taken", missingCount: 2, takenCount: 0,
    reason: "Back-to-back clients with no cover to step away.",
    confirmedAt: null, confirmedText: null, lateMinutes: null,
    mode: "confirm",
  },
  {
    findingKey: "break-meallate-07/20/26", date: "07/20/26", kind: "meal-late",
    answer: "not-taken", missingCount: 1, takenCount: 0,
    reason: null, confirmedAt: null, confirmedText: null, lateMinutes: 330,
    mode: "write",
  },
];
