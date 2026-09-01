// THE PRINTED SATISFACTION SURVEY, rendered from stored answers.
//
// Mánu 2026-08-31: the questions are asked on screen and "the answers just
// fill out the pdf" - nobody types into the document itself. So this is a
// VIEW of ClientReport.answers, built on demand, and it can never disagree
// with what was recorded. Wordings all come from satisfaction.js, which holds
// his original form's strings verbatim.
//
// Same house style as the payout report: the MLS logo, the brand blues, the
// dark table header. The footer names who conducted the survey - "if im on
// the phone with a client answering the questions then it should say my name
// at the footer".
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  ORG_LINE,
  TITLE,
  CLIENT_NAME_LABEL,
  DATE_LABEL,
  COMPLETING_LABEL,
  COMPLETING_OPTIONS,
  PROGRAM_LABEL,
  PROGRAM_OPTIONS,
  INTRO,
  QUESTION_HEAD,
  RATING_HEAD,
  GRID_QUESTIONS,
  CHOICES_HEADING,
  CHOICE_QUESTIONS,
  FEEDBACK_HEADING,
  FEEDBACK_QUESTIONS,
  OVERALL_HEADING,
  OVERALL_OPTIONS,
  COMMENTS_LABEL,
  THANKS,
  fmtSurveyDate,
} from "./satisfaction.js";

const LOGO_PATH = path.join(process.cwd(), "public", "logo", "MLSlogo.png");

const PAGE_W = 612;
const PAGE_H = 792;
const L = 54;
const R = PAGE_W - 54;

const INK = rgb(0.05, 0.05, 0.05);
const MUTED = rgb(0.42, 0.47, 0.53);
const BRAND = rgb(0.086, 0.325, 0.529);
const HEADBG = rgb(0.106, 0.298, 0.404);
const ROWALT = rgb(0.965, 0.976, 0.984);
const GRID = rgb(0.75, 0.79, 0.83);
const RULE = rgb(0.85, 0.88, 0.91);
const WHITE = rgb(1, 1, 1);

function wrapAt(textStr, width, font, size) {
  const words = String(textStr || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const probe = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(probe, size) <= width) line = probe;
    else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderSatisfactionPdf({ clientName, answers, conductedByName, conductedOn }) {
  const a = answers || {};
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

  const text = (s, x, yy, { size = 9.5, f = font, color = INK } = {}) =>
    page.drawText(String(s), { x, y: yy, size, font: f, color });

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - 52;
  };

  // 46pt is reserved under the content for the footer drawn at the end
  const ensure = (h) => {
    if (y - h < 64) newPage();
  };

  // a checkbox: ticked in brand blue, empty as a light outline - always drawn,
  // so an unanswered question looks exactly like a skipped line on paper
  const box = (x, yy, checked, size = 9) => {
    if (checked) {
      page.drawRectangle({ x, y: yy, width: size, height: size, color: BRAND });
      const s = size;
      page.drawLine({
        start: { x: x + s * 0.22, y: yy + s * 0.5 },
        end: { x: x + s * 0.42, y: yy + s * 0.26 },
        thickness: 1.2,
        color: WHITE,
      });
      page.drawLine({
        start: { x: x + s * 0.42, y: yy + s * 0.26 },
        end: { x: x + s * 0.8, y: yy + s * 0.74 },
        thickness: 1.2,
        color: WHITE,
      });
    } else {
      page.drawRectangle({
        x, y: yy, width: size, height: size,
        borderColor: GRID, borderWidth: 0.9,
      });
    }
  };

  // "☐ Yes" with the tick when chosen; returns the width used
  const boxLabel = (x, yy, label, checked, { size = 9.5, f = font } = {}) => {
    box(x, yy - 1.5, checked);
    text(label, x + 14, yy, { size, f: checked ? bold : f });
    return 14 + (checked ? bold : f).widthOfTextAtSize(label, size);
  };

  const sectionHeading = (label) => {
    ensure(34);
    y -= 8;
    text(label, L, y, { size: 12, f: bold, color: BRAND });
    y -= 7;
    page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.8, color: GRID });
    y -= 16;
  };

  // an answer line under a prompt: the written words, or ruled blanks when
  // nothing was said - the paper form's empty lines, kept
  const answerLines = (value) => {
    const lines = wrapAt(value, R - L - 12, font, 9.5);
    if (!lines.length) {
      for (let i = 0; i < 3; i++) {
        ensure(15);
        y -= 13;
        page.drawLine({ start: { x: L + 6, y }, end: { x: R, y }, thickness: 0.6, color: RULE });
      }
      y -= 8;
      return;
    }
    for (const ln of lines) {
      ensure(14);
      y -= 12;
      text(ln, L + 6, y, { size: 9.5 });
    }
    y -= 14;
  };

  // ------------------------------------------------------------------ page 1
  newPage();

  const logoH = 40;
  let tx = L;
  if (logo) {
    const lw = (logo.width / logo.height) * logoH;
    page.drawImage(logo, { x: L, y: y - logoH, width: lw, height: logoH });
    tx = L + lw + 14;
  }
  text(ORG_LINE, tx, y - 11, { size: 8.5, f: bold, color: MUTED });
  text(TITLE, tx, y - 32, { size: 16, f: bold, color: BRAND });
  y -= logoH + 18;
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.8, color: GRID });
  y -= 20;

  // client name and date on one line, the date to the right
  const dateShown = fmtSurveyDate(a.date) || conductedOn || "";
  text(CLIENT_NAME_LABEL, L, y, { f: bold });
  text(clientName || "", L + bold.widthOfTextAtSize(CLIENT_NAME_LABEL, 9.5) + 6, y);
  const dLabelW = bold.widthOfTextAtSize(DATE_LABEL, 9.5);
  const dValW = font.widthOfTextAtSize(dateShown, 9.5);
  text(DATE_LABEL, R - dValW - dLabelW - 6, y, { f: bold });
  text(dateShown, R - dValW, y);
  y -= 22;

  // person completing survey - the four options, chosen one ticked
  text(COMPLETING_LABEL, L, y, { f: bold });
  y -= 15;
  for (const opt of COMPLETING_OPTIONS) {
    const isOther = opt === "Other";
    const label =
      isOther && a.completedBy === "Other" && a.completedByOther
        ? `Other: ${a.completedByOther}`
        : isOther
          ? "Other: _________"
          : opt;
    boxLabel(L + 6, y, label, a.completedBy === opt);
    y -= 14;
  }
  y -= 6;

  // program - both options on one line, as the form prints them
  text(PROGRAM_LABEL, L, y, { f: bold });
  let px = L + bold.widthOfTextAtSize(PROGRAM_LABEL, 9.5) + 10;
  for (const opt of PROGRAM_OPTIONS) {
    const isOther = opt === "Other";
    const label =
      isOther && a.program === "Other" && a.programOther
        ? `Other: ${a.programOther}`
        : isOther
          ? "Other: ______"
          : opt;
    px += boxLabel(px, y, label, a.program === opt) + 16;
  }
  y -= 24;

  text(INTRO, L, y, { size: 10.5, f: bold });
  y -= 14;

  // ------------------------------------------------------------- rating grid
  const RATE_W = 74;
  const Q_W = R - L - RATE_W * RATING_HEAD.length;

  const gridHead = () => {
    ensure(30);
    const hH = 24;
    page.drawRectangle({ x: L, y: y - hH + 4, width: R - L, height: hH, color: HEADBG });
    text(QUESTION_HEAD, L + 6, y - 10, { size: 8, f: bold, color: WHITE });
    RATING_HEAD.forEach((label, i) => {
      const cx = L + Q_W + RATE_W * i + RATE_W / 2;
      const words = label.split(" ");
      if (words.length === 2 && bold.widthOfTextAtSize(label, 8) > RATE_W - 8) {
        text(words[0], cx - bold.widthOfTextAtSize(words[0], 8) / 2, y - 6, { size: 8, f: bold, color: WHITE });
        text(words[1], cx - bold.widthOfTextAtSize(words[1], 8) / 2, y - 15, { size: 8, f: bold, color: WHITE });
      } else {
        text(label, cx - bold.widthOfTextAtSize(label, 8) / 2, y - 10, { size: 8, f: bold, color: WHITE });
      }
    });
    y -= hH + 2;
  };

  gridHead();
  GRID_QUESTIONS.forEach((q, i) => {
    const lines = wrapAt(`${i + 1}. ${q}`, Q_W - 12, font, 9);
    const rowH = Math.max(19, lines.length * 11 + 8);
    if (y - rowH < 64) {
      newPage();
      gridHead();
    }
    if (i % 2 === 1) page.drawRectangle({ x: L, y: y - rowH + 4, width: R - L, height: rowH, color: ROWALT });
    let ly = y - 9;
    for (const ln of lines) {
      text(ln, L + 6, ly, { size: 9 });
      ly -= 11;
    }
    const boxY = y - rowH / 2 - 1;
    RATING_HEAD.forEach((opt, c) => {
      box(L + Q_W + RATE_W * c + RATE_W / 2 - 4.5, boxY, a.grid?.[i] === opt);
    });
    y -= rowH;
  });
  page.drawLine({ start: { x: L, y: y + 4 }, end: { x: R, y: y + 4 }, thickness: 0.8, color: GRID });
  y -= 10;

  // ------------------------------------------------------------ your choices
  sectionHeading(CHOICES_HEADING);
  CHOICE_QUESTIONS.forEach((c, i) => {
    const lines = wrapAt(c.q, R - L - 6, font, 9.5);
    ensure(lines.length * 12 + 26);
    for (const ln of lines) {
      text(ln, L, y, { size: 9.5 });
      y -= 12;
    }
    let cx = L + 6;
    y -= 3;
    for (const opt of c.options) cx += boxLabel(cx, y, opt, a.choices?.[i] === opt) + 22;
    y -= 18;
  });

  // ----------------------------------------------------------- your feedback
  sectionHeading(FEEDBACK_HEADING);
  FEEDBACK_QUESTIONS.forEach((q, i) => {
    const lines = wrapAt(q, R - L - 6, font, 9.5);
    ensure(lines.length * 12 + 20);
    for (const ln of lines) {
      text(ln, L, y, { size: 9.5, f: bold });
      y -= 12;
    }
    y -= 2;
    answerLines(a.feedback?.[i]);
    y -= 4;
  });

  // ----------------------------------------------------- overall satisfaction
  sectionHeading(OVERALL_HEADING);
  ensure(20);
  let ox = L + 6;
  for (const opt of OVERALL_OPTIONS) ox += boxLabel(ox, y, opt, a.overall === opt) + 22;
  y -= 24;

  // additional comments
  ensure(34);
  text(COMMENTS_LABEL, L, y, { size: 9.5, f: bold });
  y -= 14;
  answerLines(a.comments);
  y -= 6;

  // thank you, the form's own closing words
  const thanksLines = wrapAt(THANKS, R - L - 24, font, 9);
  ensure(thanksLines.length * 12 + 24);
  page.drawLine({ start: { x: L, y: y + 6 }, end: { x: R, y: y + 6 }, thickness: 0.8, color: GRID });
  y -= 10;
  for (const ln of thanksLines) {
    text(ln, L + 12, y, { size: 9, color: MUTED });
    y -= 12;
  }

  // ------------------------------------------------- footer, every page last
  // who conducted it - Mánu's requirement, and the reason a survey filled over
  // the phone still says whose voice was asking
  const pages = doc.getPages();
  const footLeft = `Conducted by ${conductedByName} in the My Life Services portal on ${conductedOn}`;
  pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: L, y: 44 }, end: { x: R, y: 44 }, thickness: 0.6, color: GRID });
    pg.drawText(footLeft, { x: L, y: 32, size: 8, font, color: MUTED });
    const pn = `Page ${i + 1} of ${pages.length}`;
    pg.drawText(pn, { x: R - font.widthOfTextAtSize(pn, 8), y: 32, size: 8, font, color: MUTED });
  });

  return { bytes: await doc.save() };
}
