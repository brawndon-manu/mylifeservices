// STRUCTURAL GUARDS for the amendment on the audit: one billable rule read
// everywhere, the tab, the edge and the figures. each of these failing open
// ends the same way - a report summing a figure the card does not show.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

test("every surface that sums billable minutes reads billable-of, and none keeps its own fallback", () => {
  for (const p of [
    "src/app/portal/admin/audit/[id]/AuditCards.js",
    "src/app/portal/admin/audit/[id]/ShiftEvidence.js",
    "src/app/portal/admin/audit/[id]/TimeCompare.js",
    "src/lib/timesheet/audit-workbook.js",
    "src/lib/timesheet/client-hours-report.js",
    "src/lib/timesheet/client-calendar-report.js",
  ]) {
    const s = read(p);
    assert.match(s, /billableOf/, `${p} must read billableOf`);
    assert.doesNotMatch(s, /review\?\.billableMin \?\? r\.billedMin/, `${p} still carries the old fallback`);
  }
});

test("the build joins approved amendments and reads the signed shift for the findings", () => {
  const s = read("src/app/portal/admin/audit/[id]/build.js");
  assert.match(s, /prisma\.clockAmendment\.findMany\(\{\s*where: \{ testOnly: false, approvedAt: \{ not: null \}/);
  assert.match(s, /const forRules = amendedShift\(shift, amendment\);\s*const read = auditRow\(forRules, note\);/);
  assert.match(s, /clockWorkedMin: shift\.workedMin \?\? null,\s*amendment,/);
});

test("the cards carry the Amended tab, the blue edge and the pill", () => {
  const cards = read("src/app/portal/admin/audit/[id]/AuditCards.js");
  assert.match(cards, /\{ key: "amended", label: "Amended", match: \(r\) => !!r\.amendment \}/);
  assert.match(cards, /\["open", "flagged", "approved", "amended", "all"\]/);
  assert.match(cards, /data-amended=\{r\.amendment \? "true" : undefined\}/);
  assert.match(cards, /styles\.amendedPill/);
  const focus = read("src/app/portal/admin/audit/[id]/StudyMode.js");
  assert.match(focus, /data-amended=\{row\.amendment \? "true" : undefined\}/);
  const css = read("src/app/portal/admin/audit/audit.module.css");
  // the blue edge is declared after the decision colours so it wins on a card
  // that is both decided and amended
  const decided = css.indexOf('.card[data-decision="approved"]');
  const amended = css.indexOf('.card[data-amended="true"] { border-left: 3px solid var(--accent); }');
  assert.ok(decided > 0 && amended > decided, "the amended edge must follow the decision edges");
  assert.match(css, /--accent-fill: #0066cc1a;/);
  assert.match(css, /--accent-fill: #65afff26;/);
});

test("the punch rules of the auto flagger stand down on the end an amendment covers", () => {
  const s = read("src/lib/timesheet/auto-flag.js");
  assert.match(s, /!!r\.noOut && !r\.amendment\?\.outChanged/);
  assert.match(s, /!!r\.noIn && !r\.amendment\?\.inChanged/);
  assert.match(s, /r\.gpsIn === "no" && !r\.amendment\?\.placeIn/);
  assert.match(s, /r\.gpsOut === "no" && !r\.amendment\?\.placeOut/);
});
