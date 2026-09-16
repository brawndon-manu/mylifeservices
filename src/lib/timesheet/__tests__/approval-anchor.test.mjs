import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { renderSheet } from "../render-sheet.js";
import { findApprovalAnchor } from "../approval-anchor.js";

// The bug this module exists for: the sheet an employee signs is rendered by
// `renderSheet`, the rect the stamp trusted was stored by the rebuild's own
// render call with a different input set, and the two disagreed by the height
// of the mileage line on every sheet of 08/16-08/31. So the tests hold the
// anchor against the renderer's OWN reported rect, on documents whose block
// sits at different heights.

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
});

const close = (a, b, what) =>
  assert.ok(Math.abs(a - b) < 0.01, `${what}: ${a} vs ${b}`);

test("the anchor read off the rendered bytes is the rect the renderer reported", async () => {
  const r = await renderSheet(sheet());
  const found = findApprovalAnchor(await PDFDocument.load(r.bytes));
  assert.ok(found, "anchor found");
  assert.equal(found.pageIndex, r.approvalRect.pageIndex);
  close(found.x, r.approvalRect.x, "x");
  close(found.y, r.approvalRect.y, "y");
  close(found.dateX, r.approvalRect.dateX, "dateX");
  close(found.dateY, r.approvalRect.dateY, "dateY");
  assert.equal(found.width, r.approvalRect.width);
  assert.equal(found.dateWidth, r.approvalRect.dateWidth);
  // the one-line layout's name field, read back the same way
  assert.equal(found.layout, "line");
  close(found.nameX, r.approvalRect.nameX, "nameX");
  close(found.nameY, r.approvalRect.nameY, "nameY");
  assert.equal(found.nameWidth, r.approvalRect.nameWidth);
});

// A SHEET FROM BEFORE THE ONE-LINE LAYOUT: signature label at the margin, no
// "Approved by:" on the line. Every copy signed before 2026-09-15 looks like
// this, and it still has to take an approval.
test("a sheet rendered before the one-line layout still resolves its signature and date", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Approval Signature:", { x: 34, y: 100, size: 8.5, font });
  page.drawText("Date:", { x: 350, y: 100, size: 8.5, font });
  const found = findApprovalAnchor(await PDFDocument.load(await doc.save()));
  assert.ok(found);
  assert.equal(found.layout, "old");
  close(found.x, 128, "x");
  close(found.y, 96, "y");
  close(found.dateX, 384, "dateX");
  assert.equal(found.nameX, undefined, "no name field on the old line");
});

test("the anchor follows the document when the mileage line moves the block", async () => {
  const plain = await renderSheet(sheet());
  const miles = await renderSheet(sheet({ qspMiles: 123.4 }));
  // the miles line plus its attestation sentence push the admin block down -
  // this gap is exactly what put every stamp above the label
  assert.ok(
    miles.approvalRect.y < plain.approvalRect.y,
    `mileage should lower the block: ${miles.approvalRect.y} vs ${plain.approvalRect.y}`,
  );
  const found = findApprovalAnchor(await PDFDocument.load(miles.bytes));
  assert.ok(found, "anchor found");
  close(found.y, miles.approvalRect.y, "y");
});

test("a document with no approval block yields null, not a guess", async () => {
  const doc = await PDFDocument.create();
  doc.addPage();
  assert.equal(findApprovalAnchor(doc), null);
});
