// HOURS THEY REPORTED AS WRONG, SHOWN ON THE DAY THEY ARE ABOUT.
//
// Mánu 2026-09-17: "any time they report a day for hours changing i want to
// cross out the current hours and next to it have the new total and this should
// work even if they keep adding more."
//
// IT TOOK THREE HOMES TO FIND THE RIGHT ONE, and the wrong two are why most of
// these exist:
//
//   1. Built from the stored corrections. Those only exist once the reports are
//      SENT, so a draft sat on screen saying "Not sent" beside an unchanged
//      figure - exactly when somebody wants to see what they typed.
//   2. Moved into a line inside DayByDay. A reported day never reaches it:
//      ReportedDayVisual replaces the whole header the moment a claim exists.
//   3. ReportedDayVisual itself, which already had both numbers and printed
//      them as two unrelated sentences.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const page = strip(read("src/app/t/[token]/page.js"));
const dayByDay = strip(read("src/app/t/[token]/DayByDay.js"));
const dayRail = strip(read("src/app/t/[token]/DayRail.js"));
const flowFile = strip(read("src/app/t/[token]/ReviewFlow.js"));
const reviewDays = read("src/lib/timesheet/review-days.js");
const corrections = read("src/lib/timesheet/corrections.js");

test("the strike is drawn where a reported day actually renders", () => {
  assert.match(flowFile, /export function ReportedDayVisual/);
  assert.match(flowFile, /const display = reportedReviewDay\(day, flow\?\.items\);/);
  // this early return is the whole reason a line in DayByDay could never work
  assert.match(flowFile, /if \(!display\.reviewReported\) return children;/);
  // and neither dead approach is left behind
  assert.ok(!page.includes("reportedHours"), "the database-built map is gone");
  assert.ok(!dayByDay.includes("reportedHours"), "and the prop that carried it");
  assert.ok(!dayByDay.includes("DayHoursLine"), "and the component that never rendered");
  assert.ok(!flowFile.includes("DayHoursLine"), "including its definition");
});

test("a DRAFT strikes the figure, not only a sent report", () => {
  // `flow.items` is the drafts AND the sent ones, so the line appears the
  // moment "Add to reports" is pressed rather than after Send
  assert.match(flowFile, /const \[draftItems, setItems\] = useState\(\(\) => \(readOnly \? \[\] : initialReports\)\);/);
  assert.match(flowFile, /const items = readOnly \? initialReports : draftItems;/);
});

test("the day and the rail draw the same figure from the same rule", () => {
  // two spellings of "what this day now reads" is how a rail and a card come to
  // disagree about one day
  assert.match(dayRail, /reportedReviewDay\(\{ date: d\.date, paidHours: Number\(d\.hrs\) \}, flow\?\.items\)/);
  assert.match(flowFile, /import \{ reportedReviewDay, dayChipLabel \} from "@\/lib\/timesheet\/review-days";/);
});

test("the struck figure is the day's own, kept by the rule itself", () => {
  assert.match(reviewDays, /reviewReported: true, reviewRecordedHours: day\.paidHours \|\| 0,/);
  assert.match(flowFile, /display\.reviewRecordedHours \?\? day\.paidHours \?\? 0/);
  // and the claim sits beside it rather than instead of it
  assert.match(flowFile, /now <span className=\{`font-semibold \$\{styles\.nowFigure\}`\}>\{display\.paidHours\.toFixed\(2\)\}<\/span> hrs/);
});

test("the sentence under it says whether it has been sent", () => {
  // a draft and a sent report look the same otherwise, and "we will check it"
  // would be a promise nobody has been given yet
  assert.match(flowFile, /flow\.reported \? "You reported this\. We will check it before anything changes\." : "Not sent yet\."/);
});

test("only an unresolved report is ever in hand", () => {
  // the flow is seeded from the page's OPEN corrections, so an accepted claim -
  // which has already become the day's own hours - cannot strike anything
  assert.match(page, /initialReports=\{openCorrections\}/);
  // open REPORTS - status alone, and never an answer row or the time-off
  // answer, which is what holds the document now (2026-09-25)
  assert.match(page, /const openCorrections = openReports\(ts\.corrections\);/);
});

test("an accepted report becomes the day's hours, which is why open-only is right", () => {
  assert.match(corrections, /case "hours":\s*\n\s*return claimedHours == null\s*\n\s*\? \{\}\s*\n\s*: \{ paidHours: r2\(claimedHours\)/);
});

test("the totals at the top move with the claim, at his word", () => {
  // Mánu 2026-09-17: "i want the hours above to change too." I had left this out
  // deliberately and asked; this is the answer, so the summary follows the day.
  assert.match(flowFile, /export function ReviewTotals/);
  assert.match(flowFile, /const worked = r2\(paidHours \+ delta\);/);
  assert.match(flowFile, /const paid = r2\(worked \+ timeOffHours\);/);
  // the page still hands it the STORED figure - the claim is applied on screen,
  // never written back into what the sheet holds
  assert.match(page, /paidHours=\{ts\.paidHours\}/);
});

test("overtime is recomputed from the engine's own rule, never approximated", () => {
  // "why didnt ot change" - it did not, because I had deferred it, and on an
  // 11.50 hour day that is a wrong number beside a right one rather than
  // caution. Whether a day crosses eight is applyOvertime's answer.
  assert.match(flowFile, /import \{ applyOvertime \} from "@\/lib\/timesheet\/overtime";/);
  assert.match(flowFile, /const rerun = applyOvertime\(claimed, payPeriod \|\| null\);/);
  assert.match(flowFile, /ot = r2\(rerun\.reduce\(\(n, d\) => n \+ \(d\.otHours \|\| 0\), 0\)\);/);
  assert.match(flowFile, /dbl = r2\(rerun\.reduce\(\(n, d\) => n \+ \(d\.doubleHours \|\| 0\), 0\)\);/);
  // only when something is claimed; an ordinary sheet keeps the stored figures
  assert.match(flowFile, /if \(changed && claimed\.length\) \{/);
  // and the partial-week pass needs QSP's printed overtime, so the page sends it
  assert.match(page, /printed: d\.printed \|\| null,/);
});

test("the overtime rule was MOVED, not copied", () => {
  const overtime = read("src/lib/timesheet/overtime.js");
  const parse = read("src/lib/timesheet/parse.js");
  // one definition. a second copy of a payroll rule is the thing this codebase
  // does not do, and the whole reason the file exists rather than a reimplementation
  assert.match(overtime, /export function applyOvertime\(days, payPeriod = null\) \{/);
  assert.equal((parse.match(/function applyOvertime\(/g) || []).length, 0, "parse.js no longer defines it");
  assert.match(parse, /import \{ OT_RULES, applyOvertime \} from "\.\/overtime\.js";/);
  // and it is still exported from where every caller has always read it
  assert.match(parse, /export \{ applyOvertime \};/);
  // the thresholds have one home too, spread back into the engine's table
  assert.match(overtime, /dailyOtAfterHours: 8,/);
  assert.match(parse, /\.\.\.OT_RULES,/);
  assert.equal((parse.match(/dailyOtAfterHours:/g) || []).length, 0, "and are not redeclared");
});

test("and the source itself is still untouched", () => {
  assert.match(reviewDays, /A draft or submitted claim changes the review picture only, never the source\./);
});

test("two reports on one day do not collide as React keys", () => {
  // submitTimesheetCorrections createMany's whatever was sent and ReportProblem
  // appends items with no duplicate-day guard, so `told-${kind}-${date}`
  // collided and React warned it may duplicate or omit rows
  assert.match(page, /<li key=\{c\.id\} className="flex gap-4 py-2\.5 text-\[13px\]">/);
  assert.ok(!page.includes("told-${c.kind}-${c.date}"), "the colliding key is gone");
});

test("the header's time off reads every source, not just the calendar", () => {
  // it read loadTimeOffFor alone, so sick pay off the QuickSolve export showed
  // nowhere on the employee's own timesheet
  assert.match(page, /const timeOff = payoutTimeOff\(ts, timeOffTotals\(await loadTimeOffFor\(ts\)\)\);/);
  assert.match(page, /const timeOffHours = timeOff\.added;/);
  // `added` and not `total`: the third source inside payoutTimeOff is Misc time
  // that `paidHours` already holds, and adding it would count those hours twice
  assert.ok(!/payoutTimeOff\([^)]*\)\.total/.test(page), "total would double-count the Misc hours");
});

test("PTO and sick pay are named, not lumped as time off", () => {
  // Mánu 2026-09-17, having seen it as one line: "time off shoudnt be there.
  // its just PTO Sick pay". Separate pay codes, separately tracked balances.
  const timeOffLib = read("src/lib/timesheet/time-off.js");
  // the split comes from the rule, not from a screen re-deriving it
  assert.match(timeOffLib, /addedBy: \{ pto: r2\(addedPto\), sick: r2\(addedSick\) \}/);
  assert.match(page, /pto=\{timeOff\.addedBy\.pto\}/);
  assert.match(page, /sick=\{timeOff\.addedBy\.sick\}/);
  assert.match(flowFile, /\{pto > 0 && <Figure label="PTO" value=\{pto\} \/>\}/);
  assert.match(flowFile, /\{sick > 0 && <Figure label="Sick pay" value=\{sick\} \/>\}/);
  assert.ok(!flowFile.includes('label="Time off"'), "the lumped row is gone");
  // and `added` itself is untouched, so no payout surface moves
  assert.match(timeOffLib, /added: r2\(addedPto \+ addedSick\),/);
});

test("the holiday row exists but draws nothing until there is a holiday", () => {
  // HolHr is on the payroll report, the timesheet PDF has a Holiday column and
  // render.js already prints one - and across 2,668 day rows in seven periods
  // not one carries an hour. So the row is here and always zero, and holiday is
  // deliberately NOT inside `added`: folding an always-zero third bucket into
  // what Total payable grows by would be deciding a pay rule nobody has.
  const timeOffLib = read("src/lib/timesheet/time-off.js");
  assert.match(flowFile, /\{holiday > 0 && <Figure label="Holiday" value=\{holiday\} \/>\}/);
  assert.match(page, /holiday=\{0\}/);
  assert.ok(!/addedBy: \{[^}]*holiday/.test(timeOffLib), "holiday is not in the payable split yet");
});

test("a changed figure is drawn the way the audit screen draws one", () => {
  // his pick 2026-09-17, pointing at the Audit workspace: the old figure struck
  // and quiet, the new one amber. Same values as audit.module.css so the two
  // screens agree about what "we have changed this" looks like.
  const css = read("src/app/t/[token]/ReviewFlow.module.css");
  const audit = read("src/app/portal/admin/audit/audit.module.css");
  assert.match(css, /--review-changed: #936000;/);
  assert.match(css, /--review-changed: #e9b453;/);
  assert.match(audit, /--amber: #936000;/);
  assert.match(audit, /--amber: #e9b453;/);
  assert.match(css, /\.review \.nowFigure \{\s*color: var\(--review-changed\);/);
  assert.match(css, /\.review \.wasFigure \{[\s\S]*?text-decoration: line-through;/);
  // every place that draws a pair uses the same two classes, so one page cannot
  // end up with two ways of showing the same thing: the totals figure, the
  // reported day's heading, and since 2026-09-26 the draft card's figure and
  // its crossed-out old range
  assert.equal((flowFile.match(/styles\.wasFigure/g) || []).length, 4);
  assert.equal((flowFile.match(/styles\.nowFigure/g) || []).length, 3);
});
