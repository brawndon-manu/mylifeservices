// the payout report as a document - hours worked, penalties owed, and what each
// person is actually owed in total, one row per employee.
//
// this is the thing David asked for in his own words: "all hours worked plus
// penalties that need to be paid out and a total for each staff". the web
// version and the CSV carry the same figures; this one exists because a report
// you can attach to an email or drop in a folder is what actually gets used.
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
const PREM = rgb(0.7, 0.11, 0.11);
const TOTALBG = rgb(0.878, 0.949, 0.961);
const GRID = rgb(0.75, 0.79, 0.83);
const WHITE = rgb(1, 1, 1);
// the provisional / final notice on the penalty column
const WAITBG = rgb(0.992, 0.969, 0.894);
const WAITINK = rgb(0.42, 0.32, 0.06);
const OKBG = rgb(0.898, 0.961, 0.925);
const OKINK = rgb(0.05, 0.35, 0.19);

const f2 = (n) => (Math.round((n || 0) * 100) / 100).toFixed(2);

// widths sum to exactly R - L (532)
const COLS = [
  ["Employee", 142, false],
  ["Regular", 62, true],
  ["OT", 52, true],
  ["Double", 58, true],
  ["Hours worked", 74, true],
  ["Penalty", 62, true],
  ["Total payable", 82, true],
];

// greedy wrap: the notice is a sentence, and a sentence running through the
// right rule on a payroll document reads as a broken form.
function wrapAt(str, maxW, font, size) {
  const out = [];
  let line = "";
  for (const w of String(str).split(/\s+/)) {
    const cand = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(cand, size) > maxW && line) { out.push(line); line = w; }
    else line = cand;
  }
  if (line) out.push(line);
  return out;
}

export async function renderPayoutReport({ periodFrom, periodTo, rows, standing }, opts = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let logo = null;
  try {
    logo = await doc.embedPng(fs.readFileSync(LOGO_PATH));
  } catch {
    // decorative
  }

  const period = `${periodFrom} to ${periodTo}`;
  const sum = (k) => rows.reduce((n, r) => n + (r[k] || 0), 0);
  const totals = {
    regularHours: sum("regularHours"),
    otHours: sum("otHours"),
    doubleHours: sum("doubleHours"),
    paidHours: sum("paidHours"),
    premiumHours: sum("premiumHours"),
    payable: rows.reduce((n, r) => n + (r.paidHours || 0) + (r.premiumHours || 0), 0),
  };
  const unmatched = rows.filter((r) => !r.matched).length;
  const partial = rows.filter((r) => r.partialWeek).length;
  const disputed = rows.filter((r) => r.disputed).length;

  let page = null;
  let y = 0;
  let pageNo = 0;

  const text = (s, x, yy, { size = 9, f = font, color = INK } = {}) =>
    page.drawText(String(s), { x, y: yy, size, font: f, color });

  const drawHead = () => {
    const hH = 18;
    page.drawRectangle({ x: L, y: y - hH + 4, width: R - L, height: hH, color: HEADBG });
    let x = L;
    for (const [label, w, numeric] of COLS) {
      const lx = numeric ? x + w - 5 - bold.widthOfTextAtSize(label, 7.5) : x + 5;
      text(label, lx, y - 8, { size: 7.5, f: bold, color: WHITE });
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
      text("Payroll Hours and Penalties Due", tx, y - 35, { size: 17, f: bold, color: BRAND });
      y -= logoH + 15;
      text(`Pay period ${period}`, L, y, { size: 11, f: bold });
      y -= 13;
      text(`${rows.length} employees`, L, y, { size: 8.5, color: MUTED });
      y -= 12;

      // WHETHER THE PENALTY COLUMN IS FINISHED CHANGING. Mánu 2026-08-09 late:
      // the projected report is the one, "updated as people confirm with a
      // notice when everyone has confirmed". THE DIRECTION INVERTED 2026-08-11 -
      // every fault is charged from the start and confirming one takes it off,
      // so the total can only come DOWN. A report that looks final while most of
      // the batch has an open question now over-states payroll rather than
      // shortchanging an employee.
      if (standing?.people) {
        const good = standing.settled;
        const title = good
          ? "FINAL. Everyone has answered."
          : `PROVISIONAL. ${standing.waiting} of ${standing.people} have not answered yet.`;
        const body = good
          ? `All ${standing.people} confirmed what they were asked about their breaks. Nothing further can move the penalty column.`
          : `Every break the reports do not show is charged here. Up to ${f2(standing.assumptions)} penalty hours come off if everyone still to answer confirms they took theirs. The penalty column can fall and cannot rise.`;
        const ink = good ? OKINK : WAITINK;
        const lines = wrapAt(body, R - L - 16, font, 7.5);
        const boxH = 17 + lines.length * 9;
        page.drawRectangle({
          x: L, y: y - boxH + 5, width: R - L, height: boxH,
          color: good ? OKBG : WAITBG, borderColor: ink, borderWidth: 0.6,
        });
        text(title, L + 5, y - 7, { size: 8.5, f: bold, color: ink });
        let ly = y - 18;
        for (const ln of lines) { text(ln, L + 5, ly, { size: 7.5, color: ink }); ly -= 9; }
        y -= boxH + 8;
      }

      page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.8, color: GRID });
      y -= 18;
    } else {
      text(`Payroll Hours and Penalties Due · ${period} (continued)`, L, y, {
        size: 9, f: bold, color: MUTED,
      });
      y -= 20;
    }
    drawHead();
  };

  newPage();

  const rowH = 15;
  let alt = false;
  for (const r of rows) {
    // leave room for the totals block rather than stranding it on its own page
    if (y < 96) {
      newPage();
      alt = false;
    }
    if (alt) {
      page.drawRectangle({ x: L, y: y - 4, width: R - L, height: rowH - 2, color: ROWALT });
    }
    alt = !alt;

    const payable = (r.paidHours || 0) + (r.premiumHours || 0);
    const cells = [
      r.who,
      f2(r.regularHours),
      f2(r.otHours),
      f2(r.doubleHours),
      f2(r.paidHours),
      f2(r.premiumHours),
      f2(payable),
    ];

    let x = L;
    cells.forEach((c, i) => {
      const [, w, numeric] = COLS[i];
      const isPrem = i === 5 && (r.premiumHours || 0) > 0;
      const isTotal = i === 6;
      const f = isTotal || isPrem ? bold : font;
      const size = 8.5;
      const cx = numeric ? x + w - 5 - f.widthOfTextAtSize(c, size) : x + 5;
      text(c, cx, y, { size, f, color: isPrem ? PREM : INK });
      x += w;
    });
    // a quiet marker rather than a whole column - these are exceptions, not data
    if (!r.matched || r.disputed) {
      text(r.disputed ? "!" : "*", L - 8, y, { size: 8, f: bold, color: PREM });
    }
    y -= rowH;
  }

  // ---------- totals ----------
  y -= 4;
  const boxH = 26;
  page.drawRectangle({ x: L, y: y - boxH + 10, width: R - L, height: boxH, color: TOTALBG });
  let x = L;
  const totalCells = [
    `TOTAL (${rows.length})`,
    f2(totals.regularHours),
    f2(totals.otHours),
    f2(totals.doubleHours),
    f2(totals.paidHours),
    f2(totals.premiumHours),
    f2(totals.payable),
  ];
  totalCells.forEach((c, i) => {
    const [, w, numeric] = COLS[i];
    const size = i === 6 ? 11 : 9;
    const cx = numeric ? x + w - 5 - bold.widthOfTextAtSize(c, size) : x + 5;
    text(c, cx, y - 2, {
      size, f: bold,
      color: i === 5 || i === 6 ? PREM : INK,
    });
    x += w;
  });
  y -= boxH + 14;

  // ---------- notes ----------
  const notes = [];
  notes.push(
    "Total payable = hours worked (with paid rest break time added back) plus penalty hours. Penalty hours are paid at the employee's regular rate of pay under Labor Code 226.7.",
  );
  if (disputed) {
    notes.push(
      `! ${disputed} employee${disputed === 1 ? " has" : "s have"} reported a problem that is not yet resolved - those figures are likely to change.`,
    );
  }
  if (unmatched) {
    notes.push(
      `* ${unmatched} row${unmatched === 1 ? " is" : "s are"} not matched to a portal account and are named as the payroll export printed them.`,
    );
  }
  if (partial) {
    notes.push(
      `${partial} sheet${partial === 1 ? "" : "s"} include a workweek cut off by the pay-period boundary, so overtime over 40 hours on those weeks is provisional until the neighbouring period is known.`,
    );
  }

  for (const n of notes) {
    if (y < 46) break;
    const words = n.split(/\s+/);
    let line = "";
    for (const w of words) {
      const cand = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(cand, 7.5) > R - L) {
        text(line, L, y, { size: 7.5, color: MUTED });
        y -= 9.5;
        line = w;
      } else {
        line = cand;
      }
    }
    if (line) {
      text(line, L, y, { size: 7.5, color: MUTED });
      y -= 13;
    }
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

  return { bytes: await doc.save(), totals };
}
