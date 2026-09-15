// THE TIMESHEET OPENS ON ITS FIRST DAY.
//
// Somebody signing a fortnight should be able to start at the top and press
// Next all the way through. It used to open on the first day that still needed
// something, which reads as the page having skipped ahead - and the days it
// skipped are exactly the ones nobody then looks at, on a document they are
// about to put their name to.
//
// Read as text because DayRail is "use client" and holds React state; the rule
// is one line and the point is that it stays one line.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const RAIL = fs.readFileSync("src/app/t/[token]/DayRail.js", "utf8");

test("the rail starts on day one, not on the first day that asks something", () => {
  assert.match(RAIL, /const \[sel, setSel\] = useState\(0\);/,
    "the opening day is the first day of the period");
  assert.ok(
    !/useState\(first/.test(RAIL) && !/d\.needs && !d\.done\)\)/.test(RAIL),
    "and it must not go back to seeking the first day that needs an answer",
  );
});

test("a deep link into one day still wins over the opening day", () => {
  // the panel above links to #day-<date>, and that handler runs on mount - so
  // starting at day one cannot break a jump straight to the day in question
  assert.match(RAIL, /#day-\(\.\+\)\$/, "the hash is still parsed");
  assert.match(RAIL, /window\.addEventListener\("hashchange", onHash\);\s*\n\s*onHash\(\);/,
    "and still runs on mount, not only on a later hash change");
});
