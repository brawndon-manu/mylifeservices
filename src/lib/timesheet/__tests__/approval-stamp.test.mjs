// THE APPROVER'S NAME ON THE SHEET. The stamp used to put a signature and a
// date on the approval line and nothing about who signed. It prints
// "Approved by: <legal name>" on the free line above the signature now, in
// the label column, on a sheet rendered by the real renderer and located by
// the real anchor - so the test is the same path production takes, minus the
// press.
import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFArray, decodePDFRawStream } from "pdf-lib";
import { renderSheet } from "../render-sheet.js";
import { findApprovalAnchor } from "../approval-anchor.js";
import { stampApproval, APPROVED_BY_LABEL } from "../approval-stamp.js";

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
// the y of the text matrix set just before a string is shown
const yOf = (text, s) => {
  const at = text.indexOf(hex(s));
  if (at < 0) return null;
  const m = [...text.slice(Math.max(0, at - 400), at).matchAll(/1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm/g)].pop();
  return m ? Number(m[2]) : null;
};

async function stamped(approvedBy) {
  const { bytes } = await renderSheet(sheet());
  const doc = await PDFDocument.load(bytes);
  const rect = findApprovalAnchor(doc);
  assert.ok(rect, "the rendered sheet has an approval line to find");
  const out = await stampApproval(doc, { rect, signatureDataUrl: PNG, approvedOn: "9/15/2026", approvedBy });
  const reloaded = await PDFDocument.load(await doc.save());
  return { rect, out, text: contentText(reloaded.getPages()[rect.pageIndex]) };
}

test("the approver's legal name prints above the signature, in the label column", async () => {
  const { rect, out, text } = await stamped("Brandon Uribe");
  assert.equal(out.name, "Brandon Uribe");
  assert.ok(text.includes(hex(APPROVED_BY_LABEL)), "the label is on the page");
  assert.ok(text.includes(hex("Brandon Uribe")), "the name is on the page");
  const y = yOf(text, "Brandon Uribe");
  assert.ok(y > rect.y + rect.height, `the name (${y}) sits above the signature line (${rect.y + rect.height})`);
  assert.ok(y < rect.y + 30, `and inside the admin box (${y} < ${rect.y + 30})`);
  assert.equal(yOf(text, APPROVED_BY_LABEL), y, "label and name share the line");
});

test("the date still prints where it always did", async () => {
  const { rect, text } = await stamped("Brandon Uribe");
  assert.ok(text.includes(hex("9/15/2026")));
  assert.equal(yOf(text, "9/15/2026"), rect.dateY + 4);
});

test("no name means no label, not an empty label", async () => {
  const { out, text } = await stamped(null);
  assert.equal(out.name, null);
  assert.ok(!text.includes(hex(APPROVED_BY_LABEL)));
});

// an open hours claim is what puts a sheet on the corrections layout, the one
// with the tick row above the signature line - proved by that layout's own
// employee label being on the page, so the fixture cannot quietly fall back to
// the plain layout and pass on it twice
test("the corrections layout has the same free line", async () => {
  const withClaim = sheet();
  withClaim.corrections = [{ kind: "hours", date: "07/31/26", status: "open", claimedHours: 7 }];
  const { bytes } = await renderSheet(withClaim);
  const doc = await PDFDocument.load(bytes);
  const rect = findApprovalAnchor(doc);
  assert.ok(rect);
  await stampApproval(doc, { rect, signatureDataUrl: PNG, approvedOn: "9/15/2026", approvedBy: "Brandon Uribe" });
  const text = contentText((await PDFDocument.load(await doc.save())).getPages()[rect.pageIndex]);
  assert.ok(text.includes(hex("Employee Signature - reported changes:")), "this is the corrections layout");
  const y = yOf(text, "Brandon Uribe");
  assert.ok(y > rect.y + rect.height && y < rect.y + 30, `name line at ${y} for a rect at ${rect.y}`);
});
