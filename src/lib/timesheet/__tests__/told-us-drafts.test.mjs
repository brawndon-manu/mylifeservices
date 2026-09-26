// A DRAFTED REPORT SITS IN THE TOLD-US PANEL, and the Review reports button
// at the foot of the page is gone.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const flow = fs.readFileSync("src/app/t/[token]/ReviewFlow.js", "utf8");
const page = fs.readFileSync("src/app/t/[token]/page.js", "utf8");
const report = fs.readFileSync("src/app/t/[token]/ReportProblem.js", "utf8");

test("the Review reports button is gone from the foot of the days stage", () => {
  assert.doesNotMatch(flow, /Review reports \(/);
  assert.match(flow, /\{stage !== "days" && <div className="flex items-center justify-between gap-3">/);
});

test("the panel lists a draft as a row of the panel's own shape, with its figure, and points at the reports page", () => {
  const panel = flow.slice(flow.indexOf("export function ToldUsPanel("), flow.indexOf("export function ReviewStage("));
  assert.match(panel, /const drafts = flow && !flow\.readOnly && !flow\.reported \? flow\.items : \[\];/);
  assert.match(panel, /if \(!hasRows && !drafts\.length\) return null;/);
  assert.match(panel, /What you have told us about this timesheet/);
  assert.match(panel, /\{item\.date \? dayChipLabel\(item\.date\) : "This timesheet"\}/);
  assert.match(panel, /<span className="font-semibold text-amber-700 dark:text-amber-400">not sent<\/span>/);
  assert.match(panel, /\{CORRECTION_KINDS\[item\.kind\]\?\.label \|\| item\.kind\}/);
  assert.match(panel, /\{Number\(item\.claimedHours\)\.toFixed\(2\)\}<\/span> hrs/);
  // no sending from here - the reports page keeps that
  assert.doesNotMatch(panel, /Send reports|reportRef/);
  assert.match(panel, /onClick=\{\(\) => flow\.go\("reports"\)\} disabled=\{!!flow\.editorTarget\}[\s\S]{0,140}View reports/);
});

test("the page hands the panel its rows and the panel owns the heading", () => {
  assert.match(page, /<ToldUsPanel hasRows=\{Object\.keys\(answers\)\.length > 0 \|\| toldUs\.length > 0\}>/);
  assert.equal((page.match(/What you have told us about this timesheet/g) || []).length, 0);
  assert.match(page, /import ReviewFlow, \{ ReviewStage, ReviewTotals, ReviewProvider, ToldUsPanel \} from "\.\/ReviewFlow";/);
});

test("the one send stays the reports page's, and it refreshes the page so the server's rows take over from the drafts", () => {
  assert.doesNotMatch(report, /\n\s*send,\n\s*\}\)\);/);
  assert.match(report, /if \(live && acceptAction[^\n]*\n[^\n]*\n\s*router\.refresh\(\);\n\s*\}/);
  assert.match(report, /\{items\.length > 0 && !flow\.reported && <>\n\s*<button type="button" onClick=\{send\}/);
});
