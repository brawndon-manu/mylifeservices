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
  // every non-rehearsal amendment on the copy's days is read once; only the
  // approved ones become the record, the rest only say they are out
  assert.match(s, /prisma\.clockAmendment\.findMany\(\{\s*where: \{ testOnly: false, shiftDate: \{ in: shiftDates \} \}/);
  assert.match(s, /indexAmendments\(amendmentRows\.filter\(\(a\) => a\.approvedAt\)/);
  assert.match(s, /indexAmendments\(amendmentRows\.filter\(\(a\) => !a\.approvedAt\)/);
  assert.match(s, /const forRules = amendedShift\(shift, amendment\);\s*const read = auditRow\(forRules, note\);/);
  assert.match(s, /clockWorkedMin: shift\.workedMin \?\? null,\s*amendment,/);
});

test("the cards carry the Amended tab, the blue edge and the pill", () => {
  const cards = read("src/app/portal/admin/audit/[id]/AuditCards.js");
  assert.match(cards, /\{ key: "amended", label: "Addendum", match: \(r\) => !!r\.amendment \}/);
  assert.match(cards, /\["open", "flagged", "approved", "amended", \.\.\.\(canRaise \? \["raise"\] : \[\]\), "all"\]/);
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

// ---- raising one from the card ----

test("both screens raise through the one creator, and the page keeps none of the writing", () => {
  const page = read("src/app/portal/admin/clock-amendments/actions.js");
  assert.match(page, /import \{ raiseOne \} from "@\/lib\/clock-amendment\/raise"/);
  assert.match(page, /results\.push\(await raiseOne\(\{ user, candidate: c, pick: p, testOnly, pdf/);
  assert.doesNotMatch(page, /prisma\.clockAmendment\.create/, "the page must not write its own record");
  assert.doesNotMatch(page, /sendAmendmentForm/, "the page must not send its own mail");
  const card = read("src/app/portal/admin/audit/actions.js");
  assert.match(card, /export async function raiseAmendmentFromCard\(formData\)/);
  assert.match(card, /raiseOne\(\{ user, candidate, pick, testOnly, pdf, clockName: batch\.clockName, notesName: batch\.notesName \}\)/);
  const creator = read("src/lib/clock-amendment/raise.js");
  assert.match(creator, /export async function raiseOne\(/);
  assert.match(creator, /prisma\.clockAmendment\.create\(/);
  assert.match(creator, /sendAmendmentForm\(/);
});

test("the card's raise re-reads the shift from the copy's stored export, refuses a clean shift and a second open one", () => {
  const card = read("src/app/portal/admin/audit/actions.js");
  assert.match(card, /if \(!canManageTimesheets\(user\?\.role\)\) return \{ ok: false, error: "auth" \}/);
  // read back from the store, fresh: fetchBlob reads past the CDN cache
  assert.match(card, /fetchBlob\(batch\.clockUrl\)/);
  assert.match(read("src/lib/blob.js"), /useCache: false/);
  assert.match(card, /clockShiftFor\(clockShifts\(xls\), identity, \{ whoKey: who, clientKey \}\)/);
  assert.match(card, /if \(!hasIssue\(shift\)\) return \{ ok: false, error: "clean" \}/);
  assert.match(card, /where: \{ testOnly: false, approvedAt: null, staffId: account\.id, shiftDate: shift\.date \}/);
  assert.match(card, /if \(open\.some\(sameShift\)\) return \{ ok: false, error: "open" \}/);
  // the note is the card's own, by page, and its pages come off the stored file
  assert.match(card, /n\.page === page && who\(n\.employee\) === who\(shift\.name\) && n\.date === shift\.date/);
  assert.match(card, /notePageSpan\(notes, note, pageCount\)/);
});

test("the button is offered only where the clock has something wrong and nothing is out, and the card carries what the rules need", () => {
  const cards = read("src/app/portal/admin/audit/[id]/AuditCards.js");
  assert.match(cards, /const showRaise = canRaise && raisable\(r\);/);
  assert.match(read("src/lib/clock-amendment/rules.js"), /export const raisable = \(row\) => !!row && !row\.amendment && !row\.pending && row\.inClockExport === true && hasIssue\(row\);/);
  assert.match(cards, /const canRaise = canUpload && !frozenMode;/);
  assert.match(cards, /styles\.pendingPill/);
  const build = read("src/app/portal/admin/audit/[id]/build.js");
  assert.match(build, /startDelta: shift\.startDelta \?\? null, endDelta: shift\.endDelta \?\? null,/);
  assert.match(build, /pendingView\(pendingRow/);
  assert.match(build, /where: \{ testOnly: false, shiftDate: \{ in: shiftDates \} \}/);
  const panel = read("src/app/portal/admin/audit/[id]/RaiseAmendment.js");
  for (const fn of ["asksStart", "asksEnd", "asksPlace", "startingTimes", "missingPunchText"]) assert.match(panel, new RegExp(`\\b${fn}\\(`), fn);
  assert.match(panel, /search=\{searchPeople\}/);
  assert.match(panel, /raiseAmendmentFromCard\(body\)/);
  const evidence = read("src/app/portal/admin/audit/[id]/ShiftEvidence.js");
  assert.match(evidence, /\{!row\.amendment && row\.pending && <PendingLine p=\{row\.pending\} \/>\}/);
});

// ---- what was said, under a wording flag ----

test("both card surfaces quote the sentence a wording rule matched, off the row and never off the flag", () => {
  for (const p of ["src/app/portal/admin/audit/[id]/AuditCards.js", "src/app/portal/admin/audit/[id]/StudyMode.js"]) {
    const s = read(p);
    assert.match(s, /import WhatWasSaid from "\.\/WhatWasSaid"/, p);
    assert.match(s, /<WhatWasSaid row=\{r(ow)?\} \/>/, p);
  }
  const said = read("src/app/portal/admin/audit/[id]/WhatWasSaid.js");
  assert.match(said, /if \(!flaggedForWording\(row\?\.review\)\) return null;/);
  assert.match(said, /const matches = languageMatches\(row\);/);
  assert.match(said, /<mark>/);
  assert.match(read("src/app/portal/admin/audit/audit.module.css"), /\.saidList mark \{ background: var\(--amber-fill\)/);
});
