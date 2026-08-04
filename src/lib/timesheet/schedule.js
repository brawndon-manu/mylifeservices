// the QSP "Employee Schedules" export: one month-calendar page per employee.
//
// this is a second, independent record of the same time. it matters because the
// punch data has typos in it - times entered in the wrong box, or with the wrong
// meridiem - and there is no way to spot those from the punches alone when the
// errors happen to cancel out. two sources disagreeing is a signal one page
// cannot give you.
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
function readPage(items) {
  const header = items.map((i) => i.str).join(" ").replace(/\s+/g, " ");
  const who = /Employee:\s*(.+?)\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i.exec(header);
  const when = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i.exec(header);
  if (!who || !when) return null;

  const month = MONTHS.indexOf(when[1].toLowerCase());
  const year = +when[2];

  const pos = items
    .filter((i) => i.str && i.str.trim())
    .map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0 }));

  // the day numbers are bare integers and they define the grid
  const dayCells = pos.filter((p) => /^\d{1,2}$/.test(p.s.trim()) && +p.s <= 31);
  if (dayCells.length < 20) return null; // not a calendar page

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
  const cols = colCentres.map((c) => c.sum / c.n);
  const rowYs = [...new Set(dayCells.map((d) => Math.round(d.y)))].sort((a, b) => b - a);
  const colWidth = cols.length > 1 ? cols[1] - cols[0] : 123;

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
  for (const p of pos) {
    if (/^\d{1,2}$/.test(p.s.trim()) && +p.s <= 31) continue;
    const ci = colIndex(p.x);
    const ry = rowOf(p.y);
    if (ci < 0 || ry === null) continue;
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
    });
  }

  days.sort((a, b) => a.day - b.day);
  return { employee: who[1].trim(), month, year, days };
}

export async function parseSchedulePdf(bytes) {
  const pdfjs = await getPdfjs();
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const doc = await pdfjs.getDocument({ data }).promise;

  const people = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const parsed = readPage(content.items);
    if (parsed) people.push(parsed);
  }
  if (!people.length) throw new Error("no schedule pages found in that PDF");
  return people;
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
      rows.push({ date: s.date, timesheet: null, schedule: s.workHours, diff: null, flag: "missing-from-timesheet" });
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
