// PLACING A NAME ON A CERTIFICATE - Mánu 2026-09-13: "hopefully we can make it
// so we choose where it goes for the name?"
//
// The maths is pinned rather than the drawing: a name that is centred on the
// wrong point, or that runs off a printed page, is a reprint of every copy in
// the batch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { placeName, fitSize, renderCertificate, mergeCertificates, printedDate, MIN_SIZE } from "../render.js";

async function font() {
  const doc = await PDFDocument.create();
  return doc.embedFont(StandardFonts.HelveticaBold);
}

async function blank(pages = 1, w = 792, h = 612) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) doc.addPage([w, h]);
  return Buffer.from(await doc.save());
}

test("a name is centred on the point it was dropped on", async () => {
  const f = await font();
  const text = "Caitlan Comia";
  const size = 28;
  const width = f.widthOfTextAtSize(text, size);
  const at = placeName({ text, x: 396, y: 300, size, align: "center", font: f, pageWidth: 792 });
  // the middle of the drawn text lands on x, which is what clicking a spot means
  assert.ok(Math.abs(at.x + width / 2 - 396) < 0.01);
});

test("left alignment starts at the point instead", async () => {
  const f = await font();
  const at = placeName({ text: "Caitlan Comia", x: 100, y: 300, size: 28, align: "left", font: f, pageWidth: 792 });
  assert.equal(at.x, 100);
});

test("a name never hangs off the page", async () => {
  const f = await font();
  const long = "Bartholomew Fitzwilliam-Montgomery III";
  // centred hard against the right edge
  const at = placeName({ text: long, x: 780, y: 300, size: 28, align: "center", font: f, pageWidth: 792 });
  assert.ok(at.x >= 4, "not off the left");
  assert.ok(at.x + at.width <= 792 - 4 + 0.01, "not off the right");
  // and hard against the left
  const at2 = placeName({ text: long, x: 5, y: 300, size: 28, align: "center", font: f, pageWidth: 792 });
  assert.ok(at2.x >= 4);
});

test("a long name shrinks rather than overflowing", async () => {
  const f = await font();
  const long = "Bartholomew Fitzwilliam-Montgomery III";
  const fitted = fitSize({ text: long, font: f, size: 48, maxWidth: 300 });
  assert.ok(fitted < 48, "it came down");
  assert.ok(f.widthOfTextAtSize(long, fitted) <= 300, "and it fits");
  // a short name at a size that already fits is left alone
  assert.equal(fitSize({ text: "Joe", font: f, size: 28, maxWidth: 300 }), 28);
  // it never shrinks past readable
  assert.ok(fitSize({ text: long, font: f, size: 48, maxWidth: 10 }) >= MIN_SIZE);
});

test("the name is drawn on the page that was picked", async () => {
  const bytes = await renderCertificate(await blank(3), { name: "Caitlan Comia", page: 1, x: 396, y: 300 });
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 3, "the template is not reshaped");
  // a page index past the end lands on the last page rather than throwing
  const b2 = await renderCertificate(await blank(2), { name: "X", page: 9, x: 100, y: 100 });
  assert.equal((await PDFDocument.load(b2)).getPageCount(), 2);
});

test("an empty name leaves the template alone", async () => {
  const bytes = await renderCertificate(await blank(), { name: "   ", x: 396, y: 300 });
  assert.ok(bytes.length > 0);
});

test("the batch merges into one file, a page per certificate", async () => {
  const one = await renderCertificate(await blank(), { name: "A", x: 396, y: 300 });
  const two = await renderCertificate(await blank(2), { name: "B", x: 396, y: 300 });
  const merged = await mergeCertificates([one, two]);
  assert.equal((await PDFDocument.load(merged)).getPageCount(), 3, "1 + 2");
});

test("a date is drawn only where the batch was given a place for it", async () => {
  // most templates print their own date, so the placement is optional and the
  // person's date is still recorded either way
  const bytes = await renderCertificate(await blank(), {
    name: "Aaron Jones", x: 396, y: 300, date: "09/13/26",
  });
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1, "no placement, no second draw, no extra page");

  const placed = await renderCertificate(await blank(), {
    name: "Aaron Jones", x: 396, y: 300,
    date: "09/13/26", dateX: 396, dateY: 200, dateSize: 14,
  });
  assert.ok(placed.length > bytes.length, "the date adds content when it has somewhere to go");

  // and an empty date never draws, placement or not
  const none = await renderCertificate(await blank(), {
    name: "Aaron Jones", x: 396, y: 300, date: "  ", dateX: 396, dateY: 200,
  });
  assert.equal(none.length, bytes.length);
});

test("the date can sit on a different page from the name", async () => {
  const bytes = await renderCertificate(await blank(2), {
    name: "Aaron Jones", page: 0, x: 396, y: 300,
    date: "09/13/26", datePage: 1, dateX: 396, dateY: 200,
  });
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 2);
});

test("the guides are the picker's, and never the certificate's", async () => {
  // Mánu 2026-09-13: "it doesnt actually go on the generated pdf after its just
  // for help when making it". The renderer puts the name on the page and draws
  // nothing else - somebody adding a guide line here would print it on every
  // copy, and nobody would notice until they were handed out.
  const fs = await import("node:fs");
  const path = await import("node:path");
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/certificates/render.js"), "utf8");
  for (const drawing of ["drawLine", "drawRectangle", "drawCircle", "drawSvgPath"]) {
    assert.ok(!src.includes(drawing), `render.js must not ${drawing}`);
  }
  assert.equal((src.match(/drawText\(/g) || []).length, 1, "one thing is drawn: the name");

  // and the guides do exist, in the preview. That preview moved out of
  // CertificateBuilder when going back to edit a placement needed the same
  // panel, so this now watches the one both screens use.
  const picker = fs.readFileSync(
    path.join(process.cwd(), "src/app/portal/admin/forms/certificates/_components/PlacementPanel.js"),
    "utf8",
  );
  assert.match(picker, /Centre guides/);
  assert.match(picker, /pointer-events-none/, "they are never clickable - a click is a placement");
});

test("a date prints the way a certificate says it, not the way it is stored", () => {
  // the picker hands over ISO because that is what is unambiguous to keep
  assert.equal(printedDate("2026-09-13"), "Sep 13, 2026");
  // and it is California's calendar day, not an instant - no sliding back one
  assert.equal(printedDate("2026-01-01"), "Jan 1, 2026");
  assert.equal(printedDate("2026-12-31"), "Dec 31, 2026");
  // anything a person typed themselves is left alone
  assert.equal(printedDate("Summer 2026"), "Summer 2026");
  assert.equal(printedDate("09/13/26"), "09/13/26");
  assert.equal(printedDate(""), "");
  assert.equal(printedDate(null), "");
});
