// the actual signed documents stitched into one file. every submission gets a
// divider page saying which form it is, who signed it and when, then the
// stored PDF's own pages follow untouched. the reports (form-report-pdf.js)
// say who signed; this is the evidence itself in one download.
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const LOGO_PATH = path.join(process.cwd(), "public", "logo", "MLSlogo.png");

const PAGE_W = 612;
const PAGE_H = 792;
const L = 40;
const R = PAGE_W - 40;

const INK = rgb(0.05, 0.05, 0.05);
const MUTED = rgb(0.42, 0.47, 0.53);
const BRAND = rgb(0.086, 0.325, 0.529);
const GRID = rgb(0.75, 0.79, 0.83);
const ERR = rgb(0.7, 0.11, 0.11);

// groups: [{ formTitle, category, items }] in library order, each item
// { who, email, how, when, asTyped, bytes }. bytes = the stored PDF, or null
// when the fetch failed - the divider page then says so instead of silently
// dropping the signature from the bundle.
export async function renderSignedFormsBundle({ groups }, opts = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let logo = null;
  try {
    logo = await doc.embedPng(fs.readFileSync(LOGO_PATH));
  } catch {
    // decorative
  }

  const total = groups.reduce((n, g) => n + g.items.length, 0);
  let docNo = 0;

  for (const g of groups) {
    for (const item of g.items) {
      docNo++;
      // ---- divider page ----
      const page = doc.addPage([PAGE_W, PAGE_H]);
      let y = PAGE_H - 48;
      const logoH = 42;
      let tx = L;
      if (logo) {
        const lw = (logo.width / logo.height) * logoH;
        page.drawImage(logo, { x: L, y: y - logoH, width: lw, height: logoH });
        tx = L + lw + 14;
      }
      const text = (s, x, yy, o = {}) =>
        page.drawText(String(s), {
          x, y: yy, size: o.size ?? 9, font: o.f ?? font, color: o.color ?? INK,
        });
      text("My Life Services, Inc.", tx, y - 12, { size: 8.5, f: bold, color: MUTED });
      text(g.formTitle, tx, y - 35, { size: 15, f: bold, color: BRAND });
      y -= logoH + 24;

      text(`Signed by ${item.who}`, L, y, { size: 12, f: bold });
      y -= 15;
      text(`${item.when} · ${item.email} · ${item.how}`, L, y, { size: 9, color: MUTED });
      y -= 12;
      if (item.asTyped) {
        text("Name and email as typed at submission - not yet matched to a portal account.",
          L, y, { size: 8, color: MUTED });
        y -= 12;
      }
      page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.8, color: GRID });
      y -= 16;
      text(`Document ${docNo} of ${total} · ${g.category} · the signed pages follow`, L, y, {
        size: 8, color: MUTED,
      });
      if (opts.generatedOn) {
        page.drawText(`Prepared ${opts.generatedOn}`, {
          x: L, y: 28, size: 7.5, font, color: MUTED,
        });
      }

      // ---- the signed document itself ----
      let err = null;
      if (!item.bytes) {
        err = "The stored PDF could not be fetched.";
      } else {
        try {
          const src = await PDFDocument.load(item.bytes, { ignoreEncryption: true });
          const pages = await doc.copyPages(src, src.getPageIndices());
          for (const p of pages) doc.addPage(p);
        } catch {
          err = "The stored PDF could not be read.";
        }
      }
      if (err) {
        y -= 16;
        text(`${err} Use the submission's own Download button in the portal.`, L, y, {
          size: 9, f: bold, color: ERR,
        });
      }
    }
  }

  return { bytes: await doc.save() };
}
