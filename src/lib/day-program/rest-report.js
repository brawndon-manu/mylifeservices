// The day program's Rest Break Period Report, read into per-person days.
//
// This is not a QSP export and nothing in `lib/timesheet` can read it. The day
// program has no Simple Timesheet, no clock export and no schedule PDF, so the
// engine that turns punches into hours has nothing to work on here. What the
// report holds instead, per person per day, is a shift length and up to two
// rest breaks, and every "Actual Work Shift" cell in it reads
// "6.5 hrs (exact start/end not shown)". There are no start or end times in the
// file at all.
//
// So this is deliberately a READER, not an engine. It reports what each cell
// says, says which cells it could not make sense of, and computes nothing that
// would end up above somebody's signature without a person having seen it
// first. The faults it collects are the point: the file is hand-maintained and
// it shows.
//
// Day program staff take no unpaid meal period, so nothing here looks for one.

import { restsRequired, RULES } from "../timesheet/parse.js";
import { readXlsxRows, excelDate } from "./xlsx.js";

// the two markers the report author uses in a break cell, spelled out in the
// legend on row 2 of the file itself.
const NOT_DOCUMENTED = "❌"; // red X
const NEEDS_REVIEW = "◆"; // black diamond

// a day program shift sits inside ordinary daytime hours. used only to work out
// which half of the clock a bare "10:00" means, and to notice a time that lands
// somewhere a shift could not.
const DAY_START_MIN = 6 * 60;
const DAY_END_MIN = 20 * 60;

// how far a break can be from ten minutes before it stops looking like a typed
// break and starts looking like a typing mistake. the engine's own window.
const { restMinMin, restMaxMin } = RULES;

const clean = (v) => (typeof v === "string" ? v.trim() : v);
const text = (v) => (v === undefined || v === null ? "" : String(v).trim());

// ------------------------------------------------------------------ times

// "10:05", "1:20PM", "9 AM", "12". Returns the candidate minute values: one when
// the cell said AM or PM, two when it left us to guess.
function candidates(token) {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?[Mm]?\.?$/.exec(token)
    || /^(\d{1,2})(?::(\d{2}))?$/.exec(token);
  if (!m) return null;
  const hour = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  if (hour < 1 || hour > 12 || min > 59) return null;

  const base = (hour % 12) * 60 + min;
  const am = { min: base, stated: true };
  const pm = { min: base + 720, stated: true };
  const meridiem = m[3]?.toLowerCase();
  if (meridiem === "a") return [am];
  if (meridiem === "p") return [pm];
  return [{ ...am, stated: false }, { ...pm, stated: false }];
}

// minutes past midnight to "10:05 AM"
export function clockLabel(min) {
  if (!Number.isFinite(min)) return "";
  const h24 = Math.floor(min / 60) % 24;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(min % 60).padStart(2, "0")} ${h24 >= 12 ? "PM" : "AM"}`;
}

const inDay = (min) => min >= DAY_START_MIN && min <= DAY_END_MIN;

// Pick the reading of a range that makes the most sense, and say whether we had
// to guess. Scored rather than branched: a bare "12:50-1" only reads correctly
// as 12:50 PM to 1:00 PM, and the ordering is what tells you so.
// Exported for analyze.js, which reads 2nd-break ranges out of the rest
// report's own Schedule Notes with exactly the same rules.
export function resolveRange(left, right) {
  const l = candidates(left);
  const r = candidates(right);
  if (!l || !r) return null;

  let best = null;
  for (const a of l) {
    for (const b of r) {
      const minutes = b.min - a.min;
      // ordering first, then a length near ten, then landing in daytime. a
      // negative span is never the right reading of a ten minute break.
      const score =
        (minutes > 0 ? 0 : 1000) +
        Math.abs(minutes - 10) +
        (inDay(a.min) ? 0 : 300) +
        (inDay(b.min) ? 0 : 300);
      if (!best || score < best.score) {
        best = { score, from: a.min, to: b.min, minutes, guessed: !a.stated || !b.stated };
      }
    }
  }
  return best;
}

// One break cell, read. `flag` carries the marker the author put in it; the
// times are whatever survived parsing, which on a cell like "1-10:15" is
// nothing at all.
export function parseBreakCell(raw) {
  const value = text(raw);
  const cell = { text: value };
  if (!value) return { ...cell, empty: true };

  let body = value;
  if (body.includes(NOT_DOCUMENTED)) cell.flag = "not-documented";
  else if (body.includes(NEEDS_REVIEW)) cell.flag = "needs-review";
  body = body.replace(new RegExp(`[${NOT_DOCUMENTED}${NEEDS_REVIEW}]`, "g"), "").trim();

  // the author sometimes restates the length after the range, e.g.
  // "12:27PM-12:36PM (9 min)". read it, because it is a second opinion on a
  // range we are about to measure ourselves.
  const stated = /\((\d+)\s*min\)/i.exec(body);
  if (stated) {
    cell.statedMinutes = Number(stated[1]);
    body = body.replace(stated[0], "").trim();
  }

  if (!body || /^n\/?a$/i.test(body)) return { ...cell, none: true };

  const parts = body.split(/\s*[–—-]\s*/);
  if (parts.length !== 2) return { ...cell, unreadable: true };

  const range = resolveRange(parts[0], parts[1]);
  if (!range) return { ...cell, unreadable: true };

  return {
    ...cell,
    from: range.from,
    to: range.to,
    minutes: range.minutes,
    guessed: range.guessed,
  };
}

// ----------------------------------------------------------------- header

// what each column holds, found by its heading rather than by its letter, so a
// re-export that gains a column still reads. The heading row is the one that
// says Employee and Date.
const HEADINGS = [
  [/^employee$/i, "employee"],
  [/^date$/i, "date"],
  [/^shift\s*hrs?$/i, "shiftHours"],
  [/^actual\s*work\s*shift$/i, "actualShift"],
  [/^1st\s*rest\s*break$/i, "break1"],
  [/^2nd\s*rest\s*break$/i, "break2"],
  [/^1st\s*source$/i, "source1"],
  [/^2nd\s*source$/i, "source2"],
  // spelled "Corrction" on the 08/01-08/15 file. matched loosely rather than
  // exactly, because the alternative is 41 correction notes silently reading as
  // text nobody put in a column.
  [/^corr?e?c?tion$/i, "correction"],
];

function findHeader(rows) {
  for (const { row, cells } of rows) {
    const map = {};
    for (const [col, value] of Object.entries(cells)) {
      const label = text(value);
      const hit = HEADINGS.find(([re]) => re.test(label));
      if (hit) map[hit[1]] = col;
    }
    if (map.employee && map.date) return { row, map };
  }
  return null;
}

// ---------------------------------------------------------------- reading

export function parseRestReport(bytes) {
  const rows = readXlsxRows(bytes);
  const header = findHeader(rows);
  if (!header) {
    throw new Error("that doesn't look like the Rest Break Period Report (no Employee / Date row)");
  }

  const { map } = header;
  const known = new Set(Object.values(map));
  const at = (cells, key) => (map[key] ? clean(cells[map[key]]) : undefined);

  // the banner above the table, kept so the screen can show what the file says
  // about itself rather than a title we invented.
  const title = rows
    .filter((r) => r.row < header.row)
    .map((r) => text(Object.values(r.cells)[0]))
    .find((s) => /audit/i.test(s)) || "";

  const people = new Map();
  const faults = [];
  const fault = (kind, day, detail, extra = {}) =>
    faults.push({ kind, person: day.person, date: day.date, detail, ...extra });

  for (const { row, cells } of rows) {
    if (row <= header.row) continue;
    const name = text(at(cells, "employee"));
    const serial = at(cells, "date");
    if (!name || serial === undefined || serial === "") continue;

    const date = typeof serial === "number" ? excelDate(serial) : text(serial);
    const shiftHours = Number(at(cells, "shiftHours"));
    const day = {
      row,
      person: name,
      date,
      shiftHours: Number.isFinite(shiftHours) ? shiftHours : null,
      actualShift: text(at(cells, "actualShift")),
      breaks: [parseBreakCell(at(cells, "break1")), parseBreakCell(at(cells, "break2"))],
      sources: [text(at(cells, "source1")), text(at(cells, "source2"))],
      correction: text(at(cells, "correction")),
      // anything typed outside the columns the headings describe. row 222 of the
      // 08/01-08/15 file has a correction note one column too far right, where
      // nothing would ever have read it.
      stray: Object.entries(cells)
        .filter(([col, v]) => !known.has(col) && text(v))
        .map(([col, v]) => ({ column: col, text: text(v) })),
    };

    if (!day.date) fault("unreadable-date", day, `date cell reads "${text(serial)}"`);
    if (day.shiftHours === null) fault("no-hours", day, "shift hours cell is empty or not a number");

    for (const s of day.stray) {
      fault("stray-note", day, `text in column ${s.column}, outside every heading`, {
        text: s.text,
      });
    }

    day.breaks.forEach((b, i) => {
      const which = i === 0 ? "1st" : "2nd";
      if (b.flag === "not-documented") {
        fault("not-documented", day, `${which} break is marked not documented`, { text: b.text });
      }
      if (b.flag === "needs-review") {
        fault("needs-review", day, `${which} break is flagged for review`, { text: b.text });
      }
      if (b.unreadable) {
        fault("unreadable-break", day, `${which} break cell can't be read as a time range`, {
          text: b.text,
        });
      }
      if (Number.isFinite(b.minutes)) {
        if (b.minutes < restMinMin || b.minutes > restMaxMin) {
          fault("break-length", day, `${which} break reads as ${b.minutes} minutes`, {
            text: b.text,
          });
        }
        if (b.statedMinutes !== undefined && b.statedMinutes !== b.minutes) {
          fault("length-disagrees", day, `${which} break says ${b.statedMinutes} min, times give ${b.minutes}`, {
            text: b.text,
          });
        }
        if (!inDay(b.from) || !inDay(b.to)) {
          fault("outside-day", day, `${which} break reads as ${clockLabel(b.from)} to ${clockLabel(b.to)}`, {
            text: b.text,
          });
        }
      }
    });

    const [first, second] = day.breaks;
    if (Number.isFinite(first?.to) && Number.isFinite(second?.from) && second.from < first.to) {
      fault("out-of-order", day, "2nd break starts before the 1st one ends");
    }

    // what the day is owed, against what the report shows for it. the engine's
    // own rule, so this says the same thing the MLS sheets say.
    if (day.shiftHours !== null) {
      const owed = restsRequired(day.shiftHours);
      const shown = day.breaks.filter((b) => Number.isFinite(b.minutes)).length;
      day.restsOwed = owed;
      day.restsShown = shown;
      if (shown < owed) {
        fault("short-of-entitlement", day, `${day.shiftHours} hrs is owed ${owed}, report shows ${shown}`);
      }
      if (day.shiftHours > 8) {
        fault("over-eight", day, `${day.shiftHours} hrs on one day`);
      }
    }

    if (!people.has(name)) people.set(name, { name, days: [] });
    people.get(name).days.push(day);
  }

  const dates = [...people.values()].flatMap((p) => p.days.map((d) => d.date)).filter(Boolean);
  const sorted = [...new Set(dates)].sort((a, b) => order(a) - order(b));

  return {
    title,
    from: sorted[0] || null,
    through: sorted[sorted.length - 1] || null,
    dates: sorted,
    people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name)),
    faults,
  };
}

// "08/03/26" sorts by what it means, not by its first character
function order(date) {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(date || "");
  return m ? Number(`20${m[3]}${m[1]}${m[2]}`) : 0;
}
