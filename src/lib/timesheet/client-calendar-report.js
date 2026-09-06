// BILLABLE HOURS THE WAY DAVID BILLS THEM - per client, per day.
//
// David, via Mánu 2026-09-06, with the DDS eBilling unit calendar open: "I
// bill by client so it's hard to cross reference by staff." eBilling is a
// month calendar per client with a daily figure typed into each day, so this
// report mirrors that exactly: one calendar page per client with the day's
// total billable hours in each cell (the reviewer's corrected figure where
// one exists, the billed figure otherwise), then a breakdown page listing
// every shift behind every day. A day holding a flagged shift is shaded,
// which is the cross-reference he asked for.
//
// The model is pure so the workbook's Daily billable tab and this PDF read
// the same numbers, and days are keyed by day-of-month because a pay period
// never crosses a month boundary here.
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { clockLabel } from "./schedule-notes.js";
import { minsWords } from "./hours-label.js";
import { pdfText } from "./flag-report.js";

const hrs = (m) => `${(m / 60).toFixed(2)}h`;

// "08/01/26" -> { year: 2026, month: 7 } (JS month index)
const monthOf = (d) => {
  const m = /^(\d{2})\/\d{2}\/(\d{2})$/.exec(d || "");
  return m ? { year: 2000 + Number(m[2]), month: Number(m[1]) - 1 } : null;
};
const dayNum = (d) => {
  const m = /^\d{2}\/(\d{2})\/\d{2}$/.exec(d || "");
  return m ? Number(m[1]) : null;
};

// client -> { name, authKey, days: Map(dayOfMonth -> day), totalMin }
// day = { billableMin, flagged, corrected, shifts: [...] }
export function clientDayModel(rows) {
  const clients = new Map();
  for (const r of rows) {
    const name = r.client || "No client on the booking";
    let c = clients.get(name);
    if (!c) {
      c = { name, authKey: r.authKey || null, days: new Map(), totalMin: 0 };
      clients.set(name, c);
    }
    if (!c.authKey && r.authKey) c.authKey = r.authKey;
    const n = dayNum(r.date);
    if (n == null) continue;
    let d = c.days.get(n);
    if (!d) {
      d = { billableMin: 0, flagged: false, corrected: false, shifts: [] };
      c.days.set(n, d);
    }
    const billable = r.review?.billableMin ?? r.billedMin ?? 0;
    d.billableMin += billable;
    c.totalMin += billable;
    if (r.review?.decision === "flagged") d.flagged = true;
    if (r.review?.billableMin != null) d.corrected = true;
    d.shifts.push({
      who: r.whoLegal || r.who, // legal names on documents
      from: r.schedFrom,
      to: r.schedTo,
      billableMin: billable,
      billedMin: r.billedMin ?? 0,
      corrected: r.review?.billableMin != null,
      decision: r.review?.decision || null,
    });
  }
  for (const c of clients.values()) {
    for (const d of c.days.values()) d.shifts.sort((a, b) => (a.from ?? 0) - (b.from ?? 0));
  }
  return [...clients.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ------------------------------------------------------------- the document
//
// The client report's page, margins and palette, so the family reads as one
// set in one folder.
const LOGO_PATH = path.join(process.cwd(), "public", "logo", "MLSlogo.png");
const PAGE_W = 612;
const PAGE_H = 792;
const L = 40;
const R = PAGE_W - 40;
const INK = rgb(0.05, 0.05, 0.05);
const MUTED = rgb(0.42, 0.47, 0.53);
const BRAND = rgb(0.086, 0.325, 0.529);
const GRID = rgb(0.75, 0.79, 0.83);
const AMBER = rgb(0.65, 0.42, 0.02);
const AMBER_BG = rgb(0.992, 0.953, 0.87);
const HEAD_BG = rgb(0.965, 0.973, 0.984);
const GREEN = rgb(0.086, 0.396, 0.204);

// eBilling's grid runs Monday through Sunday, so this one does too
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const firstLast = (c) => {
  const v = String(c || "");
  const i = v.indexOf(",");
  return i < 0 ? v : `${v.slice(i + 1).trim()} ${v.slice(0, i).trim()}`;
};

function wrapAt(str, maxW, font, size) {
  const out = [];
  let line = "";
  for (const w of pdfText(String(str)).split(/\s+/)) {
    const cand = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(cand, size) > maxW && line) { out.push(line); line = w; }
    else line = cand;
  }
  if (line) out.push(line);
  return out;
}

export async function renderClientCalendars({ periodFrom, generatedOn, clients, authorized = null, authMonthLabel = null }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  let logo = null;
  try {
    logo = await doc.embedPng(fs.readFileSync(LOGO_PATH));
  } catch {
    // decorative
  }

  const mo = monthOf(periodFrom) || { year: new Date().getFullYear(), month: new Date().getMonth() };
  const monthName = new Date(mo.year, mo.month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const daysInMonth = new Date(mo.year, mo.month + 1, 0).getDate();
  const firstCol = (new Date(mo.year, mo.month, 1).getDay() + 6) % 7; // Monday first

  let page = null;
  let y = 0;
  const text = (s, x, yy, { size = 9, f = font, color = INK } = {}) =>
    page.drawText(pdfText(String(s)), { x, y: yy, size, font: f, color });
  const newPage = () => { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - 48; };
  const need = (h) => { if (y - h < 48) newPage(); };
  const right = (s, yy, size, f = font, color = MUTED) =>
    text(s, R - f.widthOfTextAtSize(pdfText(String(s)), size), yy, { size, f, color });

  for (const c of clients) {
    // ---------- the calendar page ----------
    newPage();
    const logoH = 36;
    let tx = L;
    if (logo) {
      const lw = (logo.width / logo.height) * logoH;
      page.drawImage(logo, { x: L, y: y - logoH, width: lw, height: logoH });
      tx = L + lw + 12;
    }
    text("My Life Services, Inc.", tx, y - 10, { size: 8.5, f: bold, color: MUTED });
    text("Billable Hours by Day", tx, y - 30, { size: 16, f: bold, color: BRAND });
    y -= logoH + 20;
    text(firstLast(c.name), L, y, { size: 13, f: bold });
    const auth = authorized && c.authKey ? authorized[c.authKey] : null;
    right(
      `billable ${hrs(c.totalMin)}${auth ? ` of ${auth.hours}h authorized for ${authMonthLabel}` : ""}`,
      y, 9.5,
    );
    y -= 16;
    text(monthName, L, y, { size: 11, f: bold, color: MUTED });
    right(`Generated ${generatedOn}`, y, 8.5);
    y -= 14;

    const cellW = (R - L) / 7;
    const headH = 16;
    const weeks = Math.ceil((firstCol + daysInMonth) / 7);
    const cellH = Math.max(44, Math.min(64, (y - 300) / weeks));
    for (let i = 0; i < 7; i++) {
      page.drawRectangle({ x: L + i * cellW, y: y - headH, width: cellW, height: headH, color: HEAD_BG, borderColor: GRID, borderWidth: 0.5 });
      const w = bold.widthOfTextAtSize(WEEKDAYS[i], 8);
      text(WEEKDAYS[i], L + i * cellW + (cellW - w) / 2, y - headH + 4.5, { size: 8, f: bold, color: MUTED });
    }
    y -= headH;
    let day = 1;
    for (let w = 0; w < weeks; w++) {
      for (let i = 0; i < 7; i++) {
        const x = L + i * cellW;
        const inMonth = (w > 0 || i >= firstCol) && day <= daysInMonth;
        const d = inMonth ? c.days.get(day) : null;
        page.drawRectangle({
          x, y: y - cellH, width: cellW, height: cellH,
          color: d?.flagged ? AMBER_BG : undefined,
          borderColor: GRID, borderWidth: 0.5,
        });
        if (inMonth) {
          text(String(day), x + 4, y - 11, { size: 7.5, color: MUTED });
          if (d) {
            const v = (d.billableMin / 60).toFixed(2);
            const vw = bold.widthOfTextAtSize(v, 12);
            text(v, x + (cellW - vw) / 2, y - cellH / 2 - 5, { size: 12, f: bold, color: d.flagged || d.billableMin === 0 ? AMBER : INK });
          }
          if (d?.flagged) text("flagged", x + 4, y - cellH + 4, { size: 6.5, f: italic, color: AMBER });
          day++;
        }
      }
      y -= cellH;
    }
    y -= 14;
    for (const piece of wrapAt(
      "Each figure is the day's total billable hours for this client, with the reviewer's corrected figure in place where one was set. A shaded day holds a flagged shift. The next page breaks every day into its shifts.",
      R - L, font, 8,
    )) {
      text(piece, L, y, { size: 8, color: MUTED });
      y -= 11;
    }

    // ---------- the breakdown page ----------
    const activeDays = [...c.days.entries()].sort((a, b) => a[0] - b[0]);
    if (!activeDays.length) continue;
    newPage();
    text(`${firstLast(c.name)} - day by day`, L, y, { size: 12, f: bold });
    y -= 14;
    text(`${monthName} · ${activeDays.length} day${activeDays.length === 1 ? "" : "s"} with billed service`, L, y, { size: 9, color: MUTED });
    y -= 16;
    for (const [n, d] of activeDays) {
      need(38);
      page.drawLine({ start: { x: L, y: y + 3 }, end: { x: R, y: y + 3 }, thickness: 0.5, color: GRID });
      y -= 12;
      const dateLabel = `${String(mo.month + 1).padStart(2, "0")}/${String(n).padStart(2, "0")}/${String(mo.year).slice(2)}`;
      text(dateLabel, L, y, { size: 9.5, f: bold });
      const wordsPart = minsWords(d.billableMin);
      right(
        `${hrs(d.billableMin)}${wordsPart ? ` (${wordsPart})` : ""}`,
        y, 9, d.flagged || d.corrected ? bold : font, d.flagged || d.corrected ? AMBER : MUTED,
      );
      y -= 13;
      for (const s of d.shifts) {
        need(14);
        const span = s.from != null && s.to != null ? `${clockLabel(s.from)}-${clockLabel(s.to)}` : "no booked span";
        text(span, L + 12, y, { size: 8.5, color: MUTED });
        text(s.who, L + 110, y, { size: 8.5 });
        const fig = s.corrected ? `${hrs(s.billableMin)} corrected from ${hrs(s.billedMin)}` : hrs(s.billableMin);
        text(fig, L + 300, y, { size: 8.5, f: s.corrected ? bold : font, color: s.corrected ? AMBER : INK });
        if (s.decision === "flagged") right("FLAGGED", y, 8, bold, AMBER);
        else if (s.decision === "approved") right("approved", y, 8, font, GREEN);
        y -= 11.5;
      }
      y -= 5;
    }
  }

  const pages = doc.getPages();
  pages.forEach((pg, i) =>
    pg.drawText(`Page ${i + 1} of ${pages.length}`, { x: R - 70, y: 30, size: 7.5, font, color: MUTED }),
  );
  return doc.save();
}
