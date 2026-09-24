// THE CLOCK IS THE EXPORT'S, THE BILLING IS THE ADDENDUM'S, and the addenda
// report says what every one of them did. three guards for the 09/23 change:
// the Clocked figure never carries the signed window, the clock comparison
// never flags the gap an addendum closes, and the report's model reads the
// way the flagged shifts report reads.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { amendedShift } from "../amended.js";
import { auditRow } from "../note-audit.js";
import { addendaReportModel, assembleAddenda } from "../addenda-report.js";

const src = (rel) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

// the export's row for a late clock-in: booked 2:00-4:30, clocked 2:40-4:03
const shift = () => ({
  name: "Espinoza, Brandon", client: "Prescott, Mason", date: "09/22/26",
  schedFrom: 840, schedTo: 990, scheduledMin: 83, actualFrom: 880, actualTo: 963, workedMin: 83,
  originalFrom: 840, originalTo: 990, noIn: false, noOut: false, gpsIn: "yes", gpsOut: "yes", startDelta: 40,
});
const view = { timesChanged: true, inChanged: true, outChanged: false, from: 825, to: 963, min: 138, wasFrom: 880, wasTo: 963 };
const note = { words: 160, minutes: 83, signedAt: "4:03 PM" };

test("an amended shift carries what bills, and the clock comparison comes out level on it", () => {
  const read = amendedShift(shift(), view);
  assert.equal(read.billableMin, 138);
  const kinds = auditRow(read, note).reasons.map((r) => r.kind);
  assert.ok(!kinds.includes("billed-under-clocked"), `no under finding on an amended shift: ${kinds}`);
  assert.ok(!kinds.includes("billed-over-clocked"), `no over finding on an amended shift: ${kinds}`);
  // the same shift without the addendum still says the roster bills below the clock it would have
  const plain = auditRow({ ...shift(), workedMin: 138, actualFrom: 825 }, note).reasons.map((r) => r.kind);
  assert.ok(plain.includes("billed-under-clocked"), `the rule itself still fires: ${plain}`);
});

test("the row's clocked minutes are the export's, and the card never strikes the Clocked figure", () => {
  const build = src("src/app/portal/admin/audit/[id]/build.js");
  assert.match(build, /\.\.\.read,\s*\/\/[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*clockedMin: shift\.workedMin \?\? null,/);
  const card = src("src/app/portal/admin/audit/[id]/ShiftEvidence.js");
  assert.doesNotMatch(card, /amendedFigure/);
  assert.match(card, /<dt>Clocked<\/dt>[\s\S]{0,400}<FigureHours value=\{clocked\.value\} \/>/);
  const menu = src("src/app/portal/admin/audit/AuditDownloads.js");
  assert.match(menu, /key: "addenda", title: "Clock addenda", format: "PDF"/);
});

test("the addenda report groups by person, sums the hours moved, and lists what is still out", () => {
  const rows = [
    { who: "Brandon E.", whoLegal: "Brandon Espinoza", employeeKey: "espinoza, brandon", date: "09/22/26", startMin: 840, client: "Prescott, Mason", service: "ILS Service", billedMin: 83,
      amendment: { id: "a1", ...view, by: "Mánu Uribe", byLegal: "Brandon Uribe", at: "2026-09-22T23:23:20Z", signedBy: "Brandon Espinoza", placeIn: null, placeOut: null } },
    { who: "Ana T.", whoLegal: "Ana Torres", employeeKey: "torres, ana", date: "09/03/26", startMin: 540, client: "Okafor, Maribel", service: "ILS Service", billedMin: 150,
      amendment: { id: "a2", timesChanged: true, inChanged: false, outChanged: true, from: 540, to: 660, min: 120, wasFrom: 540, wasTo: null, by: "Mánu Uribe", byLegal: "Brandon Uribe", at: "2026-09-10T00:00:00Z", signedBy: "Ana Torres", placeIn: null, placeOut: "The CVS on Whittier" } },
    { who: "Ana T.", whoLegal: "Ana Torres", employeeKey: "torres, ana", date: "09/18/26", startMin: 540, client: "Ferrante, Lucia", service: "ILS Service", billedMin: 120,
      pending: { id: "p1", line: "Waiting on them", sentAt: "2026-09-23T21:13:43Z", to: "Ana Torres" } },
  ];
  const details = new Map([
    ["a1", { id: "a1", createdAt: new Date("2026-09-22T12:00:00Z"), clockRow: { noIn: false, noOut: false, startDelta: 40, gpsIn: "yes", gpsOut: "yes" }, reasonText: "The app would not take the clock-in.", filledName: "Brandon Espinoza", filledAt: "2026-09-22T22:41:00Z", filledUa: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", clientSigner: "Mason Prescott", clientSignerKind: "client", clientSignedAt: "2026-09-22T22:50:00Z", clientSignedVia: "own", approvedBy: { name: "Brandon Uribe" }, approvedAt: "2026-09-22T23:23:20Z", approvalNote: "Confirmed with the note.", qspFixedIn: "1:45 PM", qspFixedTo: null, qspFixedAt: "2026-09-22T19:00:00Z" }],
    ["a2", { id: "a2", createdAt: new Date("2026-09-10T12:00:00Z"), clockRow: { noIn: false, noOut: true, startDelta: 0, gpsIn: "yes", gpsOut: null }, reasonText: "Forgot to clock out at the pharmacy.", filledName: "Ana Torres", filledAt: "2026-09-10T20:00:00Z", filledUa: null, clientSigner: null, clientSignerKind: "unavailable", clientUnavailableReason: "Client had left with her mother.", approvedBy: { name: "Brandon Uribe" }, approvedAt: "2026-09-10T22:00:00Z", approvalNote: null, qspFixedIn: null, qspFixedTo: "11:00 AM", qspFixedAt: null }],
    ["p1", { id: "p1", createdAt: new Date("2026-09-23T12:00:00Z"), clockRow: { noIn: false, noOut: true } }],
  ]);
  const { addenda, pending } = assembleAddenda({ rows, details, titleOf: new Map([["torres, ana", "Independent Living Instructor"]]), stamp: (d) => (d ? "09/22/26, 3:41 PM" : null), day: (d) => (d ? "09/22/26" : null) });
  assert.equal(addenda.length, 2);
  assert.equal(pending.length, 1);
  assert.equal(addenda[0].number, "CA-260922-A1");
  assert.equal(addenda[0].headline, "clocked in late");
  assert.equal(addenda[0].signedDevice, "Safari on iPhone");

  const m = addendaReportModel({ periodFrom: "09/01/26", periodTo: "09/30/26", generatedOn: "9/23/2026", addenda, pending });
  assert.equal(m.summary[0], "2 addenda approved on this period.");
  assert.equal(m.summary[1], "1 sets more time than the roster billed, 0.92h in all; 1 sets less, 0.50h.");
  assert.match(m.summary[2], /^1 more is out and not yet approved/);
  assert.deepEqual(m.groups.map((g) => g.who), ["Ana Torres", "Brandon Espinoza"]);
  const brandon = m.groups[1].entries[0];
  assert.match(brandon.when, /^09\/22\/26 · 2p · Mason Prescott · ILS Service · CA-/);
  assert.equal(brandon.headline, "The clock shows they clocked in late.");
  assert.equal(brandon.changed, "Clock-in 1:45p by addendum (the clock had 2:40p) · billable 2.30h, the roster billed 1.38h");
  assert.equal(brandon.signatures, "Signed by Brandon Espinoza 09/22/26, 3:41 PM, Safari on iPhone · Mason Prescott, the person served 09/22/26, 3:41 PM, signed on their own device");
  assert.equal(brandon.approval, "Approved by Brandon Uribe 09/22/26, 3:41 PM · QSClock clock-in corrected to 1:45 PM on 09/22/26 · note: Confirmed with the note.");
  assert.equal(brandon.quote, "The app would not take the clock-in.");
  const ana = m.groups[0].entries[0];
  assert.equal(ana.changed, "Clock-out 11a by addendum (no clock-out was recorded) · billable 2.00h, the roster billed 2.50h");
  assert.match(ana.signatures, /Nobody was available to sign: Client had left with her mother\.$/);
  assert.equal(m.pending.line, "1 out, not yet approved");
  assert.match(m.pending.entries[0].when, /^Ana Torres · 09\/18\/26 · 9a · Lucia Ferrante · ILS Service · CA-/);
  assert.equal(m.pending.entries[0].line, "Waiting on them, sent 09/22/26, to Ana Torres");
});
