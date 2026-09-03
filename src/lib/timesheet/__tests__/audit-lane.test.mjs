// STRUCTURAL GUARDS for the audit lane - Mánu 2026-09-03: "the audit card and
// the timesheets will be its own seperate data so the newer data doesnt
// override the exisiting signed off sheets." An audit copy is a batch flagged
// auditOnly; these pin the walls between it and the payroll side, because
// every one of them failing open ends the same way - a signed batch going
// read-only, or sixty unsigned sheets one button from being mailed.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

test("supersede runs within a kind - an audit copy never outranks a payroll batch", () => {
  const s = read("src/lib/timesheet/superseded.js");
  assert.match(s, /auditOnly: true/, "the batch lookup must carry the flag");
  assert.match(
    s,
    /auditOnly: batch\.auditOnly/,
    "the newer-batch query must match the batch's own kind",
  );
});

test("the payroll surfaces never list an audit copy", () => {
  for (const [file, why] of [
    ["src/app/portal/admin/timesheets/page.js", "the batch list's main button is Send all"],
    ["src/app/portal/admin/timesheets/new/page.js", "the lands-on-top-of warning"],
    ["src/app/portal/admin/timesheets/patterns/page.js", "a period would count twice"],
  ]) {
    assert.match(read(file), /auditOnly: false/, `${file}: ${why}`);
  }
});

test("nothing sends or signs from an audit copy", () => {
  const actions = read("src/app/portal/admin/timesheets/actions.js");
  // sendTimesheets bounces to the Audit page instead of building a single email
  assert.match(actions, /if \(batch\.auditOnly\) redirect\(`\/portal\/admin\/audit\/\$\{batch\.id\}`\)/);
  // a leaked token posted straight at the signing action gets nothing
  assert.match(actions, /if \(ts\.batch\?\.auditOnly\) return \{ ok: false, error: "auth" \}/);
  // the /t page 404s the sheet before anything renders
  assert.match(read("src/app/t/[token]/page.js"), /if \(ts\.batch\?\.auditOnly\) notFound\(\)/);
  // and the batch page itself hands an audit copy to the Audit page
  assert.match(
    read("src/app/portal/admin/timesheets/[id]/page.js"),
    /if \(batch\.auditOnly\) redirect\(`\/portal\/admin\/audit\/\$\{batch\.id\}`\)/,
  );
});

test("the audit upload needs no payroll or rest report, and only when it is one", () => {
  const actions = read("src/app/portal/admin/timesheets/actions.js");
  assert.match(actions, /if \(!payFile && !auditOnly\) redirect\(`\$\{NEW\}error=nopayroll`\)/);
  assert.match(actions, /if \(!restFile && !auditOnly\) redirect\(`\$\{NEW\}error=norests`\)/);
  // their parse blocks are guarded, so a missing pick skips rather than throws
  assert.match(actions, /if \(restFile\) \{\n\s*P\.stage = "rests"/);
  assert.match(actions, /if \(payFile\) \{\n\s*P\.stage = "payroll"/);
  // a correction upload is never an audit copy - the target batch says what it is
  assert.match(actions, /const auditOnly = !intoBatchId &&/);
  // the flag lands on the batch row and the finished screen is the Audit page
  assert.match(actions, /auditOnly,\n/);
  assert.match(actions, /\? `\/portal\/admin\/audit\/\$\{batch\.id\}`/);
});

test("the schema carries the flag with a false default", () => {
  assert.match(
    read("prisma/schema.prisma"),
    /auditOnly\s+Boolean\s+@default\(false\)/,
    "every batch that predates the lane is an explicit payroll batch",
  );
});
