// A REPORTED ISSUE HOLDS THE DOCUMENT UNTIL PAYROLL DECIDES, and what the
// page and the rail say around it.
//
// the nine asks of 2026-09-25, phases 2 and 3: (1) an open report stops
// Generate everywhere the sheet was signable, the server included; (2) the
// last decision emails the person with the bell's own words and no office
// note; (3) a day payroll changed wears the badge and "Approved", a denied
// one keeps its walk check with "Not approved"; (6) in Live the office can
// accept what it just sent; (7) the report form's hours are the slots added
// up; (8) the floating bar offers Cancel while the form is open.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isReportRow, openReports, decidedReportsByDate } from "../corrections.js";
import { slotHours } from "../work-slots.js";
import { decisionSubject } from "../../timesheet-subjects.js";

const read = (file) => fs.readFileSync(file, "utf8");
const actions = read("src/app/portal/admin/timesheets/actions.js");
const page = read("src/app/t/[token]/page.js");
const flow = read("src/app/t/[token]/ReviewFlow.js");
const signer = read("src/app/t/[token]/TimesheetSigner.js");
const report = read("src/app/t/[token]/ReportProblem.js");
const rail = read("src/app/t/[token]/DayRail.js");
const byDay = read("src/app/t/[token]/DayByDay.js");
const bodyOf = (name) => {
  const at = actions.indexOf(`export async function ${name}`);
  return actions.slice(at, actions.indexOf("\nexport async function", at + 10));
};
const HOLD = "Your reported issues are pending. You'll get an email once payroll has decided.";

// ---- what counts as an open report --------------------------------------

test("only a report row holds: answers, fixes and the time-off answer never do", () => {
  assert.equal(isReportRow({ kind: "hours" }), true);
  assert.equal(isReportRow({ kind: "other" }), true);
  assert.equal(isReportRow({ kind: "q_nothingDocumentedMeal" }), false);
  assert.equal(isReportRow({ kind: "time_off" }), false);
  const rows = [
    { kind: "hours", status: "open", date: "07/16/26" },
    { kind: "q_nothingDocumentedRest", status: "open", date: "07/17/26" },
    { kind: "time_off", status: "open", date: null },
    { kind: "meal_missed", status: "accepted", date: "07/18/26" },
  ];
  assert.deepEqual(openReports(rows).map((r) => r.kind), ["hours"]);
  assert.deepEqual(openReports([]), []);
  assert.deepEqual(openReports(null), []);
});

test("what payroll decided per day: accepted wins, declines alone read denied, an open report on the day says nothing yet", () => {
  const rows = [
    { kind: "hours", status: "accepted", date: "07/16/26" },
    { kind: "meal_missed", status: "declined", date: "07/16/26" },
    { kind: "rest_missed", status: "declined", date: "07/17/26" },
    { kind: "hours", status: "declined", date: "07/18/26" },
    { kind: "day_extra", status: "open", date: "07/18/26" },
    { kind: "q_nothingDocumentedMeal", status: "accepted", date: "07/19/26" },
    { kind: "other", status: "accepted", date: null },
  ];
  assert.deepEqual(decidedReportsByDate(rows), { "07/16/26": "approved", "07/17/26": "denied" });
  assert.deepEqual(decidedReportsByDate([]), {});
});

// ---- ask 1: the hold, everywhere the sheet was signable ---------------------

test("the page reads the one filter, and both gates and the strip's readiness carry it", () => {
  assert.match(page, /const openCorrections = openReports\(ts\.corrections\);/);
  assert.match(page, /const reportsPending = openCorrections\.length > 0;/);
  assert.match(page, /const readyToGenerate = progress\.settled && gate\.canSign && breakAsks\.length === 0 && !reportsPending;/);
  assert.match(page, /canSign=\{progress\.settled && gate\.canSign && breakAsks\.length === 0 && !reportsPending\}/);
  assert.match(page, /reportsPending=\{reportsPending\}/);
});

test("the flow holds Generate on a sent report and says why in the footer", () => {
  assert.match(flow, /export const REPORTS_PENDING = "Your reported issues are pending\. You'll get an email once payroll has decided\.";/);
  assert.match(flow, /const canGenerate = ready && !editorTarget && !draftsUnsent && !reported;/);
  assert.match(flow, /: reported && stage !== "days" \? REPORTS_PENDING\n/);
});

test("the Generate band holds with his line, for the server's reports and for one this tab just sent", () => {
  assert.match(signer, /const pending = reportsPending \|\| !!flow\?\.reported;/);
  assert.match(signer, /const gated = !canSign \|\| pending;/);
  assert.match(signer, /\{pending\n\s*\? REPORTS_PENDING\n\s*: gated/);
});

test("the panel after Send reports says the same, and page 2 is gone from it", () => {
  assert.match(report, /Thanks - payroll has been told\.[\s\S]{0,600}\{REPORTS_PENDING\}/);
  assert.doesNotMatch(report, /What you reported goes on page 2 of your timesheet\. Sign it there/);
});

test("the server refuses a signature over an open report, on status alone", () => {
  const body = bodyOf("submitSignedTimesheet");
  assert.match(body, /if \(ts\.heldAt\) return \{ ok: false, error: "held" \};\n[\s\S]{0,700}if \(openReports\(ts\.corrections\)\.length\) return \{ ok: false, error: "reported" \};/);
  assert.doesNotMatch(body, /claimStage/);
});

test("the hold line is typed once and read from the flow everywhere", () => {
  const all = [flow, signer, report, page].join("\n");
  assert.equal(all.split(HOLD).length - 1, 1);
});

// ---- ask 2: the email on the last decision ---------------------------------

test("the decision email rides with the bell: same title, the sentence without the office's notes, the same link, the rehearsal address", () => {
  const body = actions.slice(actions.indexOf("async function ringDecision"), actions.indexOf("export async function overrideDayHours"));
  assert.match(body, /await sendDecisionEmail\(\{\n\s*intendedEmail: sheet\.user\.email,/);
  assert.match(body, /title,\n\s*body: plain,/);
  assert.match(body, /signUrl: `\$\{base\}\/t\/\$\{signTimesheetToken\(sheet\.id\)\}`,/);
  assert.match(body, /forceTo: batchForceTo\(sheet\.batch\),/);
  // the bell keeps the notes, the mail never carries them
  assert.match(body, /body = `Payroll decided on the changes you reported on your \$\{period\} timesheet\.\$\{notes\} Open it to review and sign\.`;\n\s*plain = `Payroll decided on the changes you reported on your \$\{period\} timesheet\. Open it to review and sign\.`;/);
  assert.doesNotMatch(body.slice(body.indexOf("await sendDecisionEmail(")), /notes/);
});

test("both callers of the bell select the address and the rehearsal flags it needs", () => {
  const resolve = bodyOf("resolveCorrection");
  const settle = bodyOf("settleDecidedSheet");
  for (const body of [resolve, settle]) {
    assert.match(body, /user: \{ select: \{ email: true, name: true, preferredFirstName: true, preferredLastName: true \} \}/);
    assert.match(body, /testOnly: true, testEmail: true/);
  }
});

test("the subject is the bell's title, with the test prefix like every other timesheet email", () => {
  assert.equal(decisionSubject({ title: "Your timesheet is ready to sign" }), "Your timesheet is ready to sign");
  assert.equal(decisionSubject({ title: "Your timesheet is ready to sign", redirectedFrom: "a@b.c" }), "[TEST -> a@b.c] Your timesheet is ready to sign");
});

// ---- ask 3: the day payroll changed ------------------------------------------

test("the rail reads the decision off the report rows, badge and word for approved, walk check and word for denied", () => {
  assert.match(page, /const decidedByDate = decidedReportsByDate\(ts\.corrections\);/);
  assert.equal(page.split("decided={decidedByDate}").length - 1, 2);
  assert.match(byDay, /decided: decided\[d\.date\] \|\| null,/);
  assert.match(rail, /const approved = d\.decided === "approved";\n\s*const denied = d\.decided === "denied";/);
  assert.match(rail, /\{!needsAnswer && !hasReport && approved && <CircleCheck size=\{17\} className=\{styles\.approved\} \/>\}/);
  assert.match(rail, /\{!needsAnswer && !hasReport && !approved && \(/);
  assert.match(rail, /if \(approved\) return <span className=\{`block text-\[11\.5px\] font-semibold \$\{styles\.approved\}`\}>Approved<\/span>;/);
  assert.match(rail, /if \(denied\) return <span className="block text-\[11\.5px\] text-muted">Not approved<\/span>;/);
  assert.match(rail, /<DecisionWord \{\.\.\.status\} \/>/);
});

// ---- ask 6: Live accepts on the spot -------------------------------------------

test("the send hands back the rows it wrote, and Live's accept is office-only, on those rows, still open, on the token's sheet", () => {
  const send = bodyOf("submitTimesheetCorrections");
  assert.match(send, /return \{ ok: true, ids: written\.map\(\(r\) => r\.id\) \};/);
  const accept = bodyOf("acceptReportsNow");
  assert.match(accept, /^export async function acceptReportsNow\(\{ token, ids \}\) \{\n\s*await requireTimesheetAccess\(\);/);
  assert.match(accept, /where: \{ id: \{ in: wanted \}, timesheetId: id, status: "open" \}/);
  assert.match(accept, /if \(rows\.length !== wanted\.length\) return \{ ok: false, error: "changed" \};/);
  // the last decision hands back the send prompt's email - see resolveCorrection
  assert.match(accept, /for \(const r of rows\) last = await resolveCorrection\(r\.id, "accepted", null\);/);
  assert.match(accept, /return \{ ok: true, accepted: rows\.length, send: last\?\.send \|\| null \};/);
});

test("the Live offer, in his words, only in Live, with a line per report", () => {
  assert.match(page, /live=\{live\} employeeName=\{reviewerName\}\n\s*acceptAction=\{act\(acceptReportsNow\)\}/);
  assert.match(report, /if \(live && acceptAction && Array\.isArray\(res\.ids\) && res\.ids\.length\) setOffer\(\{ ids: res\.ids, items: payload \}\);/);
  assert.match(report, /Accept these changes now\?/);
  assert.match(report, /You are in Live on \{employeeName \|\| "this person"\}&apos;s timesheet\. Accepting applies the changes now, so their timesheet can be generated\./);
  assert.match(report, /\{offer\.items\.map\(\(item, i\) => \{/);
  assert.match(report, />\{busy \? "Accepting\.\.\." : "Accept now"\}</);
  assert.match(report, />Leave it for review</);
  assert.match(report, /const res = await acceptAction\(\{ token, ids: offer\.ids \}\);/);
});

// ---- ask 7: the hours are the slots -------------------------------------------

test("slotHours adds up the readable slots and is null until one reads", () => {
  assert.equal(slotHours([{ from: "11:30a", to: "1p" }]), 1.5);
  assert.equal(slotHours([{ from: "9a", to: "10a" }, { from: "3p", to: "6p" }]), 4);
  assert.equal(slotHours([{ from: "9a", to: "10a" }, { from: "", to: "" }]), 1);
  assert.equal(slotHours([{ from: "9a", to: "" }]), null);
  assert.equal(slotHours([{ from: "6p", to: "9a" }]), null);
  assert.equal(slotHours([]), null);
  assert.equal(slotHours(null), null);
});

test("the form reads its hours off the slots and has no box for them", () => {
  // no total while a slot runs into another - see report-form-rules
  assert.match(report, /const slotTotal = takesSlots && problems\.ok \? slotHours\(slots\) : null;\n\s*const hours = slotTotal == null \? "" : String\(slotTotal\);/);
  assert.doesNotMatch(report, /id="rp-hours"/);
  assert.doesNotMatch(report, /setHours\(/);
  assert.match(report, /<span data-slot-total className=\{`text-2xl font-medium tabular-nums text-foreground \$\{reviewStyles\.hours\}`\}>\n\s*\{slotTotal == null \? "—" : fmt\(slotTotal\)\}/);
});

// ---- ask 8: Cancel on the floating bar ------------------------------------------

test("the bar offers Cancel beside Report a problem while the form is open, and it is the form's own cancel", () => {
  assert.match(flow, /\{flow\.editorTarget && <button type="button" onClick=\{\(\) => flow\.reportRef\.current\?\.cancel\(\)\}\n\s*className="[^"]*">Cancel<\/button>\}/);
  assert.match(report, /useImperativeHandle\(flow\?\.reportRef, \(\) => \(\{[\s\S]*?cancel,\n\s*\}\)\);/);
});

test("the form's intro says the report goes to payroll and the timesheet waits, not page 2", () => {
  const form = fs.readFileSync("src/app/t/[token]/ReportProblem.js", "utf8").replace(/\s+/g, " ");
  assert.match(form, /What you send goes to payroll, and your timesheet waits until they decide\./);
  assert.doesNotMatch(form, /goes on page 2 of your timesheet/);
  // the line after it said "decide" a second time, so it went
  assert.doesNotMatch(form, /Nothing changes until payroll decides/);
});
