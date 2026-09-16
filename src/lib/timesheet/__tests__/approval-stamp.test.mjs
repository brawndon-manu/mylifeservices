// THE APPROVER'S NAME ON THE SHEET. The approval line is one line since
// 2026-09-15 - "Approved by: ____ Approval Signature ____ Date: ____" - and
// the stamp fills the name in beside its label the way it fills the date, on a
// sheet rendered by the real renderer and located by the real anchor, so the
// test is the same path production takes, minus the press. A sheet rendered
// before the one-line layout has no name field, and there the name still goes
// on the free line above the signature with its own label.
import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFArray, StandardFonts, decodePDFRawStream } from "pdf-lib";
import { renderSheet } from "../render-sheet.js";
import { findApprovalAnchor } from "../approval-anchor.js";
import { stampApproval, APPROVED_BY_LABEL } from "../approval-stamp.js";
import { APPROVAL_LINE } from "../approval-line.js";

// a 1x1 transparent png, the smallest thing embedPng will take
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const sheet = (extra = {}) => ({
  id: "t1",
  sourceName: "Uribe, Brandon",
  batch: { periodFrom: "07/16/26", periodTo: "07/31/26", restsByDate: [] },
  data: {
    generatedOn: "8/7/2026",
    payPeriod: { from: "07/16/26", to: "07/31/26" },
    premiums: { mealHours: 0, restHours: 0, totalHours: 0, mealDays: [], restDays: [] },
    days: [
      {
        date: "07/31/26", paidHours: 6.5, rawHours: 6.5, regularHours: 6.5,
        otHours: 0, doubleHours: 0,
        punches: [{ min: 480, raw: "8a" }, { min: 720, raw: "12p" }],
        breaks: [],
      },
    ],
    ...extra,
  },
  corrections: [],
});

// the page's content streams as latin1 text, the way the anchor reads them
function contentText(page) {
  const contents = page.node.Contents();
  const streams = [];
  if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i++) streams.push(page.node.context.lookup(contents.get(i)));
  } else if (contents) streams.push(page.node.context.lookup(contents));
  let text = "";
  for (const s of streams) {
    if (!s) continue;
    try { text += Buffer.from(decodePDFRawStream(s).decode()).toString("latin1") + "\n"; }
    catch { text += Buffer.from(s.contents || []).toString("latin1") + "\n"; }
  }
  return text;
}
const hex = (s) => `<${Buffer.from(s, "latin1").toString("hex").toUpperCase()}>`;
const count = (text, s) => text.split(hex(s)).length - 1;
// the x and y of the text matrix set just before a string is shown - the LAST
// time it is shown, because "Date:" is printed on the employee line first and
// the admin block is drawn after it
const tmOf = (text, s) => {
  const at = text.lastIndexOf(hex(s));
  if (at < 0) return null;
  const m = [...text.slice(Math.max(0, at - 400), at).matchAll(/1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm/g)].pop();
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
};

async function stamped(approvedBy, fixture = sheet()) {
  const { bytes } = await renderSheet(fixture);
  const doc = await PDFDocument.load(bytes);
  const rect = findApprovalAnchor(doc);
  assert.ok(rect, "the rendered sheet has an approval line to find");
  const out = await stampApproval(doc, { rect, signatureDataUrl: PNG, approvedOn: "9/15/2026", approvedBy });
  const reloaded = await PDFDocument.load(await doc.save());
  return { rect, out, text: contentText(reloaded.getPages()[rect.pageIndex]) };
}

test("the renderer prints the three labels on one line, in order, inside the row", async () => {
  const { bytes } = await renderSheet(sheet());
  const doc = await PDFDocument.load(bytes);
  const rect = findApprovalAnchor(doc);
  const text = contentText(doc.getPages()[rect.pageIndex]);
  const name = tmOf(text, APPROVAL_LINE.nameLabel), sig = tmOf(text, APPROVAL_LINE.sigLabel), date = tmOf(text, APPROVAL_LINE.dateLabel);
  assert.ok(name && sig && date, "all three labels on the page");
  assert.equal(name.y, sig.y); assert.equal(sig.y, date.y);
  assert.ok(name.x < sig.x && sig.x < date.x, "Approved by, then Approval Signature, then Date");
  // the fields sit after their labels and the last one ends inside the row
  assert.ok(rect.nameX > name.x && rect.nameX + rect.nameWidth < sig.x);
  assert.ok(rect.x > sig.x && rect.x + rect.width < date.x);
  assert.ok(rect.dateX > date.x && rect.dateX + rect.dateWidth <= 612 - 28 - 6);
});

test("the approver's legal name fills its field, on the signature line, the way the date does", async () => {
  const { rect, out, text } = await stamped("Brandon Uribe");
  assert.equal(out.name, "Brandon Uribe");
  const name = tmOf(text, "Brandon Uribe");
  assert.deepEqual(name, { x: rect.nameX + 4, y: rect.nameY + 4 });
  assert.equal(tmOf(text, "9/15/2026").y, name.y, "name and date share the baseline");
  assert.equal(count(text, APPROVED_BY_LABEL), 1, "the label is printed once, by the renderer, not again by the stamp");
});

test("the date still prints where it always did", async () => {
  const { rect, text } = await stamped("Brandon Uribe");
  assert.deepEqual(tmOf(text, "9/15/2026"), { x: rect.dateX + 4, y: rect.dateY + 4 });
});

test("no name means the field stays empty", async () => {
  const { out, text } = await stamped(null);
  assert.equal(out.name, null);
  assert.equal(count(text, APPROVED_BY_LABEL), 1, "the renderer's label is still there, unfilled");
});

// an open hours claim is what puts a sheet on the corrections layout, the one
// with the tick row above the line - proved by that layout's own employee
// label, so the fixture cannot quietly fall back to the plain layout
test("the corrections layout carries the same line", async () => {
  const withClaim = sheet();
  withClaim.corrections = [{ kind: "hours", date: "07/31/26", status: "open", claimedHours: 7 }];
  const { rect, text } = await stamped("Brandon Uribe", withClaim);
  assert.ok(text.includes(hex("Employee Signature - reported changes:")), "this is the corrections layout");
  assert.deepEqual(tmOf(text, "Brandon Uribe"), { x: rect.nameX + 4, y: rect.nameY + 4 });
});

// EVERY COPY SIGNED BEFORE 2026-09-15 has the old line, signature and date
// only. The name still prints, above the signature with its own label.
test("a sheet from before the one-line layout gets the name on the line above, with its label", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Approval Signature:", { x: 34, y: 100, size: 8.5, font });
  page.drawText("Date:", { x: 350, y: 100, size: 8.5, font });
  // a page's content stream only exists once the document is saved, which is
  // also the state a signed copy arrives in
  const saved = await PDFDocument.load(await doc.save());
  const rect = findApprovalAnchor(saved);
  assert.ok(rect, "anchor found on the old line");
  assert.equal(rect.layout, "old");
  const out = await stampApproval(saved, { rect, signatureDataUrl: PNG, approvedOn: "9/15/2026", approvedBy: "Brandon Uribe" });
  const text = contentText((await PDFDocument.load(await saved.save())).getPages()[0]);
  assert.equal(out.nameY, rect.y + 20);
  assert.equal(count(text, APPROVED_BY_LABEL), 1, "the stamp supplies the label here");
  assert.equal(tmOf(text, "Brandon Uribe").y, rect.y + 20);
  assert.equal(tmOf(text, APPROVED_BY_LABEL).y, rect.y + 20);
});
