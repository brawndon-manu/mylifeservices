// ONE PERSON'S EMAIL ACKNOWLEDGMENT, AS A DOCUMENT.
//
// Mánu 2026-09-12: "generate the pdf per person". Before the portal, HR emailed
// a notice and people replied "received, read, understood" - the reply IS the
// signature, and it lived in a Gmail thread where nothing could reach it.
//
// WHAT IT SAYS IS ONLY WHAT HAPPENED. The person's reply is reproduced exactly
// as they typed it, the time is the time their reply was sent, and the page
// says plainly that this was acknowledged by email and transcribed afterwards
// by a named person. It deliberately does NOT look like a signature the portal
// captured, because it is not one - it is a record of one that happened
// somewhere else, and a document that blurs that is worth less than no
// document.
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { companyDateTime } from "@/lib/company-time";

const LOGO_PATH = path.join(process.cwd(), "public", "logo", "MLSlogo.png");

const PAGE_W = 612;
const PAGE_H = 792;
const L = 56;
const R = PAGE_W - 56;

const INK = rgb(0.05, 0.05, 0.05);
const MUTED = rgb(0.42, 0.47, 0.53);
const BRAND = rgb(0.086, 0.325, 0.529);
const RULE = rgb(0.82, 0.85, 0.88);

function wrap(text, font, size, width) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderEmailAckPdf({
  noticeTitle,
  noticeDate,
  personName,
  asTyped,
  replyText,
  when,
  recordedBy,
  matchedHow,
  // WHAT THEY WERE ASKED TO CONFIRM - Mánu 2026-09-12: "should we attatch the
  // pdf that was apart of the email and the contents of the email itself?"
  // Yes, and this is why: the message said "Your email response will serve as
  // your acknowledgment and electronic signature confirming receipt and
  // understanding of this notice." Without it the document shows somebody
  // typed "Received"; with it, it shows what they were told that meant.
  askedText,
  askedFrom,
}) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = PAGE_H - 56;

  try {
    const png = await doc.embedPng(fs.readFileSync(LOGO_PATH));
    const w = 38;
    page.drawImage(png, { x: L, y: y - w + 10, width: w, height: (png.height / png.width) * w });
  } catch {
    // a missing logo must not cost the record
  }

  page.drawText("MY LIFE SERVICES", { x: L + 50, y: y - 6, size: 9, font: bold, color: BRAND });
  page.drawText("Acknowledgment received by email", { x: L + 50, y: y - 20, size: 13, font: bold, color: INK });
  y -= 54;

  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 1, color: RULE });
  y -= 28;

  const field = (label, value) => {
    page.drawText(label, { x: L, y, size: 8, font: bold, color: MUTED });
    const lines = wrap(value || "-", font, 12, R - L);
    let yy = y - 15;
    for (const ln of lines) {
      page.drawText(ln, { x: L, y: yy, size: 12, font, color: INK });
      yy -= 15;
    }
    y = yy - 12;
  };

  field("NOTICE", noticeTitle);
  if (noticeDate) field("SENT", noticeDate);
  field("ACKNOWLEDGED BY", personName);
  if (asTyped && asTyped !== personName) field("REPLIED AS", asTyped);
  field("WHEN THEY REPLIED", when ? companyDateTime(when) : "-");

  y -= 4;
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 1, color: RULE });
  y -= 26;

  page.drawText("THEIR REPLY, AS WRITTEN", { x: L, y, size: 8, font: bold, color: MUTED });
  y -= 18;
  for (const ln of wrap(replyText, font, 12, R - L - 16)) {
    page.drawText(ln, { x: L + 12, y, size: 12, font, color: INK });
    y -= 16;
  }

  // THE REQUEST, AS IT WAS MADE. Flows onto a second page rather than being
  // trimmed - a record that cuts off the sentence making a reply a signature
  // is not worth keeping.
  let last = page;
  if (askedText) {
    let page2 = page;
    let yy = y - 14;
    const need = (h) => {
      if (yy - h > 120) return;
      page2 = doc.addPage([PAGE_W, PAGE_H]);
      yy = PAGE_H - 64;
    };
    need(60);
    page2.drawLine({ start: { x: L, y: yy }, end: { x: R, y: yy }, thickness: 1, color: RULE });
    yy -= 22;
    page2.drawText(
      askedFrom ? `WHAT THEY WERE ASKED, SENT BY ${String(askedFrom).toUpperCase()}` : "WHAT THEY WERE ASKED",
      { x: L, y: yy, size: 8, font: bold, color: MUTED },
    );
    yy -= 16;
    for (const para of String(askedText).split(/\n+/)) {
      if (!para.trim()) { yy -= 6; continue; }
      for (const ln of wrap(para.trim(), font, 10, R - L)) {
        need(16);
        page2.drawText(ln, { x: L, y: yy, size: 10, font, color: INK });
        yy -= 13;
      }
      yy -= 5;
    }
    // the footer belongs at the end of the document, not at the end of its
    // first page - the request can run onto a second one
    last = page2;
  }

  // the honest footer: what this is, and who typed it in
  y = 96;
  last.drawLine({ start: { x: L, y: y + 22 }, end: { x: R, y: y + 22 }, thickness: 1, color: RULE });
  const foot = [
    "This acknowledgment was given by email reply before it could be recorded in the portal, and was",
    `transcribed from that thread${recordedBy ? ` by ${recordedBy}` : ""}. It is a record of an acknowledgment made elsewhere,`,
    "not a signature captured by this system.",
    matchedHow ? `The reply was attributed to this person on this basis: ${matchedHow}.` : null,
  ].filter(Boolean);
  for (const ln of foot) {
    last.drawText(ln, { x: L, y, size: 8, font, color: MUTED });
    y -= 11;
  }

  return Buffer.from(await doc.save());
}

// THE MESSAGE THAT WENT OUT, AS THE FIRST PAGE OF THE NOTICE.
//
// Mánu 2026-09-12: "should we attatch the pdf that was apart of the email and
// the contents of the email itself?" The attachments alone are the law; the
// email is the instruction - who sent it, when, what it asked for, and the
// sentence saying a reply would stand as a signature. Stored together, the one
// document is what everybody actually received.
export async function renderNoticeCover({ title, fromName, sentDate, body, attachmentNames = [] }) {
  const doc = await PDFDocument.create();
  let page = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = PAGE_H - 56;

  try {
    const png = await doc.embedPng(fs.readFileSync(LOGO_PATH));
    const w = 38;
    page.drawImage(png, { x: L, y: y - w + 10, width: w, height: (png.height / png.width) * w });
  } catch {
    // a missing logo must not cost the record
  }
  page.drawText("MY LIFE SERVICES", { x: L + 50, y: y - 6, size: 9, font: bold, color: BRAND });
  page.drawText("The message this notice went out with", { x: L + 50, y: y - 20, size: 13, font: bold, color: INK });
  y -= 54;
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 1, color: RULE });
  y -= 26;

  const line = (label, value) => {
    if (!value) return;
    page.drawText(label, { x: L, y, size: 8, font: bold, color: MUTED });
    page.drawText(String(value), { x: L + 70, y, size: 10, font, color: INK });
    y -= 16;
  };
  line("SUBJECT", title);
  line("FROM", fromName);
  line("SENT", sentDate);
  if (attachmentNames.length) {
    page.drawText("ATTACHED", { x: L, y, size: 8, font: bold, color: MUTED });
    for (const n of attachmentNames) {
      page.drawText(n, { x: L + 70, y, size: 10, font, color: INK });
      y -= 14;
    }
  }

  y -= 12;
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 1, color: RULE });
  y -= 24;

  for (const para of String(body || "").split(/\n+/)) {
    if (!para.trim()) { y -= 8; continue; }
    for (const ln of wrap(para.trim(), font, 11, R - L)) {
      if (y < 70) { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - 64; }
      page.drawText(ln, { x: L, y, size: 11, font, color: INK });
      y -= 15;
    }
    y -= 6;
  }

  return doc;
}

// A SECTION'S TITLE PAGE - Mánu 2026-09-12: "lets consider formatting with new
// pages for title pages". The first one put its words a little below the middle
// of an otherwise empty sheet, which reads as text that landed there rather
// than a page that was designed.
//
// So: the masthead at the top where every other page carries it, and the title
// block centred as a block - measured and placed, not guessed at - so the two
// section openers in a report are identical whatever their words are.
async function drawTitlePage(doc, { eyebrow, title, note }) {
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let top = PAGE_H - 56;
  try {
    const png = await doc.embedPng(fs.readFileSync(LOGO_PATH));
    const w = 38;
    page.drawImage(png, { x: L, y: top - w + 10, width: w, height: (png.height / png.width) * w });
  } catch {
    // a missing logo must not cost the page
  }
  page.drawText("MY LIFE SERVICES", { x: L + 50, y: top - 6, size: 9, font: bold, color: BRAND });
  page.drawText("Record of acknowledgment", { x: L + 50, y: top - 20, size: 10, font, color: MUTED });

  // the block, measured first so it can actually be centred
  const titleLines = wrap(title || "", bold, 24, R - L);
  const noteLines = note ? wrap(note, font, 11, R - L) : [];
  const blockH = 14 + titleLines.length * 28 + 18 + noteLines.length * 16;
  let y = (PAGE_H + blockH) / 2;

  page.drawText(String(eyebrow || "").toUpperCase(), { x: L, y, size: 9, font: bold, color: MUTED });
  y -= 30;
  for (const ln of titleLines) {
    page.drawText(ln, { x: L, y, size: 24, font: bold, color: INK });
    y -= 28;
  }
  y += 6;
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 1, color: RULE });
  y -= 20;
  for (const ln of noteLines) {
    page.drawText(ln, { x: L, y, size: 11, font, color: MUTED });
    y -= 16;
  }
  return page;
}

// THE REPORT, WITH THE THING PEOPLE ACKNOWLEDGED ON THE END OF IT.
//
// Mánu 2026-09-12, having downloaded the report: "i downloaded it and its
// still jsut the who acked". It was - the signature report is a roster, and a
// roster on its own does not say what anybody agreed to. The form's own stored
// document goes on the end behind a divider, so one download is the whole
// record: who acknowledged, and what.
export async function appendSourceDocument(reportBytes, sourceBytes, { title, label } = {}) {
  if (!sourceBytes) return reportBytes;
  const out = await PDFDocument.load(reportBytes);
  const font = await out.embedFont(StandardFonts.Helvetica);

  const cover = await drawTitlePage(out, {
    eyebrow: label || "The document people were acknowledging",
    title,
    note: "Everything after this page is that document, exactly as it was sent.",
  });

  try {
    const src = await PDFDocument.load(sourceBytes);
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
  } catch {
    // a document that will not load must not cost the roster - the title page
    // stays and says what should have followed it
    cover.drawText("The stored document could not be read, so it is not attached.", {
      x: L, y: 96, size: 10, font, color: rgb(0.7, 0.11, 0.11),
    });
  }
  return Buffer.from(await out.save());
}

// WHAT EVERYBODY WROTE, AS A SECTION OF THE REPORT.
//
// Mánu 2026-09-12: "maybe lets incldue all of the people response to the email
// as well since we have timestamps too". The roster says who and when; on an
// email acknowledgment the words ARE the signature, so a record without them
// is a tally. Skipped entirely when no row carries any - an ordinary form's
// evidence is its PDF, and an empty section would be noise on every report.
export async function appendReplies(reportBytes, replies) {
  const rows = (replies || []).filter((r) => r.text && r.text.trim());
  if (!rows.length) return reportBytes;

  const out = await PDFDocument.load(reportBytes);
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);

  await drawTitlePage(out, {
    eyebrow: "What each person wrote",
    title: "The replies, in their own words",
    note: `${rows.length} ${rows.length === 1 ? "reply" : "replies"}, newest first, each with the time it was sent.`,
  });

  let page = out.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - 56;

  const need = (h) => {
    if (y - h > 56) return;
    page = out.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - 56;
  };

  for (const r of rows) {
    const body = wrap(r.text.trim(), font, 10, R - L - 14);
    need(18 + body.length * 13 + 10);
    page.drawText(r.name || "Unassigned", { x: L, y, size: 11, font: bold, color: INK });
    const stamp = r.when ? companyDateTime(r.when) : "";
    if (stamp) {
      page.drawText(stamp, { x: R - font.widthOfTextAtSize(stamp, 9), y, size: 9, font, color: MUTED });
    }
    y -= 15;
    if (r.asTyped && r.asTyped !== r.name) {
      page.drawText(`replied as ${r.asTyped}`, { x: L, y, size: 8, font, color: MUTED });
      y -= 12;
    }
    for (const ln of body) {
      page.drawText(ln, { x: L + 14, y, size: 10, font, color: INK });
      y -= 13;
    }
    y -= 12;
  }
  return Buffer.from(await out.save());
}
