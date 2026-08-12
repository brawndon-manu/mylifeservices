// the QSP "Employee Schedules" export: one month-calendar page per employee.
//
// IT IS NOT AN INDEPENDENT WITNESS, and this file used to claim it was.
//
// The Simple Timesheet is generated FROM the schedule, not from clock punches.
// Measured on 07/16-07/31: of 114 days where the schedule and QSClock disagree
// about when somebody started, the timesheet followed the schedule 93 times and
// the clock 0. Across 632 day-cases the two agree to a rounding hundredth 63% of
// the time and differ by more than an hour exactly once. The "Time In / Time
// Out" columns on the timesheet are rostered shift times wearing punch clothes.
//
// So comparing the two is not corroboration - it is comparing a document to its
// own source. That still earns its keep, because the schedule is the CLEAN
// original and the timesheet is the copy that gets mangled during entry: times
// typed into the wrong box, or with the wrong meridiem, in ways that cancel out
// and hide from the punches alone. When a repaired day matches the schedule we
// have recovered what was originally entered. What we have NOT done is confirm
// it against a second observation of the same day.
//
// The only files holding actual behaviour are QSClock and the Rest Periods
// Report. Anything read here is the plan.
//
// what it holds: dated entries like "8:30a-11:30a Chapman, J-ILS Service(3:00)",
// each printing its own length, plus meal breaks. what it does NOT hold: rest
// periods. not one, anywhere in the document. so this can corroborate hours and
// meals and can say nothing at all about rest breaks.
//
// parsed off text positions rather than reading order: the page is a 7-column
// grid, the day numbers are their own text items, and everything else belongs to
// whichever cell it sits inside.

// pdfjs wants browser globals at load time, same as parse.js. kept lazy so a
// client bundle never drags the pdf stack in.
function ensurePdfGlobals() {
  const g = globalThis;
  if (typeof g.DOMMatrix === "undefined") {
    g.DOMMatrix = class DOMMatrix {
      constructor(init) {
        const m = Array.isArray(init) ? init : [1, 0, 0, 1, 0, 0];
        [this.a, this.b, this.c, this.d, this.e, this.f] = m;
      }
      multiply() { return this; }
      invertSelf() { return this; }
      translate() { return this; }
      scale() { return this; }
    };
  }
  if (typeof g.Path2D === "undefined") {
    g.Path2D = class Path2D {
      addPath() {} moveTo() {} lineTo() {} closePath() {}
      rect() {} bezierCurveTo() {} quadraticCurveTo() {}
    };
  }
  if (typeof g.ImageData === "undefined") {
    g.ImageData = class ImageData {
      constructor(width, height) {
        this.width = width;
        this.height = height;
        this.data = new Uint8ClampedArray(Math.max(0, width * height * 4));
      }
    };
  }
}

let pdfjsPromise = null;
function getPdfjs() {
  if (!pdfjsPromise) {
    ensurePdfGlobals();
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs");
  }
  return pdfjsPromise;
}

const MONTHS = ["january","february","march","april","may","june","july",
  "august","september","october","november","december"];

// "Service(3:00)" / "-Meal Break(0:30)" - every entry prints its own length
const DURATION = /\((\d+):(\d\d)\)/;
// an entry always opens with its time range: "8:30a-11:30a", "12p-2p", "9a-11a".
// the lookbehind matters: without it "8:30a" also matches at the "30a", and the
// entry gets split down the middle of its own start time.
const ENTRY_START = /(?=(?<![:\d])\d{1,2}(?::\d{2})?[ap]\s*-\s*\d{1,2}(?::\d{2})?[ap])/g;

function isMeal(text) {
  return /meal\s*(break|period)/i.test(text);
}

// group a page's text items into calendar cells and pull the entries out of each
// `prev` is the page before this one. a month can run over onto a second page,
// and the split lands MID-WEEK: the entries that don't fit carry on at the top
// of the next page with no day number above them, and that page has no
// "Employee:" header either. read on its own it looks like nothing, so those
// shifts used to be dropped - the scheduled total came out short and the checks
// screen then accused a day that was fine.
function readPage(items, prev = null, pageNum = 0) {
  const header = items.map((i) => i.str).join(" ").replace(/\s+/g, " ");
  const who = /Employee:\s*(.+?)\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i.exec(header);
  const when = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i.exec(header);

  // no header = a continuation of whoever was on the last page
  const isContinuation = (!who || !when) && !!prev;
  if ((!who || !when) && !isContinuation) return null;

  const month = isContinuation ? prev.month : MONTHS.indexOf(when[1].toLowerCase());
  const year = isContinuation ? prev.year : +when[2];

  const pos = items
    .filter((i) => i.str && i.str.trim())
    .map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0 }));

  // the day numbers are bare integers and they define the grid
  const dayCells = pos.filter((p) => /^\d{1,2}$/.test(p.s.trim()) && +p.s <= 31);
  // a full page needs a real grid; a continuation may carry only a row or two,
  // and can legitimately have none at all if only the spill-over fits.
  if (!isContinuation && dayCells.length < 20) return null;
  if (isContinuation && !dayCells.length && !prev.lastRow) return null;

  // day numbers are CENTRED in their cell, so "10" starts further left than "1".
  // taking transform[4] at face value splits every column in two - cluster on the
  // middle of the glyph run instead.
  const centres = dayCells.map((d) => d.x + d.w / 2).sort((a, b) => a - b);
  const colCentres = [];
  for (const c of centres) {
    const last = colCentres[colCentres.length - 1];
    if (last && c - last.sum / last.n < 40) {
      last.sum += c;
      last.n++;
    } else {
      colCentres.push({ sum: c, n: 1 });
    }
  }
  // a continuation page may carry no day numbers of its own, so the column grid
  // comes from the page it continues.
  const cols =
    colCentres.length > 1 ? colCentres.map((c) => c.sum / c.n) : (prev?.cols ?? colCentres.map((c) => c.sum / c.n));
  const rowYs = [...new Set(dayCells.map((d) => Math.round(d.y)))].sort((a, b) => b - a);
  const colWidth = cols.length > 1 ? cols[1] - cols[0] : (prev?.colWidth ?? 123);

  const colIndex = (x) => {
    // entries are left-aligned, so measure from the cell's left edge
    let best = -1, bestD = Infinity;
    for (let i = 0; i < cols.length; i++) {
      const d = Math.abs(x + 8 - cols[i]);
      if (d < bestD) { bestD = d; best = i; }
    }
    return bestD > colWidth * 0.8 ? -1 : best;
  };
  const rowOf = (y) => {
    let row = null;
    for (const ry of rowYs) if (ry >= y - 1) row = ry;
    return row;
  };

  const cells = new Map();
  for (const d of dayCells) {
    const ci = colIndex(d.x + d.w / 2 - 8);
    const ry = Math.round(d.y);
    if (ci < 0) continue;
    cells.set(`${ci}|${ry}`, { day: +d.s, items: [] });
  }
  // anything sitting ABOVE this page's first day-number row is the tail of the
  // week that got cut by the page break. it belongs to the matching column of
  // the previous page's last row, not to anything on this page.
  const topRowY = rowYs.length ? rowYs[0] : null;
  const spill = new Map(); // date -> items

  for (const p of pos) {
    if (/^\d{1,2}$/.test(p.s.trim()) && +p.s <= 31) continue;
    const ci = colIndex(p.x);
    if (ci < 0) continue;

    const isSpill = isContinuation && (topRowY === null || p.y > topRowY + 2);
    if (isSpill) {
      const day = prev?.lastRow?.[ci];
      if (!day) continue;
      if (!spill.has(day)) spill.set(day, []);
      spill.get(day).push(p);
      continue;
    }

    const ry = rowOf(p.y);
    if (ry === null) continue;
    const key = `${ci}|${ry}`;
    if (!cells.has(key)) continue;
    cells.get(key).items.push(p);
  }

  const days = [];
  for (const cell of cells.values()) {
    // reading order inside the cell: down the page, then across
    cell.items.sort((a, b) => (Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x));
    const text = cell.items.map((i) => i.s).join(" ").replace(/\s+/g, " ").trim();
    if (!text) continue;

    let workMin = 0, mealMin = 0;
    const entries = [];
    for (const chunk of text.split(ENTRY_START)) {
      const d = DURATION.exec(chunk);
      if (!d) continue;
      const mins = (+d[1]) * 60 + (+d[2]);
      const meal = isMeal(chunk);
      if (meal) mealMin += mins;
      else workMin += mins;
      entries.push({ text: chunk.trim(), minutes: mins, meal });
    }
    if (!entries.length) continue;

    const dd = String(cell.day).padStart(2, "0");
    days.push({
      date: `${String(month + 1).padStart(2, "0")}/${dd}/${String(year).slice(2)}`,
      day: cell.day,
      workHours: Math.round((workMin / 60) * 100) / 100,
      mealHours: Math.round((mealMin / 60) * 100) / 100,
      entries,
      // which page of the export this day was read off. a day cut by a page
      // break ends up with two, which is exactly the case worth showing.
      pages: [pageNum],
    });
  }

  // the spilled tail, shaped the same way so the caller can fold it into the
  // day it belongs to on the previous page
  const spillDays = [];
  for (const [day, items] of spill) {
    items.sort((a, b) => (Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x));
    const text = items.map((i) => i.s).join(" ").replace(/\s+/g, " ").trim();
    if (!text) continue;
    let workMin = 0, mealMin = 0;
    const entries = [];
    for (const chunk of text.split(ENTRY_START)) {
      const d = DURATION.exec(chunk);
      if (!d) continue;
      const mins = (+d[1]) * 60 + (+d[2]);
      if (isMeal(chunk)) mealMin += mins;
      else workMin += mins;
      entries.push({ text: chunk.trim(), minutes: mins, meal: isMeal(chunk) });
    }
    if (entries.length) {
      spillDays.push({
        day,
        workHours: Math.round((workMin / 60) * 100) / 100,
        mealHours: Math.round((mealMin / 60) * 100) / 100,
        entries,
        pages: [pageNum],
      });
    }
  }

  // which date sits in each column of the LAST row on this page - that's what a
  // following continuation page needs to attribute its spill-over to.
  const lastRow = {};
  if (rowYs.length) {
    const bottomY = rowYs[rowYs.length - 1];
    for (const d of dayCells) {
      if (Math.round(d.y) !== bottomY) continue;
      const ci = colIndex(d.x + d.w / 2 - 8);
      if (ci >= 0) lastRow[ci] = +d.s;
    }
  }

  days.sort((a, b) => a.day - b.day);
  return {
    employee: isContinuation ? prev.employee : who[1].trim(),
    month,
    year,
    days,
    isContinuation,
    spillDays,
    pages: [pageNum],
    // carried forward so the next page can read a grid it may not have itself
    cols,
    colWidth,
    lastRow: rowYs.length ? lastRow : prev?.lastRow ?? {},
  };
}

// the stitching, separated from pdfjs so it can be tested without a PDF.
// `pages` is one array of text items per page, in order.
export function readSchedulePages(pages) {
  const people = [];
  let last = null;
  for (let i = 1; i <= pages.length; i++) {
    const parsed = readPage(pages[i - 1], last, i);
    if (!parsed) continue;

    if (parsed.isContinuation && people.length) {
      // same person, second page of their month: fold it into what we already
      // have rather than starting a new record.
      const person = people[people.length - 1];
      const byDay = new Map(person.days.map((d) => [d.day, d]));

      person.pages.push(...parsed.pages);

      // the cut week's tail first - these add to a day that already exists
      for (const s of parsed.spillDays) {
        const existing = byDay.get(s.day);
        if (existing) {
          existing.workHours = Math.round((existing.workHours + s.workHours) * 100) / 100;
          existing.mealHours = Math.round((existing.mealHours + s.mealHours) * 100) / 100;
          existing.entries.push(...s.entries);
          // this is the day the page break cut in half, so it now reads off two
          // pages. both are worth linking to from the checks screen.
          for (const p of s.pages) if (!existing.pages.includes(p)) existing.pages.push(p);
        } else {
          const dd = String(s.day).padStart(2, "0");
          const day = {
            ...s,
            date: `${String(parsed.month + 1).padStart(2, "0")}/${dd}/${String(parsed.year).slice(2)}`,
          };
          person.days.push(day);
          byDay.set(s.day, day);
        }
      }
      // then whole days that only appear on this page
      for (const d of parsed.days) {
        const existing = byDay.get(d.day);
        if (existing) {
          existing.workHours = Math.round((existing.workHours + d.workHours) * 100) / 100;
          existing.mealHours = Math.round((existing.mealHours + d.mealHours) * 100) / 100;
          existing.entries.push(...d.entries);
          for (const p of d.pages) if (!existing.pages.includes(p)) existing.pages.push(p);
        } else {
          person.days.push(d);
          byDay.set(d.day, d);
        }
      }
      person.days.sort((a, b) => a.day - b.day);
    } else {
      people.push(parsed);
    }
    last = parsed;
  }
  if (!people.length) throw new Error("no schedule pages found in that PDF");
  return people;
}

export async function parseSchedulePdf(bytes) {
  const pdfjs = await getPdfjs();
  // same ownership trap as parseTimesheetPdf - pdfjs detaches what it's given,
  // so the caller's bytes have to be copied first. the schedule only survived
  // this because its upload happens before its parse, which is luck rather than
  // design and would break the moment those two lines swapped.
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const data = view.slice();
  const doc = await pdfjs.getDocument({ data }).promise;

  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items);
  }
  return readSchedulePages(pages);
}

// "Stephanie Garcia" and "Garcia, Stephanie" are the same person. the schedule
// prints first-last, the timesheet prints last-first.
export function scheduleKey(name) {
  const n = String(name || "").trim();
  if (n.includes(",")) {
    const [last, first] = n.split(",").map((s) => s.trim());
    return `${first} ${last}`.toLowerCase().replace(/\s+/g, " ");
  }
  return n.toLowerCase().replace(/\s+/g, " ");
}

// the scheduled shifts themselves, kept alongside the total.
//
// "schedule has 4.12" tells you the two records disagree but not HOW, and the
// figure is our transcription of a document the reader can't see. The shifts are
// what make a wrong reading obvious: a page-break bug once printed a perfectly
// plausible 5.00 for a day that was really 8.00, and nothing but opening the
// source PDF by hand would have caught it. The missing 2:30p-5:30p shows here.
//
// Kept verbatim, client initial and all. The whole point is to let someone check
// our transcription against the document, and a tidied-up version can't do that.
function scheduleEvidence(s) {
  const shifts = (s?.entries || []).map((e) => ({
    text: String(e.text || "").replace(/\s+/g, " ").trim(),
    minutes: e.minutes || 0,
    meal: !!e.meal,
  }));
  return {
    shifts,
    // a day cut by a page break carries both pages
    schedulePages: s?.pages || [],
  };
}

// line the two records up. only days present in the timesheet are compared -
// the schedule covers a whole month and a pay period is half of one.
export function compareToSchedule(timesheetDays, scheduleDays, { toleranceHours = 1 } = {}) {
  const byDate = new Map((scheduleDays || []).map((d) => [d.date, d]));
  const rows = [];
  let tsTotal = 0, schTotal = 0;

  for (const d of timesheetDays || []) {
    const s = byDate.get(d.date);
    const ts = Math.round((d.paidHours || 0) * 100) / 100;
    tsTotal += ts;
    if (!s) {
      rows.push({ date: d.date, timesheet: ts, schedule: null, diff: null, flag: ts > 0 ? "not-on-schedule" : null });
      continue;
    }
    schTotal += s.workHours;
    const diff = Math.round((ts - s.workHours) * 100) / 100;
    rows.push({
      date: d.date,
      timesheet: Math.round(ts * 100) / 100,
      schedule: s.workHours,
      diff,
      flag: Math.abs(diff) > toleranceHours ? "mismatch" : null,
      ...scheduleEvidence(s),
    });
  }

  // days the schedule has that never reached the timesheet at all.
  //
  // only inside the pay period: the schedule export covers a whole month while a
  // pay period is half of one, so without this every sheet reports a fortnight of
  // "missing" days that simply belong to the other half.
  const seen = new Set((timesheetDays || []).map((d) => d.date));
  const dates = [...seen].sort();
  const first = dates[0], last = dates[dates.length - 1];
  if (first && last) {
    for (const s of scheduleDays || []) {
      if (seen.has(s.date) || s.workHours <= 0) continue;
      if (s.date < first || s.date > last) continue;
      rows.push({
        date: s.date,
        timesheet: null,
        schedule: s.workHours,
        diff: null,
        flag: "missing-from-timesheet",
        ...scheduleEvidence(s),
      });
    }
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));
  const flagged = rows.filter((r) => r.flag);
  return {
    rows,
    flagged,
    timesheetTotal: Math.round(tsTotal * 100) / 100,
    scheduleTotal: Math.round(schTotal * 100) / 100,
    worstDiff: flagged.reduce((m, r) => (Math.abs(r.diff || 0) > Math.abs(m) ? r.diff : m), 0),
  };
}

// The times a rostered entry runs between.
//
// An entry prints as "8:30a-11:30a Chapman, J-ILS Service(3:00)", so the block
// is on the front of the string. Returns null for anything that does not lead
// with a time range, which includes the header and total lines.
export function blockTimes(text) {
  const m = /^(\d{1,2}(?::\d{2})?\s*[ap])\s*-\s*(\d{1,2}(?::\d{2})?\s*[ap])/i.exec(String(text || ""));
  if (!m) return null;
  const at = (s) => {
    const p = /^(\d{1,2})(?::(\d{2}))?\s*([ap])$/i.exec(s.trim());
    if (!p) return null;
    let h = parseInt(p[1], 10);
    const mm = p[2] ? parseInt(p[2], 10) : 0;
    if (h === 12) h = 0;
    return (p[3].toLowerCase() === "p" ? h + 12 : h) * 60 + mm;
  };
  const start = at(m[1]), end = at(m[2]);
  return start == null || end == null ? null : { start, end };
}

// WHAT KIND OF TIME A BLOCK WAS BOOKED AS - "ILS Service", "ILS Admin",
// "ILS Misc", "ILS Travel", "Meal Break".
//
// Mánu 2026-08-12: "can we add in after the time what the service is? Admin,
// travel, miscellaneous, ILS service. Just don't include the client's name." The
// timesheet punches know only that time was worked; the roster is the only
// document that says what it was worked ON, and his 07/30 is why it matters -
// the schedule books "12p-12:10p -ILS Misc(0:10)" and the calendar drew it as
// two anonymous minutes of work.
//
// THE CLIENT NAME IS DELIBERATELY DROPPED. He asked for it to be, and it is the
// right call twice over: the employee already knows who they were with, and this
// page is reached by a signed link rather than a login, so every name left on it
// is a name that leaves the building.
//
// Parsed right to left, because the left is ambiguous and the right is not. The
// text runs "10a-12p Rincon, R-ILS Service (2:00)": the time range holds a
// hyphen, the client name holds a comma and may hold a hyphen of its own, and
// the only reliable landmarks are the trailing "(h:mm)" and the LAST hyphen
// before it. A day with no client reads "12p-12:10p -ILS Misc(0:10)", which the
// same two steps handle without a special case.
const LEADING_TIMES = /^\d{1,2}(?::\d{2})?\s*[ap]\s*-\s*\d{1,2}(?::\d{2})?\s*[ap]\s*/i;

export function serviceOf(text) {
  const s = String(text || "")
    .replace(LEADING_TIMES, "")        // "10a-12p "
    .replace(/\([^)]*\)\s*$/, "")      // "(2:00)"
    .trim();
  const cut = s.lastIndexOf("-");
  return (cut >= 0 ? s.slice(cut + 1) : s).trim() || null;
}

// A day's rostered blocks as minutes, in order, so the engine can ask where a
// punch gap falls relative to them. Meal blocks are kept and marked rather than
// dropped: a gap that lines up with a rostered meal is a different animal from
// one that lines up with the seam between two clients.
// CARRIES THE SERVICE NOW, because the entitlement rules need it.
//
// This used to return {start, end, meal} and throw the text away, which meant
// `analyzeDay` could see WHEN a block was but never WHAT it was. Mánu
// 2026-08-12: time rostered as Misc over ten minutes is not time worked - it is
// usually PTO or sick pay - so it cannot drive the hours that decide whether a
// rest or a meal is owed. Deciding that needs the service, so the service comes
// along. `misc` is precomputed rather than left to callers so the test for it
// lives in one place.
export function scheduleBlocks(entries) {
  return (entries || [])
    .map((e) => {
      const t = blockTimes(e.text);
      if (!t) return null;
      const service = serviceOf(e.text);
      return { ...t, meal: !!e.meal, service, misc: isMiscService(service) };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
}

// "ILS Misc", "Misc", "misc" - what `serviceOf` returns for a miscellaneous
// block. Kept beside `serviceOf` because it is a fact about that output format.
export function isMiscService(service) {
  return /(^|\s)misc$/i.test(String(service || "").trim());
}
