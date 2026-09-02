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

// pdf-lib writes standard-font text hex-encoded, and Helvetica's encoding for
// ASCII is the ASCII bytes, so the label is findable as plain hex.
const LABEL_HEX = Buffer.from("Approval Signature:", "latin1").toString("hex").toUpperCase();

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
    const m = [...text.slice(Math.max(0, at - 400), at).matchAll(/1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm/g)].pop();
    if (!m) continue;
    const L = Number(m[1]) - 6;
    const y = Number(m[2]) - 4;
    return {
      pageIndex: pi,
      x: L + 100, y, width: 200, height: 15,
      dateX: L + 356, dateY: y, dateWidth: 180,
    };
  }
  return null;
}
