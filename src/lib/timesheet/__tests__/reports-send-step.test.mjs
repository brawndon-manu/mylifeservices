// THE REPORTS STEP SAYS NOT SENT OUT LOUD. a list that read "Review these",
// with a small grey "Not sent" under each report and the only word about
// sending in the footer's small print, looked finished. now: the heading names
// the send, a box says they are not sent and what waits on them, each report
// carries its state by its date, the send rides the bottom of the screen, the
// thanks after a send is said once, and leaving with drafts unsent is asked
// first - drafts live in the tab alone.
//
// client components, so the rules are pinned as text like the rest of this
// screen's.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const report = fs.readFileSync(new URL("../../../app/t/[token]/ReportProblem.js", import.meta.url), "utf8");
const flow = fs.readFileSync(new URL("../../../app/t/[token]/ReviewFlow.js", import.meta.url), "utf8");
const list = report.slice(report.indexOf('if (flow?.stage === "reports") {'), report.indexOf("if (flow && !open) return null;"));

test("unsent, the step is named for the send and a box says they are not sent and what waits on them", () => {
  assert.match(list, /const unsent = items\.length > 0 && !flow\.reported;/);
  assert.match(list, /\{unsent \? "Send your reports" : "Your reports"\}/);
  assert.match(list, /\{items\.length === 1 \? "This report is not sent yet" : `These \$\{items\.length\} reports are not sent yet`\}/);
  assert.match(list, /\{items\.length === 1 \? "Payroll won't see it until you send it\." : "Payroll won't see them until you send them\."\} Your timesheet waits until payroll has decided\./);
});

test("each report carries its state by its date, amber while not sent, and nowhere else", () => {
  assert.match(list, /\{flow\.reported \? "bg-fill font-medium text-muted" : "bg-amber-500\/15 font-semibold text-amber-700 dark:text-amber-300"\}/);
  assert.match(list, /\{flow\.reported \? "Awaiting payroll" : "Not sent"\}\s*<\/span>\s*<\/h3>/);
  assert.equal((list.match(/"Awaiting payroll" : "Not sent"/g) || []).length, 1, "said once per report");
});

test("the send rides the bottom of the screen while reports wait, the page's own footer steps aside, and Back moves to the top", () => {
  assert.match(flow, /<span className="block text-\[13px\] font-semibold text-amber-700 dark:text-amber-300">\{items\.length\} not sent<\/span>/);
  assert.match(flow, /\{items\.length === 1 \? "Send it to payroll to finish\." : "Send them to payroll to finish\."\}/);
  assert.match(flow, /\{enabled && !readOnly && !sendHere && \(stage !== "days" \|\| hold\) && \(/);
  assert.match(list, /\{unsent && <button type="button" onClick=\{\(\) => flow\.go\("days"\)\} className="mb-1 min-h-\[44px\] text-\[13px\] font-medium text-accent">‹ Back<\/button>\}/);
  // the bar is the day bar's own, so the page keeps room under it, lined up
  // with the page's column on a wide screen (no day rail on this step)
  assert.match(flow, /data-send-bar className=\{`flex items-center justify-between gap-3 \$\{styles\.dayBar\} \$\{styles\.sendBar\}`\}/);
  const css = fs.readFileSync(new URL("../../../app/t/[token]/ReviewFlow.module.css", import.meta.url), "utf8");
  assert.ok(css.indexOf(".sendBar {") > css.lastIndexOf(".dayBar {"), "the send bar's rule comes after every day bar rule");
  assert.match(css, /\.sendBar \{\s*left: calc\(max\(0px, \(100% - 72rem\) \/ 2\) \+ 1\.5rem\);\s*right: calc\(max\(0px, \(100% - 72rem\) \/ 2\) \+ 1\.5rem\);/);
});

test("after a send the thanks is said once, over the list of what was sent", () => {
  assert.match(report, /if \(done && flow\?\.stage !== "reports"\) return thanks;/);
  assert.match(list, /\{done && thanks\}/);
  assert.match(report, /setDone\(true\);\s*flow\?\.setReported\(true\);\s*flow\?\.setJustSent\?\.\(true\);/);
  assert.match(flow, /const \[justSent, setJustSent\] = useState\(false\);/);
  assert.match(flow, /: reported && stage !== "days" && !\(stage === "reports" && justSent\) \? REPORTS_PENDING\n/);
  // a sent list has no line of its own under the heading
  assert.match(list, /: unsent && <p className="mt-2 text-sm text-muted">Check them, then send them to payroll\.<\/p>\}/);
});

test("closing or leaving the page with reports not sent is asked first, and only then", () => {
  assert.match(flow, /useEffect\(\(\) => \{\s*if \(readOnly \|\| !draftsUnsent\) return undefined;\s*const warn = \(e\) => \{ e\.preventDefault\(\); e\.returnValue = ""; \};\s*window\.addEventListener\("beforeunload", warn\);\s*return \(\) => window\.removeEventListener\("beforeunload", warn\);\s*\}, \[readOnly, draftsUnsent\]\);/);
});
