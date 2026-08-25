// one form's signature record as a document - who signed it and when, with the
// counts up top. same rows as the form record page and its CSV; this one exists
// because a report you can attach to an email or drop in a folder is what
// actually gets used.
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
const HEADBG = rgb(0.106, 0.298, 0.404);
const ROWALT = rgb(0.965, 0.976, 0.984);
const GRID = rgb(0.75, 0.79, 0.83);
const WHITE = rgb(1, 1, 1);
const AMBER = rgb(0.42, 0.32, 0.06);
const AMBERBG = rgb(0.992, 0.969, 0.894);
const STATBG = rgb(0.878, 0.949, 0.961);

// widths sum to exactly R - L (532)
const COLS = [
  ["#", 26],
  ["Employee", 150],
  ["Email", 168],
  ["Attribution", 76],
  ["Signed", 112],
];

// clip with an ellipsis instead of running through the next column
function clip(str, maxW, font, size) {
  let s = String(str ?? "");
  if (font.widthOfTextAtSize(s, size) <= maxW) return s;
  while (s.length > 1 && font.widthOfTextAtSize(s + "…", size) > maxW) {
    s = s.slice(0, -1);
  }
  return s + "…";
}

// rows: { who, email, how, when, asTyped } newest first, matching the screen.
// stats: { total, attributed, unassigned, lastLabel }. filterLabel names any
// active filters so a filtered file can't pass as the full record.
export async function renderFormSignatureReport(
  { formTitle, category, filterLabel, stats, rows },
  opts = {},
) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let logo = null;
  try {
    logo = await doc.embedPng(fs.readFileSync(LOGO_PATH));
  } catch {
    // decorative
  }

  let page = null;
  let y = 0;
  let pageNo = 0;

  const text = (s, x, yy, { size = 9, f = font, color = INK } = {}) =>
    page.drawText(String(s), { x, y: yy, size, font: f, color });

  const drawHead = () => {
    const hH = 18;
    page.drawRectangle({ x: L, y: y - hH + 4, width: R - L, height: hH, color: HEADBG });
    let x = L;
    for (const [label, w] of COLS) {
      text(label, x + 5, y - 8, { size: 7.5, f: bold, color: WHITE });
      x += w;
    }
    y -= hH + 4;
  };

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    pageNo++;
    y = PAGE_H - 48;

    if (pageNo === 1) {
      const logoH = 42;
      let tx = L;
      if (logo) {
        const lw = (logo.width / logo.height) * logoH;
        page.drawImage(logo, { x: L, y: y - logoH, width: lw, height: logoH });
        tx = L + lw + 14;
      }
      text("My Life Services, Inc.", tx, y - 12, { size: 8.5, f: bold, color: MUTED });
      text(clip(formTitle, R - tx, bold, 17), tx, y - 35, { size: 17, f: bold, color: BRAND });
      y -= logoH + 15;
      text(`Signature record · ${category}`, L, y, { size: 11, f: bold });
      y -= 13;
      if (filterLabel) {
        text(`Filtered: ${filterLabel}`, L, y, { size: 8.5, color: MUTED });
        y -= 12;
      }

      // the counts as tiles, so the state of the form reads before the list does
      const tiles = [
        { n: String(stats.total), label: "signed", bg: STATBG, ink: INK },
        { n: String(stats.attributed), label: "attributed to a person", bg: STATBG, ink: INK },
        {
          n: String(stats.unassigned),
          label: "need assignment",
          bg: stats.unassigned > 0 ? AMBERBG : STATBG,
          ink: stats.unassigned > 0 ? AMBER : INK,
        },
        { n: stats.lastLabel || "—", label: "last signed", bg: STATBG, ink: INK, small: true },
      ];
      const gap = 8;
      const tileW = (R - L - gap * (tiles.length - 1)) / tiles.length;
      const tileH = 40;
      let tx2 = L;
      for (const t of tiles) {
        page.drawRectangle({ x: tx2, y: y - tileH + 6, width: tileW, height: tileH, color: t.bg });
        const nSize = t.small ? 10 : 16;
        text(t.n, tx2 + 8, y - 14, { size: nSize, f: bold, color: t.ink });
        text(t.label, tx2 + 8, y - 28, { size: 7.5, color: t.ink === INK ? MUTED : t.ink });
        tx2 += tileW + gap;
      }
      y -= tileH + 10;

      page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.8, color: GRID });
      y -= 18;
    } else {
      text(`${formTitle} · signature record (continued)`, L, y, {
        size: 9, f: bold, color: MUTED,
      });
      y -= 20;
    }
    if (rows.length) drawHead();
  };

  newPage();

  if (!rows.length) {
    text("No submissions match.", L, y - 6, { size: 10, color: MUTED });
    y -= 20;
  }

  const rowH = 15;
  let alt = false;
  let anyTyped = false;
  rows.forEach((r, i) => {
    if (y < 60) {
      newPage();
      alt = false;
    }
    if (alt) {
      page.drawRectangle({ x: L, y: y - 4, width: R - L, height: rowH - 2, color: ROWALT });
    }
    alt = !alt;
    if (r.asTyped) anyTyped = true;

    const cells = [
      String(i + 1),
      r.asTyped ? `${r.who} *` : r.who,
      r.email,
      r.how,
      r.when,
    ];
    let x = L;
    cells.forEach((c, ci) => {
      const [, w] = COLS[ci];
      // a typed-in name is a claim, not a match - muted until someone assigns it
      text(clip(c, w - 10, font, 8.5), x + 5, y, {
        size: 8.5,
        color: r.asTyped ? MUTED : INK,
      });
      x += w;
    });
    y -= rowH;
  });

  if (anyTyped && y > 46) {
    y -= 6;
    text(
      "* name and email as typed at submission - not yet matched to a portal account.",
      L, y, { size: 7.5, color: MUTED },
    );
  }

  const all = doc.getPages();
  all.forEach((pg, i) => {
    pg.drawText(`Page ${i + 1} of ${all.length}`, {
      x: R - 60, y: 28, size: 7.5, font, color: MUTED,
    });
    if (opts.generatedOn) {
      pg.drawText(`Prepared ${opts.generatedOn}`, {
        x: L, y: 28, size: 7.5, font, color: MUTED,
      });
    }
  });

  return { bytes: await doc.save() };
}
