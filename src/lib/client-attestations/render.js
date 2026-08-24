// THE FORM A CLIENT SIGNS: their month's schedule, with a sign-off block under
// it.
//
// THE CALENDAR IS REDRAWN RATHER THAN LIFTED OFF THE EXPORT, and that is the
// whole reason parse.js works out which day each visit falls on. QSP prints a
// visit as one run of text:
//
//     8a-10a Solorzano, I-ILS Service (2)
//
// and Mánu's approved layout splits it in two, with the staff member named in
// full underneath:
//
//     8a-10a ILS Service (2)
//          Ilean Solorzano
//
// No amount of stamping on top of QSP's page produces that, so the grid is ours.
// Everything in it still comes from the export - the visits, the times, the
// hours exactly as printed - and the only thing added is the full name, which
// the export abbreviates to an initial and cannot supply.
//
// THE FIELDS ARE REAL ACROFORM FIELDS, so one document serves both ways of
// signing it: printed and filled in by hand at a kitchen table, or opened from
// the emailed link and signed in the browser. The portal's FormFiller finds
// these by name - a text field with "signature" in its name and no "date" gets a
// draw pad - so the names below are load-bearing, not labels.
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// A DOCUMENT-SIZED LOGO, AND THAT IS THE WHOLE POINT OF IT.
//
// The full MLSlogo.png is 777x733 and 341KB. Embedded into every form it made a
// one-page PDF weigh 403KB and a month of them 99MB - the logo was 86MB of that,
// the same picture 252 times over. This copy is 160px wide and 25KB, still well
// above print resolution at the 46pt it is drawn, and it takes the month to
// about 13MB.
const LOGO_PATH = path.join(process.cwd(), "public", "logo", "MLSlogo-doc.png");
const LOGO_FALLBACK = path.join(process.cwd(), "public", "logo", "MLSlogo.png");

// read once per process rather than once per form. `undefined` means "not looked
// at yet", `null` means "looked and there is none" - so a missing file is not
// re-read 252 times.
let logoBytes;
function readLogo() {
  if (logoBytes !== undefined) return logoBytes;
  for (const p of [LOGO_PATH, LOGO_FALLBACK]) {
    try {
      logoBytes = fs.readFileSync(p);
      return logoBytes;
    } catch {
      // try the next one
    }
  }
  logoBytes = null;
  return logoBytes;
}

const PAGE_W = 900;
const BLOCK_H = 196;
const PAGE_H = 780;
const M = 14;

const INK = rgb(0.05, 0.05, 0.05);
const MUTED = rgb(0.42, 0.47, 0.53);
const BRAND = rgb(0.086, 0.325, 0.529);
const HEADBG = rgb(0.863, 0.902, 0.945);
const OUTMONTH = rgb(0.898, 0.898, 0.898);
const GRID = rgb(0.15, 0.15, 0.15);
const HAIR = rgb(0.72, 0.76, 0.8);
const FIELDBG = rgb(0.945, 0.957, 0.973);
const WHITE = rgb(1, 1, 1);

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// THE FOUR THINGS BEING CONFIRMED.
//
// The first is ours; the other three are HR's request word for word - that the
// client was provided their schedule, that they want to continue with their
// current staff, and that staff have been providing services as scheduled.
//
// Kept as data rather than four drawing calls so the wording lives in one place
// and the tests can assert the document actually carries all four.
export const ATTESTATION_ITEMS = [
  "The schedule shown above is accurate - the dates, times, service hours and assigned staff are correct.",
  "The client has reviewed this schedule and approves it.",
  "The client requests this specific schedule of days and times, and wants to work with the staff assigned.",
  "Staff are showing up and providing services on the scheduled dates and at the scheduled times.",
];

// FIELD NAMES ARE AN INTERFACE. FormFiller decides which widget to draw from the
// name alone, and the signed copy is stored under these keys, so renaming one
// silently changes what a supervisor is asked to do.
export const FIELDS = {
  items: ATTESTATION_ITEMS.map((_, i) => `Confirmed ${i + 1}`),
  inPerson: "Reviewed in person",
  overPhone: "Reviewed over the phone",
  otherHow: "Reviewed other",
  dateReviewed: "Date reviewed",
  reviewedWith: "Reviewed with",
  comments: "Comments / exceptions",
  supervisorName: "Supervisor name (print)",
  supervisorSignature: "Supervisor signature",
  supervisorTitle: "Title",
  supervisorDate: "Date",
  clientSignature: "Client / authorized representative signature",
  clientDate: "Client signature date",
};

// greedy wrap - a sentence running through a rule reads as a broken form
function wrap(text, maxW, font, size) {
  const out = [];
  let line = "";
  for (const word of String(text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > maxW && line) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

function centered(page, text, { cx, y, size, font, color }) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: cx - w / 2, y, size, font, color });
}

// ------------------------------------------------------------------ calendar

// which weekday the 1st falls on, and how long the month is. Plain arithmetic on
// a UTC date: the month label is a label, not a timestamp, and pulling a
// timezone into it is how a schedule ends up starting on the wrong day.
function monthGrid(monthName, year) {
  const month = MONTHS.indexOf(monthName);
  if (month === -1) return null;
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const length = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const rows = Math.ceil((firstWeekday + length) / 7);
  return { month, firstWeekday, length, rows };
}

function drawCalendar(page, fonts, { clientName, monthName, year, days, datePrinted, logo }) {
  const { font, bold } = fonts;
  const grid = monthGrid(monthName, year);
  const top = PAGE_H - M;
  const left = M;
  const right = PAGE_W - M;
  const width = right - left;

  // ---- title band ----
  if (logo) {
    const h = 46;
    const w = (logo.width / logo.height) * h;
    page.drawImage(logo, { x: left + 6, y: top - h - 4, width: w, height: h });
  }
  centered(page, `Client: ${clientName}`, {
    cx: PAGE_W / 2, y: top - 20, size: 13, font: bold, color: BRAND,
  });
  centered(page, `${monthName} ${year}`, {
    cx: PAGE_W / 2, y: top - 44, size: 18, font, color: BRAND,
  });
  if (datePrinted) {
    const label = `Date Printed: ${datePrinted}`;
    const w = font.widthOfTextAtSize(label, 9);
    page.drawText(label, { x: right - w - 4, y: top - 20, size: 9, font, color: BRAND });
  }

  // ---- weekday header ----
  const headTop = top - 56;
  const headH = 16;
  const colW = width / 7;
  WEEKDAYS.forEach((d, i) => {
    centered(page, d, {
      cx: left + colW * (i + 0.5), y: headTop - 12, size: 9, font: bold, color: BRAND,
    });
  });

  // ---- week rows ----
  const gridTop = headTop - headH;
  const gridBottom = BLOCK_H + 10;
  const rowH = (gridTop - gridBottom) / grid.rows;

  const byDay = new Map(days.map((d) => [d.day, d.entries]));

  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < 7; c++) {
      const n = r * 7 + c - grid.firstWeekday + 1;
      const x = left + colW * c;
      const yTop = gridTop - rowH * r;
      const inMonth = n >= 1 && n <= grid.length;

      page.drawRectangle({
        x, y: yTop - rowH, width: colW, height: rowH,
        color: inMonth ? WHITE : OUTMONTH,
        borderColor: GRID, borderWidth: 0.9,
      });
      if (!inMonth) continue;

      centered(page, String(n), {
        cx: x + colW / 2, y: yTop - 11, size: 9, font, color: INK,
      });

      // ---- the visits ----
      //
      // Two lines each: what the service is, then who is providing it, centred
      // under it. The name is the change Mánu asked for - a client reading their
      // own schedule should see "Ilean Solorzano", not "Solorzano, I".
      let ly = yTop - 22;
      for (const e of byDay.get(n) || []) {
        const headline = `${e.start}-${e.end} ${e.service} (${e.hoursText})`;
        for (const line of wrap(headline, colW - 8, font, 6.4)) {
          page.drawText(line, { x: x + 4, y: ly, size: 6.4, font, color: INK });
          ly -= 7.4;
        }
        const who = e.staffName || e.staff;
        centered(page, who, {
          cx: x + colW / 2, y: ly, size: 6.6, font: bold, color: BRAND,
        });
        ly -= 9.4;
      }
    }
  }
}

// --------------------------------------------------------------- sign-off

// a field with its label ABOVE it, the way the approved layout has them
function labelled(form, page, { name, label, x, y, width, height = 14, font, bold, multiline = false, labelSize = 6.6 }) {
  page.drawText(label, { x, y: y + height + 3, size: labelSize, font: bold, color: INK });
  const field = form.createTextField(name);
  if (multiline) field.enableMultiline();
  field.addToPage(page, { x, y, width, height, borderWidth: 0, backgroundColor: FIELDBG });
  page.drawLine({
    start: { x, y: y - 0.5 }, end: { x: x + width, y: y - 0.5 },
    thickness: 0.5, color: HAIR,
  });
  return field;
}

// a field sharing its line with an inline label ("Date reviewed:  ______")
function inlineField(form, page, { name, label, x, y, labelW, width, font, bold, height = 13 }) {
  page.drawText(label, { x, y: y + 3.5, size: 7, font: bold, color: INK });
  const field = form.createTextField(name);
  field.addToPage(page, {
    x: x + labelW, y, width, height, borderWidth: 0, backgroundColor: FIELDBG,
  });
  page.drawLine({
    start: { x: x + labelW, y: y - 0.5 }, end: { x: x + labelW + width, y: y - 0.5 },
    thickness: 0.5, color: HAIR,
  });
  return field;
}

function tick(form, page, { name, label, x, y, font }) {
  const box = form.createCheckBox(name);
  box.addToPage(page, {
    x, y: y - 1, width: 9, height: 9,
    borderWidth: 0.8, borderColor: HAIR, backgroundColor: WHITE,
  });
  page.drawText(label, { x: x + 14, y, size: 7, font, color: INK });
}

function drawSignOff(page, form, fonts, { clientName, monthName, year }) {
  const { font, bold, italic } = fonts;
  const left = M;
  const right = PAGE_W - M;
  const top = BLOCK_H - 4;
  const bottom = 10;

  // outer box
  page.drawRectangle({
    x: left, y: bottom, width: right - left, height: top - bottom,
    borderColor: BRAND, borderWidth: 1,
  });

  // ---- header bar ----
  const barH = 22;
  page.drawRectangle({
    x: left, y: top - barH, width: right - left, height: barH,
    color: HEADBG, borderColor: BRAND, borderWidth: 1,
  });
  page.drawText("SUPERVISOR REVIEW & SIGN-OFF", {
    x: left + 12, y: top - barH + 7, size: 9.5, font: bold, color: BRAND,
  });
  page.drawText(`Client: ${clientName}`, {
    x: left + 222, y: top - barH + 7, size: 9.5, font, color: INK,
  });
  const month = `Service Month: ${monthName} ${year}`;
  const mw = bold.widthOfTextAtSize(month, 9);
  page.drawText(month, { x: right - mw - 12, y: top - barH + 7, size: 9, font: bold, color: BRAND });

  // ---- the two panels ----
  const panelTop = top - barH;
  const sigTop = bottom + 48;
  const divide = left + Math.round((right - left) * 0.615);

  page.drawLine({
    start: { x: divide, y: panelTop }, end: { x: divide, y: sigTop },
    thickness: 0.8, color: BRAND,
  });
  page.drawLine({
    start: { x: left, y: sigTop }, end: { x: right, y: sigTop },
    thickness: 0.8, color: BRAND,
  });

  // ---- left: the four items ----
  let y = panelTop - 16;
  page.drawText("Supervisor attestation - check each item confirmed:", {
    x: left + 12, y, size: 7.5, font: bold, color: INK,
  });
  y -= 15;
  ATTESTATION_ITEMS.forEach((text, i) => {
    tick(form, page, {
      name: FIELDS.items[i],
      label: `${i + 1}. ${text}`,
      x: left + 22,
      y,
      font,
    });
    y -= 15;
  });
  page.drawText(
    "If any item above is not checked, describe the issue and corrective action in Comments.",
    { x: left + 14, y: y + 2, size: 6.4, font: italic, color: MUTED },
  );

  // ---- right: how, when, and anything that needs saying ----
  const rx = divide + 14;
  const rw = right - rx - 12;
  let ry = panelTop - 16;
  page.drawText("This schedule was reviewed with the client:", {
    x: rx, y: ry, size: 7.5, font: bold, color: INK,
  });

  ry -= 16;
  tick(form, page, { name: FIELDS.inPerson, label: "In person", x: rx + 8, y: ry, font });
  tick(form, page, { name: FIELDS.overPhone, label: "Over the phone", x: rx + 100, y: ry, font });
  inlineField(form, page, {
    name: FIELDS.otherHow, label: "Other:", x: rx + 200, y: ry - 3,
    labelW: 32, width: rw - 212, font, bold, height: 12,
  });

  ry -= 24;
  const halfW = (rw - 20) / 2;
  inlineField(form, page, {
    name: FIELDS.dateReviewed, label: "Date reviewed:", x: rx, y: ry,
    labelW: 62, width: halfW - 62, font, bold,
  });
  inlineField(form, page, {
    name: FIELDS.reviewedWith, label: "Reviewed with:", x: rx + halfW + 20, y: ry,
    labelW: 64, width: halfW - 64, font, bold,
  });

  ry -= 20;
  page.drawText("Comments / exceptions:", { x: rx, y: ry, size: 7.5, font: bold, color: INK });
  const commentsH = ry - 6 - (sigTop + 8);
  const comments = form.createTextField(FIELDS.comments);
  comments.enableMultiline();
  comments.addToPage(page, {
    x: rx, y: sigTop + 8, width: rw, height: Math.max(18, commentsH),
    borderWidth: 0, backgroundColor: FIELDBG,
  });

  // ---- the signature row ----
  //
  // Two signatures, because two people are saying different things: the
  // supervisor attests that the four items are true, and the client agrees the
  // schedule is theirs. The client's is marked optional - a client who cannot
  // sign is a real and ordinary case, and the supervisor's attestation is what
  // the document turns on.
  const row = [
    [FIELDS.supervisorName, "Supervisor name (print)", 150],
    [FIELDS.supervisorSignature, "Supervisor signature", 170],
    [FIELDS.supervisorTitle, "Title", 96],
    [FIELDS.supervisorDate, "Date", 86],
    [FIELDS.clientSignature, "Client / authorized representative signature (optional)", 210],
    [FIELDS.clientDate, "Date", 86],
  ];
  const gap = 14;
  const total = row.reduce((t, [, , w]) => t + w, 0) + gap * (row.length - 1);
  const scale = Math.min(1, (right - left - 24) / total);
  let x = left + 12;
  for (const [name, label, w] of row) {
    labelled(form, page, {
      name, label, x, y: bottom + 10, width: w * scale, height: 16, font, bold, labelSize: 6.4,
    });
    x += (w + gap) * scale;
  }
}

// ------------------------------------------------------------------ entry

// ONE CLIENT'S FORM. `client` is a record from parse.js, already carrying its
// days and visits. `staffNames` maps the schedule's printed abbreviation to a
// full name where we have one - see names.js - and anything missing simply keeps
// the abbreviation, which is always true even when it is not helpful.
export async function renderAttestationForm({ client, staffNames = {} }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  let logo = null;
  try {
    const bytes = readLogo();
    if (bytes) logo = await doc.embedPng(bytes);
  } catch {
    // a missing or unreadable logo must never stop a form being produced
  }

  const page = doc.addPage([PAGE_W, PAGE_H]);
  const form = doc.getForm();
  const fonts = { font, bold, italic };

  const days = (client.days || []).map((d) => ({
    day: d.day,
    entries: d.entries.map((e) => ({ ...e, staffName: staffNames[e.staff] || null })),
  }));

  drawCalendar(page, fonts, {
    clientName: client.clientName,
    monthName: client.monthName,
    year: client.year,
    datePrinted: client.datePrinted,
    days,
    logo,
  });
  drawSignOff(page, form, fonts, {
    clientName: client.clientName,
    monthName: client.monthName,
    year: client.year,
  });

  // A FLAT LOOK, NOT A FLATTENED FORM. The fields have to stay fillable - the
  // browser signer needs them - so this only stops a viewer repainting its own
  // highlight over the boxes we drew.
  form.updateFieldAppearances(font);

  return Buffer.from(await doc.save());
}
