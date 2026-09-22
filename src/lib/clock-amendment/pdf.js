// THE DOCUMENT: one shift's amended clock record, with everything that backs it
// up, laid out for an auditor and for the person who signed it.
//
// Built from the record and the bytes handed in, never from anything fetched
// here, so it can be rendered in a test and in a one-off script the same way
// the app renders it. The caller fetches the signatures and the note's pages.
//
// Order on the page is deliberate: the shift as the office holds it, what the
// clock recorded, what the service note says (the proof of service), then the
// amendment itself and who signed for it. The evidence comes before the claim
// so nobody signs a time before seeing what the records already say about it.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { SIGNER_KINDS, formNumber, correctionsOf, evidenceLevel, LATE_MIN } from "./rules.js";
import { COMPANY_TZ } from "../company-time.js";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 54;
const INK = rgb(0.11, 0.11, 0.12);
const MUTED = rgb(0.39, 0.39, 0.41);
const FAINT = rgb(0.62, 0.62, 0.65);
const RULE = rgb(0.85, 0.85, 0.87);
const RED = rgb(0.78, 0.17, 0.16);

const label = (list, key, code) => list.find((x) => x[key] === code)?.label || code || "";

// stamps read in company time wherever the document is built
const STAMP = new Intl.DateTimeFormat("en-US", {
  timeZone: COMPANY_TZ, month: "2-digit", day: "2-digit", year: "2-digit", hour: "numeric", minute: "2-digit",
});
function fmtStamp(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return STAMP.format(dt).replace(",", "");
}

// wrap a paragraph to the column width, word by word
function wrap(text, font, size, width) {
  const words = String(text ?? "").replace(/\s+/g, " ").trim().split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    if (!w) continue;
    const trial = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(trial, size) <= width) line = trial;
    else { if (line) lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderAmendmentPdf(a, { logoBytes = null, staffSignaturePng = null, clientSignaturePng = null, dsnPdfBytes = null } = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const number = formNumber(a);
  const facts = a.clockRow ? factsOf(a.clockRow) : {};
  const note = a.note || null;

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const colW = PAGE_W - MARGIN * 2;

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };
  const need = (h) => { if (y - h < MARGIN + 30) newPage(); };
  const text = (s, { size = 10, f = font, color = INK, x = MARGIN } = {}) => {
    page.drawText(String(s ?? ""), { x, y, size, font: f, color });
  };
  const para = (s, { size = 10, f = font, color = INK, gap = 3 } = {}) => {
    for (const line of wrap(s, f, size, colW)) {
      need(size + gap);
      text(line, { size, f, color });
      y -= size + gap;
    }
  };
  const heading = (s) => {
    need(30);
    y -= 10;
    text(s.toUpperCase(), { size: 8.5, f: bold, color: MUTED });
    y -= 6;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.6, color: RULE });
    y -= 14;
  };
  const row = (k, v, { color = INK } = {}) => {
    const val = String(v ?? "");
    const lines = wrap(val || "-", font, 10, colW - 150);
    need(lines.length * 13 + 2);
    text(k, { size: 9, color: MUTED });
    lines.forEach((line, i) => {
      page.drawText(line, { x: MARGIN + 150, y: y - i * 13, size: 10, font, color });
    });
    y -= lines.length * 13 + 2;
  };

  // ---- header
  if (logoBytes) {
    try {
      const logo = await doc.embedPng(logoBytes);
      const h = 34;
      const w = (logo.width / logo.height) * h;
      page.drawImage(logo, { x: MARGIN, y: y - h + 8, width: w, height: h });
    } catch {
      // a logo that will not embed is not a reason to have no document
    }
  }
  page.drawText("Clock In / Out Amendment", { x: MARGIN + 130, y: y - 6, size: 16, font: bold, color: INK });
  page.drawText(number, { x: PAGE_W - MARGIN - bold.widthOfTextAtSize(number, 11), y: y - 6, size: 11, font: bold, color: MUTED });
  y -= 24;
  page.drawText(`Raised ${fmtStamp(a.createdAt)}${a.createdByName ? ` by ${a.createdByName}` : ""}`, { x: MARGIN + 130, y, size: 9, font, color: MUTED });
  y -= 22;

  // ---- the shift
  heading("The shift");
  row("Staff member", a.staffName || facts.staffName);
  row("Person served", a.clientName);
  row("Service", a.service);
  row("Date", a.shiftDate);
  row("Scheduled", a.scheduledIn || a.scheduledOut ? `${a.scheduledIn || "?"} to ${a.scheduledOut || "?"}` : "not on the schedule export");

  // ---- the clock
  heading("What the clock recorded");
  const level = evidenceLevel(a);
  const where = (gps) => (gps === "yes" ? ", location captured" : gps === "no" ? ", no location captured" : "");
  row("Clocked in", a.clockedIn
    ? `${a.clockedIn}${where(facts.gpsIn)}${facts.lateBy != null ? `, ${facts.lateBy} minutes after the scheduled start` : ""}`
    : "no punch", { color: a.clockedIn ? INK : RED });
  row("Clocked out", a.clockedOut ? `${a.clockedOut}${where(facts.gpsOut)}` : "no punch", { color: a.clockedOut ? INK : RED });
  if (facts.qspReason) row("Reason on the export", facts.qspReason);
  if (level === "none") {
    para("Neither punch was recorded. Nothing independent shows the visit, so the signatures below carry it on their own.", { size: 9, color: RED });
  }
  if (a.clockName) row("Export", a.clockName);

  // ---- the note
  heading("What the service note says");
  if (note) {
    row("Note times", `${note.start || "?"} to ${note.end || "?"}`);
    row("Filed", note.signedAt ? `${note.signedAt}${note.signedDate ? ` on ${note.signedDate}` : ""}` : "no signature on the note");
    if (note.summary) { y -= 4; text("Summary", { size: 9, color: MUTED }); y -= 13; para(note.summary, { size: 9.5 }); }
    const sections = Array.isArray(note.sections) ? note.sections.filter((s) => s.goal) : [];
    if (sections.length) {
      y -= 4; text("Objectives", { size: 9, color: MUTED }); y -= 13;
      for (const s of sections) {
        need(14);
        text(`${s.comment ? "Yes" : "No"}  ${s.goal}`, { size: 9.5, f: s.comment ? bold : font, color: s.comment ? INK : MUTED });
        y -= 13;
        if (s.comment) para(s.comment, { size: 9.5, color: INK });
      }
    }
    if (a.notesName) row("Export", a.notesName);
    if (dsnPdfBytes) para("The note's own pages are attached at the end of this document.", { size: 9, color: MUTED });
  } else {
    para("No service note was found for this person, client and day.", { size: 10, color: RED });
  }

  // ---- the amendment
  heading("The amendment");
  const confirmed = a.filledAt;
  const words = confirmed ? a.reasonText : a.intakeReasonText;
  y -= 2; text("What happened", { size: 9, color: MUTED }); y -= 13;
  para(words || "-", { size: 10 });
  const inTime = confirmed ? a.actualIn : a.intakeActualIn;
  const outTime = confirmed ? a.actualOut : a.intakeActualOut;
  if (inTime) row("Service started", inTime);
  row("Service ended", outTime || "-");
  para(`Taken down by the office on ${fmtStamp(a.createdAt)}${a.createdByName ? ` by ${a.createdByName}` : ""}, from what the staff member reported.`, { size: 9, color: MUTED });
  const corrections = confirmed ? correctionsOf(a) : [];
  if (corrections.length) {
    for (const c of corrections) {
      para(`Corrected before signing: ${c.label} was "${c.was || "-"}", now "${c.now || "-"}".`, { size: 9, color: INK });
    }
  }

  // ---- the staff signature
  heading("Attestation");
  para(`I confirm that I provided the service described above to ${a.clientName} on ${a.shiftDate}${inTime ? ` from ${inTime}` : ""}${outTime ? ` until ${outTime}` : ""}, that the clock record is incomplete for the reason given, and that this record supports the hours billed.`, { size: 10 });
  y -= 4;
  await signatureBlock({ pngBytes: staffSignaturePng, name: a.filledName || a.staffName, when: a.filledAt, ip: a.filledIp, missing: "Not yet signed" });

  // ---- the client signature
  heading("Person served");
  if (a.clientSignedAt) {
    row("Signed by", `${a.clientSigner || ""}${a.clientSignerKind ? ` (${label(SIGNER_KINDS, "kind", a.clientSignerKind)})` : ""}`);
    para(`Confirms that ${a.staffName || "the staff member"} provided this service on ${a.shiftDate}${outTime ? ` and left at about ${outTime}` : ""}.`, { size: 10 });
    y -= 4;
    await signatureBlock({ pngBytes: clientSignaturePng, name: a.clientSigner, when: a.clientSignedAt, ip: a.clientSignedIp, missing: "No signature image" });
  } else if (a.clientUnavailableReason) {
    row("Signature", "Nobody was available to sign", { color: RED });
    row("Because", a.clientUnavailableReason);
  } else {
    row("Signature", "Not collected", { color: RED });
  }

  // ---- approval
  heading("Office approval");
  if (a.approvedAt) {
    row("Approved by", a.approvedByName || "");
    row("Approved on", fmtStamp(a.approvedAt));
    if (a.approvalNote) row("Note", a.approvalNote);
    if (a.qspFixedTo || a.qspFixedAt) {
      row("Clock record corrected", `in QSClock${a.qspFixedTo ? ` to ${a.qspFixedTo}` : ""}${a.qspFixedAt ? ` on ${fmtStamp(a.qspFixedAt)}` : ""}${a.qspFixedBy ? ` by ${a.qspFixedBy}` : ""}`);
    }
  } else {
    row("Status", "Not yet approved", { color: RED });
  }

  // ---- appendix
  if (dsnPdfBytes) {
    try {
      const src = await PDFDocument.load(dsnPdfBytes, { ignoreEncryption: true });
      const pages = await doc.copyPages(src, src.getPageIndices());
      for (const p of pages) doc.addPage(p);
    } catch {
      // an appendix that will not load is reported on the page above rather
      // than taking the document down
    }
  }

  // ---- footer on every page
  const all = doc.getPages();
  all.forEach((p, i) => {
    const line = `${number}  ·  record ${a.id}  ·  generated ${fmtStamp(new Date())}  ·  page ${i + 1} of ${all.length}`;
    p.drawText(line, { x: MARGIN, y: 30, size: 7.5, font, color: FAINT });
  });

  return doc.save();

  async function signatureBlock({ pngBytes, name, when, ip, missing }) {
    need(70);
    if (pngBytes) {
      try {
        const img = await doc.embedPng(pngBytes);
        const h = 44;
        const w = Math.min((img.width / img.height) * h, 220);
        page.drawImage(img, { x: MARGIN, y: y - h, width: w, height: h });
      } catch {
        text(missing, { size: 9, color: RED });
      }
    } else {
      text(missing, { size: 9, color: RED });
    }
    y -= 50;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 260, y }, thickness: 0.6, color: RULE });
    y -= 12;
    text(`${name || ""}${when ? `   ${fmtStamp(when)}` : ""}${ip ? `   from ${ip}` : ""}`, { size: 9, color: MUTED });
    y -= 14;
  }
}

// the clock row as stored is the parser's shift; the few flags the document
// prints from it are read here so the layout above does not know its shape
function factsOf(row) {
  return {
    staffName: row.name || null,
    gpsIn: row.gpsIn ?? null,
    gpsOut: row.gpsOut ?? null,
    qspReason: row.reason || null,
    lateBy: row.startDelta != null && row.startDelta >= LATE_MIN ? row.startDelta : null,
  };
}
