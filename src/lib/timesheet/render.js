// render a corrected timesheet PDF, matching the format approved by MLS
// one-for-one: MLS logo, the full QSP column set, colour-coded breaks, the
// attestation, the admin approval block, and the CA 226.7 premium table.
// paginates when a pay period runs long, and embeds real AcroForm signature
// fields so the portal's existing signature pad can sign it unchanged.
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// read straight off disk - this only ever runs server-side.
const LOGO_PATH = path.join(process.cwd(), "public", "logo", "MLSlogo.png");

// palette lifted from the approved sample
const REST = rgb(1, 0.949, 0.6);        // 10-min paid rest break
const MEAL = rgb(0.71, 0.85, 0.98);     // 30-min unpaid meal break
const INK = rgb(0.05, 0.05, 0.05);
const MUTED = rgb(0.45, 0.5, 0.55);
const GRID = rgb(0.45, 0.5, 0.55);
const BRAND = rgb(0.086, 0.325, 0.529); // headline blue
const HEADBG = rgb(0.106, 0.298, 0.404);// premium table header
const TOTALBG = rgb(0.878, 0.949, 0.961);
const PREM = rgb(0.7, 0.11, 0.11);
const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0, 0, 0);

const PAGE_W = 612;
const PAGE_H = 792;
const L = 28;
const R = PAGE_W - 28;

const r2 = (n) => Math.round(n * 100) / 100;
const f2 = (n) => r2(n).toFixed(2);
// blank instead of 0.00 in the OT-style columns, like the source document
const orBlank = (n) => (n && r2(n) > 0 ? f2(n) : "");

// column layout: [label, width]. mirrors the QSP export column set.
const COLUMNS = [
  ["Date", 44],
  ["Time\nIn", 32], ["Time\nOut", 32],
  ["Time\nIn", 32], ["Time\nOut", 32],
  ["Time\nIn", 32], ["Time\nOut", 32],
  ["Regular\nHours", 46],
  ["OT\nExempt", 40],
  ["Over\nTime", 38],
  ["Double\nTime", 40],
  ["Holiday", 38],
  ["Daily\nTotal", 40],
  ["Comments", 78],
];

// resolve each column's x position from the widths
function layout() {
  const xs = [];
  let x = L;
  for (const [, w] of COLUMNS) {
    xs.push({ x, w });
    x += w;
  }
  return { xs, right: x };
}

const IDX = {
  date: 0, punch: [1, 2, 3, 4, 5, 6],
  regular: 7, otExempt: 8, overtime: 9, double: 10, holiday: 11, daily: 12, comments: 13,
};

export async function renderCorrected(sheet, opts = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  let logo = null;
  try {
    logo = await doc.embedPng(fs.readFileSync(LOGO_PATH));
  } catch {
    // logo is decorative - carry on without it rather than fail a payroll doc
  }

  const { xs, right } = layout();
  const FOOTER_TOP = 40;
  const rowH = 12.6;
  const headH = 24;

  // --- paging state -------------------------------------------------------
  // a long pay period genuinely doesn't fit on one page (the source export
  // paginates too), so the table flows across pages and the trailer sections
  // start a fresh page rather than colliding with the footer.
  let page = null;
  let y = 0;
  let tableTop = null;
  let rowTops = [];
  const pages = [];

  const text = (s, x, yy, { size = 8, f = font, color = INK } = {}) =>
    page.drawText(String(s), { x, y: yy, size, font: f, color });
  const centerIn = (s, col, yy, o = {}) => {
    const size = o.size || 8;
    const f = o.f || font;
    const w = f.widthOfTextAtSize(String(s), size);
    text(s, col.x + (col.w - w) / 2, yy, o);
  };
  const line = (x1, y1, x2, y2, color = GRID, thickness = 0.5) =>
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color });

  // draw the grid for the table section currently on this page
  const closeTable = () => {
    if (tableTop === null) return;
    const bottom = rowTops[rowTops.length - 1];
    for (const ry of rowTops) line(L, ry, right, ry);
    let vx = L;
    line(vx, tableTop, vx, bottom);
    for (const [, w] of COLUMNS) {
      vx += w;
      line(vx, tableTop, vx, bottom);
    }
    tableTop = null;
    rowTops = [];
  };

  const drawPageHeader = (continued) => {
    y = PAGE_H - 40;
    if (logo) {
      const lw = 62;
      const lh = (logo.height / logo.width) * lw;
      page.drawImage(logo, { x: L + 24, y: y - lh + 14, width: lw, height: lh });
    }
    const title = continued ? "Employee Timesheet (continued)" : "Employee Timesheet";
    text(title, (PAGE_W - bold.widthOfTextAtSize(title, 19)) / 2 + 30, y - 18, {
      size: 19, f: bold, color: BRAND,
    });
    y -= 56;
    text("My Life Services", L, y, { size: 8.5, f: bold });
    const pp = `Pay Period:  ${sheet.payPeriod?.from ?? ""} to ${sheet.payPeriod?.to ?? ""}`;
    text(pp, R - bold.widthOfTextAtSize(pp, 8.5), y, { size: 8.5, f: bold });
    y -= 18;
    text("Employee Name:", L, y, { size: 8.5 });
    text(sheet.employee ?? "", L + 74, y, { size: 8.5, f: bold });
    y -= 16;
  };

  const newPage = (continued) => {
    closeTable();
    page = doc.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    drawPageHeader(continued);
  };

  const openTableHead = () => {
    tableTop = y;
    COLUMNS.forEach(([label], i) => {
      const col = xs[i];
      label.split("\n").forEach((ln, li) => {
        const w = bold.widthOfTextAtSize(ln, 7);
        text(ln, col.x + (col.w - w) / 2, y - 10 - li * 8, { size: 7, f: bold });
      });
    });
    y -= headH;
    rowTops = [tableTop, y];
  };

  // make sure `h` points of room exist below the current cursor
  const ensure = (h, { inTable = false } = {}) => {
    if (y - h >= FOOTER_TOP + 8) return;
    newPage(true);
    if (inTable) openTableHead();
  };

  newPage(false);
  openTableHead();

  for (const d of sheet.days) {
    const per = IDX.punch.length;
    // >6 punches wraps to continuation rows, exactly like the source export -
    // every punch stays visible on a document someone signs.
    const chunks = [];
    for (let i = 0; i < d.punches.length; i += per) chunks.push(d.punches.slice(i, i + per));
    if (!chunks.length) chunks.push([]);

    const at = new Map();
    d.punches.forEach((p, i) => at.set(p, { row: Math.floor(i / per), col: i % per }));

    // keep a day's continuation rows together on one page
    ensure(chunks.length * rowH, { inTable: true });

    chunks.forEach((chunk, ci) => {
      const top = y;
      const base = y - rowH + 4.5;
      const isLast = ci === chunks.length - 1;

      // break highlights sit behind the two punches that bound the gap
      for (const b of d.breaks) {
        if (b.kind !== "rest" && b.kind !== "meal") continue;
        const color = b.kind === "rest" ? REST : MEAL;
        for (const p of [b.start, b.end]) {
          const pos = at.get(p);
          if (!pos || pos.row !== ci) continue;
          const col = xs[IDX.punch[pos.col]];
          page.drawRectangle({ x: col.x, y: top - rowH, width: col.w, height: rowH, color });
        }
      }

      centerIn(d.date, xs[IDX.date], base, { size: 7.5 });
      chunk.forEach((p, i) => centerIn(p.raw, xs[IDX.punch[i]], base, { size: 7.5 }));

      if (isLast) {
        centerIn(f2(d.regularHours), xs[IDX.regular], base, { size: 7.5 });
        centerIn(orBlank(d.otHours), xs[IDX.overtime], base, { size: 7.5 });
        centerIn(orBlank(d.doubleHours), xs[IDX.double], base, { size: 7.5 });
        centerIn(f2(d.paidHours), xs[IDX.daily], base, { size: 7.5 });

        const notes = [];
        if (d.mealLate) notes.push("meal started late");
        else if (d.mealViolation) notes.push("no meal period");
        if (d.restViolation) notes.push(`rest ${d.restCount}/${d.restRequired}`);
        if (d.seventhDay) notes.push("7th day");
        if (notes.length) {
          // the column is narrow and these notes vary in length, so shrink to
          // fit and only clip as a last resort. running past the column edge on
          // a document someone signs looks like a broken form.
          const col = xs[IDX.comments];
          const maxW = col.w - 6;
          const { str, size } = fitText(notes.join(", "), maxW, font, 6, 4.4);
          text(str, col.x + 3, base, { size, color: PREM });
        }
      }

      y -= rowH;
      rowTops.push(y);
    });
  }

  // totals row
  ensure(rowH, { inTable: true });
  const tBase = y - rowH + 4.5;
  const totalsLabel = "Totals:";
  text(totalsLabel, xs[IDX.regular].x - bold.widthOfTextAtSize(totalsLabel, 8) - 6, tBase, {
    size: 8, f: bold,
  });
  centerIn(f2(sheet.totals.regularHours), xs[IDX.regular], tBase, { size: 8, f: bold });
  centerIn(orBlank(sheet.totals.otHours), xs[IDX.overtime], tBase, { size: 8, f: bold });
  centerIn(orBlank(sheet.totals.doubleHours), xs[IDX.double], tBase, { size: 8, f: bold });
  centerIn(f2(sheet.totals.paidHours), xs[IDX.daily], tBase, { size: 8, f: bold });
  y -= rowH;
  rowTops.push(y);

  closeTable();
  y -= 14;

  // ---------- attestation ----------
  // everything from here down is the signable trailer; keep it together rather
  // than splitting a signature block across a page break.
  const TRAILER_H = 150;
  ensure(TRAILER_H);

  const attest =
    "I attest that all hours I worked during the pay period recorded above are the actual hours I worked on each day, including all overtime hours worked. Unless otherwise recorded above, " +
    "I attest that I have received all my meal, rest and recovery periods consistent with My Life Services's policy and applicable law. I also attest that I reported every injury sustained on " +
    "the job during the pay period, if there were any.";
  y = wrapCentered(page, attest, L, y, R - L, { font, size: 6.5, color: INK, leading: 8.5 });
  y -= 14;

  // ---------- color key ----------
  const keyH = 20;
  page.drawRectangle({
    x: L, y: y - keyH + 6, width: R - L, height: keyH,
    borderColor: BLACK, borderWidth: 0.8,
  });
  const keyY = y - keyH + 12;
  text("Color Key:", L + 12, keyY, { size: 8.5, f: bold });
  page.drawRectangle({ x: L + 70, y: keyY - 3, width: 26, height: 11, color: REST, borderColor: GRID, borderWidth: 0.4 });
  text("10-Minute Paid Rest Break", L + 104, keyY, { size: 8 });
  page.drawRectangle({ x: L + 244, y: keyY - 3, width: 26, height: 11, color: MEAL, borderColor: GRID, borderWidth: 0.4 });
  text("30-Minute Unpaid Meal Break", L + 278, keyY, { size: 8 });
  text("Hours include paid rest break time.", L + 428, keyY, { size: 7, color: MUTED });
  y -= keyH + 18;

  // ---------- employee signature ----------
  // drawn as real AcroForm fields so the portal's existing filler can sign it
  text("Employee Signature:", L + 6, y, { size: 8.5 });
  text("Date:", L + 322, y, { size: 8.5 });
  // no underline drawn here - the AcroForm widgets added at the end sit in these
  // rects and provide their own boxes.
  const sigRect = { x: L + 100, y: y - 4, width: 200, height: 15 };
  const dateRect = { x: L + 356, y: y - 4, width: 180, height: 15 };
  // pin the page these rects belong to - later sections may start a new page,
  // and the form widgets have to land on the page they were drawn for.
  const sigPage = page;
  y -= 20;

  // ---------- admin block ----------
  const barH = 14;
  page.drawRectangle({ x: L, y: y - barH + 4, width: R - L, height: barH, color: BLACK });
  const adminLabel = "Below for Admin Use Only";
  text(adminLabel, (PAGE_W - bold.widthOfTextAtSize(adminLabel, 8)) / 2, y - barH + 8, {
    size: 8, f: bold, color: WHITE,
  });
  y -= barH + 4;

  const adminBoxTop = y;
  const adminBoxH = 42;
  page.drawRectangle({
    x: L, y: y - adminBoxH, width: R - L, height: adminBoxH,
    borderColor: BLACK, borderWidth: 0.8,
  });
  const apprY = y - adminBoxH + 12;
  text("Approval Signature:", L + 6, apprY, { size: 8.5 });
  text("Date:", L + 322, apprY, { size: 8.5 });
  // fillable, like the employee block - management signs off in the portal once
  // the employee has signed, and the approved copy is what gets filed.
  const apprRect = { x: L + 100, y: apprY - 4, width: 200, height: 15 };
  const apprDateRect = { x: L + 356, y: apprY - 4, width: 180, height: 15 };
  const apprPage = page;
  y = adminBoxTop - adminBoxH - 16;

  // dotted separator + the notes block. reserve room for the heading and at
  // least a couple of note lines so the heading never lands on the footer.
  const comments = (sheet.comments || []).filter(Boolean);
  ensure(34 + Math.min(comments.length, 3) * 9);
  for (let x = L; x < R; x += 6) line(x, y, Math.min(x + 3, R), y, GRID, 0.6);
  y -= 14;

  text("Comments Details:", L, y, { size: 8.5, f: bold });
  y -= 12;

  for (const c of comments) {
    ensure(11);
    y = wrap(page, c, L, y, R - L, { font, size: 6.5, color: INK, leading: 8 });
    y -= 1;
  }
  y -= 8;

  // ---------- premium table ----------
  const p = sheet.premiums;
  if (p.totalHours > 0) {
    // header + both rows + total, kept on one page
    ensure(40 + (p.mealDays.length ? 22 : 0) + (p.restDays.length ? 30 : 0) + 40);
    text("Break Premium Payments Due - California Labor Code \u00A7226.7", L, y, {
      size: 10.5, f: bold, color: BRAND,
    });
    y -= 16;

    const cw = [172, 300, R - L - 172 - 300];
    const cx = [L, L + cw[0], L + cw[0] + cw[1]];
    const hH = 15;
    page.drawRectangle({ x: L, y: y - hH + 4, width: R - L, height: hH, color: HEADBG });
    text("Premium Type", cx[0] + 6, y - hH + 8, { size: 7.5, f: bold, color: WHITE });
    text("Workdays with Violation", cx[1] + 6, y - hH + 8, { size: 7.5, f: bold, color: WHITE });
    text("Hours Due", cx[2] + 6, y - hH + 8, { size: 7.5, f: bold, color: WHITE });
    y -= hH + 4;

    const premRow = (label, days, hrs, note) => {
      if (!days.length) return;
      const startY = y;
      text(label, cx[0] + 6, y, { size: 7.5 });
      const listText = days.join(", ") + (note ? `  ${note}` : "");
      const endY = wrap(page, listText, cx[1] + 6, y, cw[1] - 12, {
        font, size: 7, color: INK, leading: 8.5,
      });
      text(`${f2(hrs)} hrs`, cx[2] + 6, y, { size: 7.5, f: bold, color: PREM });
      y = Math.min(startY - 12, endY - 4);
      line(L, y + 3, R, y + 3);
      y -= 9;
    };
    premRow(
      "Meal period premium",
      p.mealDays,
      p.mealHours,
      "(no meal period taken, or not started by the end of the fifth hour)",
    );
    premRow("Rest break premium", p.restDays, p.restHours, "");

    const totH = 15;
    page.drawRectangle({ x: L, y: y - totH + 5, width: R - L, height: totH, color: TOTALBG });
    text("Total premium hours due (paid at the employee's regular rate of pay)", cx[0] + 6, y - totH + 9, {
      size: 7.5, f: bold,
    });
    text(`${f2(p.totalHours)} hrs`, cx[2] + 6, y - totH + 9, { size: 7.5, f: bold, color: PREM });
    y -= totH + 10;

    text(
      "One additional hour of pay per workday for a missed meal period and for missed rest break(s) - max one of each per day. Verify before payout.",
      L, y, { size: 6.5, color: MUTED },
    );
    y -= 14;
  } else {
    text("No meal or rest break premiums due for this pay period.", L, y, {
      size: 9, f: bold, color: rgb(0.05, 0.4, 0.25),
    });
    y -= 16;
  }

  // reconciliation line so payroll can tie this back to the QSP export
  text(
    `As exported by QSP: ${f2(sheet.totals.rawHours)} hrs. Corrected to ${f2(sheet.totals.paidHours)} hrs - paid 10-minute rest breaks are included in hours worked.`,
    L, y, { size: 6.5, color: MUTED, f: italic },
  );

  // ---------- footer ----------
  // hard guard: content must never run under the footer. paging should prevent
  // this, so hitting it means a layout bug - better to shout than to hand
  // payroll a mangled sheet.
  if (y < FOOTER_TOP - 8) {
    throw new Error(
      `timesheet layout overflowed for ${sheet.employee}: content reached y=${r2(y)}, ` +
        `footer starts at ${FOOTER_TOP}.`,
    );
  }
  const stamp = opts.generatedOn || new Date().toLocaleDateString("en-US");
  pages.forEach((pg, i) => {
    pg.drawText(`Printed by:  ${opts.printedBy || sheet.employee || ""}`, {
      x: L, y: 26, size: 8, font: bold, color: INK,
    });
    pg.drawText(stamp, {
      x: R - bold.widthOfTextAtSize(stamp, 8), y: 26, size: 8, font: bold, color: INK,
    });
    if (pages.length > 1) {
      const pn = `Page ${i + 1} of ${pages.length}`;
      pg.drawText(pn, {
        x: (PAGE_W - font.widthOfTextAtSize(pn, 7)) / 2, y: 26, size: 7, font, color: MUTED,
      });
    }
  });

  // ---------- signature fields ----------
  // real AcroForm fields, so the portal's existing FormFiller renders a draw-box
  // for the signature and a text box for the date - no second signing path.
  const form = doc.getForm();
  const sig = form.createTextField("Employee Signature");
  sig.addToPage(sigPage, { ...sigRect, borderWidth: 0, backgroundColor: undefined });
  const dt = form.createTextField("Signature Date");
  dt.addToPage(sigPage, { ...dateRect, borderWidth: 0, backgroundColor: undefined });

  // deliberately NO form field for the approval line. signing flattens the
  // whole AcroForm, so an approval field would be gone by the time the employee
  // has signed - and while it existed, the filler would happily offer the
  // employee their manager's signature box. management's signature is stamped
  // at approvalRect instead.

  // hand back where the approval line sits. management's signature is stamped
  // here server-side rather than through a form field: signing flattens the
  // whole AcroForm, so by the time an employee has signed there is no field
  // left for anyone else to fill.
  const approvalRect = {
    pageIndex: pages.indexOf(apprPage),
    x: apprRect.x,
    y: apprRect.y,
    width: apprRect.width,
    height: apprRect.height,
    dateX: apprDateRect.x,
    dateY: apprDateRect.y,
    dateWidth: apprDateRect.width,
  };

  return { bytes: await doc.save(), approvalRect };
}

// shrink a single line until it fits `maxW`, then clip with an ellipsis if it
// still doesn't. returns the string and the size to draw it at.
function fitText(str, maxW, font, startSize, minSize) {
  let size = startSize;
  while (size > minSize && font.widthOfTextAtSize(str, size) > maxW) {
    size -= 0.2;
  }
  if (font.widthOfTextAtSize(str, size) <= maxW) return { str, size };

  let out = str;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, size) > maxW) {
    out = out.slice(0, -1);
  }
  return { str: `${out}…`, size };
}

// left-aligned word wrap; returns the y after the last line
function wrap(page, str, x, y, maxW, { font, size, color, leading }) {
  const words = String(str).split(/\s+/);
  let lineStr = "";
  let yy = y;
  for (const w of words) {
    const test = lineStr ? `${lineStr} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxW && lineStr) {
      page.drawText(lineStr, { x, y: yy, size, font, color });
      yy -= leading;
      lineStr = w;
    } else {
      lineStr = test;
    }
  }
  if (lineStr) {
    page.drawText(lineStr, { x, y: yy, size, font, color });
    yy -= leading;
  }
  return yy;
}

// centered word wrap, for the attestation paragraph
function wrapCentered(page, str, x, y, maxW, { font, size, color, leading }) {
  const words = String(str).split(/\s+/);
  const lines = [];
  let lineStr = "";
  for (const w of words) {
    const test = lineStr ? `${lineStr} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxW && lineStr) {
      lines.push(lineStr);
      lineStr = w;
    } else {
      lineStr = test;
    }
  }
  if (lineStr) lines.push(lineStr);
  let yy = y;
  for (const ln of lines) {
    const w = font.widthOfTextAtSize(ln, size);
    page.drawText(ln, { x: x + (maxW - w) / 2, y: yy, size, font, color });
    yy -= leading;
  }
  return yy;
}
