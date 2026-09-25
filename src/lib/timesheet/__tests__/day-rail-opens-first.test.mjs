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

// ---------------------------------------------------------------------------
// PRESSING NEXT MARKS THE DAY FINISHED, EVEN A QUIET ONE.
//
// It used to be `if (hasQuestions) done.markReady(date)`, so a day with nothing
// to check recorded nothing and its ring stayed an empty circle however many
// times you pressed Next. On most days of most periods there is nothing to
// answer, so somebody reading a fortnight through got no sign of progress at
// all - which is the whole point of walking it day by day.
const QUESTION = fs.readFileSync("src/app/t/[token]/TimesheetQuestion.js", "utf8");

test("Next marks the day finished whether or not it asked anything", () => {
  // the quiet day's Next: marked, then on to the next day
  assert.match(QUESTION, /\n\s*done\.markReady\(date\);\n\s*if \(nav\?\.go\) nav\.go\(nav\.index \+ 1\);/);
  assert.ok(
    !/if \(hasQuestions\) done\.markReady\(date\);/.test(QUESTION),
    "a quiet day must not be the one day Next records nothing for",
  );
  assert.match(QUESTION, /\n\s*done\.markReady\(date\);/,
    "it is called unconditionally now");
});

test("the answered counter still counts questions, not days walked past", () => {
  // marking quiet days finished must not turn "1 of 2 days answered" into
  // "1 of 12" - that line is about questions and has to stay about questions
  assert.match(RAIL, /const need = days\.filter\(\(d\) => d\.needs\);/,
    "the counter is scoped to days that need an answer");
  assert.match(RAIL, /\{done\} of \{need\.length\} day/);
});
