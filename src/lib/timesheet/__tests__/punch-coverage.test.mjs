// Did we read the punch grid, or only think we did?
//
// The failure this guards against is the nastiest shape there is: a COMPLETE
// document that parses without error into a wrong number. A print-to-PDF of the
// Simple Timesheet merges adjacent text runs, so `10:53a 12:44p` arrives as one
// item at the Time In column and the second punch of the pair is lost. Every
// employee, every row and every one of QSP's printed daily totals survive, and
// each day floors up to that printed figure, so the batch lands on a plausible
// premium total 44 hours out.
//
// Measured on the real 07/16-07/31/26 export saved two ways:
//   download  4049.35 of QSP's 4049.41 hours,   0 of 658 days drifting
//   print     3133.67 of QSP's 4049.41 hours, 248 of 658 days drifting
//
// Every test pairs the case with its opposite, so a guard that stopped
// discriminating fails rather than quietly passing.
import { test } from "node:test";
import assert from "node:assert/strict";

import { punchCoverage, RULES } from "../parse.js";

const at = (h, m) => ({ min: h * 60 + m });
// a day as the DOWNLOAD gives it: both punches of each pair present
const wholeDay = (date) => ({
  date,
  punches: [at(8, 0), at(12, 0), at(12, 30), at(16, 30)],
  printed: { daily: 8 },
});
// the same day as the PRINT gives it: the first pair collapsed to nothing,
// because both its times landed in one cell and only one was read
const mergedDay = (date) => ({
  date,
  punches: [at(12, 30), at(16, 30)],
  printed: { daily: 8 },
});
const sheet = (days) => [{ employee: "Test, Person", days }];

test("a timesheet whose punches reproduce QSP's printed hours passes", () => {
  const c = punchCoverage(sheet(["07/16/26", "07/17/26", "07/20/26"].map(wholeDay)));
  assert.equal(c.comparedDays, 3);
  assert.equal(c.punchHours, 24);
  assert.equal(c.printedHours, 24);
  assert.equal(c.driftDays, 0);
  assert.equal(c.ok, true);
});

test("a timesheet that lost half of every pair is refused", () => {
  const c = punchCoverage(sheet(["07/16/26", "07/17/26", "07/20/26"].map(mergedDay)));
  assert.equal(c.comparedDays, 3);
  assert.equal(c.punchHours, 12); // half of QSP's 24
  assert.equal(c.printedHours, 24);
  assert.equal(c.driftDays, 3);
  assert.equal(c.ok, false);
});

// the pair that matters most: the two files agree on EVERYTHING the old check
// looked at. If the guard ever starts reading counts instead of hours, this
// passes on both and the whole thing is worthless.
test("the counts a summary would compare are identical on both files", () => {
  const good = sheet(["07/16/26", "07/17/26"].map(wholeDay));
  const bad = sheet(["07/16/26", "07/17/26"].map(mergedDay));
  assert.equal(good[0].days.length, bad[0].days.length);
  assert.equal(
    good[0].days.filter((d) => d.printed?.daily != null).length,
    bad[0].days.filter((d) => d.printed?.daily != null).length,
  );
  // identical on every count, opposite verdicts
  assert.equal(punchCoverage(good).ok, true);
  assert.equal(punchCoverage(bad).ok, false);
});

test("a day QSP printed no total for is skipped, not counted as a shortfall", () => {
  const c = punchCoverage(sheet([
    wholeDay("07/16/26"),
    { date: "07/17/26", punches: [at(8, 0), at(16, 0)], printed: null },
  ]));
  assert.equal(c.comparedDays, 1);
  assert.equal(c.ok, true);
});

test("an export with no printed column at all is not refused, having nothing to judge", () => {
  const c = punchCoverage(sheet([{ date: "07/16/26", punches: [at(8, 0), at(16, 0)], printed: null }]));
  assert.equal(c.comparedDays, 0);
  assert.equal(c.ratio, 1);
  assert.equal(c.ok, true);
});

// QSP rounds each punch segment its own way, so an exact figure can sit a
// hundredth or two off the printed one. That is not a misread file.
test("QSP's own rounding does not trip the guard, but a real shortfall does", () => {
  const rounding = sheet([{
    date: "07/16/26",
    punches: [at(8, 0), at(15, 59)], // 7.9833 against a printed 7.99
    printed: { daily: 7.99 },
  }]);
  assert.equal(punchCoverage(rounding).ok, true);

  const short = sheet([{
    date: "07/16/26",
    punches: [at(8, 0), at(15, 0)], // a whole hour missing
    printed: { daily: 8 },
  }]);
  assert.equal(punchCoverage(short).ok, false);
});

// THE TEST THAT CHANGED THE RULE. The first version counted a day nobody
// punched as a full shortfall, so one non-punching person in ten sank a good
// export at 90%. Somebody never being set up on QSClock is a real thing here
// (Zermeno, 12 days, 0 breaks punched) and it is a different problem entirely.
// Those days are now excluded rather than the threshold loosened, which keeps
// the line tight AND removes the false positive.
test("a day nobody punched is a QSClock problem, and never sinks the export", () => {
  const days = Array.from({ length: 9 }, (_, i) => wholeDay(`07/${16 + i}/26`));
  days.push({ date: "07/25/26", punches: [], printed: { daily: 8 } });
  const c = punchCoverage(sheet(days));
  assert.equal(c.neverPunchedDays, 1);
  assert.equal(c.comparedDays, 9);   // the unpunched day is not in the comparison
  assert.equal(c.ok, true);

  // the opposite case, so this is not just asserting that everything passes:
  // half-read days at the proportion the real print file has (20% of hours
  // short) fail, and they are counted rather than skipped.
  const withMerged = Array.from({ length: 9 }, (_, i) => wholeDay(`07/${16 + i}/26`));
  withMerged.push(mergedDay("07/25/26"), mergedDay("07/26/26"), mergedDay("07/27/26"));
  const d = punchCoverage(sheet(withMerged));
  assert.equal(d.neverPunchedDays, 0);
  assert.equal(d.comparedDays, 12);
  assert.equal(d.driftDays, 3);
  assert.equal(d.ok, false);
});

// WHERE THE LINE ACTUALLY FALLS, pinned so nobody has to re-derive it. One
// half-read day in ten is a 5% shortfall and sits exactly ON the threshold, so
// it passes. That is the intended trade: this guard exists to catch a file read
// wrong wholesale (the print loses 20%), not to adjudicate a single odd day,
// which the per-day drift flag already surfaces on the checks screen.
test("a single half-read day sits on the line and passes; a fifth of them does not", () => {
  const ten = Array.from({ length: 9 }, (_, i) => wholeDay(`07/${16 + i}/26`));
  ten.push(mergedDay("07/25/26"));
  const c = punchCoverage(sheet(ten));
  assert.equal(Number(c.ratio.toFixed(4)), 0.95);
  assert.equal(c.ok, true);
  assert.equal(c.driftDays, 1);   // still visible, just not fatal

  const worse = Array.from({ length: 8 }, (_, i) => wholeDay(`07/${16 + i}/26`));
  worse.push(mergedDay("07/24/26"), mergedDay("07/25/26"));
  assert.equal(punchCoverage(sheet(worse)).ok, false);
});

test("the guard is a real line, not an always-true one", () => {
  assert.ok(RULES.minPunchCoverage > 0.5 && RULES.minPunchCoverage < 1);
});
