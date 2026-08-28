// The flagged shifts of one pay period, as a document.
//
// Mánu 2026-08-28, having reviewed the whole period: "I need to have an option
// to generate a report based on my findingss. for now just the ones i flagged."
// A finding that lives only inside the audit screen goes nowhere; a PDF can be
// attached to an email or dropped in a folder, which is what actually gets
// used - the same reasoning as the payout report next door.
//
// THE FIGURES ARE THE ONES THAT WERE DECIDED ON. ShiftReview copies billed and
// clocked in as they stood when the flag was recorded, and this report prints
// those, not a recomputation - what was flagged is what the reviewer saw.
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
// Everything the document will say, computed here so a test can read it
// without parsing a PDF. `flags` carry the stored decision figures plus the
// display name the caller resolved: { who, date, startMin, client, service,
// billedMin, clockedMin, reason, decidedByName, decidedOn }.
export function flagReportModel({ periodFrom, periodTo, flags = [], approved = [], generatedOn }) {
  // over, under, level and unclocked are different findings and the summary
  // counts them apart - his flags include under-billing, and folding those
  // into "over" would misreport what he found
  let over = 0, overMin = 0, under = 0, underMin = 0, level = 0, noClock = 0;
  for (const f of flags) {
    if (f.clockedMin == null || f.billedMin == null) { noClock++; continue; }
    const d = f.billedMin - f.clockedMin;
    if (d > 0) { over++; overMin += d; }
    else if (d < 0) { under++; underMin += -d; }
    else level++;
  }

  const parts = [];
  if (over) parts.push(`${over} bill above their clock, ${hrs(overMin)} in total`);
  if (under) parts.push(`${under} bill below it, ${hrs(underMin)}`);
  if (level) parts.push(`${level} match${level === 1 ? "es" : ""} the clock`);
  if (noClock) parts.push(`${noClock} ${noClock === 1 ? "has" : "have"} no clock to compare`);

  // one group per person, people in surname order, each person's flags in day
  // order - the order somebody works a pile in
  const byWho = new Map();
  for (const f of flags) {
    if (!byWho.has(f.who)) byWho.set(f.who, []);
    byWho.get(f.who).push(f);
  }
  const groups = [...byWho.entries()]
    .map(([who, list]) => ({
      who,
      entries: list
        .sort((a, b) => dayKey(a.date) - dayKey(b.date) || (a.startMin ?? 0) - (b.startMin ?? 0))
        .map((f) => {
          const when = [f.date, f.startMin != null ? clockLabel(f.startMin) : null, f.client, f.service]
            .filter(Boolean)
            .join(" · ");
          let figures;
          if (f.clockedMin == null || f.billedMin == null) {
            figures = `billed ${f.billedMin == null ? "-" : hrs(f.billedMin)} · not clocked`;
          } else {
            const d = f.billedMin - f.clockedMin;
            figures = `billed ${hrs(f.billedMin)} · clocked ${hrs(f.clockedMin)}`
              + (d > 0 ? ` · ${hrs(d)} above the clock` : d < 0 ? ` · ${hrs(-d)} below the clock` : "");
          }
          return { when, figures, quote: (f.reason || "").trim() };
        }),
    }))
    .sort((a, b) => a.who.localeCompare(b.who));

  // who recorded them, for the footer - one name in the ordinary case, spelled
  // out when more than one account decided. A name that is the start of
  // another is the same person under a shorter account name - Mánu's two
  // accounts read "Mánu" and "Mánu Uribe", and printing both says two people
  // reviewed when one did.
  const raw = [...new Set(flags.map((f) => f.decidedByName).filter(Boolean))];
  const names = raw.filter((n) => !raw.some((m) => m !== n && m.startsWith(n + " ")));
  const decidedOn = [...new Set(flags.map((f) => f.decidedOn).filter(Boolean))]
    .sort((a, b) => dayKey(a) - dayKey(b));

  // THE APPROVED, COMPACT ON PURPOSE. Mánu: "should be basic for the approved
  // so it doesnt take so much room" - a count, the hours, and one name-and-
  // count run, because the approved pile is the large uneventful one and the
  // flags are what the reader came for.
  const perApproved = new Map();
  let approvedMin = 0;
  for (const a of approved) {
    perApproved.set(a.who, (perApproved.get(a.who) || 0) + 1);
    approvedMin += a.billedMin || 0;
  }
  const approvedOut = approved.length
    ? {
      count: approved.length,
      line: `${approved.length} shift${approved.length === 1 ? "" : "s"} · ${hrs(approvedMin)} billed`,
      names: [...perApproved.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([who, n]) => `${who} ${n}`),
    }
    : null;

  return {
    title: "Service audit - flagged shifts",
    period: `Pay period ${periodFrom} to ${periodTo}`,
    generated: `Generated ${generatedOn}`,
    summary: flags.length
      ? [`${flags.length} shift${flags.length === 1 ? "" : "s"} flagged on review.`,
         parts.length ? `${parts.join("; ")}.` : ""].filter(Boolean)
      : ["No shifts are flagged in this period."],
    groups,
    approved: approvedOut,
    footer: names.length
      ? `Flags recorded by ${names.join(" and ")}${decidedOn.length
          ? decidedOn.length === 1
            ? ` on ${decidedOn[0]}`
            : ` between ${decidedOn[0]} and ${decidedOn[decidedOn.length - 1]}`
          : ""}.`
      : null,
  };
}

// ---------------------------------------------------------------- the PDF
//
// The payout report's page, margins and palette, so the two documents read as
// one set when they land in the same folder.
const LOGO_PATH = path.join(process.cwd(), "public", "logo", "MLSlogo.png");
const PAGE_W = 612;
const PAGE_H = 792;
const L = 40;
const R = PAGE_W - 40;
const INK = rgb(0.05, 0.05, 0.05);
const MUTED = rgb(0.42, 0.47, 0.53);
const BRAND = rgb(0.086, 0.325, 0.529);
const FLAG = rgb(0.7, 0.11, 0.11);
const GRID = rgb(0.75, 0.79, 0.83);

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

export async function renderFlagReport(model) {
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

  newPage(true);

  for (const g of model.groups) {
    need(30);
    page.drawLine({ start: { x: L, y: y + 3 }, end: { x: R, y: y + 3 }, thickness: 0.5, color: GRID });
    y -= 12;
    text(g.who, L, y, { size: 10.5, f: bold });
    const n = `${g.entries.length} shift${g.entries.length === 1 ? "" : "s"}`;
    text(n, R - font.widthOfTextAtSize(n, 9), y, { size: 9, color: MUTED });
    y -= 15;
    for (const e of g.entries) {
      const quoteLines = e.quote ? wrapAt(`"${e.quote}"`, R - L - 24, italic, 9) : [];
      need(26 + quoteLines.length * 12);
      text(e.when, L + 12, y, { size: 9, f: bold });
      y -= 12;
      text(e.figures, L + 12, y, { size: 9 });
      y -= 12;
      for (const q of quoteLines) {
        text(q, L + 24, y, { size: 9, f: italic, color: FLAG });
        y -= 12;
      }
      y -= 6;
    }
  }

  if (model.approved) {
    const run = model.approved.names.join(" · ");
    const runLines = wrapAt(run, R - L, font, 8.5);
    need(34 + runLines.length * 11);
    page.drawLine({ start: { x: L, y: y + 3 }, end: { x: R, y: y + 3 }, thickness: 0.5, color: GRID });
    y -= 12;
    text("Approved", L, y, { size: 10.5, f: bold });
    text(model.approved.line, R - font.widthOfTextAtSize(model.approved.line, 9), y, { size: 9, color: MUTED });
    y -= 15;
    for (const line of runLines) {
      text(line, L, y, { size: 8.5, color: MUTED });
      y -= 11;
    }
  }

  if (model.footer) {
    need(24);
    y -= 8;
    text(model.footer, L, y, { size: 8.5, color: MUTED });
  }

  return doc.save();
}
