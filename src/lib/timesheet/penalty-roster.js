// the sheet payroll actually works from: every employee owed break penalty
// hours, and the number. nothing else.
//
// the payout report already carries the full breakdown - regular, OT, double,
// premiums, totals - and that is exactly why it is the wrong thing to key from.
// somebody reading across eight columns to find one figure will eventually read
// the wrong one. this is deliberately set large and sparse so a row can be read
// at arm's length and ticked off.
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const LOGO_PATH = path.join(process.cwd(), "public", "logo", "MLSlogo.png");

const PAGE_W = 612;
const PAGE_H = 792;
const L = 46;
const R = PAGE_W - 46;

const INK = rgb(0.05, 0.05, 0.05);
const MUTED = rgb(0.42, 0.47, 0.53);
const BRAND = rgb(0.086, 0.325, 0.529);
const ROWALT = rgb(0.957, 0.973, 0.984);
const PREM = rgb(0.7, 0.11, 0.11);
const GRID = rgb(0.75, 0.79, 0.83);
const TOTALBG = rgb(0.878, 0.949, 0.961);

// Is "Taylor Adams" the same person as QSP's "Adams, Taylor"? Yes - it is the
// same name written the other way round, and annotating every row with that
// would be noise on all 59.
//
// "Angel Delgado Pineda" against "Delgado Pineda, Ruth" is NOT, and those are
// the two worth calling out. So compare the words, not the formatting.
function sameHuman(a, b) {
  const words = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(" ");
  return words(a) === words(b);
}

const f2 = (n) => (Math.round((n || 0) * 100) / 100).toFixed(2);

export async function renderPenaltyRoster({ periodFrom, periodTo, rows }, opts = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let logo = null;
  try {
    logo = await doc.embedPng(fs.readFileSync(LOGO_PATH));
  } catch {
    // decorative
  }

  const owed = rows.filter((r) => (r.premiumHours || 0) > 0);
  const clear = rows.length - owed.length;
  const total = owed.reduce((n, r) => n + (r.premiumHours || 0), 0);
  const period = `${periodFrom} to ${periodTo}`;

  let page = null;
  let y = 0;
  let pageNo = 0;

  const text = (s, x, yy, { size = 14, f = font, color = INK } = {}) =>
    page.drawText(String(s), { x, y: yy, size, font: f, color });

  const columnHead = () => {
    text("EMPLOYEE", L, y, { size: 9, f: bold, color: MUTED });
    const h = "PENALTY HOURS";
    text(h, R - bold.widthOfTextAtSize(h, 9), y, { size: 9, f: bold, color: MUTED });
    y -= 8;
    page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 1, color: BRAND });
    y -= 26;
  };

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    pageNo++;
    y = PAGE_H - 52;

    if (pageNo === 1) {
      const logoH = 42;
      let tx = L;
      if (logo) {
        const logoW = (logo.width / logo.height) * logoH;
        page.drawImage(logo, { x: L, y: y - logoH, width: logoW, height: logoH });
        tx = L + logoW + 14;
      }
      text("My Life Services, Inc.", tx, y - 12, { size: 8.5, f: bold, color: MUTED });
      text("Break Penalty Hours", tx, y - 35, { size: 19, f: bold, color: BRAND });
      y -= logoH + 16;
      text(`Pay period ${period}`, L, y, { size: 12, f: bold });
      y -= 14;
      text(
        `${owed.length} of ${rows.length} employees owed penalty hours` +
        (clear ? ` · ${clear} owed none` : ""),
        L, y, { size: 9, color: MUTED },
      );
      y -= 26;
    } else {
      text(`Break Penalty Hours · ${period} (continued)`, L, y, {
        size: 10, f: bold, color: MUTED,
      });
      y -= 24;
    }
    columnHead();
  };

  newPage();

  const rowH = 26;
  let alt = false;
  for (const r of owed) {
    // keep the total block with the last rows rather than stranding it
    if (y < 96) {
      newPage();
      alt = false;
    }
    if (alt) {
      page.drawRectangle({
        x: L - 6, y: y - 7, width: R - L + 12, height: rowH - 4, color: ROWALT,
      });
    }
    alt = !alt;

    // The name QSP uses, alongside the one the person goes by, when they are
    // not the same. This sheet is reconciled against QSP, and two people here
    // have set a preferred first name that appears nowhere in it - Ruth goes by
    // Angel, Francisco by Frank. Printing only the preferred name leaves
    // payroll hunting for somebody QSP has never heard of; printing only the
    // QSP name calls a person something they have chosen not to be called.
    text(r.who, L, y, { size: 14 });
    if (r.sourceName && !sameHuman(r.who, r.sourceName)) {
      const w = font.widthOfTextAtSize(r.who, 14);
      text(`(QSP: ${r.sourceName})`, L + w + 8, y, { size: 9.5, color: MUTED });
    }
    const v = f2(r.premiumHours);
    text(v, R - bold.widthOfTextAtSize(v, 15), y, { size: 15, f: bold, color: PREM });
    y -= rowH;
  }

  // ---------- total ----------
  y -= 6;
  const boxH = 40;
  page.drawRectangle({
    x: L - 6, y: y - boxH + 12, width: R - L + 12, height: boxH, color: TOTALBG,
  });
  text("TOTAL PENALTY HOURS", L, y - 8, { size: 13, f: bold });
  const t = f2(total);
  text(t, R - bold.widthOfTextAtSize(t, 20), y - 11, { size: 20, f: bold, color: PREM });
  y -= boxH + 16;

  if (y > 70) {
    const note =
      "Paid at each employee's regular rate of pay (Labor Code 226.7). Hours worked are on the corrected timesheets and the payout report; this sheet is penalty hours only.";
    const words = note.split(/\s+/);
    let line = "";
    for (const w of words) {
      const cand = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(cand, 8) > R - L) {
        text(line, L, y, { size: 8, color: MUTED });
        y -= 10;
        line = w;
      } else {
        line = cand;
      }
    }
    if (line) text(line, L, y, { size: 8, color: MUTED });
  }

  const all = doc.getPages();
  all.forEach((pg, i) => {
    pg.drawText(`Page ${i + 1} of ${all.length}`, {
      x: R - 62, y: 30, size: 8, font, color: MUTED,
    });
    pg.drawText(opts.generatedOn ? `Prepared ${opts.generatedOn}` : "", {
      x: L, y: 30, size: 8, font, color: MUTED,
    });
  });

  return { bytes: await doc.save(), owedCount: owed.length, total };
}
