// A RESET CAN TAKE THE REPORTS TOO, AND THE OFFICE SENDS THE NEW TIMESHEET.
// Reset this timesheet... asks "Just their answers" or "Answers and reports"
// (every report, decided or not, so the sheet goes back to the upload). And
// the decision that settles a sheet no longer emails the person on its own:
// the desk and Live put "Send them their new timesheet?" up, and the send is
// the decision email, exactly as that decision produced it.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { signDecisionSend, verifyDecisionSend } from "../decision-send.js";

const read = (p) => fs.readFileSync(p, "utf8");
const actions = read("src/app/portal/admin/timesheets/actions.js");
const bar = read("src/app/t/[token]/ReviewerBar.js");
const desk = read("src/app/portal/admin/timesheets/[id]/corrections/ReportedIssues.js");
const report = read("src/app/t/[token]/ReportProblem.js");
const prompt = read("src/app/portal/admin/timesheets/SendNewTimesheet.js");
const dayProgram = read("src/app/portal/admin/day-program/actions.js");
const bodyOf = (name) => {
  const at = actions.search(new RegExp(`(export )?async function ${name}\\(`));
  return actions.slice(at, actions.indexOf("\n}\n", at) + 2);
};

test("the send's handle carries the sheet and the email's words, signed, for a day", () => {
  process.env.AUTH_SECRET ||= "test-secret";
  const msg = { id: "sheet1", title: "Your timesheet is ready to sign", plain: "Payroll decided on the changes." };
  const now = 1_000_000;
  const token = signDecisionSend(msg, now);
  assert.deepEqual(verifyDecisionSend(token, now + 1000), msg);
  // a day, then it's gone
  assert.equal(verifyDecisionSend(token, now + 24 * 60 * 60 * 1000 + 1), null);
  // nothing else can ride on it
  const [body, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ ...msg, plain: "Something else.", exp: now + 5000 })).toString("base64url");
  assert.equal(verifyDecisionSend(`${forged}.${sig}`, now), null);
  assert.equal(verifyDecisionSend(`${body}.x${sig.slice(1)}`, now), null);
  for (const bad of [null, "", "nodot", 42]) assert.equal(verifyDecisionSend(bad, now), null);
});

test("the reset counts what it would take, and takes the reports only when asked", () => {
  assert.match(actions, /const REPORT_ROWS_WHERE = \{\n\s*NOT: \{ OR: \[\{ kind: \{ startsWith: "q_" \} \}, \{ kind: \{ startsWith: "fix_" \} \}, \{ kind: TIME_OFF_KIND \}\] \},\n\};/);
  const impact = bodyOf("timesheetResetImpact");
  assert.match(impact, /where: \{ timesheetId: ts\.id, \.\.\.REPORT_ROWS_WHERE \},/);
  assert.match(impact, /accepted: reportRows\.filter\(\(r\) => r\.status === "accepted"\)\.length,/);
  const reset = bodyOf("resetTimesheetAnswers");
  assert.match(reset, /if \(withReports\) \{\n\s*\(\{ count: reportCount \} = await prisma\.timesheetCorrection\.deleteMany\(\{\n\s*where: \{ timesheetId: ts\.id, \.\.\.REPORT_ROWS_WHERE \},/);
  // the reports go before the rebuild, so no accepted one is laid back on
  assert.ok(reset.indexOf("REPORT_ROWS_WHERE") < reset.indexOf("await layAcceptedReports(prisma, ts, kept);"));
  assert.match(reset, /return \{ ok: true, answers: count, reasons, reports: reportCount \};/);
});

test("the dialog offers the choice where there are reports, and passes it", () => {
  assert.match(bar, /const \[withReports, setWithReports\] = useState\(false\);/);
  assert.match(bar, /\? `Reset \$\{name\}'s timesheet\?`/);
  assert.match(bar, /\{ on: false, label: "Just their answers", why: "Their reports stay as they are\." \}/);
  assert.match(bar, /label: "Answers and reports",/);
  assert.match(bar, /why: `Their \$\{impact\.reports\.total\} report\$\{impact\.reports\.total === 1 \? "" : "s"\} go too\$\{/);
  assert.match(bar, /\? "Their sheet goes back to the upload, keeping the changes payroll accepted\."/);
  assert.match(bar, /confirmUnapprove: !!impact\.approved,\n\s*withReports,/);
  // back to "just the answers" every time it opens
  assert.match(bar, /setErr\(null\);\n\s*setWithReports\(false\);/);
});

test("the decision hands its email back instead of sending it, from the desk and Live", () => {
  const ring = bodyOf("ringDecision");
  assert.match(ring, /async function ringDecision\(sheet, signature, claims, \{ email = true \} = \{\}\) \{/);
  assert.match(ring, /const message = \{ title, plain \};\n\s*if \(email\) await emailDecision\(sheet, message\);\n\s*return message;/);
  const resolve = bodyOf("resolveCorrection");
  assert.match(resolve, /message = await ringDecision\(c\.timesheet, signature, claims, \{ email: false \}\);/);
  assert.match(resolve, /message = \(await settleDecidedSheet\(c\.timesheet\.id, \{ email: false \}\)\)\?\.message \|\| null;/);
  assert.match(resolve, /token: signDecisionSend\(\{ id: c\.timesheet\.id, title: message\.title, plain: message\.plain \}\),/);
  const settle = bodyOf("settleDecidedSheet");
  assert.match(settle, /export async function settleDecidedSheet\(timesheetId, \{ email = true \} = \{\}\) \{/);
  assert.match(settle, /return \{ signature, message \};/);
  // the day program's calendar still emails on its own
  assert.match(dayProgram, /for \(const t of asked\) await settleDecidedSheet\(t\.id\);/);
});

test("the send is office-only, takes only a handle this server signed, and marks the sheet sent", () => {
  const send = bodyOf("sendDecidedTimesheet");
  assert.match(send, /^export async function sendDecidedTimesheet\(sendToken\) \{\n\s*await requireTimesheetAccess\(\);\n\s*const msg = verifyDecisionSend\(sendToken\);\n\s*if \(!msg\) return \{ ok: false, error: "expired" \};/);
  assert.match(send, /if \(newer\) return refusal\(newer\);/);
  assert.match(send, /const sent = await emailDecision\(sheet, msg\);/);
  assert.match(send, /data: \{ sentAt: new Date\(\), sentToEmail: sent\.sentTo \|\| null, intendedEmail: sheet\.user\.email \},/);
  // the email itself: the same builder the bell's email always used
  const mail = bodyOf("emailDecision");
  assert.match(mail, /await sendDecisionEmail\(\{\n\s*intendedEmail: sheet\.user\.email,/);
  assert.match(mail, /forceTo: batchForceTo\(sheet\.batch\),/);
});

test("the prompt: on the desk after the settling decision, and in Live after Accept now", () => {
  assert.match(prompt, /Send \{send\.name\} their new timesheet\?/);
  assert.match(prompt, /Every report on it is decided\. They&apos;ll get this email, with a link to their timesheet:/);
  assert.match(prompt, /<p className="text-sm font-semibold text-foreground">\{send\.title\}<\/p>/);
  assert.match(prompt, /const res = await sendDecidedTimesheet\(send\.token\);/);
  assert.match(prompt, />\s*Not now\s*</);
  assert.match(prompt, /\{pending \? "Sending…" : "Send it"\}/);
  // the desk holds it above the detail, which a refresh can unmount
  assert.match(desk, /const \[sendPrompt, setSendPrompt\] = useState\(null\);/);
  assert.match(desk, /onDecided=\{\(send\) => send && setSendPrompt\(send\)\}/);
  assert.match(desk, /onDecided\?\.\(res\?\.send \|\| null\);/);
  assert.match(desk, /\{sendPrompt && <SendNewTimesheet send=\{sendPrompt\} onClose=\{\(\) => setSendPrompt\(null\)\} \/>\}/);
  // Live
  assert.match(report, /if \(res\?\.ok\) \{ setOffer\(null\); setDone\(false\); if \(res\.send\) setSendPrompt\(res\.send\); \}/);
  assert.match(report, /if \(sendPrompt\) return <SendNewTimesheet send=\{sendPrompt\} onClose=\{\(\) => setSendPrompt\(null\)\} \/>;/);
});
