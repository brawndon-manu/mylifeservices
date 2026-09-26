// THE SCHEDULE LOCK'S DAYS AND FILE NAMES, with no imports at all: the upload
// form runs in the browser and needs to read a QSP file name the same way the
// server does, and the comparing module next door pulls node:crypto.

const MONTHS = ["january", "february", "march", "april", "may", "june", "july",
  "august", "september", "october", "november", "december"];

const two = (n) => String(n).padStart(2, "0");
const mdy = (m, d, y) => `${two(m)}/${two(d)}/${String(y).slice(-2)}`;
// "09/24/26" -> 20260924, so days sort and compare as numbers
export const dayNum = (d) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(String(d || ""));
  return m ? (2000 + Number(m[3])) * 10000 + Number(m[1]) * 100 + Number(m[2]) : 0;
};

// every day from one "MM/DD/YY" to another, both ends in
export function daysFrom(from, to) {
  const out = [];
  const a = dayNum(from);
  const b = dayNum(to);
  if (!a || !b || a > b) return out;
  let dt = new Date(Math.floor(a / 10000), Math.floor(a / 100) % 100 - 1, a % 100);
  for (let i = 0; i < 400; i++) {
    const s = mdy(dt.getMonth() + 1, dt.getDate(), dt.getFullYear());
    out.push(s);
    if (dayNum(s) >= b) break;
    dt = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + 1);
  }
  return out;
}

// the days an export covers, off QSP's own file name:
//   "09-01-2026-09-24-2026 Employee Schedule Notes.xls"
//   "9-16-2026-9-24-2026 Employee Detailed Daily Service Notes.pdf"
//   "8-1-2026 - 8-15-2026 DSN ..."           "09_16_26-09_24_26 Simple Timesheet.pdf"
// null when the name carries no range (a renamed file)
export function fileNameRange(name) {
  const m = /(?:^|[^\d])(\d{1,2})[-_/](\d{1,2})[-_/](\d{4}|\d{2})\s*-\s*(\d{1,2})[-_/](\d{1,2})[-_/](\d{4}|\d{2})(?!\d)/.exec(String(name || ""));
  if (!m) return null;
  const from = mdy(m[1], m[2], m[3]);
  const to = mdy(m[4], m[5], m[6]);
  return dayNum(from) && dayNum(to) && dayNum(from) <= dayNum(to) ? { from, to } : null;
}

// "Employee Schedules September 2026-12.pdf" -> "2026-09"
export function scheduleNameMonth(name) {
  const m = /employee schedules\s+([a-z]+)\s+(\d{4})/i.exec(String(name || ""));
  if (!m) return null;
  const i = MONTHS.indexOf(m[1].toLowerCase());
  return i < 0 ? null : `${m[2]}-${two(i + 1)}`;
}

// the days a set of items spans, for an export whose name carries no range
export function spanOf(items) {
  const days = (items || []).map((x) => x.date).filter((d) => dayNum(d)).sort((a, b) => dayNum(a) - dayNum(b));
  return days.length ? { from: days[0], to: days[days.length - 1] } : null;
}

// the days one export is compared on: the locked days that BOTH copies cover
export function comparedDays(lockDays, lockCover, nowCover) {
  if (!lockCover || !nowCover) return [];
  const lo = Math.max(dayNum(lockCover.from), dayNum(nowCover.from));
  const hi = Math.min(dayNum(lockCover.to), dayNum(nowCover.to));
  return (lockDays || []).filter((d) => dayNum(d) >= lo && dayNum(d) <= hi);
}
