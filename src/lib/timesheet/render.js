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
import { recordedBreaksFor, insertRecordedBreaks } from "./recorded-breaks.js";

// read straight off disk - this only ever runs server-side.
const LOGO_PATH = path.join(process.cwd(), "public", "logo", "MLSlogo.png");

// palette lifted from the approved sample
const REST = rgb(1, 0.949, 0.6);        // 10-min paid rest break
const MEAL = rgb(0.71, 0.85, 0.98);     // 30-min unpaid meal break
const INK = rgb(0.05, 0.05, 0.05);
const MUTED = rgb(0.45, 0.5, 0.55);
const GRID = rgb(0.45, 0.5, 0.55);
const BRAND = rgb(0.086, 0.325, 0.529); // headline blue
const HEADBG = rgb(0.106, 0.298, 0.404);// premium table header
const TOTALBG = rgb(0.878, 0.949, 0.961);
const PREM = rgb(0.7, 0.11, 0.11);
const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0, 0, 0);

// PORTRAIT. Most people open this on a phone, and a landscape page on a phone
// is a page you pinch and drag.
//
// It fits now because the Breaks column is gone: recorded breaks are drawn back
// onto the punch cells they happened in, which is where somebody looks for
// them. That frees 86pt, and narrower punch columns buy the rest.
const PAGE_W = 612;
const PAGE_H = 792;
const L = 28;
const R = PAGE_W - 28;

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

export function buildColumns(days, neededPunches = Infinity) {
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
  const avail = PAGE_W - 2 * L - fixedW;
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
  const recorded = recordedBreaksFor(
    sheet.employee,
    sheet.restsByDate || [],
    sheet.scheduleByDate || null,
  );

  const doc = await PDFDocument.create();
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
  const neededPunches = (sheet.days || []).reduce((n, d) => {
    const { punches } = insertRecordedBreaks(d.punches || [], recorded.get(d.date)?.order || []);
    return Math.max(n, punches.length);
  }, 2);

  const { COLUMNS, IDX, xs, right } = buildColumns(sheet.days, neededPunches);
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
    text("My Life Services", L, y, { size: 8.5, f: bold });
    const pp = `Pay Period:  ${sheet.payPeriod?.from ?? ""} to ${sheet.payPeriod?.to ?? ""}`;
    text(pp, R - bold.widthOfTextAtSize(pp, 8.5), y, { size: 8.5, f: bold });
    y -= 18;
    text("Employee Name:", L, y, { size: 8.5 });
    text(sheet.employee ?? "", L + 74, y, { size: 8.5, f: bold });
    y -= 16;
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
      text(title, (PAGE_W - bold.widthOfTextAtSize(title, 11)) / 2, y - 9, {
        size: 11, f: bold, color: BRAND,
      });
      y -= 20;
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

  for (const d of sheet.days) {
    const per = IDX.punch.length;

    // The recorded breaks go back onto the punch row, in the cells they
    // happened in. A rest taken properly is PAID and never left the clock, so
    // it splits a worked segment into three contiguous ones - 10a-2p becomes
    // 10a-12p, 12p-12:10p, 12:10p-2p, and the day still totals four hours.
    // Where the break sits inside a longer gap the bounding cells are coloured
    // instead and the exact times go in a footnote, because putting punches
    // inside unpaid time would claim hours nobody worked.
    const rec = recorded.get(d.date);
    const { punches: shown, unplaced } = insertRecordedBreaks(d.punches || [], rec?.order || []);
    for (const u of unplaced) {
      footnotes.push(
        `${d.date}: ${u.kindOf} ${u.from}-${u.to} ${
          u.why === "inside a longer gap" ? "falls inside the highlighted gap" : "matches no punch"
        }`,
      );
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
        page.drawRectangle({
          x: col.x, y: top - rowH, width: col.w, height: rowH,
          color: p.mark === "rest" ? REST : MEAL,
        });
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

        const notes = [];
        if (d.mealLate) notes.push("meal started late");
        else if (d.mealViolation) notes.push("no meal period");
        // print the count the VIOLATION was decided on, not the punch-gap count.
        // those differ whenever QSP's Rest Periods Report saw fewer breaks than
        // the gaps suggest, and the punch count is the one the engine
        // deliberately doesn't trust - so days were printing "rest 3/2" beside a
        // premium for missing rest breaks. 39 rows across 16 people did that.
        if (d.restUnknown) {
          // "0 taken" and "nothing recorded it" are different claims, and only
          // one of them is a finding. Printing 0 for the second is asserting
          // something no source supports.
          notes.push(`rest: no record (${d.restRequired} owed)`);
        } else if (d.restViolation) {
          // PRINT THE FIGURE THE PREMIUM WAS DECIDED ON. This used to be
          // min(restCount, restRecorded), where restCount is the punch-gap
          // count - the number the engine deliberately does not trust. The
          // min() was added to stop days printing "rest 3/2", which it did,
          // and it introduced the mirror error: 66 days printed FEWER rests
          // than the engine had used and 22 printed more, across 31 people.
          // Mánu's 07/31 read "rest 0/2" while the report logged one and the
          // engine counted one.
          notes.push(`rest ${d.restTaken ?? 0}/${d.restRequired}`);
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
        if (d.compressedDay && d.onSiteMin != null) notes.push("overlap *");
        if (d.seventhDay) notes.push("7th day");
        if (notes.length) {
          // the column is narrow and these notes vary in length, so shrink to
          // fit and only clip as a last resort. running past the column edge on
          // a document someone signs looks like a broken form.
          const col = xs[IDX.comments];
          const maxW = col.w - 6;
          const { str, size } = fitText(notes.join(", "), maxW, font, 6, 4.4);
          text(str, col.x + 3, base, { size, color: PREM });
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

  // ---------- color key ----------
  // sits right under the table it explains - those highlights are in the punch
  // cells and nowhere else, so the legend belongs next to them rather than
  // three sections further down.
  const keyH = 20;
  ensure(keyH + 18);
  page.drawRectangle({
    x: L, y: y - keyH + 6, width: R - L, height: keyH,
    borderColor: BLACK, borderWidth: 0.8,
  });
  const keyY = y - keyH + 12;
  // reflowed for the portrait page: the old spacing was measured against a
  // 736pt table and ran the last label off a 556pt one.
  text("Color Key:", L + 8, keyY, { size: 8, f: bold });
  page.drawRectangle({ x: L + 58, y: keyY - 3, width: 22, height: 10, color: REST, borderColor: GRID, borderWidth: 0.4 });
  text("10-Minute Paid Rest Break", L + 86, keyY, { size: 7.5 });
  page.drawRectangle({ x: L + 196, y: keyY - 3, width: 22, height: 10, color: MEAL, borderColor: GRID, borderWidth: 0.4 });
  text("30-Minute Unpaid Meal Break", L + 224, keyY, { size: 7.5 });
  text("Hours include paid rest break time.", L + 348, keyY, { size: 6.5, color: MUTED });
  y -= keyH + 8;

  // Breaks the record puts INSIDE a highlighted gap rather than matching it,
  // and breaks that line up with no punch at all. The colour can only be
  // approximate for those, so the exact times are stated rather than implied.
  if (footnotes.length) {
    ensure(12 + Math.min(footnotes.length, 7) * 8);
    for (const fn of footnotes.slice(0, 6)) {
      text("* " + fn, L, y, { size: 6, color: MUTED });
      y -= 8;
    }
    if (footnotes.length > 6) {
      text("* and " + (footnotes.length - 6) + " more, listed on the checks screen", L, y, { size: 6, color: MUTED });
      y -= 8;
    }
    y -= 6;
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
      "time between the first and last punch. Both bookings are paid in full, and break " +
      "premiums are worked out on hours worked.",
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
        "high. The schedule for each day above agrees with the corrected figure, and your break premiums are " +
        "unchanged. When you clock a rest break, enter the time you stop first, then the time you start again.",
      L, y, R - L, { font, size: 6.5, color: MUTED, leading: 8.5 },
    );
    y -= 10;
  }

  // ---------- premium table ----------
  const p = sheet.premiums;
  if (p.totalHours > 0) {
    // header + both rows + total, kept on one page
    ensure(40 + (p.mealDays.length ? 22 : 0) + (p.restDays.length ? 30 : 0) + 40);
    text("Break Premium Payments Due - California Labor Code \u00A7226.7", L, y, {
      size: 10.5, f: bold, color: BRAND,
    });
    y -= 16;

    const cw = [172, 300, R - L - 172 - 300];
    const cx = [L, L + cw[0], L + cw[0] + cw[1]];
    const hH = 15;
    page.drawRectangle({ x: L, y: y - hH + 4, width: R - L, height: hH, color: HEADBG });
    text("Premium Type", cx[0] + 6, y - hH + 8, { size: 7.5, f: bold, color: WHITE });
    text("Workdays with Violation", cx[1] + 6, y - hH + 8, { size: 7.5, f: bold, color: WHITE });
    text("Hours Due", cx[2] + 6, y - hH + 8, { size: 7.5, f: bold, color: WHITE });
    y -= hH + 4;

    const premRow = (label, days, hrs, note) => {
      if (!days.length) return;
      const startY = y;
      text(label, cx[0] + 6, y, { size: 7.5 });
      const listText = days.join(", ") + (note ? `  ${note}` : "");
      const endY = wrap(page, listText, cx[1] + 6, y, cw[1] - 12, {
        font, size: 7, color: INK, leading: 8.5,
      });
      text(`${f2(hrs)} hrs`, cx[2] + 6, y, { size: 7.5, f: bold, color: PREM });
      y = Math.min(startY - 12, endY - 4);
      line(L, y + 3, R, y + 3);
      y -= 9;
    };
    premRow(
      "Meal period premium",
      p.mealDays,
      p.mealHours,
      "(no meal period taken, or not started by the end of the fifth hour)",
    );
    premRow("Rest break premium", p.restDays, p.restHours, "");

    const totH = 15;
    page.drawRectangle({ x: L, y: y - totH + 5, width: R - L, height: totH, color: TOTALBG });
    text("Total premium hours due (paid at the employee's regular rate of pay)", cx[0] + 6, y - totH + 9, {
      size: 7.5, f: bold,
    });
    text(`${f2(p.totalHours)} hrs`, cx[2] + 6, y - totH + 9, { size: 7.5, f: bold, color: PREM });
    y -= totH + 10;

    // "verify before payout" used to live here. it's aimed at payroll, and this
    // table now sits above the employee's signature, so it reads as an
    // instruction to the person signing. moved down to the admin trailer.
    text(
      "One additional hour of pay per workday for a missed meal period and for missed rest break(s) - max one of each per day.",
      L, y, { size: 6.5, color: MUTED },
    );
    y -= 14;
  } else {
    text("No meal or rest break premiums due for this pay period.", L, y, {
      size: 9, f: bold, color: rgb(0.05, 0.4, 0.25),
    });
    y -= 16;
  }

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
  const TRAILER_H = 140;
  ensure(TRAILER_H);

  const attest =
    "I attest that all hours I worked during the pay period recorded above are the actual hours I worked on each day, including all overtime hours worked. Unless otherwise recorded above, " +
    "I attest that I have received all my meal, rest and recovery periods consistent with My Life Services's policy and applicable law. I also attest that I reported every injury sustained on " +
    "the job during the pay period, if there were any.";
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
  // the payout note lives in here rather than under the premium table. that
  // table now sits above the employee's signature, and "verify before payout"
  // is aimed at payroll, not at the person signing. the box already had the
  // empty space, so this costs no page length.
  if (p.totalHours > 0) {
    text(`Verify the ${f2(p.totalHours)} premium hours above before payout.`, L + 6, adminBoxTop - 12, {
      size: 6.5, color: MUTED,
    });
  }
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

  for (const c of comments) {
    ensure(11);
    y = wrap(page, c, L, y, R - L, { font, size: 6.5, color: INK, leading: 8 });
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
  text(
    moved
      ? `As exported by QSP: ${f2(sheet.totals.rawHours)} hrs. Corrected to ${f2(sheet.totals.paidHours)} hrs - rest breaks the export left out are paid time and have been added back.`
      : `As exported by QSP: ${f2(sheet.totals.rawHours)} hrs. Hours are unchanged; rest breaks are already paid in the export. This sheet corrects break premiums only.`,
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

function fitText(str, maxW, font, startSize, minSize) {
  let size = startSize;
  while (size > minSize && font.widthOfTextAtSize(str, size) > maxW) {
    size -= 0.2;
  }
  if (font.widthOfTextAtSize(str, size) <= maxW) return { str, size };

  let out = str;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, size) > maxW) {
    out = out.slice(0, -1);
  }
  return { str: `${out}…`, size };
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
