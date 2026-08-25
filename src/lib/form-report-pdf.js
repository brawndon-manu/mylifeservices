// signature records as documents - who signed which form and when, with the
// counts up top. two shapes: one form (`renderFormSignatureReport`) and the
// whole library in one file (`renderFormsOverviewReport`: a cover with totals
// and a per-form summary table, then a section per form that has signatures).
// same rows as the form record pages and their CSVs; these exist because a
// report you can attach to an email or drop in a folder is what actually gets
// used.
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

// [label, width, numeric] - widths sum to exactly R - L (532)
const SIGNER_COLS = [
  ["#", 26, false],
  ["Employee", 150, false],
  ["Email", 168, false],
  ["Attribution", 76, false],
  ["Signed", 112, false],
];
const SUMMARY_COLS = [
  ["Form", 220, false],
  ["Category", 116, false],
  ["Signed", 50, true],
  ["To assign", 58, true],
  ["Last signed", 88, true],
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

// shared page state: st.page / st.y move together through every draw helper
async function makeSt() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try {
    logo = await doc.embedPng(fs.readFileSync(LOGO_PATH));
  } catch {
    // decorative
  }
  const st = { doc, font, bold, logo, page: null, y: 0 };
  st.text = (s, x, yy, { size = 9, f = font, color = INK } = {}) =>
    st.page.drawText(String(s), { x, y: yy, size, font: f, color });
  st.addPage = () => {
    st.page = doc.addPage([PAGE_W, PAGE_H]);
    st.y = PAGE_H - 48;
  };
  return st;
}

// logo + company line + big brand title, page 1 only
function drawMasthead(st, title) {
  const logoH = 42;
  let tx = L;
  if (st.logo) {
    const lw = (st.logo.width / st.logo.height) * logoH;
    st.page.drawImage(st.logo, { x: L, y: st.y - logoH, width: lw, height: logoH });
    tx = L + lw + 14;
  }
  st.text("My Life Services, Inc.", tx, st.y - 12, { size: 8.5, f: st.bold, color: MUTED });
  st.text(clip(title, R - tx, st.bold, 17), tx, st.y - 35, { size: 17, f: st.bold, color: BRAND });
  st.y -= logoH + 15;
}

// the counts as tiles, so the state reads before the list does
function drawTiles(st, tiles) {
  const gap = 8;
  const tileW = (R - L - gap * (tiles.length - 1)) / tiles.length;
  const tileH = 40;
  let tx = L;
  for (const t of tiles) {
    const amber = t.amber && String(t.n) !== "0";
    st.page.drawRectangle({
      x: tx, y: st.y - tileH + 6, width: tileW, height: tileH,
      color: amber ? AMBERBG : STATBG,
    });
    const ink = amber ? AMBER : INK;
    st.text(t.n, tx + 8, st.y - 14, { size: t.small ? 10 : 16, f: st.bold, color: ink });
    st.text(t.label, tx + 8, st.y - 28, { size: 7.5, color: amber ? AMBER : MUTED });
    tx += tileW + gap;
  }
  st.y -= tileH + 10;
  st.page.drawLine({ start: { x: L, y: st.y }, end: { x: R, y: st.y }, thickness: 0.8, color: GRID });
  st.y -= 18;
}

function drawHead(st, cols) {
  const hH = 18;
  st.page.drawRectangle({ x: L, y: st.y - hH + 4, width: R - L, height: hH, color: HEADBG });
  let x = L;
  for (const [label, w, numeric] of cols) {
    const lx = numeric ? x + w - 5 - st.bold.widthOfTextAtSize(label, 7.5) : x + 5;
    st.text(label, lx, st.y - 8, { size: 7.5, f: st.bold, color: WHITE });
    x += w;
  }
  st.y -= hH + 4;
}

// a paginating table. cells() maps a row to strings; muted() marks the rows
// drawn quiet; contTitle heads the run-over pages. returns nothing - st.y ends
// under the last row.
function drawTable(st, cols, rows, { cells, muted = () => false, contTitle }) {
  drawHead(st, cols);
  const rowH = 15;
  let alt = false;
  rows.forEach((r, i) => {
    if (st.y < 60) {
      st.addPage();
      st.text(contTitle, L, st.y, { size: 9, f: st.bold, color: MUTED });
      st.y -= 20;
      drawHead(st, cols);
      alt = false;
    }
    if (alt) {
      st.page.drawRectangle({ x: L, y: st.y - 4, width: R - L, height: rowH - 2, color: ROWALT });
    }
    alt = !alt;
    const quiet = muted(r);
    let x = L;
    cells(r, i).forEach((c, ci) => {
      const [, w, numeric] = cols[ci];
      const s = clip(c, w - 10, st.font, 8.5);
      const cx = numeric ? x + w - 5 - st.font.widthOfTextAtSize(s, 8.5) : x + 5;
      st.text(s, cx, st.y, { size: 8.5, color: quiet ? MUTED : INK });
      x += w;
    });
    st.y -= rowH;
  });
}

const TYPED_NOTE =
  "* name and email as typed at submission - not yet matched to a portal account.";

// one form's signer table; returns whether any row was typed-only
function drawSignerTable(st, formTitle, rows) {
  drawTable(st, SIGNER_COLS, rows, {
    contTitle: `${formTitle} · signature record (continued)`,
    muted: (r) => r.asTyped,
    cells: (r, i) => [
      String(i + 1),
      r.asTyped ? `${r.who} *` : r.who,
      r.email,
      r.how,
      r.when,
    ],
  });
  return rows.some((r) => r.asTyped);
}

function drawTypedNote(st) {
  if (st.y > 46) {
    st.y -= 6;
    st.text(TYPED_NOTE, L, st.y, { size: 7.5, color: MUTED });
    st.y -= 12;
  }
}

function statTiles(stats) {
  return [
    { n: String(stats.total), label: "signed" },
    { n: String(stats.attributed), label: "attributed to a person" },
    { n: String(stats.unassigned), label: "need assignment", amber: true },
    { n: stats.lastLabel || "—", label: "last signed", small: true },
  ];
}

async function finish(st, opts) {
  const all = st.doc.getPages();
  all.forEach((pg, i) => {
    pg.drawText(`Page ${i + 1} of ${all.length}`, {
      x: R - 60, y: 28, size: 7.5, font: st.font, color: MUTED,
    });
    if (opts.generatedOn) {
      pg.drawText(`Prepared ${opts.generatedOn}`, {
        x: L, y: 28, size: 7.5, font: st.font, color: MUTED,
      });
    }
  });
  return { bytes: await st.doc.save() };
}

// rows: { who, email, how, when, asTyped } newest first, matching the screen.
// stats: { total, attributed, unassigned, lastLabel }. filterLabel names any
// active filters so a filtered file can't pass as the full record.
export async function renderFormSignatureReport(
  { formTitle, category, filterLabel, stats, rows },
  opts = {},
) {
  const st = await makeSt();
  st.addPage();
  drawMasthead(st, formTitle);
  st.text(`Signature record · ${category}`, L, st.y, { size: 11, f: st.bold });
  st.y -= 13;
  if (filterLabel) {
    st.text(`Filtered: ${filterLabel}`, L, st.y, { size: 8.5, color: MUTED });
    st.y -= 12;
  }
  drawTiles(st, statTiles(stats));

  if (!rows.length) {
    st.text("No submissions match.", L, st.y - 6, { size: 10, color: MUTED });
  } else if (drawSignerTable(st, formTitle, rows)) {
    drawTypedNote(st);
  }
  return finish(st, opts);
}

// the whole library in one file. forms: [{ formTitle, category, stats, rows }]
// in library order - every form lands in the cover summary, and each one with
// signatures gets its own section on a fresh page.
export async function renderFormsOverviewReport({ forms }, opts = {}) {
  const st = await makeSt();
  st.addPage();
  drawMasthead(st, "Form Signature Records");

  const overall = {
    total: forms.reduce((n, f) => n + f.stats.total, 0),
    attributed: forms.reduce((n, f) => n + f.stats.attributed, 0),
    unassigned: forms.reduce((n, f) => n + f.stats.unassigned, 0),
    lastLabel: forms
      .filter((f) => f.stats.lastLabel)
      .map((f) => f.stats)
      .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt))[0]?.lastLabel,
  };
  st.text(
    `${forms.length} form${forms.length === 1 ? "" : "s"} in the library`,
    L, st.y, { size: 11, f: st.bold },
  );
  st.y -= 13;
  drawTiles(st, statTiles(overall));

  drawTable(st, SUMMARY_COLS, forms, {
    contTitle: "Form Signature Records (continued)",
    muted: (f) => f.stats.total === 0,
    cells: (f) => [
      f.formTitle,
      f.category,
      String(f.stats.total),
      String(f.stats.unassigned),
      f.stats.lastLabel || "—",
    ],
  });

  for (const f of forms) {
    if (!f.rows.length) continue;
    st.addPage();
    st.text(clip(f.formTitle, R - L, st.bold, 14), L, st.y - 4, {
      size: 14, f: st.bold, color: BRAND,
    });
    st.y -= 20;
    const s = f.stats;
    st.text(
      `Signature record · ${f.category} · ${s.total} signed · ${s.attributed} attributed · ${s.unassigned} need assignment`,
      L, st.y, { size: 8.5, color: MUTED },
    );
    st.y -= 16;
    if (drawSignerTable(st, f.formTitle, f.rows)) {
      drawTypedNote(st);
    }
  }
  return finish(st, opts);
}
