// Each client's billable hours against their monthly authorization, as a
// document.
//
// Mánu 2026-08-31: "the report showing the billable hours per client. i want
// it to be nice MLS coated. I want it to have the client name, authorised
// hours, billable hours, hours remaining. then another one called detailed x
// report that shows the same thing then a sub category showing each of those
// hours per employee breakdown with the dates."
//
// So: one model, two renderings. The summary is the four-column table; the
// detailed report prints the same clients with every shift under them, per
// employee, dated. Billable is the billed figure with the reviewer's
// corrections in place - the same arithmetic as the by-client view on screen,
// fed by the same build, so the document can never disagree with it.
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { clockLabel } from "./schedule-notes.js";

const hrs = (m) => `${(m / 60).toFixed(2)}h`;

const dayKey = (d) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(d || "");
  return m ? Number(m[3]) * 10000 + Number(m[1]) * 100 + Number(m[2]) : 0;
};

// ---------------------------------------------------------------- the model
//
// `rows` are the audit build's rows; `authorized` maps authKey -> { hours }.
export function clientHoursModel({
  periodFrom,
  periodTo,
  monthLabel,
  rows = [],
  authorized = null,
  detailed = false,
  generatedOn,
}) {
  const byClient = new Map();
  for (const r of rows) {
    const name = r.client || "No client on the booking";
    let g = byClient.get(name);
    if (!g) {
      g = { name, authKey: r.authKey || null, billableMin: 0, adjusted: 0, byWho: new Map() };
      byClient.set(name, g);
    }
    const billable = r.review?.billableMin ?? r.billedMin ?? 0;
    g.billableMin += billable;
    if (r.review?.billableMin != null) g.adjusted++;
    if (!g.authKey && r.authKey) g.authKey = r.authKey;
    const staffName = r.whoLegal || r.who; // legal names on documents
    if (!g.byWho.has(staffName)) g.byWho.set(staffName, []);
    // the billed window, whole - "12:30p-3p", not just where it starts. Mánu
    // 2026-08-31: "i want the timeframe of when is worked not just the start
    // time." The roster's booking is what the billed figure covers.
    g.byWho.get(staffName).push({
      date: r.date,
      start: r.schedFrom ?? r.startMin ?? null,
      end: r.schedTo ?? null,
      billableMin: billable,
      adjusted: r.review?.billableMin != null,
      adjustedBy: r.review?.billableMin != null ? r.review?.byLegal || null : null,
      // the window the correction was typed as, when the reviewer used the
      // time entry - printed beside the adjusted figure
      adjustedFrom: r.review?.billableMin != null ? r.review?.billableFrom ?? null : null,
      adjustedTo: r.review?.billableMin != null ? r.review?.billableTo ?? null : null,
    });
  }

  let withAuth = 0;
  let totalBillable = 0;
  const clients = [...byClient.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((g) => {
      const auth = authorized && g.authKey ? authorized[g.authKey] : null;
      if (auth) withAuth++;
      totalBillable += g.billableMin;
      const authorizedMin = auth ? Math.round(auth.hours * 60) : null;
      return {
        name: g.name,
        authorizedMin,
        billableMin: g.billableMin,
        remainingMin: authorizedMin != null ? authorizedMin - g.billableMin : null,
        adjusted: g.adjusted,
        employees: detailed
          ? [...g.byWho.entries()]
            .map(([who, entries]) => ({
              who,
              totalMin: entries.reduce((n, e) => n + e.billableMin, 0),
              entries: entries
                .sort((a, b) => dayKey(a.date) - dayKey(b.date) || (a.start ?? 0) - (b.start ?? 0))
                .map((e) => ({
                  when: [
                    e.date,
                    e.start != null
                      ? e.end != null
                        ? `${clockLabel(e.start)}-${clockLabel(e.end)}`
                        : clockLabel(e.start)
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                  figure:
                    hrs(e.billableMin)
                    + (e.adjusted
                      ? e.adjustedFrom != null && e.adjustedTo != null
                        ? ` (adjusted to ${clockLabel(e.adjustedFrom)}-${clockLabel(e.adjustedTo)} by ${e.adjustedBy || "the reviewer"})`
                        : ` (adjusted by ${e.adjustedBy || "the reviewer"})`
                      : ""),
                })),
            }))
            .sort((a, b) => a.who.localeCompare(b.who))
          : null,
      };
    });

  const summary = [
    `${clients.length} clients were billed for in this pay period, ${hrs(totalBillable)} billable in total.`,
    monthLabel && withAuth
      ? `Authorized hours are each client's monthly allowance from the ${monthLabel} Budget Capture Report; ${withAuth} of ${clients.length} clients have one on file. Remaining is that allowance minus the billable hours of this period alone.`
      : "No Budget Capture Report covering this period's month is on file, so the authorized and remaining columns are empty.",
  ];
  const adjustedTotal = clients.reduce((n, c) => n + c.adjusted, 0);
  if (adjustedTotal) {
    summary.push(
      `Billable carries the reviewer's corrected figure on ${adjustedTotal} shift${adjustedTotal === 1 ? "" : "s"} and the billed figure everywhere else.`,
    );
  }

  return {
    title: detailed ? "Client Billable Hours - Detailed" : "Client Billable Hours",
    period: `Pay period ${periodFrom} to ${periodTo}`,
    generated: `Generated ${generatedOn}`,
    summary,
    detailed,
    clients,
  };
}

// ------------------------------------------------------------- the document
//
// The payout report's page, margins and palette, so the family of documents
// reads as one set when they land in the same folder.
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
const OVER = rgb(0.7, 0.11, 0.11);
const GRID = rgb(0.75, 0.79, 0.83);
const WHITE = rgb(1, 1, 1);

// widths sum to exactly R - L (532)
const COLS = [
  ["Client", 232, false],
  ["Authorized / month", 108, true],
  ["Billable", 90, true],
  ["Remaining", 102, true],
];

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

export async function renderClientHoursReport(model) {
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
  const text = (s, x, yy, { size = 9, f = font, color = INK } = {}) =>
    page.drawText(String(s), { x, y: yy, size, font: f, color });

  const newPage = (first = false) => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - 48;
    if (!first) return;
    const logoH = 42;
    let tx = L;
    if (logo) {
      const lw = (logo.width / logo.height) * logoH;
      page.drawImage(logo, { x: L, y: y - logoH, width: lw, height: logoH });
      tx = L + lw + 14;
    }
    text("My Life Services, Inc.", tx, y - 12, { size: 8.5, f: bold, color: MUTED });
    text(model.title, tx, y - 35, { size: 17, f: bold, color: BRAND });
    y -= logoH + 15;
    text(model.period, L, y, { size: 11, f: bold });
    text(model.generated, R - font.widthOfTextAtSize(model.generated, 9), y, { size: 9, color: MUTED });
    y -= 16;
    for (const line of model.summary) {
      for (const piece of wrapAt(line, R - L, font, 9.5)) {
        text(piece, L, y, { size: 9.5 });
        y -= 13;
      }
    }
    y -= 6;
  };
  const need = (h) => { if (y - h < 48) newPage(); };

  const remainingCell = (c) => {
    if (c.remainingMin == null) return { s: "-", color: MUTED, f: font };
    if (c.remainingMin < 0) return { s: `${hrs(c.remainingMin)} over`, color: OVER, f: bold };
    return { s: hrs(c.remainingMin), color: INK, f: font };
  };

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

  newPage(true);

  if (!model.detailed) {
    // -------------------------------------------------- the four-column table
    drawHead();
    model.clients.forEach((c, i) => {
      const rowH = 15;
      if (y - rowH < 48) { newPage(); drawHead(); }
      if (i % 2 === 1) page.drawRectangle({ x: L, y: y - rowH + 4, width: R - L, height: rowH, color: ROWALT });
      const rem = remainingCell(c);
      const cells = [
        { s: c.name, f: font, color: INK },
        { s: c.authorizedMin == null ? "-" : hrs(c.authorizedMin), f: font, color: c.authorizedMin == null ? MUTED : INK },
        { s: hrs(c.billableMin), f: c.adjusted ? bold : font, color: INK },
        rem,
      ];
      let x = L;
      COLS.forEach(([, w, numeric], k) => {
        const cell = cells[k];
        const cx = numeric ? x + w - 5 - cell.f.widthOfTextAtSize(cell.s, 8.5) : x + 5;
        text(cell.s, cx, y - 7, { size: 8.5, f: cell.f, color: cell.color });
        x += w;
      });
      y -= rowH;
    });
    page.drawLine({ start: { x: L, y: y + 4 }, end: { x: R, y: y + 4 }, thickness: 0.8, color: GRID });
  } else {
    // ------------------------------- one block per client, dated per employee
    for (const c of model.clients) {
      need(46);
      page.drawLine({ start: { x: L, y: y + 3 }, end: { x: R, y: y + 3 }, thickness: 0.5, color: GRID });
      y -= 13;
      text(c.name, L, y, { size: 10.5, f: bold });
      const rem = remainingCell(c);
      const figures = [
        `authorized ${c.authorizedMin == null ? "-" : hrs(c.authorizedMin)}`,
        `billable ${hrs(c.billableMin)}`,
      ].join(" · ");
      const remLabel = `remaining ${rem.s}`;
      const figW = font.widthOfTextAtSize(figures + " · ", 9);
      text(figures + " · ", R - figW - rem.f.widthOfTextAtSize(remLabel, 9), y, { size: 9, color: MUTED });
      text(remLabel, R - rem.f.widthOfTextAtSize(remLabel, 9), y, { size: 9, f: rem.f, color: rem.color === INK ? MUTED : rem.color });
      y -= 15;
      for (const e of c.employees) {
        need(16 + e.entries.length * 12);
        text(e.who, L + 12, y, { size: 9, f: bold });
        const t = hrs(e.totalMin);
        text(t, R - font.widthOfTextAtSize(t, 9), y, { size: 9, f: bold });
        y -= 12;
        for (const en of e.entries) {
          need(14);
          text(en.when, L + 24, y, { size: 8.5, color: MUTED });
          text(en.figure, L + 200, y, { size: 8.5 });
          y -= 11;
        }
        y -= 4;
      }
      y -= 4;
    }
  }

  return doc.save();
}
