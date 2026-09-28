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
  // the send is handed to the flow for one caller: the reports step's footer
  assert.match(report, /\n\s*send,\n\s*\}\)\);/);
  const callers = (flow.match(/reportRef\.current\?\.send\(\)/g) || []).length;
  assert.equal(callers, 1, "one place presses send");
  // the one press is on the send bar at the bottom of the screen (the mock's D)
  assert.match(flow, /\{enabled && !readOnly && sendHere && \(\n\s*<div data-send-bar className=\{`flex items-center justify-between gap-3 \$\{styles\.dayBar\} \$\{styles\.sendBar\}`\}>/);
  assert.match(flow, /<button type="button" className=\{`\$\{button\} \$\{styles\.primary\} shrink-0`\}\n\s*disabled=\{!!editorTarget \|\| sending\}\n\s*onClick=\{\(\) => reportRef\.current\?\.send\(\)\}>\{sending \? "Sending\.\.\." : "Send reports"\}<\/button>/);
  assert.match(flow, /const sendHere = stage === "reports" && draftsUnsent;/);
  // the list itself keeps no Send of its own
  const list = report.slice(report.indexOf('if (flow?.stage === "reports") {'), report.indexOf("if (flow && !open) return null;"));
  assert.doesNotMatch(list, /onClick=\{send\}|Send reports/);
  assert.match(report, /if \(live && acceptAction[^\n]*\n[^\n]*\n\s*router\.refresh\(\);\n\s*\}/);
  // and the footer knows a send is under way
  assert.match(report, /flow\?\.setSending\?\.\(true\);/);
  assert.match(report, /flow\?\.setSending\?\.\(false\);/);
});

test("the reports step has no dead Next: Send reports stands in it, and once sent nothing does", () => {
  assert.match(flow, /const noNext = stage === "document" \|\| sendHere \|\| \(stage === "reports" && reported && !leave\);/);
  assert.match(flow, /\{!noNext && <button type="button" className=\{`\$\{button\} \$\{styles\.primary\}`\}/);
  // the "Next: Generate" hint only where Next is
  assert.match(flow, /\{stage !== "days" && !noNext && <p className="mt-2 text-right text-xs text-muted">Next: /);
  // the day program still goes on to its PTO step after a send
  assert.doesNotMatch(flow, /const noNext = [^\n]*reported\)/);
});

test("the panel's way to the reports step waits for every day to be walked", () => {
  const panel = flow.slice(flow.indexOf("export function ToldUsPanel("), flow.indexOf("export function ReviewStage("));
  assert.match(panel, /\{drafts\.length > 0 && \(flow\.allWalked \? \(/);
  assert.match(panel, /<p className="mt-1\.5 text-\[12\.5px\] text-faint">You&apos;ll send these after you review the last day\.<\/p>/);
  // the provider holds it, the day rail says it
  assert.match(flow, /const \[allWalked, setAllWalked\] = useState\(false\);/);
  assert.match(flow, /allWalked, setAllWalked, sending, setSending,/);
  const rail = fs.readFileSync("src/app/t/[token]/DayRail.js", "utf8");
  assert.match(rail, /const allWalked = days\.length > 0 && days\.every\(\(d\) => readyOn\(d\.date\)\);/);
  assert.match(rail, /useEffect\(\(\) => \{\n\s*setAllWalked\?\.\(allWalked\);\n\s*\}, \[allWalked, setAllWalked\]\);/);
});
