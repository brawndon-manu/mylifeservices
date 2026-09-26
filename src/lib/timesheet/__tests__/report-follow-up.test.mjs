// A REPORT, AFTER IT IS SENT AND AFTER IT IS DECIDED.
//
// the employee's page read its reports once, when it opened, and nothing a
// decision did ever reached it: accepting a report rebuilt the figures but
// told no open tab, and a refreshed tab still held the report on its day as
// "Awaiting payroll". the reports step kept offering Edit, Remove and Send for
// reports already sent. Report a problem threw the page up to the day's heading.
// and a preview on a real batch answered a send with "Something went wrong".
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const actions = read("src/app/portal/admin/timesheets/actions.js");
const report = read("src/app/t/[token]/ReportProblem.js");
const flow = read("src/app/t/[token]/ReviewFlow.js");
const rail = read("src/app/t/[token]/DayRail.js");
const page = read("src/app/t/[token]/page.js");
const bodyOf = (name) => {
  const at = actions.indexOf(`export async function ${name}`);
  return actions.slice(at, actions.indexOf("\nexport async function", at + 10));
};

test("a decision reaches the employee's own page and the office screens", () => {
  const body = bodyOf("resolveCorrection");
  assert.match(body, /revalidatePath\(`\/t\/\$\{signTimesheetToken\(c\.timesheet\.id\)\}`\);/);
  assert.match(body, /await bumpSheetVersion\(c\.timesheet\.id\);/);
  assert.match(body, /await bumpBatchVersion\(c\.timesheet\.batchId\);/);
});

test("so does a recalculation", () => {
  const body = bodyOf("recomputeTimesheet");
  assert.match(body, /revalidatePath\(`\/t\/\$\{signTimesheetToken\(ts\.id\)\}`\);/);
  assert.match(body, /await bumpSheetVersion\(ts\.id\);/);
  assert.match(body, /await bumpBatchVersion\(ts\.batchId\);/);
});

test("a tab holding sent reports takes the server's list when it changes", () => {
  assert.match(flow, /const serverReports = initialReports\.map\(\(r\) => r\.id\)\.join\("\|"\);/);
  assert.match(flow, /if \(!readOnly && seenReports !== serverReports\) \{\n\s*setSeenReports\(serverReports\);\n\s*if \(reported \|\| initialReports\.length\) \{\n\s*setItems\(initialReports\);\n\s*setReported\(initialReports\.length > 0\);/);
});

test("the document swaps when the figures are rebuilt, not only when an answer lands", () => {
  assert.match(page, /key=\{`sheet-\$\{answered\.length\}-\$\{breakAsks\.length\}-\$\{ts\.recomputedAt\?\.getTime\(\) \?\? 0\}`\}/);
  assert.match(page, /fileUrl=\{`\/t\/\$\{token\}\/pdf\?v=\$\{answered\.length\}-\$\{ts\.recomputedAt\?\.getTime\(\) \?\? 0\}`\}/);
});

test("a sent report is payroll's: no Edit, Remove or Send, and it says it is waiting", () => {
  assert.match(report, /\{!flow\.reported && \(\n\s*<div className="flex gap-4">\n\s*<button[^\n]*>Edit<\/button>/);
  assert.match(report, /\{flow\.reported \? "Awaiting payroll" : "Not sent"\}/);
  assert.match(report, /\{items\.length > 0 && !flow\.reported && <>/);
});

test("Report a problem brings the form into view and no longer jumps to the day's top", () => {
  // the rail still selects the reported day, and scrolls nothing itself
  const effect = rail.slice(rail.indexOf("const honoured = useRef(null);"), rail.indexOf("}, [requestedDate, days]);"));
  assert.match(effect, /if \(i >= 0\) setSel\(i\);/);
  assert.doesNotMatch(effect, /scrollIntoView/);
  // the form scrolls only when its top is not already in the upper part of the screen
  assert.match(report, /if \(top < 96 \|\| top > window\.innerHeight \* 0\.6\) window\.scrollBy\(\{ top: top - 96 \}\);/);
  assert.match(report, /<div ref=\{editorRef\} className="mt-4 rounded-xl bg-surface/);
});

test("a preview's refusal says it is a preview", () => {
  assert.match(report, /case "preview":\n\s*return "Preview only - nothing was saved\.";/);
});
