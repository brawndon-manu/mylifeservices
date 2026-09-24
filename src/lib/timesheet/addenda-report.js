// THE CLOCK ADDENDA OF ONE PAY PERIOD, as a document.
//
// the audit card shows an addendum on its own shift. this prints every one on
// the period in one place, the way the flagged shifts print: whose shift, what
// the addendum set, who signed, who approved, what was corrected in QSClock.
// one document to hand over beside the signed forms themselves, which stay
// where they are and open from each shift's card.
//
// THE FIGURES ARE THE ONES THE AUDIT BILLS. the roster's figure and the signed
// window print side by side, because the gap between them is what the
// addendum exists to close and what a reader wants to see closed.
//
// the model is plain values, so a test reads it without parsing a PDF. the
// assembly from the audit build is here too, so the route and a rehearsal
// script cannot disagree about what an entry says.
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { clockLabel } from "./schedule-notes.js";
import { pdfText } from "./flag-report.js";
import { formNumber, missingPunchText, signerLabel, firstLast } from "../clock-amendment/rules.js";
import { deviceLabel, viaLine } from "../clock-amendment/device.js";

const hrs = (m) => `${(m / 60).toFixed(2)}h`;
const dayKey = (d) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(d || "");
  return m ? Number(m[3]) * 10000 + Number(m[1]) * 100 + Number(m[2]) : 0;
};

// ------------------------------------------------------------- the assembly
//
// one entry per approved addendum on the audit rows, and one per addendum out
// and not yet approved. `details` holds the ClockAmendment rows by id (with
// approvedBy and recipient joined), `titleOf` the roles by employee key,
// `stamp` and `day` format a date in company time.
export function assembleAddenda({ rows = [], details = new Map(), titleOf = new Map(), stamp = (d) => (d ? String(d) : null), day = (d) => (d ? String(d) : null) }) {
  const addenda = [];
  const pending = [];
  for (const r of rows) {
    if (r.amendment) {
      const v = r.amendment;
      const a = details.get(v.id) || null;
      addenda.push({
        who: r.whoLegal || r.who,
        title: titleOf.get(r.employeeKey) || null,
        date: r.date,
        startMin: r.startMin ?? null,
        client: firstLast(r.client),
        service: r.service || null,
        number: a ? formNumber(a) : null,
        headline: a ? missingPunchText(a) : null,
        rosterMin: r.billedMin ?? null,
        billableMin: v.min ?? null,
        from: v.from ?? null, to: v.to ?? null, wasFrom: v.wasFrom ?? null, wasTo: v.wasTo ?? null,
        inChanged: !!v.inChanged, outChanged: !!v.outChanged,
        placeIn: v.placeIn || null, placeOut: v.placeOut || null,
        reason: a?.reasonText || a?.intakeReasonText || null,
        signedBy: a?.filledName || v.signedBy || null,
        signedAt: stamp(a?.filledAt),
        signedDevice: a?.filledUa ? deviceLabel(a.filledUa) : null,
        clientSigner: a?.clientSigner || null,
        clientSignerKind: a?.clientSignerKind ? signerLabel(a.clientSignerKind) : null,
        clientSignedAt: stamp(a?.clientSignedAt),
        clientVia: a?.clientSignedVia ? viaLine(a.clientSignedVia) : null,
        clientUnavailable: a?.clientUnavailableReason || null,
        approvedBy: a?.approvedBy?.name || v.byLegal || v.by || null,
        approvedAt: stamp(a?.approvedAt || v.at),
        approvalNote: a?.approvalNote || null,
        qspFixedIn: a?.qspFixedIn || null,
        qspFixedTo: a?.qspFixedTo || null,
        qspFixedAt: a?.qspFixedAt ? day(a.qspFixedAt) : null,
      });
    } else if (r.pending) {
      const p = r.pending;
      const a = details.get(p.id) || null;
      pending.push({
        who: r.whoLegal || r.who,
        date: r.date,
        startMin: r.startMin ?? null,
        client: firstLast(r.client),
        service: r.service || null,
        number: a ? formNumber(a) : null,
        line: p.line || null,
        sentAt: p.sentAt ? day(p.sentAt) : null,
        to: p.to || null,
      });
    }
  }
  return { addenda, pending };
}

// ---------------------------------------------------------------- the model
//
// entries: { who, title, date, startMin, client, service, number, headline,
// rosterMin, billableMin, from, to, wasFrom, wasTo, inChanged, outChanged,
// placeIn, placeOut, reason, signedBy, signedAt, signedDevice, clientSigner,
// clientSignerKind, clientSignedAt, clientVia, clientUnavailable, approvedBy,
// approvedAt, approvalNote, qspFixedIn, qspFixedTo, qspFixedAt }. stamps are
// already strings in company time.
export function addendaReportModel({ periodFrom, periodTo, generatedOn, addenda = [], pending = [] }) {
  let up = 0, upMin = 0, down = 0, downMin = 0, level = 0;
  for (const a of addenda) {
    if (a.billableMin == null || a.rosterMin == null) { level++; continue; }
    const d = a.billableMin - a.rosterMin;
    if (d > 0) { up++; upMin += d; }
    else if (d < 0) { down++; downMin += -d; }
    else level++;
  }
  const n = addenda.length;
  const summary = [];
  summary.push(n ? `${n} ${n === 1 ? "addendum" : "addenda"} approved on this period.` : "No addendum has been approved on this period.");
  const parts = [];
  if (up) parts.push(`${up} set${up === 1 ? "s" : ""} more time than the roster billed, ${hrs(upMin)} in all`);
  if (down) parts.push(`${down} set${down === 1 ? "s" : ""} less, ${hrs(downMin)}`);
  if (level) parts.push(`${level} moved no time`);
  if (parts.length) summary.push(`${parts.join("; ")}.`);
  if (pending.length) summary.push(`${pending.length} more ${pending.length === 1 ? "is" : "are"} out and not yet approved, and ${pending.length === 1 ? "moves" : "move"} no figure until then.`);
  summary.push("Each approved addendum is on file as a signed document and opens from the shift's card. The billed hours on the audit, the workbook and the client reports follow it.");

  const byWho = new Map();
  for (const a of addenda) {
    if (!byWho.has(a.who)) byWho.set(a.who, []);
    byWho.get(a.who).push(a);
  }
  const groups = [...byWho.entries()]
    .map(([who, list]) => ({
      who,
      title: list.find((a) => a.title)?.title || null,
      entries: list
        .sort((x, y) => dayKey(x.date) - dayKey(y.date) || (x.startMin ?? 0) - (y.startMin ?? 0))
        .map((a) => ({
          when: [a.date, a.startMin != null ? clockLabel(a.startMin) : null, a.client, a.service, a.number].filter(Boolean).join(" · "),
          headline: a.headline ? `The clock shows they ${a.headline}.` : null,
          changed: changedLine(a),
          signatures: signaturesLine(a),
          approval: approvalLine(a),
          quote: (a.reason || "").trim(),
        })),
    }))
    .sort((x, y) => x.who.localeCompare(y.who));

  const pendingEntries = [...pending]
    .sort((x, y) => x.who.localeCompare(y.who) || dayKey(x.date) - dayKey(y.date))
    .map((p) => ({
      when: [p.who, p.date, p.startMin != null ? clockLabel(p.startMin) : null, p.client, p.service, p.number].filter(Boolean).join(" · "),
      line: [p.line, p.sentAt ? `sent ${p.sentAt}` : null, p.to ? `to ${p.to}` : null].filter(Boolean).join(", "),
    }));

  return {
    title: "Clock addenda",
    period: `${periodFrom} to ${periodTo}`,
    generated: `Generated ${generatedOn}`,
    summary,
    groups,
    pending: pendingEntries.length ? { line: `${pendingEntries.length} out, not yet approved`, entries: pendingEntries } : null,
    footer: "An addendum adds a signed record to the clock; the punches the export holds are never changed. Amend nothing, add the evidence.",
  };
}

function changedLine(a) {
  const parts = [];
  if (a.inChanged && a.from != null) parts.push(`Clock-in ${clockLabel(a.from)} by addendum${a.wasFrom != null ? ` (the clock had ${clockLabel(a.wasFrom)})` : " (no clock-in was recorded)"}`);
  if (a.outChanged && a.to != null) parts.push(`Clock-out ${clockLabel(a.to)} by addendum${a.wasTo != null ? ` (the clock had ${clockLabel(a.wasTo)})` : " (no clock-out was recorded)"}`);
  if (!parts.length) {
    parts.push(
      a.placeIn && a.placeOut ? "Where they were at both punches attested"
        : a.placeIn ? "Where they were at clock-in attested"
          : a.placeOut ? "Where they were at clock-out attested"
            : "Addendum on the clock record",
    );
  }
  if (a.billableMin != null) {
    parts.push(`billable ${hrs(a.billableMin)}${a.rosterMin != null && a.rosterMin !== a.billableMin ? `, the roster billed ${hrs(a.rosterMin)}` : ""}`);
  }
  return parts.join(" · ");
}

function signaturesLine(a) {
  const staff = `Signed by ${a.signedBy || "the staff member"}${a.signedAt ? ` ${a.signedAt}` : ""}${a.signedDevice ? `, ${a.signedDevice}` : ""}`;
  let served;
  if (a.clientSigner) {
    served = `${a.clientSigner}${a.clientSignerKind ? `, ${a.clientSignerKind.toLowerCase()}` : ""}${a.clientSignedAt ? ` ${a.clientSignedAt}` : ""}${a.clientVia ? `, ${a.clientVia.toLowerCase()}` : ""}`;
  } else if (a.clientUnavailable) {
    served = `Nobody was available to sign: ${a.clientUnavailable}`;
  } else {
    served = "Person served: not collected";
  }
  return `${staff} · ${served}`;
}

function approvalLine(a) {
  const parts = [`Approved by ${a.approvedBy || "the office"}${a.approvedAt ? ` ${a.approvedAt}` : ""}`];
  if (a.qspFixedIn || a.qspFixedTo) {
    const fixes = [a.qspFixedIn ? `clock-in corrected to ${a.qspFixedIn}` : null, a.qspFixedTo ? `clock-out corrected to ${a.qspFixedTo}` : null].filter(Boolean).join(", ");
    parts.push(`QSClock ${fixes}${a.qspFixedAt ? ` on ${a.qspFixedAt}` : ""}`);
  } else {
    parts.push("the punches stand as recorded");
  }
  if (a.approvalNote) parts.push(`note: ${a.approvalNote}`);
  return parts.join(" · ");
}

// --------------------------------------------------------------- the document
//
// same page, margins and palette as the flagged shifts report, so the two read
// as one set when they sit in a folder together.
const LOGO_PATH = path.join(process.cwd(), "public", "logo", "MLSlogo.png");
const PAGE_W = 612;
const PAGE_H = 792;
const L = 40;
const R = PAGE_W - 40;
const INK = rgb(0.05, 0.05, 0.05);
const MUTED = rgb(0.42, 0.47, 0.53);
const BRAND = rgb(0.086, 0.325, 0.529);
const GRID = rgb(0.75, 0.79, 0.83);

function wrapAt(str, maxW, font, size) {
  str = pdfText(str);
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

export async function renderAddendaReport(model) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  let logo = null;
  try { logo = await doc.embedPng(fs.readFileSync(LOGO_PATH)); } catch { /* decorative */ }

  let page = null;
  let y = 0;
  const text = (s, x, yy, { size = 9, f = font, color = INK } = {}) => page.drawText(pdfText(s), { x, y: yy, size, font: f, color });
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
      for (const piece of wrapAt(line, R - L, font, 9.5)) { text(piece, L, y, { size: 9.5 }); y -= 13; }
    }
    y -= 6;
  };
  const need = (h) => { if (y - h < 48) newPage(); };
  const para = (s, { size = 8.5, f = font, color = MUTED, indent = 12 } = {}) => {
    for (const piece of wrapAt(s, R - L - indent, f, size)) { need(size + 4); text(piece, L + indent, y, { size, f, color }); y -= size + 3; }
  };

  newPage(true);

  for (const g of model.groups) {
    need(30);
    page.drawLine({ start: { x: L, y: y + 3 }, end: { x: R, y: y + 3 }, thickness: 0.5, color: GRID });
    y -= 12;
    text(g.who + (g.title ? `  ·  ${g.title}` : ""), L, y, { size: 10.5, f: bold });
    const n = `${g.entries.length} addend${g.entries.length === 1 ? "um" : "a"}`;
    text(n, R - font.widthOfTextAtSize(n, 9), y, { size: 9, color: MUTED });
    y -= 15;
    for (const e of g.entries) {
      need(60);
      text(e.when, L + 12, y, { size: 9, f: bold });
      y -= 12;
      if (e.headline) para(e.headline, { size: 9, color: INK });
      para(e.changed, { size: 9, color: BRAND });
      para(e.signatures, { size: 8.5 });
      para(e.approval, { size: 8.5 });
      if (e.quote) para(`"${e.quote}"`, { size: 9, f: italic, color: INK, indent: 24 });
      y -= 6;
    }
  }

  if (model.pending) {
    need(34);
    page.drawLine({ start: { x: L, y: y + 3 }, end: { x: R, y: y + 3 }, thickness: 0.5, color: GRID });
    y -= 12;
    text("Out and not yet approved", L, y, { size: 10.5, f: bold });
    text(model.pending.line, R - font.widthOfTextAtSize(model.pending.line, 9), y, { size: 9, color: MUTED });
    y -= 15;
    for (const p of model.pending.entries) {
      need(26);
      text(p.when, L + 12, y, { size: 9, f: bold });
      y -= 12;
      para(p.line, { size: 8.5 });
      y -= 4;
    }
  }

  if (model.footer) {
    need(24);
    y -= 8;
    for (const piece of wrapAt(model.footer, R - L, font, 8.5)) { text(piece, L, y, { size: 8.5, color: MUTED }); y -= 11; }
  }

  return doc.save();
}
