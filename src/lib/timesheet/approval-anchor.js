// Where the approval stamp goes, read off the document being stamped.
//
// The stamp used to trust `data.approvalRect`, coordinates stored whenever a
// rebuild rendered the sheet. But the sheet an employee signs is rendered on
// demand by `renderSheet`, and the rebuild render at `recompute` passes a
// different input set - no `milesDriven`, among others - so the admin block in
// the document that actually got signed can sit lower on the page than the
// stored rect says. Measured 2026-09-02: every approved sheet on 08/16-08/31
// carried the manager's signature 22.5pt above the "Approval Signature:"
// label, the height of the mileage line plus the attestation sentence that
// rides with it.
//
// The block is IN the PDF being stamped, so read it from there: find the
// label's own text-positioning op and derive the field rects from it the same
// way the renderer laid them out. Coordinates that ride the bytes cannot
// disagree with the bytes.
import { PDFArray, decodePDFRawStream } from "pdf-lib";
import { APPROVAL_LINE, APPROVAL_LINE_OLD } from "./approval-line.js";

// pdf-lib writes standard-font text hex-encoded, and Helvetica's encoding for
// ASCII is the ASCII bytes, so the label is findable as plain hex.
const LABEL_HEX = Buffer.from("Approval Signature:", "latin1").toString("hex").toUpperCase();
// the one-line layout (2026-09-15) prints "Approved by:" on the same line; a
// sheet rendered before it has no such label, and its line has no name field
const NAME_HEX = Buffer.from(APPROVAL_LINE.nameLabel, "latin1").toString("hex").toUpperCase();
const TM = /1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm/g;

// every drawing op on one page, decompressed and concatenated. A page's
// Contents can be a single stream or an array of them (the signing filler
// appends its own), and a stream that will not decode is skipped rather than
// fatal - the label lives in the renderer's stream, which always does.
function contentText(page) {
  const contents = page.node.Contents();
  const streams = [];
  if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i++) streams.push(page.node.context.lookup(contents.get(i)));
  } else if (contents) {
    streams.push(page.node.context.lookup(contents));
  }
  let text = "";
  for (const s of streams) {
    if (!s) continue;
    try {
      text += Buffer.from(decodePDFRawStream(s).decode()).toString("latin1") + "\n";
    } catch {
      text += Buffer.from(s.contents || []).toString("latin1") + "\n";
    }
  }
  return text;
}

// The geometry mirrors the admin block in render.js: the label draws at
// (L + 6, apprY), the signature field at L + 100 and the date at L + 356,
// both 4 under the label's baseline and 15 tall. Change them together.
export function findApprovalAnchor(doc) {
  const pages = doc.getPages();
  // the block is drawn once, near the end of the document - search back
  for (let pi = pages.length - 1; pi >= 0; pi--) {
    const text = contentText(pages[pi]);
    const at = text.indexOf(`<${LABEL_HEX}>`);
    if (at < 0) continue;
    // the Tm that positioned the label is the last one before its Tj
    const m = [...text.slice(Math.max(0, at - 400), at).matchAll(TM)].pop();
    if (!m) continue;
    const labelX = Number(m[1]);
    const y = Number(m[2]) - 4;
    // WHICH LAYOUT: the name label on the same line, or nothing there
    const nameAt = text.indexOf(`<${NAME_HEX}>`);
    const nm = nameAt < 0 ? null : [...text.slice(Math.max(0, nameAt - 400), nameAt).matchAll(TM)].pop();
    if (nm && Math.abs(Number(nm[2]) - Number(m[2])) < 0.5) {
      const A = APPROVAL_LINE;
      const L = labelX - A.sigLabelX;
      return {
        pageIndex: pi, layout: "line",
        x: L + A.sigX, y, width: A.sigWidth, height: A.height,
        dateX: L + A.dateX, dateY: y, dateWidth: A.dateWidth,
        nameX: L + A.nameX, nameY: y, nameWidth: A.nameWidth,
      };
    }
    const O = APPROVAL_LINE_OLD;
    const L = labelX - O.sigLabelX;
    return {
      pageIndex: pi, layout: "old",
      x: L + O.sigX, y, width: O.sigWidth, height: O.height,
      dateX: L + O.dateX, dateY: y, dateWidth: O.dateWidth,
    };
  }
  return null;
}
