// A RESET ON A SIGNED SHEET HAS TO ACTUALLY RESET IT.
//
// Mánu 2026-09-18, on Joseph Gutierrez's live sheet: he added 8 hours of sick to
// the calendar, pressed "Yes, reset it", and nothing happened. Signed 09/17,
// approved 09/17, both still standing afterwards.
//
// IT WAS GUARANTEED, NOT UNLUCKY. Two guards stood in the way and each is right
// for every other caller:
//
//   the freeze   `frozen = signedAt || approvedAt` keeps the stored days, so a
//                correction can never silently rewrite a signed document
//   the verdict  decideSignature keeps a signature when nothing moved - and on
//                a frozen sheet nothing ever moves
//
// So on exactly the sheets the dialog was offered for, the reset could not do
// what the dialog promised. It answered {"keep":true,"why":"grantedAsReported"}.
//
// His call: "they signed? their signature will be removed. if they did that and
// we approve as well then another promp because it is supposed to fully reset
// the timesheet."
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const actions = read("src/app/portal/admin/timesheets/actions.js");
const bar = read("src/app/t/[token]/ReviewerBar.js");

test("a full reset passes both guards, and only a full reset may", () => {
  assert.match(actions, /async function rebuildSheetFor\(ts, overrides, \{ keepSent = false, client = prisma, fullReset = false \} = \{\}\) \{/);
  // the freeze stands for every other caller
  assert.match(actions, /const frozen = !fullReset && !!\(ts\.signedAt \|\| ts\.approvedAt\);/);
  // and so does the verdict
  assert.match(actions, /\.\.\.\(fullReset \|\| clearsSignature\(ts\.signedAt, signature\) \? \{/);
  // nine other call sites, none of which pass it
  const passes = actions.match(/fullReset: /g) || [];
  assert.equal(passes.length, 1, "exactly one caller asks for a full reset");
});

test("the server refuses to un-sign unless it was told it had been said", () => {
  // the rule lives in the action, not the dialog - hiding a control is a
  // suggestion, and a signature coming off a payroll document cannot be an
  // accident
  assert.match(actions, /export async function resetTimesheetAnswers\(timesheetId, \{ confirmUnsign = false, confirmUnapprove = false \} = \{\}\) \{/);
  assert.match(actions, /if \(ts\.signedAt && !confirmUnsign\) return \{ ok: false, error: "needsunsign" \};/);
  assert.match(actions, /if \(ts\.approvedAt && !confirmUnapprove\) return \{ ok: false, error: "needsunapprove" \};/);
  // and an ordinary unsigned reset is the rebuild it has always been
  assert.match(actions, /const full = !!\(ts\.signedAt \|\| ts\.approvedAt\);/);
});

test("the prompt knows whether it was approved, not just signed", () => {
  // it only ever reported `signed`, so the dialog could not tell the two apart
  assert.match(actions, /return \{ answers, reasons, signed: !!ts\.signedAt, approved: !!ts\.approvedAt \};/);
  assert.match(actions, /return \{ answers: 0, reasons: 0, signed: false, approved: false \};/);
  // and it has to be selected, or it reads undefined and the second step never appears
  assert.match(actions, /approvedAt: true,/);
});

test("an approval takes a second press, never the same one", () => {
  assert.match(bar, /const \[stage, setStage\] = useState\("first"\);/);
  assert.match(bar, /if \(impact\.approved && stage === "first"\) \{ setStage\("confirm"\); return; \}/);
  assert.match(bar, /Also remove your approval of \{name\}&apos;s sheet\?/);
  // the wording he asked for, on the sheet that has a signature to lose
  assert.match(bar, /<b className="text-foreground">Their signature will be removed<\/b>/);
  // and what the button says at each step
  assert.match(bar, /\? "Continue"/);
  assert.match(bar, /\? "Yes, reset it and remove my approval"/);
});

test("both confirmations are carried to the server", () => {
  assert.match(bar, /confirmUnsign: !!impact\.signed,/);
  assert.match(bar, /confirmUnapprove: !!impact\.approved,/);
});
