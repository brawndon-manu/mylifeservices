// the reported problems page is a tab in the batch views now, there on every
// screen of a period whether or not anything is waiting. before this the only
// way in from the batch was the amber box, which goes away once the last report
// is decided, so a period whose reports were all settled had no door to them.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { REPORT_ROWS } from "../reported-issues.js";
import { TIME_OFF_KIND } from "../time-off.js";

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const views = read("src/app/portal/admin/timesheets/_components/BatchViews.js");
const viewsCss = read("src/app/portal/admin/timesheets/_components/BatchViews.module.css");
const page = read("src/app/portal/admin/timesheets/[id]/corrections/page.js");
const issues = read("src/app/portal/admin/timesheets/[id]/corrections/ReportedIssues.js");
const batchPage = read("src/app/portal/admin/timesheets/[id]/page.js");

// the filter as prisma would read it, for the three kinds of row a correction can be
const isReport = (kind) => REPORT_ROWS.AND.every((clause) => {
  const not = clause.kind.not;
  return typeof not === "string" ? kind !== not : !kind.startsWith(not.startsWith);
});

test("a report counts, a question answer and the time-off answer do not", () => {
  assert.equal(isReport("hours"), true);
  assert.equal(isReport("day_missing"), true);
  assert.equal(isReport("other"), true);
  assert.equal(isReport("q_mealShort"), false);
  assert.equal(isReport("q_mealCouldMove"), false);
  assert.equal(isReport(TIME_OFF_KIND), false);
});

test("the tab is the last view and opens the reported problems page", () => {
  assert.match(views, /\{ key: "payout", label: "Payout report", href: `\$\{base\}\/report` \},\n\s*\{ key: "reported", label: "Reported problems", href: `\$\{base\}\/corrections` \},\n\s*\];/);
});

test("the tab is never conditional, only its number is", () => {
  // every view renders, so nothing may filter the list before the map
  assert.match(views, /\{views\.map\(\(view\) => \(/);
  assert.doesNotMatch(views, /views\.filter\(/);
  assert.match(views, /\{view\.key === "reported" && waiting > 0 && <span className=\{`\$\{styles\.count\} \$\{styles\.waiting\}`\}>\{waiting\}<\/span>\}/);
});

test("the number is the open reports, read with the page's own filter", () => {
  assert.match(views, /import \{ REPORT_ROWS \} from "@\/lib\/timesheet\/reported-issues";/);
  assert.match(views, /const waiting = await prisma\.timesheetCorrection\.count\(\{\n\s*where: \{ \.\.\.REPORT_ROWS, status: "open", timesheet: \{ batchId \} \},\n\s*\}\);/);
  // and the page lists exactly those rows, both the sheets and their corrections
  assert.match(page, /where: \{ batchId: id, corrections: \{ some: REPORT_ROWS \} \},/);
  assert.match(page, /corrections: \{\n\s*where: REPORT_ROWS,/);
  assert.doesNotMatch(page, /NOT_A_QUESTION/);
});

test("the reported problems page carries the same row with its own tab current", () => {
  assert.match(page, /views=\{<BatchViews batchId=\{batch\.id\} count=\{people\} active="reported" \/>\}/);
  assert.match(page, /prisma\.timesheet\.count\(\{ where: \{ batchId: id \} \}\)/);
  // under the heading, above the list or the empty sentence
  assert.match(issues, /<\/header>\n\s*\{views && <div className=\{styles\.views\}>\{views\}<\/div>\}\n\s*\{sheets\.length === 0/);
});

test("the amber box is still there while something is waiting", () => {
  assert.match(batchPage, /\{disputed > 0 && \(/);
  assert.match(batchPage, /Review what they reported/);
});

test("the waiting number keeps its contrast in light", () => {
  // the plain caution colour on its wash measured 3.74:1 in light; mixed a fifth
  // toward the text colour it is 4.98:1
  assert.match(viewsCss, /\.waiting \{ background: color-mix\(in srgb, var\(--status-caution\) 13%, transparent\); color: color-mix\(in srgb, var\(--status-caution\) 80%, var\(--foreground\)\); font-weight: 600; \}/);
});
