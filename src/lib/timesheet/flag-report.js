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

// THE DETAIL LINE - the facts the one-by-one deck shows, on one small line
// per flag so the document carries them without the clutter of a table.
// Mánu 2026-09-04: "drop downs showing the clients hours billable clocked gps
// geofence similar to the way the one by one has it" - a PDF cannot fold, so
// the detail prints compact instead. QSP records one location fact per punch
// (GPS captured yes/no); that is the same fact the screen's geofence ticks
// read, so the line prints it once as GPS.
function detailLine(f) {
  if (f.punchIn === undefined && f.punchOut === undefined) return null;
  const parts = [];
  if (f.clockAvailable === false) parts.push("no clock export");
  else if (f.inClockExport === false) parts.push("no clock row for this shift");
  else {
    const end = (label, time, missed, gps) => {
      if (time == null && missed) return `no clock-${label}`;
      if (time == null) return null;
      return `${label} ${time}${gps === "yes" ? " GPS yes" : gps === "no" ? " GPS no" : ""}`;
    };
    const a = end("in", f.punchIn, f.noIn, f.gpsIn);
    const b = end("out", f.punchOut, f.noOut, f.gpsOut);
    if (a) parts.push(a);
    if (b) parts.push(b);
  }
  if (f.billableMin != null) parts.push(`billable set ${hrs(f.billableMin)}`);
  return parts.length ? parts.join(" · ") : null;
}

const dayKey = (d) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(d || "");
  return m ? Number(m[3]) * 10000 + Number(m[1]) * 100 + Number(m[2]) : 0;
};

// ---------------------------------------------------------------- the model
//
// Everything the document will say, computed here so a test can read it
// without parsing a PDF. `flags` carry the stored decision figures plus the
// display name the caller resolved: { who, date, startMin, client, service,
// billedMin, clockedMin, reason, decidedByName, decidedOn } - and, where the
// caller joined the audit build, the punch facts for the detail line:
// { punchIn, punchOut, noIn, noOut, gpsIn, gpsOut, clockAvailable,
//   inClockExport, billableMin }.
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
          return { when, figures, detail: detailLine(f), quote: (f.reason || "").trim() };
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

// ------------------------------------------------- the detailed model
//
// The second document: every flag as a full block - the facts the one-by-one
// deck shows - grouped by employee with their role. Mánu picked this shape
// off four mock rounds on 2026-09-04; the layout rulings live in the helpers:
// round hours carry no minutes wording, times print "4:05 PM", the heading
// carries the scheduled range, the billing line prints on EVERY flag (TBD
// when no corrected figure was set), and the reason is a labeled "Flag note"
// signed by whoever said it.

// the hour labels live in hours-label.js so the audit screens spell figures
// the same way this document does; re-exported here for the model's tests
import { ampmLabel, minsWords } from "./hours-label.js";
export { ampmLabel, minsWords };

// `flags` carry the stored decision plus what the caller joined off the audit
// build: title (role), schedFrom/schedTo, originalFrom/originalTo, punches,
// gps, note texts. Everything the document says is computed here so tests
// read the model, never the PDF.
export function flagReportDetailModel({ periodFrom, periodTo, flags = [], generatedOn }) {
  const byWho = new Map();
  for (const f of flags) {
    if (!byWho.has(f.who)) byWho.set(f.who, { who: f.who, title: f.title || null, list: [] });
    byWho.get(f.who).list.push(f);
  }

  const figure = (label, m) => ({ label, h: m == null ? null : hrs(m), mins: minsWords(m) });

  const groups = [...byWho.values()]
    .map((g) => ({
      who: g.who,
      title: g.title,
      count: `${g.list.length} shift${g.list.length === 1 ? "" : "s"}`,
      entries: g.list
        .sort((a, b) => dayKey(a.date) - dayKey(b.date) || (a.startMin ?? 0) - (b.startMin ?? 0))
        .map((f) => {
          const joined = f.punchIn !== undefined || f.punchOut !== undefined;
          const span =
            f.schedFrom != null && f.schedTo != null
              ? `${ampmLabel(f.schedFrom)} - ${ampmLabel(f.schedTo)}`
              : f.startMin != null
                ? ampmLabel(f.startMin)
                : null;
          const schedMin =
            f.originalFrom != null && f.originalTo != null ? f.originalTo - f.originalFrom : null;
          const d =
            f.billedMin != null && f.clockedMin != null ? f.billedMin - f.clockedMin : null;
          let clock = null;
          if (joined) {
            if (f.clockAvailable === false) clock = { note: "no clock export for this period" };
            else if (f.inClockExport === false) clock = { note: "no clock row for this shift" };
            else {
              clock = {
                rows: ["in", "out"].map((end) => {
                  const t = end === "in" ? f.punchIn : f.punchOut;
                  const missed = end === "in" ? f.noIn : f.noOut;
                  const gps = end === "in" ? f.gpsIn : f.gpsOut;
                  const inherited = end === "in" ? f.inheritedIn : f.inheritedOut;
                  return {
                    end,
                    // a shared session's boundary is a time, never a tick
                    mark: inherited ? null : t != null ? "yes" : missed ? "no" : null,
                    time: t != null ? ampmLabel(t) : null,
                    gps: gps === "yes" ? "yes" : gps === "no" ? "no" : null,
                  };
                }),
                session: f.sharedSession
                  ? `one session ${ampmLabel(f.sharedSession.from)} - ${ampmLabel(f.sharedSession.to)} across ${f.sharedSession.parts} bookings`
                  : null,
              };
            }
          }
          return {
            client: f.client || "no client on the booking",
            service: f.service || null,
            dateLine: [f.date, span].filter(Boolean).join("   "),
            figures: [
              figure("Billed", f.billedMin),
              figure("Scheduled", schedMin),
              figure("Clocked", f.clockedMin),
            ],
            delta: d
              ? {
                h: hrs(Math.abs(d)),
                mins: minsWords(Math.abs(d)),
                word: d > 0 ? "above the clock" : "below the clock",
                over: d > 0,
              }
              : null,
            clock,
            billing:
              f.billableMin != null
                ? { set: hrs(f.billableMin), mins: minsWords(f.billableMin), was: f.billedMin == null ? null : hrs(f.billedMin) }
                : { tbd: true },
            serviceNote: f.serviceNote || null,
            // the DSN speaks under its own name - Mánu 2026-09-05
            serviceNoteLabel: f.serviceNoteSource === "dsn" ? "DSN" : "Service note",
            scheduleNote: f.scheduleNote || null,
            flagNote: f.reason
              ? { text: `"${(f.reason || "").trim()}" - ${f.decidedByName || "unknown"}` }
              : null,
          };
        }),
    }))
    .sort((a, b) => a.who.localeCompare(b.who));

  return {
    title: "Service audit - flagged shifts, detailed",
    period: `Pay period ${periodFrom} to ${periodTo}`,
    generated: `Generated ${generatedOn}`,
    summary: flags.length
      ? [`${flags.length} shift${flags.length === 1 ? "" : "s"} flagged on review, grouped by employee.`]
      : ["No shifts are flagged in this period."],
    groups,
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
      const detailLines = e.detail ? wrapAt(e.detail, R - L - 24, font, 8) : [];
      need(26 + (quoteLines.length + detailLines.length) * 12);
      text(e.when, L + 12, y, { size: 9, f: bold });
      y -= 12;
      text(e.figures, L + 12, y, { size: 9 });
      y -= 12;
      for (const d of detailLines) {
        text(d, L + 12, y, { size: 8, color: MUTED });
        y -= 11;
      }
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

// the detailed document. Same page, margins and palette; ZapfDingbats is one
// of the standard fourteen, so the checks and crosses embed without a font
// file. The clock table's columns are FIXED x positions - his ruling off the
// screenshot where 12:30p pushed the GPS marks out of line.
const AMBER = rgb(0.65, 0.42, 0.02);
const GREEN = rgb(0.13, 0.55, 0.3);

export async function renderFlagReportDetail(model) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const dings = await doc.embedFont(StandardFonts.ZapfDingbats);

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
  const mark = (v, x, yy) => {
    if (v === "yes") text("✔", x, yy, { size: 8, f: dings, color: GREEN });
    else if (v === "no") text("✘", x, yy, { size: 8, f: dings, color: FLAG });
    else text("-", x, yy, { size: 8, color: MUTED });
  };
  // a run of differently-styled pieces on one baseline
  const pieces = (segs, x, yy, size) => {
    let cx = x;
    for (const [s, f, c] of segs) {
      if (!s) continue;
      text(s, cx, yy, { size, f, color: c });
      cx += f.widthOfTextAtSize(s, size);
    }
  };

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
      text(line, L, y, { size: 9.5 });
      y -= 13;
    }
    y -= 6;
  };
  const need = (h) => { if (y - h < 48) newPage(); };

  newPage(true);

  const VAL_X = L + 70;
  for (const g of model.groups) {
    need(50);
    page.drawLine({ start: { x: L, y: y + 3 }, end: { x: R, y: y + 3 }, thickness: 0.5, color: GRID });
    y -= 13;
    text(g.who, L, y, { size: 10.5, f: bold });
    if (g.title) text(g.title, L + bold.widthOfTextAtSize(g.who, 10.5) + 10, y, { size: 8, color: MUTED });
    text(g.count, R - font.widthOfTextAtSize(g.count, 9), y, { size: 9, color: MUTED });
    y -= 16;
    for (const e of g.entries) {
      need(70);
      pieces([[e.client, bold, INK], [e.service ? `   ${e.service}` : "", font, MUTED]], L + 12, y, 9);
      y -= 11;
      text(e.dateLine, L + 12, y, { size: 8.5, color: MUTED });
      y -= 13;
      for (const fig of e.figures) {
        text(fig.label, L + 12, y, { size: 8.5, color: MUTED });
        const segs = fig.h == null
          ? [["-", font, MUTED]]
          : [[fig.h, font, INK], [fig.mins ? ` (${fig.mins})` : "", italic, MUTED]];
        if (fig.label === "Clocked" && e.delta) {
          const dColor = e.delta.over ? FLAG : INK;
          segs.push(["   ·   ", font, MUTED]);
          segs.push([e.delta.h, font, dColor]);
          segs.push([e.delta.mins ? ` (${e.delta.mins})` : "", italic, MUTED]);
          segs.push([` ${e.delta.word}`, font, dColor]);
        }
        pieces(segs, VAL_X, y, 8.5);
        y -= 11;
      }
      y -= 2;
      if (e.clock?.note) {
        text(`CLOCK  ${e.clock.note}`, L + 12, y, { size: 8, color: MUTED });
        y -= 11;
      } else if (e.clock?.rows) {
        text("CLOCK", L + 12, y, { size: 7, f: bold, color: MUTED });
        const X = { label: L + 52, punch: L + 74, time: L + 88, gpsLabel: L + 148, gps: L + 168 };
        for (const r of e.clock.rows) {
          text(r.end, X.label, y, { size: 8, color: MUTED });
          mark(r.mark, X.punch, y);
          text(r.time || "-", X.time, y, { size: 8 });
          text("GPS", X.gpsLabel, y, { size: 8, color: MUTED });
          mark(r.gps, X.gps, y);
          y -= 11;
        }
        if (e.clock.session) {
          text(e.clock.session, L + 52, y, { size: 7, f: italic, color: MUTED });
          y -= 10;
        }
      }
      y -= 3;
      if (e.billing.tbd) {
        text("CORRECTED BILLING TBD", L + 12, y, { size: 8.5, f: bold, color: AMBER });
      } else {
        pieces(
          [
            [`CORRECTED BILLING SET ${e.billing.set}`, bold, AMBER],
            [e.billing.mins ? ` (${e.billing.mins})` : "", italic, AMBER],
            [e.billing.was ? `   was billed ${e.billing.was}` : "", font, MUTED],
          ],
          L + 12, y, 8.5,
        );
      }
      y -= 12;
      const noteBlock = (label, txt, cap) => {
        if (!txt) return;
        y -= 2;
        need(24);
        text(label, L + 12, y, { size: 7.5, f: bold, color: MUTED });
        y -= 10;
        const lines = wrapAt(txt, R - L - 24, font, 7.5);
        for (const line of lines.slice(0, cap)) {
          need(10);
          text(line, L + 12, y, { size: 7.5, color: MUTED });
          y -= 9.5;
        }
        if (lines.length > cap) {
          text("(the full note is on the audit screen)", L + 12, y, { size: 7, f: italic, color: MUTED });
          y -= 10;
        }
      };
      noteBlock(e.serviceNoteLabel || "Service note", e.serviceNote, 8);
      noteBlock("Schedule note", e.scheduleNote, 4);
      if (e.flagNote) {
        y -= 2;
        need(24);
        text("Flag note", L + 12, y, { size: 7.5, f: bold, color: FLAG });
        y -= 10;
        for (const q of wrapAt(e.flagNote.text, R - L - 36, italic, 9)) {
          need(11);
          text(q, L + 24, y, { size: 9, f: italic, color: FLAG });
          y -= 11.5;
        }
        y -= 2;
      }
      y -= 8;
    }
  }

  const pages = doc.getPages();
  pages.forEach((pg, i) =>
    pg.drawText(`Page ${i + 1} of ${pages.length}`, { x: R - 70, y: 30, size: 7.5, font, color: MUTED }),
  );
  return doc.save();
}
