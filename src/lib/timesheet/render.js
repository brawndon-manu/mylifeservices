// render a corrected timesheet PDF: MLS logo, the full QSP column set,
// colour-coded breaks, the CA 226.7 premium table, the attestation and the
// admin approval block. paginates when a pay period runs long, and embeds real
// AcroForm signature fields so the portal's existing signature pad can sign it
// unchanged.
//
// the order is deliberate and it is NOT the order of the approved sample. the
// sample put the premium table below the signature, so somebody signed "unless
// otherwise recorded above, I received all my breaks" before the sheet had told
// them which days it was paying them a premium for. the colour key moved for
// the same reason - it explains the punch cells, so it belongs under them.
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { recordedBreaksFor, insertRecordedBreaks, withStatedRest, withStatedBreaks } from "./recorded-breaks.js";

// read straight off disk - this only ever runs server-side.
const LOGO_PATH = path.join(process.cwd(), "public", "logo", "MLSlogo.png");

// palette lifted from the approved sample
const REST = rgb(1, 0.949, 0.6);        // 10-min paid rest break
const MEAL = rgb(0.71, 0.85, 0.98);     // 30-min unpaid meal break
// a rest the report recorded while the person was OFF the clock. Same yellow so
// it still reads as a rest, hazard-striped so it does not read as one QSP
// recorded: these minutes were added to the day by us, not punched by them.
const ADDED_BAR = rgb(0.85, 0.68, 0.2);
// a thirty-minute entry sitting in the REST report, drawn as the meal its length
// says it is. Same blue so it reads as a meal, striped so it does not read as
// one anybody has confirmed.
const MEAL_BAR = rgb(0.18, 0.42, 0.66);
// a rest rostered outside the whole working day - before the first shift starts
// or after the last one ends. Blue with RED stripes, Mánu 2026-08-09: it is not
// a break in the day, it is ten minutes recorded against no shift. Still paid.
const OUTSIDE_BAR = rgb(0.75, 0.16, 0.16);
const INK = rgb(0.05, 0.05, 0.05);
const MUTED = rgb(0.45, 0.5, 0.55);
const GRID = rgb(0.45, 0.5, 0.55);
const BRAND = rgb(0.086, 0.325, 0.529); // headline blue
const HEADBG = rgb(0.106, 0.298, 0.404);// premium table header
const TOTALBG = rgb(0.878, 0.949, 0.961);
const PREM = rgb(0.7, 0.11, 0.11);
// a day with nothing owed. Mánu 2026-08-09 asked for the waived note and the
// clean day to read green and italic, so a person scanning the column can see
// at a glance which days are settled without reading a word of it.
const GOOD = rgb(0.06, 0.45, 0.24);
const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0, 0, 0);
// the banner that names which of the three documents this is
const NOTEBG = rgb(0.992, 0.969, 0.894);
const NOTEBORDER = rgb(0.788, 0.635, 0.153);
const NOTEINK = rgb(0.42, 0.32, 0.06);

// WHICH DOCUMENT AM I HOLDING.
//
// One person can be printed three ways and the three differ by every premium on
// the page - Aranda is 19.00 hours on one and 2.00 on another. Page two of the
// wrong one is indistinguishable from page two of the right one, so the banner
// is drawn on EVERY page rather than only the first.
//
// THE NAMES AND THE ROLES SWAPPED ON 2026-08-11. `projected` used to be the
// engine's small proposal and `ignoring` the reference copy nobody should
// mistake for a payslip. The flip makes the full figure the default, so
// `projected` IS the document people sign and `assumed` is the admin reading.
//
// `projected` therefore carries NO WARNING BANNER: there is nothing to warn
// anybody off, it is their timesheet, and every hour the engine could find for
// them is on it. The other two are readings of an open question and say so.
//
// `projected` CARRIES NO BANNER AT ALL. Mánu 2026-08-11: "remove yellow hazard
// over the time sheet. for the bottom one too." It is the default document and
// their own timesheet - there is nothing to warn anybody off, and an amber box
// on every page put a hazard stripe over the header on page one and across the
// attestation on page two. The sentence it carried has moved into the premium
// section at the bottom, in grey, next to the figure it is actually about.
const BASIS_BANNER = {
  assumed: {
    title: "IF EVERY ASSUMPTION HOLDS - reference copy, not a payslip.",
    body: "Every break with nothing on file is treated as taken here, whether or not it was. Not the copy sent for signature.",
  },
  corrected: {
    title: "AS CORRECTED - what would be left once everyone has answered.",
    body: "Assumptions are applied here except where somebody has told us they missed the break. Not the copy sent for signature.",
  },
};

// PORTRAIT. Most people open this on a phone, and a landscape page on a phone
// is a page you pinch and drag.
//
// It fits now because the Breaks column is gone: recorded breaks are drawn back
// onto the punch cells they happened in, which is where somebody looks for
// them. That frees 86pt, and narrower punch columns buy the rest.
const PAGE_W = 612;
const PAGE_H = 792;
// LANDSCAPE IS THE EXCEPTION, NOT THE DEFAULT. Mánu 2026-08-09, on days that
// need more punch columns than portrait can hold: "for those the sheet has to
// be landscape with those being the only exception."
//
// Showing an added rest as its own in and out costs two punch cells, so a day
// that already filled the row now overflows it. The alternative was wrapping
// onto a continuation line, which splits one day across two rows on the
// document somebody signs. Turning the page is the smaller cost, and only the
// sheets that need it turn.
const LANDSCAPE_W = 792;
const LANDSCAPE_H = 612;
const L = 28;
const R = PAGE_W - 28;

// Diagonal hazard stripes across one cell, drawn over its fill.
//
// pdf-lib has no pattern fill and no clipping path worth the trouble, so each
// stripe is a short line whose ends are clamped to the cell. A 45-degree line
// x = c - y stays inside the box when both ends are clamped to the same edges,
// which is why this is arithmetic rather than a clip.
//
// Kept coarse on purpose: at 4pt spacing the stripes moire against the grid
// when a page is scaled down to fit a phone, and the point is that somebody
// notices the cell is different, not that they can count the lines.
function hazard(page, x, y, w, h, color = ADDED_BAR) {
  const step = 5;
  const thickness = 1.1;
  for (let c = 0; c <= w + h; c += step) {
    // the line runs from (x + c, y) up-left to (x, y + c), clamped to the box
    const x1 = x + Math.min(c, w);
    const y1 = y + Math.max(0, c - w);
    const x2 = x + Math.max(0, c - h);
    const y2 = y + Math.min(c, h);
    if (x1 === x2 && y1 === y2) continue;
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color });
  }
}

const r2 = (n) => Math.round(n * 100) / 100;
const f2 = (n) => r2(n).toFixed(2);
// blank instead of 0.00 in the OT-style columns, like the source document
const orBlank = (n) => (n && r2(n) > 0 ? f2(n) : "");

// Column layout is built PER SHEET, not fixed.
//
// The form mirrored QSP's column set, which meant every sheet carried OT
// Exempt, Double Time and Holiday whether or not anybody had one. Across the
// whole 07/16-07/31 batch those three are blank on all 59 sheets and Over Time
// appears on 12, so 47 sheets were spending 136pt of a 736pt page on four empty
// columns - and paying for it in punch slots, where a day of more than seven
// pairs wrapped onto a second row.
//
// A column is included when THIS sheet uses it. That is self-correcting: a
// future period with a holiday or a double-time day gets the column back
// automatically, because the test is on the days in hand rather than on a
// belief about what QSP prints.
const PUNCH_W = 25;
// The date cell holds a day of the month now, not a whole date - the month and
// year moved to a title above the table, where they are said once instead of
// fourteen times.
const FIXED = { date: 26, regular: 36, overtime: 34, daily: 36, comments: 70 };
// Over Time is always shown: it is a column payroll expects to find, and 12 of
// the 59 use it. The other three are still conditional, and that is
// self-correcting - a future period with a holiday gets the column back
// automatically, because the test is on the days in hand rather than on a
// belief about what QSP prints. Across 07/16-07/31 all three are blank on all
// 59 sheets.
const OPTIONAL = [
  ["otExempt", "OT\nExempt", 30, (d) => (d.otExempt || d.printed?.otExempt || 0) > 0],
  ["double", "Double\nTime", 30, (d) => (d.doubleHours || 0) > 0],
  ["holiday", "Holiday", 30, (d) => (d.holiday || d.printed?.holiday || 0) > 0],
];

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

// "07/16/26" -> 16, and "16" -> "16th". Ordinals because the column now holds a
// day rather than a date, and "16" alone under a heading called Date reads like
// a number rather than a day.
export function dayOfMonth(date) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(String(date || "").trim());
  return m ? Number(m[2]) : null;
}
export function ordinal(n) {
  if (n == null) return "";
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] || "th"}`;
}

// "July 2nd Half 2026". Pay periods run the 1st-15th and the 16th to month end,
// so a period never spans two months.
export function periodTitle(payPeriod) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(String(payPeriod?.from || "").trim());
  if (!m) return "";
  const month = MONTHS[Number(m[1]) - 1];
  if (!month) return "";
  const yr = Number(m[3]);
  const year = yr < 100 ? 2000 + yr : yr;
  return `${month} ${Number(m[2]) <= 15 ? "1st" : "2nd"} Half ${year}`;
}

export function buildColumns(days, neededPunches = Infinity, pageWidth = PAGE_W) {
  const used = OPTIONAL.filter(([, , , test]) => (days || []).some(test));
  const fixedW =
    FIXED.date + FIXED.regular + FIXED.overtime + FIXED.daily + FIXED.comments +
    used.reduce((n, [, , w]) => n + w, 0);
  // Punch columns are sized to what THIS sheet uses, not to what the page could
  // hold. Fourteen slots on a person whose longest day is four punches left ten
  // empty cells on every row, which is ten columns of nothing to read past.
  //
  // Still in PAIRS - an in with no out is not a column, it is half a mistake -
  // and still capped by what fits, so a 22-punch day wraps rather than shrinks
  // the type to nothing.
  const avail = pageWidth - 2 * L - fixedW;
  const canFit = Math.max(2, Math.floor(avail / (PUNCH_W * 2)));
  const wanted = Math.max(2, Math.ceil(Math.min(neededPunches, canFit * 2) / 2));
  const pairs = Math.min(canFit, wanted);
  // whatever the punch block gives back widens the cells themselves before it
  // goes anywhere else - a wider cell is a more readable one, and the table
  // should still span the page rather than stop halfway across it.
  const punchW = Math.min(38, Math.floor(avail / (pairs * 2)));

  const cols = [["Date", FIXED.date]];
  const IDX = { date: 0, punch: [] };
  for (let i = 0; i < pairs * 2; i++) {
    IDX.punch.push(cols.length);
    cols.push([i % 2 === 0 ? "Time\nIn" : "Time\nOut", punchW]);
  }
  IDX.regular = cols.length; cols.push(["Reg\nHours", FIXED.regular]);
  for (const [key, label, w] of used) {
    IDX[key] = cols.length;
    cols.push([label, w]);
  }
  IDX.overtime = cols.length; cols.push(["Over\nTime", FIXED.overtime]);
  IDX.daily = cols.length; cols.push(["Daily\nTotal", FIXED.daily]);
  // punches only come in pairs, so a sheet is left with up to 49pt that will
  // not make another pair. it goes to Comments, which is the column that has
  // actually run out of room before - the overlapping bookings note needed
  // 117pt of a 72pt column and was clipped to "overlappi…" on 15 of 16 days.
  const slack = avail - pairs * 2 * punchW;
  IDX.comments = cols.length; cols.push(["Comments", FIXED.comments + Math.max(0, slack)]);

  const xs = [];
  let x = L;
  for (const [, w] of cols) { xs.push({ x, w }); x += w; }
  return { COLUMNS: cols, IDX, xs, right: x };
}

export async function renderCorrected(sheet, opts = {}) {
  // what the two reports recorded, per date. Empty when a batch predates the
  // stored rest times, in which case the Breaks column simply stays blank -
  // which is honest, and better than the old behaviour of colouring punch gaps
  // that nothing had recorded.
  //
  // MATCHED ON `restName`, NOT ON THE NAME PRINTED AT THE TOP OF THE PAGE. QSP
  // spells one person two ways across its own exports, and the Breaks column
  // came out EMPTY for the person it does that to while the engine had counted
  // her breaks and charged her no premium - the signed document disagreeing with
  // itself. See `restNameFor`. Falls back to the printed name, which is the same
  // string for everybody QSP spells consistently.
  const recorded = recordedBreaksFor(
    sheet.restName || sheet.employee,
    sheet.restsByDate || [],
    sheet.scheduleByDate || null,
  );

  // No clock readings in the file. pdf-lib stamps CreationDate and ModDate from
  // the system clock, so the same sheet rendered twice produced different bytes
  // - which matters now that the unsigned sheet is BUILT ON REQUEST rather than
  // stored. Every download would otherwise be a slightly different file, and
  // "is this the document they signed" would have no clean answer.
  //
  // The dates come from the stamp already on the row, so the metadata says the
  // same thing the footer does.
  const doc = await PDFDocument.create({ updateMetadata: false });
  const stampedAt = (() => {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(opts.generatedOn || "").trim());
    return m ? new Date(Date.UTC(+m[3], +m[1] - 1, +m[2])) : new Date(0);
  })();
  doc.setCreationDate(stampedAt);
  doc.setModificationDate(stampedAt);
  doc.setProducer("My Life Services");
  doc.setCreator("My Life Services");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  let logo = null;
  try {
    logo = await doc.embedPng(fs.readFileSync(LOGO_PATH));
  } catch {
    // logo is decorative - carry on without it rather than fail a payroll doc
  }

  // how many punch cells this sheet actually needs, AFTER the recorded breaks
  // are inserted - a rest that splits a worked segment adds four cells, so the
  // count has to be taken from the row that gets drawn, not the raw punches.
  // what the two reports recorded, PLUS anything the employee told us about a
  // day neither of them witnessed. Both, because the single-rest kinds still
  // write `statedRest` and the breaks question writes the list.
  const entriesFor = (d) =>
    withStatedBreaks(withStatedRest(recorded.get(d.date)?.order || [], d.statedRest), d.statedBreaks);
  const neededPunches = (sheet.days || []).reduce((n, d) => {
    const { punches } = insertRecordedBreaks(d.punches || [], entriesFor(d));
    return Math.max(n, punches.length);
  }, 2);

  // LANDSCAPE IS FOR SHEETS THE ADDED REST PUSHED OVER, AND NOTHING ELSE.
  //
  // Measured on the live batch before wiring this: 16 of 59 sheets need more
  // punch cells than portrait holds, and ALL SIXTEEN were already over the
  // limit - Gutierrez and McCulley need 22 against a capacity of 14, because an
  // on-clock rest splits a worked segment into three. Not one of them is caused
  // by an added rest. Turning the page on all of them would flip 27% of the
  // batch to landscape for a reason that predates this work, and against the
  // deliberate portrait choice: people open these on a phone.
  //
  // So the test is not "does it overflow" but "did WE make it overflow". Today
  // that is zero sheets, and it stays a safety valve rather than a redesign.
  const portrait = buildColumns(sheet.days, neededPunches);
  const withoutAdded = (sheet.days || []).reduce((n, d) => {
    const { punches } = insertRecordedBreaks(d.punches || [], entriesFor(d));
    return Math.max(n, punches.filter((x) => x.mark !== "added").length);
  }, 2);
  const needsLandscape =
    portrait.IDX.punch.length < neededPunches && withoutAdded <= portrait.IDX.punch.length;
  // these SHADOW the module-level portrait constants for the rest of this
  // function, so every measurement below follows the page actually in use.
  const PAGE_W = needsLandscape ? LANDSCAPE_W : 612;
  const PAGE_H = needsLandscape ? LANDSCAPE_H : 792;
  const R = PAGE_W - 28;
  const { COLUMNS, IDX, xs, right } = needsLandscape
    ? buildColumns(sheet.days, neededPunches, PAGE_W)
    : portrait;
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

  // The rules QSP's own form draws heavier: where the punch block ends and the
  // hours begin, and either side of Daily Total. They separate three different
  // kinds of number - times, computed hours, and the figure that gets paid -
  // and a uniform grid makes those read as one undifferentiated block.
  const HEAVY = new Set([
    IDX.punch[IDX.punch.length - 1] + 1, // after the last Time Out
    IDX.daily,                            // before Daily Total
    IDX.daily + 1,                        // after Daily Total
  ]);

  // draw the grid for the table section currently on this page
  const closeTable = () => {
    if (tableTop === null) return;
    const bottom = rowTops[rowTops.length - 1];
    for (const ry of rowTops) line(L, ry, right, ry);
    let vx = L;
    line(vx, tableTop, vx, bottom, GRID, 1.2);
    COLUMNS.forEach(([, w], i) => {
      vx += w;
      const heavy = HEAVY.has(i + 1) || i === COLUMNS.length - 1;
      line(vx, tableTop, vx, bottom, GRID, heavy ? 1.2 : 0.5);
    });
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
    text(title, (PAGE_W - bold.widthOfTextAtSize(title, 19)) / 2, y - 18, {
      size: 19, f: bold, color: BRAND,
    });
    y -= 56;
    text(sheet.onDutyMeal ? "My Life Services - Day Program" : "My Life Services", L, y, {
      size: 8.5, f: bold,
    });
    const pp = `Pay Period:  ${sheet.payPeriod?.from ?? ""} to ${sheet.payPeriod?.to ?? ""}`;
    text(pp, R - bold.widthOfTextAtSize(pp, 8.5), y, { size: 8.5, f: bold });
    y -= 18;
    text("Employee Name:", L, y, { size: 8.5 });
    text(sheet.employee ?? "", L + 74, y, { size: 8.5, f: bold });
    y -= 9;

    const banner = BASIS_BANNER[sheet.basis];
    if (banner) {
      // MEASURED AND SHRUNK, never wrapped. One line keeps the banner the same
      // height on every page of every sheet, portrait or landscape, so it
      // cannot push a table row onto a page of its own. 7.5pt fits both widths
      // with room to spare; the loop is here so a future edit to the wording
      // cannot silently run it through the right rule.
      const gap = 5;
      let size = 7.5;
      const wide = () =>
        bold.widthOfTextAtSize(banner.title, size) +
        gap + font.widthOfTextAtSize(banner.body, size) > R - L - 14;
      while (size > 5 && wide()) size -= 0.25;
      const boxH = size + 9;
      y -= 8;
      page.drawRectangle({
        x: L, y: y - boxH, width: R - L, height: boxH,
        color: NOTEBG, borderColor: NOTEBORDER, borderWidth: 0.6,
      });
      const base = y - boxH + (boxH - size) / 2 + 1;
      text(banner.title, L + 7, base, { size, f: bold, color: NOTEINK });
      text(banner.body, L + 7 + bold.widthOfTextAtSize(banner.title, size) + gap, base, {
        size, color: NOTEINK,
      });
      y -= boxH + 3;
    }
  };

  const newPage = (continued) => {
    closeTable();
    page = doc.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    drawPageHeader(continued);
  };

  const openTableHead = () => {
    // The month said once, above the table, instead of fourteen times down the
    // date column. Pay periods are the 1st-15th and the 16th to month end, so a
    // period never spans two months and this is always exact.
    const title = periodTitle(sheet.payPeriod);
    if (title) {
      text(title, (PAGE_W - bold.widthOfTextAtSize(title, 12)) / 2, y - 8, {
        size: 12, f: bold, color: BRAND,
      });
      y -= 17;
    }
    tableTop = y;
    COLUMNS.forEach(([label], i) => {
      const col = xs[i];
      const lines = label.split("\n");
      // headers shrink to fit rather than run over the rule beside them
      lines.forEach((ln, li) => {
        let size = 6.5;
        while (size > 4.5 && bold.widthOfTextAtSize(ln, size) > col.w - 3) size -= 0.2;
        const w = bold.widthOfTextAtSize(ln, size);
        text(ln, col.x + (col.w - w) / 2, y - 9 - li * 7.5, { size, f: bold });
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

  const footnotes = [];
  // does this sheet have a rest we added? decides the third key entry.
  let hasAdded = false;
  // and a thirty-minute entry we have drawn as a meal? decides the fourth.
  let hasAdjustedMeal = false;
  // ten minutes recorded against no shift at all, and a break with no times
  let hasOutside = false;
  let hasUnknown = false;

  for (const d of sheet.days) {
    const per = IDX.punch.length;

    // The recorded breaks go back onto the punch row, in the cells they
    // happened in. A rest taken properly is PAID and never left the clock, so
    // it splits a worked segment into three contiguous ones - 10a-2p becomes
    // 10a-12p, 12p-12:10p, 12:10p-2p, and the day still totals four hours.
    // A break with a start and an end always gets TWO cells, at its own times -
    // rest or meal, paid or unpaid. The one exception is a break that IS the
    // whole gap, where both punches are already on the row and repeating them
    // would just cost two columns.
    const entries = entriesFor(d);
    const { punches: shown, unplaced } = insertRecordedBreaks(d.punches || [], entries);
    if (shown.some((x) => x.mark === "added")) hasAdded = true;
    // an entry in the rest report that is a meal long. Drawn as the meal its
    // length says it is, and footnoted with what that would mean, but NOT
    // decided: counting it would remove the meal premium this day owes.
    //
    // Taken off the ENTRIES rather than the drawn cells - a break paints two
    // cells, and one footnote per cell would say everything twice.
    if (shown.some((x) => x.mark === "added-outside")) hasOutside = true;
    if (shown.some((x) => x.mark === "unknown-rest")) hasUnknown = true;

    for (const e of entries) {
      // Ten minutes recorded before the day started or after it ended.
      //
      // THIS SENTENCE HAS NOW BEEN WRONG IN BOTH DIRECTIONS. It said the
      // minutes were "paid time and have been added"; the 2026-08-09 evening
      // misclick ruling withheld them and it was rewritten to say so; the
      // 2026-08-11 flip pays them again, because reading a misclick into a
      // correct-looking entry is an ASSUMPTION and assumptions are not applied
      // on their own. Caught by reading the rendered sheet, not the build.
      if (e.kindOf === "rest" && e.outsideShift) {
        footnotes.push(
          `${d.date}: the ${e.from}-${e.to} rest break is recorded outside the shifts ` +
          `you were rostered for that day. We have taken it at face value and paid those ` +
          `minutes as a break off the clock. If the time was entered wrongly and you were ` +
          `not on a break then, say so on your timesheet page and they come back off.`,
        );
      }
      // the report says a break happened and holds neither end of it
      if (e.kindOf === "rest" && e.unknown) {
        footnotes.push(
          `${d.date}: a rest break is recorded on your ${e.shiftFrom}-${e.shiftTo} shift ` +
          `with no times on it, shown here as ???. Nothing is charged for it. Tell us ` +
          `when you took it and we will put the times in.`,
        );
      }
      // a meal the roster put at an hour nobody works, read twelve hours over
      if (e.kindOf === "meal" && e.ampmFixed) {
        footnotes.push(
          `${d.date}: your schedule rosters a meal break at ${e.wasFrom}-${e.wasTo}, ` +
          `which is the middle of the night. We have read that as ${e.from}-${e.to} and ` +
          `shown it there. Tell us if that is wrong.`,
        );
      }
      if (e.kindOf !== "meal" || !e.adjusted) continue;
      hasAdjustedMeal = true;
      footnotes.push(
        `${d.date}: the ${e.from}-${e.to} break is recorded as a REST but runs ` +
        `${e.minutes} minutes, which is the length of a meal period. It is shown as a ` +
        `meal and counted as neither, so nothing on this day has changed. Payroll will ` +
        `confirm which it was.`,
      );
    }
    // said in words, not in a colour: the times came from the person signing
    // rather than from either source document, and the sheet should not quietly
    // present that as something QSP recorded.
    if (d.statedRest?.from) {
      footnotes.push(
        `${d.date}: you told us you took this rest break at ${d.statedRest.from}, ` +
        `so it is shown at that time rather than the one the report holds.`,
      );
    }
    // BREAKS THE EMPLOYEE PUT ON THE RECORD THEMSELVES. Nothing witnessed these
    // at the time - that is why they were asked - so the sheet says whose
    // account they are, and where each time came from. A time somebody typed
    // and a time they accepted off their own schedule are different claims and
    // this document is the one they sign.
    if ((d.statedBreaks || []).length) {
      const said = (kind) => (d.statedBreaks || []).filter((b) => b.kindOf === kind);
      const parts = [];
      for (const b of said("meal")) parts.push(`a meal at ${b.from}`);
      for (const b of said("rest")) parts.push(`a rest break at ${b.from}`);
      const typed = (d.statedBreaks || []).filter((b) => b.source === "typed").length;
      const off = (d.statedBreaks || []).length - typed;
      footnotes.push(
        `${d.date}: you told us you took ${parts.join(" and ")}. Nothing recorded ` +
        `${parts.length === 1 ? "it" : "them"} at the time, so this is your own account of the day.` +
        (off ? ` ${off === (d.statedBreaks || []).length ? "Those times came" : "One of those times came"} from your schedule and you accepted ${off === 1 ? "it" : "them"}.` : ""),
      );
    }
    // EVERY `why` HERE IS ONE `insertRecordedBreaks` ACTUALLY PUSHES, and the
    // list is the whole of it: "recorded with no times", "unreadable times",
    // "not counted as a rest", "reversed in the report", "matches no punch".
    //
    // Two more branches used to sit at the top of this chain - "added off the
    // clock" and "added outside the shift" - and nothing had produced either
    // since before the off-clock rule was written. They were dead, and what they
    // said was "a rest period is paid time, so those minutes have been added to
    // the day", which stopped being true on 2026-08-12 when Mánu ruled that
    // nothing is added until the employee confirms the break. Dead copy asserting
    // a rule the engine does not follow is a trap for whoever reads this next.
    for (const u of unplaced) {
      const why =
        u.why === "reversed in the report"
          // says what we did AND that it was a judgement, not a fact. The report
          // held the end before the start, which cannot happen, so we read it as
          // the two boxes being filled in the wrong order. If that presumption is
          // wrong the times are wrong, and the person signing is the one who
          // would know.
          ? "was entered with the start and end the wrong way round in QSP's report. We have presumed that a mistake and reversed it to the times shown here."
          : u.why === "not counted as a rest"
            // said out loud rather than drawn. It is not coloured, because
            // nothing was added and the stripe means minutes were; it is not
            // silent either, because "QSP holds something unreadable here" is
            // worth telling the person who signs the page.
            ? "is too long to be a rest break, so it has not been counted or added to your hours. Worth fixing in QSClock."
            : u.why === "recorded with no times"
              ? "was recorded with no start or end time, and the shift it was filed against has no room on this row to draw it in. Nothing is charged for it."
              : u.why === "unreadable times"
                ? "was recorded with times we could not read, so it is not drawn on this row. Nothing is charged for it."
                : "does not fall inside any punch recorded on this day, so it is not drawn on this row.";
      footnotes.push(`${d.date}: ${u.kindOf} ${u.from}-${u.to} ${why}`);
    }

    // a long day wraps to continuation rows, exactly like the source export -
    // every punch stays visible on a document someone signs.
    const chunks = [];
    for (let i = 0; i < shown.length; i += per) chunks.push(shown.slice(i, i + per));
    if (!chunks.length) chunks.push([]);

    // keep a day's continuation rows together on one page
    ensure(chunks.length * rowH, { inTable: true });

    chunks.forEach((chunk, ci) => {
      const top = y;
      const base = y - rowH + 4.5;
      const isLast = ci === chunks.length - 1;

      // colour the cells the break actually happened in
      chunk.forEach((p, i) => {
        if (!p.mark) return;
        const col = xs[IDX.punch[i]];
        // blue for anything unpaid or unplaceable, yellow for a rest in the day
        const isMeal = p.mark === "meal" || p.mark === "meal-adjusted"
          || p.mark === "added-outside" || p.mark === "unknown-rest";
        page.drawRectangle({
          x: col.x, y: top - rowH, width: col.w, height: rowH,
          color: isMeal ? MEAL : REST,
        });
        // striped means "we changed something here": added minutes on a rest,
        // an entry moved out of the rest report, or ten minutes against no shift
        if (p.mark === "added") hazard(page, col.x, top - rowH, col.w, rowH);
        if (p.mark === "meal-adjusted") hazard(page, col.x, top - rowH, col.w, rowH, MEAL_BAR);
        if (p.mark === "added-outside") hazard(page, col.x, top - rowH, col.w, rowH, OUTSIDE_BAR);
      });

      // the day only - the month is in the title above the table
      if (ci === 0) centerIn(ordinal(dayOfMonth(d.date)), xs[IDX.date], base, { size: 7, f: bold });
      chunk.forEach((p, i) => centerIn(p.raw, xs[IDX.punch[i]], base, { size: 6.5 }));

      if (isLast) {
        centerIn(f2(d.regularHours), xs[IDX.regular], base, { size: 7.5 });
        // only drawn when the column exists on this sheet
        if (IDX.overtime != null) centerIn(orBlank(d.otHours), xs[IDX.overtime], base, { size: 7.5 });
        if (IDX.double != null) centerIn(orBlank(d.doubleHours), xs[IDX.double], base, { size: 7.5 });
        centerIn(f2(d.paidHours), xs[IDX.daily], base, { size: 7.5 });

        // Each note carries its own tone, because one row can hold both: the
        // 16th is a waived meal AND a missed rest, and printing the whole line
        // one colour makes the settled half look like a finding.
        const notes = [];
        const bad = (t) => notes.push({ t, tone: "bad" });
        const good = (t) => notes.push({ t, tone: "good" });
        // A DAY OFF SAYS SO ON THE DOCUMENT.
        //
        // The day program has no Misc classification, so time off is recorded
        // as a day with nominal punches and its hours held on `ptoHours`. Left
        // unlabelled it prints as an ordinary worked day and the person signs an
        // attestation that they worked hours they did not - which is the one
        // thing this column exists to prevent. It also owes no break, so
        // "compliant" would be true and completely misleading.
        if (d.isPto) {
          good(`Misc PTO${d.ptoHours ? ` ${f2(d.ptoHours)} hrs` : ""}`);
        }
        // NOTED, NOT CHARGED - the tone this sheet already uses for "+0.17
        // added" and "overlap *". A premium an assumption took away keeps its
        // words and loses its colour, which is the whole difference between the
        // documents: same finding, not being charged for.
        const noted = (t) => notes.push({ t, tone: "muted" });
        // set only on an ASSUMED or CORRECTED render, never on the projected one
        // that goes out - `applyAssumptions` cleared the violation flags this row
        // would otherwise have been drawn from, so without this the row goes
        // silent and prints "compliant". 359 rows on the live batch would claim
        // a clean day for a break nobody verified.
        const pn = d.premiumNote || null;
        if (d.mealLate) bad("meal started late");
        // a day past ten hours owes a SECOND meal, and "you got the first one
        // and not the second" is a different sentence from "you got no lunch".
        // §226.7 pays the same hour either way; the sheet still has to say
        // which one happened.
        else if (d.secondMealViolation && d.mealsRostered >= 1) {
          bad(d.secondMealLate ? "second meal started late" : "no second meal period");
        } else if (d.mealViolation) bad("no meal period");
        else if (pn?.meal === "taken") good("meal taken, confirmed");
        // a waived day is not a violation, and the sheet has to say which one it
        // is. printing nothing would make a waived day look identical to a day
        // where lunch was actually taken, and the only record of why 63 hours
        // came off the period would live in the engine.
        // "waiver on file" was the justification, not the outcome, and it made
        // the note the longest thing in a 70pt column. The waiver is a fact
        // about paperwork; the sheet only has to say the meal was waived.
        else if (d.mealWaived) good("meal waived");
        // print the count the VIOLATION was decided on, not the punch-gap count.
        // those differ whenever QSP's Rest Periods Report saw fewer breaks than
        // the gaps suggest, and the punch count is the one the engine
        // deliberately doesn't trust - so days were printing "rest 3/2" beside a
        // premium for missing rest breaks. 39 rows across 16 people did that.
        //
        // THE ASSUMED CASE IS HANDLED SEPARATELY, further down, as ONE phrase
        // naming both breaks and where the assumption stands. The order matters:
        // most of these days are `restUnknown` too - nothing recorded a rest at
        // all - so a later branch would print that sentence in red on a document
        // charging nothing for it.
        if (pn?.rest === "assumed") {
          // said below, with the meal
        } else if (d.restUnknown) {
          // "0 taken" and "nothing recorded it" are different claims, and only
          // one of them is a finding. Printing 0 for the second is asserting
          // something no source supports.
          bad(`rest: no record (${d.restRequired} owed)`);
        } else if (pn?.rest === "taken") {
          good("rest taken, confirmed");
        } else if (d.restViolation) {
          // PRINT THE FIGURE THE PREMIUM WAS DECIDED ON. This used to be
          // min(restCount, restRecorded), where restCount is the punch-gap
          // count - the number the engine deliberately does not trust. The
          // min() was added to stop days printing "rest 3/2", which it did,
          // and it introduced the mirror error: 66 days printed FEWER rests
          // than the engine had used and 22 printed more, across 31 people.
          // Mánu's 07/31 read "rest 0/2" while the report logged one and the
          // engine counted one.
          bad(`rest ${d.restTaken ?? 0}/${d.restRequired}`);
        }
        // hours credited exceed the window they sit in, so two client bookings
        // overlap. flagged rather than adjusted: entitlement follows hours
        // worked, and quietly paying less because the arithmetic looks odd is
        // the move this engine exists to avoid.
        // Marked here, explained in full under the table. The sentence this
        // deserves does not fit a 78pt column: at 4.4pt, the smallest size the
        // fitter will go to, it needed 117pt, so it was being truncated to
        // "overlappi…" on 15 of the 16 days that carry it. Shortening the
        // wording does not rescue it either - "overlap 8.00h" still only fits 2
        // of 16 once the meal and rest notes are in front of it. A day whose
        // hours are questioned is exactly the day whose explanation has to be
        // readable, so the marker stays in the cell and the sentence moves.
        if (d.compressedDay && d.onSiteMin != null) notes.push({ t: "overlap *", tone: "muted" });
        // HOURS THIS DAY GAINED, said out loud. A rest recorded while the person
        // was off the clock is paid time nobody paid for, so the minutes are
        // added rather than a premium charged (Mánu 2026-08-09). An employee
        // reading a daily total a fraction above what they punched is owed the
        // reason on the same line, otherwise the only place it exists is the
        // engine. Reads "+0.17 added" against the Daily Total beside it.
        if (d.addedHours > 0) notes.push({ t: `+${f2(d.addedHours)} added`, tone: "muted" });
        if (d.seventhDay) notes.push({ t: "7th day", tone: "muted" });
        // WHICH BREAKS WERE ASSUMED AND WHERE THE ASSUMPTION STANDS, as ONE
        // phrase. An answer covers the DAY rather than the break, so the state
        // is said once; and the finding and the state are merged because they
        // do not fit as two.
        //
        // EVERY WORD HERE WAS MEASURED, over all 59 sheets, against a control
        // of 0 clipped cells on the default sheet:
        //
        //     "no meal period, rest 1/2, needs confirmation"   226 clipped
        //     "meal + rest 1/2: needs confirmation"             45
        //     "meal + rest: needs confirmation"                 45
        //     "meal + rest: to confirm"                          3
        //
        // 68pt is the narrowest this column gets and the fitter stops shrinking
        // at 4pt, which buys about 25 characters once a row is already carrying
        // "overlap *" or "+0.17 added". The full phrase Mánu asked for lives in
        // the colour key three inches below, where there is room for it.
        //
        // IT GOES LAST DELIBERATELY. Moving it ahead of those two markers also
        // gives 3, but they are the ones clipped instead - and both explain the
        // Daily Total on the same row, while this one is spelled out in full
        // under the premium table. Given something has to give, it is this.
        //
        // Two states, and they are different claims. Before the deadline we are
        // still asking. After it the acknowledgment they signed has answered for
        // them, and the sheet says what the company is now treating as true
        // rather than leaving a question open that nobody is going to close
        // (Mánu 2026-08-09). "assumed taken" clips 13 rows to "assumed tak…",
        // against 1 for a bare "taken" that reads as nonsense beside "rest 0/1".
        if (pn && (pn.meal === "assumed" || pn.rest === "assumed")) {
          const which =
            pn.meal === "assumed" && pn.rest === "assumed"
              ? "meal + rest"
              : pn.meal === "assumed"
                ? "meal"
                : `rest ${pn.restTaken}/${pn.restRequired}`;
          noted(`${which}: ${pn.state === "not-documented" ? "assumed taken" : "to confirm"}`);
        }
        // A DAY WITH NOTHING TO SAY STILL SAYS SOMETHING. Mánu 2026-08-09: a
        // blank Comments cell reads as "we did not look", and the whole point of
        // this column is that somebody did. Green, so a clean day is legible at
        // a glance.
        if (!notes.length) good("compliant");
        {
          // the column is narrow and these notes vary in length, so shrink to
          // fit and only clip as a last resort. running past the column edge on
          // a document someone signs looks like a broken form.
          const col = xs[IDX.comments];
          const maxW = col.w - 6;
          // drawn segment by segment rather than as one string, so the settled
          // half of a row is green while the owed half stays red.
          const pieces = notes.map((n, i) => ({
            str: i < notes.length - 1 ? `${n.t}, ` : n.t,
            f: n.tone === "good" ? italic : font,
            color: n.tone === "bad" ? PREM : n.tone === "good" ? GOOD : MUTED,
          }));

          // MEASURED PER SEGMENT, IN THE FONT EACH ONE IS ACTUALLY DRAWN IN.
          // This used to size the joined string in `font` alone, so any row with
          // a green italic piece measured narrower than it drew.
          const widthAt = (sz) =>
            pieces.reduce((w, pc) => w + pc.f.widthOfTextAtSize(pc.str, sz), 0);
          let size = 6;
          while (size > 4 && widthAt(size) > maxW) size -= 0.2;

          // AND CLIP WHEN EVEN THE FLOOR DOES NOT FIT. The old code called a
          // helper that returned both an ellipsised string and a size, kept only
          // the size, and drew the full text at 4.4pt straight through the
          // table's right rule. Four rows on this batch, two of them before any
          // of today's changes: Uribe's 28th and 29th lost the "d" of "added"
          // through the border.
          let x = col.x + 3;
          const edge = col.x + 3 + maxW;
          for (const pc of pieces) {
            const room = edge - x;
            if (room <= 0) break;
            if (pc.f.widthOfTextAtSize(pc.str, size) <= room) {
              text(pc.str, x, base, { size, color: pc.color, f: pc.f });
              x += pc.f.widthOfTextAtSize(pc.str, size);
              continue;
            }
            let cut = pc.str;
            while (cut.length > 1 && pc.f.widthOfTextAtSize(`${cut}…`, size) > room) {
              cut = cut.slice(0, -1);
            }
            text(`${cut}…`, x, base, { size, color: pc.color, f: pc.f });
            break;
          }
        }
      }

      y -= rowH;
      rowTops.push(y);
    });
  }

  // TOTALS ROW, drawn outside the table grid.
  //
  // It used to be another row, so closeTable() ruled every punch column through
  // it and the sheet ended on a line of empty boxes. QSP's own form boxes only
  // the figures that carry a total and leaves the punch span open, which is
  // also the honest shape: there is no such thing as a total of a clock-in.
  ensure(rowH + 4, { inTable: true });
  closeTable();

  const tTop = y;
  const tBot = y - rowH;
  const tBase = tBot + 4.5;
  const from = xs[IDX.regular].x;
  line(from, tTop, right, tTop, GRID, 1.2);
  line(from, tBot, right, tBot, GRID, 1.2);
  for (let i = IDX.regular; i <= IDX.comments; i++) {
    const heavy = i === IDX.regular || i === IDX.daily || i === IDX.daily + 1;
    line(xs[i].x, tTop, xs[i].x, tBot, GRID, heavy ? 1.2 : 0.5);
  }
  line(right, tTop, right, tBot, GRID, 1.2);

  const totalsLabel = "Totals:";
  text(totalsLabel, from - bold.widthOfTextAtSize(totalsLabel, 8) - 6, tBase, { size: 8, f: bold });
  centerIn(f2(sheet.totals.regularHours), xs[IDX.regular], tBase, { size: 8, f: bold });
  if (IDX.overtime != null) centerIn(orBlank(sheet.totals.otHours), xs[IDX.overtime], tBase, { size: 8, f: bold });
  if (IDX.double != null) centerIn(orBlank(sheet.totals.doubleHours), xs[IDX.double], tBase, { size: 8, f: bold });
  centerIn(f2(sheet.totals.paidHours), xs[IDX.daily], tBase, { size: 8, f: bold });
  y = tBot;
  y -= 14;

  // ---------- miles driven ----------
  //
  // Mánu 2026-08-17: the mileage goes on the sheet they sign, and the
  // attestation covers it. A LINE UNDER THE TOTALS rather than a column,
  // because the payroll report states one figure per person for the whole
  // period - there is no per-day mileage to put in a row, and inventing a
  // column that is blank on every line but one would say the opposite.
  //
  // Drawn only when a figure exists. A batch whose payroll report predates the
  // mileage column has nothing to state, and printing "0.00" above a sentence
  // swearing it is accurate would ask somebody to attest to a number we never
  // received.
  if (sheet.milesDriven != null) {
    const milesLabel = "Miles driven this pay period:";
    text(milesLabel, L, y, { size: 8, f: bold });
    text(f2(sheet.milesDriven), L + bold.widthOfTextAtSize(milesLabel, 8) + 6, y, {
      size: 8, f: bold,
    });
    y -= 14;
  }

  // ---------- color key ----------
  // sits right under the table it explains - those highlights are in the punch
  // cells and nowhere else, so the legend belongs next to them rather than
  // three sections further down.
  // THE KEY LAYS ITSELF OUT NOW. It was three hand-placed x offsets, which was
  // fine at three entries and became a guessing game at five. Each entry is
  // measured, packed two to a row, and the box grows to fit - a legend that runs
  // off the page is worse than no legend.
  //
  // Only entries this sheet actually uses appear: a swatch for something not on
  // the page is a question nobody can answer by looking.
  const keyItems = [
    { fill: REST, label: "10-Minute Paid Rest Break" },
    // a day program sheet can never colour a meal cell - the meal is on-duty
    // and on the clock - so its key does not offer one. "a swatch for
    // something not on the page is a question nobody can answer by looking."
    ...(sheet.onDutyMeal ? [] : [{ fill: MEAL, label: "30-Minute Unpaid Meal Break" }]),
  ];
  // THE KEY MAY NOT PROMISE MINUTES THE SHEET DID NOT PAY.
  //
  // Both striped entries used to state flatly that the time had been added -
  // "the minutes paid as time off the clock". That was true from 2026-08-09 to
  // 2026-08-12, when a rest recorded off the clock was paid on sight. Mánu
  // reversed it on the 12th: nothing is added until the employee confirms the
  // break was taken there, and he was emphatic that paying it otherwise is
  // against policy. The key kept saying the old thing on the document they sign.
  //
  // Gated on `addedHours`, which is the only figure that can answer it: it is
  // what the totals row prints as ADDED, so the key and the total now agree by
  // construction. Nothing added means the sentence has to say so, because a
  // striped cell with no explanation reads as extra pay.
  //
  // NEITHER ENTRY TALKS ABOUT PAY ANY MORE. Mánu 2026-08-12 had "the minutes
  // have been added to your hours" removed from the key. The stripe says WHERE
  // the record puts the break and that we marked it; what the minutes did to the
  // total is the ADDED line's job, and it only prints when there is one.
  if (hasAdded) {
    keyItems.push({ fill: REST, bar: ADDED_BAR, label: "Rest Break recorded off the clock" });
  }
  if (hasAdjustedMeal) {
    keyItems.push({ fill: MEAL, bar: MEAL_BAR, label: "Meal Break - recorded as a rest break, and not counted as either" });
  }
  if (hasOutside) {
    keyItems.push({
      fill: MEAL, bar: OUTSIDE_BAR,
      label: "Rest Break recorded outside your shift - counted as a break you took",
    });
  }
  if (hasUnknown) {
    keyItems.push({ fill: MEAL, label: "??? - a rest break with no times recorded. Not charged to anyone." });
  }

  const keySize = 7.5;
  const swatchW = 22, gap = 6, pad = 14;
  const itemW = (it) => swatchW + gap + font.widthOfTextAtSize(it.label, keySize) + pad;
  // pack into rows that fit between "Color Key:" and the right rule
  const keyX0 = L + 58;
  const keyRows = [[]];
  let used = 0;
  for (const it of keyItems) {
    const w = itemW(it);
    if (used + w > R - keyX0 - 4 && keyRows[keyRows.length - 1].length) {
      keyRows.push([]);
      used = 0;
    }
    keyRows[keyRows.length - 1].push(it);
    used += w;
  }
  const keyH = 8 + keyRows.length * 12;
  ensure(keyH + 18);
  page.drawRectangle({
    x: L, y: y - keyH + 6, width: R - L, height: keyH,
    borderColor: BLACK, borderWidth: 0.8,
  });
  const keyTop = y - keyH + 6 + keyH - 12;
  text("Color Key:", L + 8, keyTop, { size: 8, f: bold });
  keyRows.forEach((row, ri) => {
    let x = keyX0;
    const ky = keyTop - ri * 12;
    for (const it of row) {
      page.drawRectangle({ x, y: ky - 3, width: swatchW, height: 10, color: it.fill, borderColor: GRID, borderWidth: 0.4 });
      if (it.bar) hazard(page, x, ky - 3, swatchW, 10, it.bar);
      text(it.label, x + swatchW + gap, ky, { size: keySize });
      x += itemW(it);
    }
  });
  y -= keyH + 8;

  // WHAT WAS ADDED, AND WHY - directly under the colour key, because the key is
  // where the striped cells are introduced and this is the sentence that says
  // what they mean.
  //
  // It used to sit at the very bottom with the reconciliation line, and on a
  // full sheet there was no room left: Uribe's went to a SECOND PAGE, alone,
  // after the signature block. An explanation for a figure is no use on a page
  // somebody has already stopped reading.
  // WHAT A GREY BREAK NOTE MEANS, said in full, directly under the table it
  // describes. The cells themselves only have room for "meal + rest: to
  // confirm" - 68pt at the narrowest, and the fitter bottoms out at 4pt - so
  // the sentence Mánu asked for lives here, where there is a whole page width
  // for it. Same reason the overlap marker is a "*" pointing at a paragraph.
  if ((sheet.days || []).some((d) => d.premiumNote)) {
    const due = (sheet.days || []).some((d) => d.premiumNote?.state === "not-documented");
    y = wrap(
      page,
      due
        ? "GREY BREAK NOTES: a meal or rest break with nothing on file recording it. The date for replying has passed, so these are being treated as taken and nothing is charged for them. Say so if any of them were missed."
        : "GREY BREAK NOTES: a meal or rest break with nothing on file recording it. This copy treats them as taken and charges nothing for them. The timesheet you sign charges every one, so these come off only if you confirm you took them.",
      L, y, R - L, { font: italic, size: 6.5, color: NOTEINK, leading: 8 },
    );
    y -= 4;
  }

  if ((sheet.totals.addedHours || 0) > 0) {
    const addedOt = sheet.totals.addedOtHours || 0;
    const ot = addedOt > 0
      ? ` ${f2(addedOt)} of it falls past eight hours in a day and is paid as overtime.`
      : "";
    y = wrap(
      page,
      // Only ever printed when `addedHours > 0`, which since 2026-08-12 means
      // the employee CONFIRMED the break. So it says that, rather than "a rest
      // period is paid time, so those minutes have been paid", which read as an
      // entitlement the engine applies on its own - the thing it stopped doing.
      `ADDED: ${f2(sheet.totals.addedHours)} hrs on top of the export. The striped cells are rest breaks the report recorded while you were clocked out, and you told us you took them then, so those minutes have been paid.${ot}`,
      L, y, R - L, { font: italic, size: 6.5, color: INK, leading: 8 },
    );
    y -= 4;
  }

  // Anything that could not be drawn on a row at all: a meal inside a longer
  // gap, a reversed row we corrected, times QSP wrote unreadably. Everything
  // else is said by the colour of the cell.
  if (footnotes.length) {
    // WRAPPED, because these are sentences now rather than fragments. Drawn as
    // one unbroken line they ran straight through the right rule and off the
    // page: "Payroll will confirm whic" was where 07/25 stopped.
    for (const fn of footnotes.slice(0, 6)) {
      ensure(18);
      y = wrap(page, "* " + fn, L, y, R - L, { font, size: 6, color: MUTED, leading: 7.5 });
    }
    ensure(12);
    if (footnotes.length > 6) {
      text("* and " + (footnotes.length - 6) + " more, listed on the checks screen", L, y, { size: 6, color: MUTED });
      y -= 8;
    }
    y -= 4;
  }

  // ---------- overlapping client bookings ----------
  // The days marked "overlap *" in the Comments column. Two client bookings run
  // over each other and QSP credits both in full, so the hours credited exceed
  // the time the person was actually on site.
  //
  // The entitlement is NOT reduced to fit the window. California measures a meal
  // and rest entitlement on hours worked, and quietly paying less because the
  // arithmetic looks odd is the move this whole engine exists to avoid. So the
  // day is stated plainly, above the signature, and a person decides.
  const overlaps = sheet.days.filter((d) => d.compressedDay && d.onSiteMin != null);
  if (overlaps.length) {
    ensure(30 + overlaps.length * 11);
    // "bookings", NOT "client bookings". The renderer only sees punches, so it
    // cannot know WHAT overlapped - and on 07/16-07/31 only 2 of 17 were two
    // clients. The other 15 were a client visit running over travel, training or
    // admin time. Naming a cause this document cannot verify is how a wage
    // statement ends up asserting something untrue.
    text("* Overlapping bookings", L, y, { size: 9.5, f: bold, color: BRAND });
    y -= 13;
    y = wrap(
      page,
      "On these days two bookings overlap, so more hours are credited than the " +
      "time between the first and last punch. Both bookings are paid in full, and what " +
      "breaks the day entitles you to is worked out on hours worked.",
      L, y, R - L, { font, size: 7.5, color: MUTED, leading: 9.5 },
    );
    y -= 4;
    for (const d of overlaps) {
      ensure(12);
      text(d.date, L + 8, y, { size: 7.5, f: bold });
      text(
        `${f2(d.paidHours)} hrs credited, ${f2(d.onSiteMin / 60)} hrs between first and last punch`,
        L + 60, y, { size: 7.5 },
      );
      y -= 11;
    }
    y -= 8;
  }

  // ---------- punch corrections ----------
  // days where a rest break's two times were recorded in reverse AND the
  // schedule the timesheet was generated from agrees with the corrected
  // figure. it sits above the
  // signature because we changed somebody's punches, and they should read that
  // before they sign rather than after.
  const fixes = sheet.punchCorrections || [];
  if (fixes.length) {
    ensure(34 + fixes.length * 15 + 34);
    text("Punch Corrections", L, y, { size: 10.5, f: bold, color: BRAND });
    y -= 16;

    const kw = [58, 176, 176, R - L - 58 - 176 - 176];
    const kx = [L, L + kw[0], L + kw[0] + kw[1], L + kw[0] + kw[1] + kw[2]];
    const khH = 15;
    page.drawRectangle({ x: L, y: y - khH + 4, width: R - L, height: khH, color: HEADBG });
    text("Date", kx[0] + 6, y - khH + 8, { size: 7.5, f: bold, color: WHITE });
    text("Recorded by QSP", kx[1] + 6, y - khH + 8, { size: 7.5, f: bold, color: WHITE });
    text("Read as", kx[2] + 6, y - khH + 8, { size: 7.5, f: bold, color: WHITE });
    text("Day total", kx[3] + 6, y - khH + 8, { size: 7.5, f: bold, color: WHITE });
    y -= khH + 4;

    for (const fx of fixes) {
      // a day can carry more than one reversed break, so each moved pair gets
      // its own line. one row listing every punch on the day ran straight
      // through the next column.
      const pairs = movedPairs(fx.was, fx.now);
      pairs.forEach((pr, i) => {
        ensure(14);
        if (i === 0) text(fx.date, kx[0] + 6, y, { size: 7.5 });
        text(pr.was, kx[1] + 6, y, { size: 7, color: PREM });
        text(pr.now, kx[2] + 6, y, { size: 7 });
        if (i === 0) {
          text(`${f2(fx.hoursBefore)} to ${f2(fx.hoursAfter)}`, kx[3] + 6, y, { size: 7.5, f: bold });
        }
        y -= 11;
      });
      line(L, y + 3, R, y + 3);
      y -= 5;
    }
    y -= 3;

    y = wrap(
      page,
      "A rest break's two times were recorded in reverse, so the same minutes were counted twice and the day read " +
        "high. The schedule for each day above agrees with the corrected figure, and your breaks are " +
        "unaffected. When you clock a rest break, enter the time you stop first, then the time you start again.",
      L, y, R - L, { font, size: 6.5, color: MUTED, leading: 8.5 },
    );
    y -= 10;
  }

  // ---------- premium table ----------
  const p = sheet.premiums;

  // WHAT THIS DOCUMENT LEFT OUT, AND WHY.
  //
  // On a projected or corrected sheet the premium table is only half the story:
  // the other half is every hour that was NOT charged because we assumed the
  // break was taken. On 50 of the 59 people in the live batch the table is
  // empty and this paragraph is the entire content of the section, which is
  // exactly why it cannot be optional - "No meal or rest break premiums due"
  // standing alone is a clean bill of health for something nobody verified.
  const assumedDays = (sheet.days || []).filter((d) => d.premiumNote);
  const assumedMeals = assumedDays.filter((d) => d.premiumNote.meal === "assumed").length;
  const assumedRests = assumedDays.filter((d) => d.premiumNote.rest === "assumed").length;
  const pastDue = assumedDays.some((d) => d.premiumNote.state === "not-documented");
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const assumedNote =
    assumedMeals + assumedRests > 0
      ? [
          `Assumed taken, not charged: ${
            [
              assumedMeals ? plural(assumedMeals, "meal period", "meal periods") : null,
              assumedRests ? plural(assumedRests, "rest break", "rest breaks") : null,
            ].filter(Boolean).join(" and ")
          }, on the days shown in grey above. Company policy asks you to enter your rest periods and your `
            + "lunch on your own schedule, and nothing on file says these were missed.",
          pastDue
            ? "The date for replying has passed, so these are being treated as taken under the acknowledgment you signed. If any of them were missed, say so and this figure changes."
            : "If any of them were missed, say so on your timesheet page and this figure changes.",
        ]
      : null;

  // drawn in a tinted box, the same one the banner uses, so the two halves of
  // "what this document is" read as one thing rather than as a stray footnote.
  const drawAssumedNote = (top) => {
    ensure(64);
    let cur = top;
    const boxTop = cur;
    cur -= 8;
    for (const para of assumedNote) {
      cur = wrap(page, para, L + 7, cur, R - L - 14, {
        font, size: 7, color: NOTEINK, leading: 9,
      });
      cur -= 3;
    }
    cur -= 4;
    // the fill goes down AFTER the height is known, and behind the text: pdf-lib
    // paints in call order, so drawing the box first would need the height
    // guessed and drawing it opaque afterwards would bury the paragraph.
    page.drawRectangle({
      x: L, y: cur, width: R - L, height: boxTop - cur,
      borderColor: NOTEBORDER, borderWidth: 0.6,
    });
    return cur - 12;
  };

  // THE §226.7 PREMIUM TABLE WAS DRAWN HERE, AND IT IS GONE.
  //
  // Keep the mention of penalty or premium fully out of the signable timesheet,
  // 2026-08-14. This was the last place either word printed anywhere an employee
  // reads - the review page stopped saying them on 2026-08-12 - and it was the
  // documented exception to that rule. The exception is withdrawn.
  //
  // What went: the "Break Premium Payments Due - California Labor Code §226.7"
  // heading, the Premium Type / Workdays with Violation / Hours Due table, its
  // meal and rest rows, the "Total premium hours due (paid at the employee's
  // regular rate of pay)" line, the "one additional hour of pay per workday"
  // note, the sentence about a break being paid as missed with the penalty in
  // the figure above, and both nil-case lines. The removed block is kept in
  // docs/week10/scratch/removed-premium-block.txt and in git.
  //
  // THE FIGURES ARE NOT LOST. `payout-pdf.js` is where payroll reads them and it
  // is untouched - that is an admin document. This file draws what gets signed.
  //
  // THE ASSUMED-TAKEN NOTE STAYS. It names neither word, and it is the half that
  // says what was NOT charged - on 50 of the 59 people in the live batch it was
  // the entire content of this section, and dropping it too would leave the
  // sheet reading as a clean bill of health for days nobody verified.
  if (assumedNote) y = drawAssumedNote(y);

  // ---------- attestation ----------
  // everything from here down is the signable trailer; keep it together rather
  // than splitting a signature block across a page break. the colour key used
  // to be part of this block, which is why the reservation is smaller than it
  // was - it now sits above, with the table it describes.
  //
  // counted rather than guessed: attestation 3 lines at 8.5 leading + 14 = 40,
  // signature 20, admin bar 18, admin box 42 + 16 = 58. that's 136, so 140
  // leaves a little slack. the old figure reserved less than the block actually
  // draws, and a sheet landing exactly on the boundary would have started the
  // trailer with too little room and tripped the footer guard below.
  y -= 12;
  // RAISED FROM 140 ON 2026-08-17, when the attestation grew two sentences and
  // the miles line joined the block. The old figure counted three attestation
  // lines; four fit in 34 rather than 25, and a sheet landing exactly on the
  // boundary would start the trailer with too little room and trip the footer
  // guard below - which is how a signature block ends up half off the page.
  const TRAILER_H = 158;
  ensure(TRAILER_H);

  // WHAT THEY ARE PUTTING THEIR NAME TO. Changed 2026-08-17 on Mánu's wording,
  // quoted and approved before it went in - this is the one paragraph on the
  // document that carries legal weight, so it is never reworded in passing.
  //
  // Two additions. The breaks sentence now says the missed ones are reported
  // accurately, which is the half the old wording left out: it attested only
  // that periods WERE received, so a person who missed one had nothing to
  // affirm about it. And mileage gets its own sentence, because the sheet now
  // carries the figure - see the line under the totals.
  //
  // THE MILEAGE SENTENCE ONLY APPEARS WHEN THE MILEAGE DOES. Caught by reading
  // a rendered July sheet: that batch's payroll report predates the mileage
  // column, so no figure is printed - and the paragraph still asked the person
  // to swear that "the miles recorded above" were accurate. Attesting to a
  // number that is not on the page is exactly the kind of sentence that makes
  // a signed document worthless, so it is gated on the same value the line is.
  // THE DAY PROGRAM VARIANT differs in exactly one clause: there is no unpaid
  // meal period to attest to, because day program staff work an on-duty paid
  // meal under the signed agreement, so the meal half of the sentence says
  // that instead. Chosen by the flag the day program pipeline sets on its
  // sheets; an MLS sheet can never carry it, and the MLS paragraph below is
  // untouched.
  const attest = sheet.onDutyMeal
    ? "I attest that all hours I worked during the pay period recorded above are the actual hours I worked on each day, including all overtime hours worked. Unless otherwise recorded above, " +
      "I attest that I have received all my rest and recovery periods consistent with My Life Services's policy and applicable law, and that every rest period I did not take is " +
      "accurately reported above. I understand that my meal period is an on-duty paid meal period consistent with the meal period agreement I have signed. " +
      "I also attest that I reported every injury sustained on the job during the pay period, if there were any."
    : "I attest that all hours I worked during the pay period recorded above are the actual hours I worked on each day, including all overtime hours worked. Unless otherwise recorded above, " +
    "I attest that I have received all my meal, rest and recovery periods consistent with My Life Services's policy and applicable law, and that every meal and rest period I did not take is " +
    "accurately reported above. " +
    (sheet.milesDriven != null
      ? "I attest that the miles recorded above are the actual miles I drove for work during this pay period. "
      : "") +
    "I also attest that I reported every injury sustained on the job during the pay period, if there were any.";
  y = wrapCentered(page, attest, L, y, R - L, { font, size: 6.5, color: INK, leading: 8.5 });
  y -= 14;

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
  // THE PAYOUT NOTE WENT WITH THE TABLE. It read "Verify the N premium hours
  // above before payout" and it pointed at a table that is no longer drawn, so
  // it was both the word we are removing and a reference to nothing. It was
  // aimed at payroll anyway, and payroll reads the payout report - which still
  // carries every figure.
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

  // A LINE IS EITHER QSP'S OR SOMEBODY'S WORDS. QSP's notes arrive as plain
  // strings and print upright; a break comment arrives as `{ text, italic }`
  // from `render-sheet.js` and prints in italic, already quoted. Mánu
  // 2026-08-17, on the sheet people sign off. Strings still work untouched, so
  // every other caller of `renderCorrected` - the rebuild's check render among
  // them - is unaffected.
  for (const c of comments) {
    ensure(11);
    const body = typeof c === "string" ? c : c?.text;
    if (!body) continue;
    y = wrap(page, body, L, y, R - L, {
      font: typeof c === "string" || !c?.italic ? font : italic,
      size: 6.5, color: INK, leading: 8,
    });
    y -= 1;
  }
  y -= 8;

  // Reconciliation line so payroll can tie this back to the QSP export.
  //
  // This used to say the correction adds paid rest breaks into hours worked.
  // QSP stopped deducting them on 2026-08-06, so on a current export there is
  // usually nothing to add and the two figures match - describing a correction
  // that did not happen is worse than saying nothing. Say what is actually true
  // of THIS sheet instead.
  const moved = Math.abs(sheet.totals.paidHours - sheet.totals.rawHours) >= 0.005;
  const added = sheet.totals.addedHours || 0;
  const addedOt = sheet.totals.addedOtHours || 0;
  // AND IT STILL SAID IT, on 14 of the 119 sheets in the two live batches.
  //
  // "rest breaks the export left out are paid time and have been added back" is
  // the only sentence the moved branch had, and on every one of those 14 sheets
  // it was false. Measured 2026-08-12: 13 of the 15 moved days differ by exactly
  // 0.01 hrs, which is rounding - the day is summed from its own punch minutes
  // and QSP rounds each segment separately, so Solorzano's 480 worked minutes
  // print as 7.99 there and 8.00 here. The other two are `restsFromShortMeals`:
  // a meal block the roster booked for only ten minutes is a rest period, and a
  // rest period is paid.
  //
  // NONE of it is a rest break added back, and none of it is the off-clock
  // minutes - `addedHours` is zero on all 119, because nobody has confirmed one.
  // Mánu 2026-08-12: the sheet must not talk about gaining hours that way at all.
  // So each cause says its own name, and where nothing was added the line says
  // so outright rather than leaving a difference for somebody to read as pay.
  const shortMealDays = (sheet.days || []).filter((d) => (d.restsFromShortMeals || 0) > 0).length;
  text(
    !moved
      ? `As exported by QSP: ${f2(sheet.totals.rawHours)} hrs. Hours are unchanged; rest breaks are already paid in the export.`
      : added > 0
        ? `As exported by QSP: ${f2(sheet.totals.rawHours)} hrs. This sheet totals ${f2(sheet.totals.paidHours)} hrs: ${f2(added)} hrs of rest breaks you told us you took while clocked out have been added.`
        : shortMealDays > 0
          ? `As exported by QSP: ${f2(sheet.totals.rawHours)} hrs. This sheet totals ${f2(sheet.totals.paidHours)} hrs. On ${shortMealDays} ${shortMealDays === 1 ? "day" : "days"} the roster booked a meal break only ten minutes long - that is a rest period, not a meal, and a rest period is paid - so those minutes are in your hours. No other break time has been added.`
          : `As exported by QSP: ${f2(sheet.totals.rawHours)} hrs. This sheet totals ${f2(sheet.totals.paidHours)} hrs. The difference is rounding: each day is worked out from its own punch times, and QSP rounds each segment separately. No break time has been added.`,
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

// which punches actually moved, as out/in pairs. showing the whole day's punch
// list instead is unreadable and overflows the column.
function movedPairs(was, now) {
  const a = was || [], b = now || [];
  const idx = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) idx.push(i);
  const pairs = [];
  for (let i = 0; i + 1 < idx.length; i += 2) {
    const x = idx[i], z = idx[i + 1];
    pairs.push({ was: `${a[x]} out, ${a[z]} in`, now: `${b[x]} out, ${b[z]} in` });
  }
  // odd number of moved punches shouldn't happen for a swap, but never render
  // nothing - fall back to the two lists.
  return pairs.length ? pairs : [{ was: a.join(" "), now: b.join(" ") }];
}

// shrink a single line until it fits `maxW`, then clip with an ellipsis if it
// still doesn't. returns the string and the size to draw it at.
// which two cells a break's highlight belongs behind.
//
// At upload time `b.start` IS the object sitting in `punches`, so identity finds
// it. A sheet rendered from STORED days has been through JSON, so `b.start` is a
// copy and identity finds nothing - which silently dropped every meal and rest
// highlight the moment anyone pressed Recompute (0 of 441 breaks resolved, 54 of
// 59 sheets), while the colour key underneath carried on explaining colours that
// were no longer on the page.
//
// Matching on value alone is NOT enough: a punch out and the next punch in
// routinely share a time, so one key matches two different cells - Ruth Delgado
// Pineda 07/20 has 3:15p twice. A break always spans two ADJACENT punches
// (parse.js builds it from p[i+1] and p[i+2]), so it is the PAIR that identifies
// the position, not either punch on its own.
// NO LONGER USED BY THE RENDERER. Breaks are not painted onto punch cells any
// more - they are printed in the Breaks column from what the two reports
// recorded, because a punch gap is not evidence of a break and a properly taken
// rest leaves no gap at all.
//
// Kept, with its tests, because those tests record two real bugs: highlights
// vanishing on recompute when identity was matched by object reference, and a
// repeated punch time sending a highlight to the wrong cell. Delete both
// together if punch-cell colouring is never coming back.
export function breakCells(punches, at, b) {
  const byId = [at.get(b.start), at.get(b.end)];
  if (byId[0] && byId[1]) return byId;
  const same = (x, z) => x && z && x.min === z.min && x.raw === z.raw;
  for (let i = 0; i + 1 < punches.length; i++) {
    if (same(punches[i], b.start) && same(punches[i + 1], b.end)) {
      return [at.get(punches[i]), at.get(punches[i + 1])];
    }
  }
  return [];
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
