// THE PENDING DOCUMENT (Mánu 2026-09-09, mock C of three).
//
// While a claim is open the sheet prints as two things: page 1 the timesheet
// as recorded with no attestation and no signature, page 2 the reported
// changes carrying the claim, the attestation to it, the signature, and the
// decision box. These pin the copy he approved and the shape of the file the
// signer and the approval stamp both depend on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";

import { analyzeTimesheet } from "../parse.js";
import { renderCorrected, claimLines } from "../render.js";
import { findApprovalAnchor } from "../approval-anchor.js";

// one string per page, wrapped lines rejoined, so a sentence can be asserted
// whole even though the renderer draws it a line at a time
async function pdfPages(bytes) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes), useSystemFonts: false, isEvalSupported: false,
  }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    out.push(content.items.map((it) => it.str).join(" ").replace(/\s+/g, " ").trim());
  }
  return out;
}

const at = (h, m = 0) => ({ min: h * 60 + m });
const day = (date, outH = 15) => ({ date, punches: [at(8, 30), at(outH)], printed: null });
const PERIOD = { from: "09/01/37", to: "09/15/37" };
// the Mocktember shape: the 3rd clocked out at one against a three o'clock
// schedule, the 9th not there at all
const sheetOf = (extra = {}) => ({
  ...analyzeTimesheet({
    employee: "Uribe, Brandon", payPeriod: PERIOD,
    days: [day("09/01/37"), day("09/03/37", 13), day("09/11/37")],
  }),
  basis: "projected",
  ...extra,
});
const CLAIMS = [
  { id: "c1", date: "09/03/37", kind: "hours", status: "open", claimedHours: 6.5,
    statedSlots: [{ from: 510, to: 900 }], note: "Forgot to clock out at three" },
  { id: "c2", date: null, kind: "time_off", status: "noted", choice: "yes",
    timeOff: [{ date: "09/09/37", kind: "pto", hours: 8 }] },
  // a question answer is never a claim
  { id: "q", date: "09/11/37", kind: "q_duplicateDay", status: "open", choice: "no" },
];
const OPTS = { printedBy: "Test", generatedOn: "9/9/2037" };

test("claimLines says each change in the words of the mock", () => {
  const sheet = sheetOf();
  const lines = claimLines(CLAIMS, sheet.days, []);
  assert.deepEqual(lines, [
    { date: "09/03/37", note: "Forgot to clock out at three",
      text: "The hours for this day are wrong. I worked 08:30 AM to 03:00 PM, 6.50 hours. The timesheet records 4.50." },
    { date: "09/09/37", note: null,
      text: "Paid leave not on my schedule. 8.00 hours PTO. The timesheet records no shift." },
  ]);

  // a day already on the calendar rides the grid as a PTO row and is no
  // longer being asked for
  assert.deepEqual(
    claimLines(CLAIMS, sheet.days, [{ date: "09/09/37", kind: "pto", hours: 8 }]).map((l) => l.date),
    ["09/03/37"],
  );
  // decided rows are not changes this document asks for; a "no" asks nothing
  assert.deepEqual(claimLines([
    { ...CLAIMS[0], status: "accepted" },
    { ...CLAIMS[0], status: "declined" },
    { ...CLAIMS[1], choice: "no" },
  ], sheet.days, []), []);

  // the other kinds, and the order: by day, the whole-sheet one last
  const more = claimLines([
    { date: null, kind: "other", status: "open", note: "The whole week is off by a day" },
    { date: "09/12/37", kind: "day_missing", status: "open", claimedHours: 8,
      statedSlots: [{ from: 480, to: 720 }, { from: 750, to: 990 }] },
    { date: "09/01/37", kind: "meal_taken", status: "open", statedBreaks: [{ kindOf: "meal", from: "12:00p", to: "12:30p" }] },
    { date: "09/11/37", kind: "day_extra", status: "open" },
  ], sheet.days, []);
  assert.deepEqual(more.map((l) => [l.date, l.text]), [
    ["09/01/37", "I did take my lunch, it just isn't punched. Taken 12:00p to 12:30p. The timesheet records 6.50."],
    ["09/11/37", "There's a day here I didn't work. The timesheet records 6.50."],
    ["09/12/37", "I worked a day that isn't listed. I worked 08:00 AM to 12:00 PM and 12:30 PM to 04:30 PM, 8.00 hours. The timesheet records no shift."],
    ["", "Something else."],
  ]);
  assert.equal(more[3].note, "The whole week is off by a day");
});

test("a reported sheet prints as the pending document: no attestation on the figures, the claim on its own page", async () => {
  const sheet = sheetOf({ claims: CLAIMS, timeOff: [] });
  const out = await renderCorrected(sheet, OPTS);
  assert.equal(out.pending, true);
  const pages = await pdfPages(out.bytes);
  assert.equal(pages.length, 2);
  const [p1, p2] = pages;

  // page 1: the record, pointing at the claim
  for (const s of [
    "Employee Timesheet",
    "NOT FINAL - see page 2",
    "The employee has reported 2 changes to this timesheet.",
    "no signature on this page",
    "This page prints the timesheet as recorded. It carries no attestation and no signature while a report is open.",
    // the 9th is not on the sheet, and still gets a row that points at page 2
    "9th",
  ]) assert.ok(p1.includes(s), `page 1 missing: ${s}`);
  assert.equal((p1.match(/see page 2/g) || []).length, 3, "the band plus the 3rd and the 9th");
  assert.ok(!p1.includes("I attest"), "no attestation on the figures");
  assert.ok(!p1.includes("Approval Signature"), "no admin block on page 1");

  // page 2: the claim, the attestation to it, the signature, the decision
  for (const s of [
    "Reported Changes",
    "WHAT I AM ASKING PAYROLL TO CHANGE",
    "09/03/37",
    "The hours for this day are wrong. I worked 08:30 AM to 03:00 PM, 6.50 hours. The timesheet records 4.50.",
    "“Forgot to clock out at three”".replace(/[“”]/g, '"'),
    "09/09/37",
    "Paid leave not on my schedule. 8.00 hours PTO. The timesheet records no shift.",
    "I attest that the changes listed on this page are true and complete, and that apart from them the hours recorded on page 1 are the actual hours I worked. I understand payroll has not yet decided on these changes.",
    "Employee Signature - reported changes:",
    "Below for Admin Use Only",
    "Decision:",
    "approved as reported",
    "changed - reason attached",
    "Approval Signature:",
    "Page 2 of 2",
  ]) assert.ok(p2.includes(s), `page 2 missing: ${s}`);
  assert.ok(!p2.includes("I attest that all hours"), "the sheet's own attestation stays off the pending document");

  // NO DASHES on anything printed - Mánu's rule for every user-facing string
  assert.ok(!/[–—]/.test(pages.join(" ")));

  // the signer and the stamp find what they need on the claims page
  assert.equal(out.approvalRect.pageIndex, 1);
  assert.equal(out.decision.pageIndex, 1);
  assert.ok(out.decision.approved.x < out.decision.changed.x);
  const doc = await PDFDocument.load(out.bytes);
  assert.deepEqual(doc.getForm().getFields().map((f) => f.getName()).sort(), ["Employee Signature", "Signature Date"]);
  assert.equal(findApprovalAnchor(doc)?.pageIndex, 1, "the stamp reads the label off the last page");
});

test("with nothing reported the ordinary document is untouched", async () => {
  const out = await renderCorrected(sheetOf({ claims: [] }), OPTS);
  assert.equal(out.pending, false);
  assert.equal(out.decision, null);
  const pages = await pdfPages(out.bytes);
  assert.equal(pages.length, 1);
  assert.ok(pages[0].includes("I attest that all hours I worked"));
  assert.ok(!pages[0].includes("NOT FINAL"));
  assert.ok(pages[0].includes("Approval Signature:"));
  assert.equal(out.approvalRect.pageIndex, 0);
});

test("a time-off claim already on the calendar is not a pending change", async () => {
  const out = await renderCorrected(
    sheetOf({ claims: [CLAIMS[1]], timeOff: [{ date: "09/09/37", kind: "pto", hours: 8 }] }),
    OPTS,
  );
  assert.equal(out.pending, false);
});

test("a sheet that runs to a second page names the pages it attests to", async () => {
  // sixty days: the table needs two pages, so the claims land on the third
  const days = [];
  for (let m = 9; m <= 11; m++) for (let d = 1; d <= 20; d++) days.push(day(`${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/37`));
  const sheet = {
    ...analyzeTimesheet({ employee: "Uribe, Brandon", payPeriod: { from: "09/01/37", to: "11/20/37" }, days }),
    basis: "projected",
    claims: [CLAIMS[0]], timeOff: [],
  };
  const out = await renderCorrected(sheet, OPTS);
  const pages = await pdfPages(out.bytes);
  const n = pages.length;
  assert.ok(n >= 3, `expected the claims on a third page, got ${n}`);
  assert.equal(out.decision.pageIndex, n - 1);
  // every timesheet page carries the band with the right number
  for (let i = 0; i < n - 1; i++) assert.ok(pages[i].includes(`NOT FINAL - see page ${n}`), `band on page ${i + 1}`);
  assert.ok(pages[n - 1].includes(`the hours recorded on pages 1 to ${n - 1} are the actual hours I worked`));
});
