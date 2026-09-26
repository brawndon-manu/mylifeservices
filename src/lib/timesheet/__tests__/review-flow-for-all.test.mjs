// THE DAY PROGRAM'S REVIEW FLOW IS EVERY PROGRAM'S, MINUS ITS PTO STAGE FOR
// ILS. Mánu 2026-09-15: "i like the day program flow way better" - the step
// strip with Back and Next together, Report a problem on every day, the sky
// accent on the hours - and then "remove pto and sick pay option for ils".
// Client and server files, pinned as text.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");

test("the flow and the scope are on for every program; the leave stage only for the day program", () => {
  const page = read("../../../app/t/[token]/page.js");
  // the state props moved up to ReviewProvider on 2026-09-17, so the summary
  // at the top of the page can see a drafted report - same values, one level up
  assert.match(page, /<ReviewProvider\s+enabled\s+leave=\{isDayProgram\}\s+ready=\{readyToGenerate\}/);
  assert.doesNotMatch(page, /enabled=\{isDayProgram\}/);
  assert.doesNotMatch(page, /function Stepper\(/, "the three-step strip is gone");
  assert.match(page, /\$\{reviewStyles\.review\}/);
  assert.match(page, /\{isDayProgram && \(\s*<TimeOffCard/);
  const css = read("../../../app/t/[token]/ReviewFlow.module.css");
  assert.match(css, /\.review \{\n  --accent: #196e93;/);
  assert.match(css, /\.review \.hours \{/);
  assert.doesNotMatch(css, /dayProgram/);
});

test("without the leave stage the strip is three steps and reports go straight to the document", () => {
  const flow = read("../../../app/t/[token]/ReviewFlow.js");
  assert.match(flow, /leave = true, ready, openDays = \[\], children,\s*\}\) \{/);
  assert.match(flow, /const steps = leave \? \["Review days", "PTO & sick pay", "Generate", "Sign"\] : \["Review days", "Generate", "Sign"\];/);
  assert.match(flow, /const afterReports = leave \? "leave" : "document";/);
  assert.match(flow, /onClick=\{\(\) => go\(stage === "reports" \? afterReports : "document"\)\}>Next/);
  assert.match(flow, /Next: \{stage === "reports" && leave \? "PTO & sick pay" : "Generate"\}/);
});

test("ILS still cannot answer the time-off question, and only a day-program batch links to the calendar", () => {
  const actions = read("../../../app/portal/admin/timesheets/actions.js");
  assert.match(actions, /the question only exists on day-program sheets/);
  const batch = read("../../../app/portal/admin/timesheets/[id]/page.js");
  assert.match(batch, /\{batch\.program === "DP" && \(\s*<Link\s+href=\{`\/portal\/admin\/timesheets\/\$\{batch\.id\}\/calendar`\}/);
});

test("a day still owing an answer keeps Back and Next together under the sentence", () => {
  const q = read("../../../app/t/[token]/TimesheetQuestion.js");
  // outside the review the sentence still sits over the pair; inside it, the
  // sentence stays in the day's card (DayBlockedNote) and the floating bar
  // carries Back and Next alone
  assert.match(q, /\{!flow && \(\n\s+<p className="text-xs text-muted">\n\s+Answer everything on this day to finish with it\.\n\s+<\/p>\n\s+\)\}\n\s+<div className="flex items-center justify-end gap-3">\n\s+\{hasBack && <BackButton/);
});
