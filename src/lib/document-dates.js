// HOW MY DOCUMENTS WRITES ITS DATES. a pay period reads "Sep 1 – 15, 2026"
// (the month again when it crosses one, the year again when it crosses a year);
// a day reads "Sep 16", with the year only when it is not this one.
//
// dependency-free so the node tests can pin it.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TZ = "America/Los_Angeles";

// "09/01/26" or "09/01/2026" -> { y, m, d } (m from 0), else null
function mdy(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(String(s || "").trim());
  if (!m) return null;
  return { y: m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]), m: Number(m[1]) - 1, d: Number(m[2]) };
}

export function periodRange(from, to) {
  const a = mdy(from);
  const b = mdy(to);
  if (!a || !b) return [from, to].filter(Boolean).join(" to ");
  if (a.y !== b.y) return `${MONTHS[a.m]} ${a.d}, ${a.y} – ${MONTHS[b.m]} ${b.d}, ${b.y}`;
  if (a.m !== b.m) return `${MONTHS[a.m]} ${a.d} – ${MONTHS[b.m]} ${b.d}, ${b.y}`;
  return `${MONTHS[a.m]} ${a.d} – ${b.d}, ${b.y}`;
}

// a Date, an ISO string or "YYYY-MM-DD" -> "Sep 16", or "Sep 16, 2025" when
// the year is not this one. a bare "YYYY-MM-DD" is a calendar day, read as is.
export function shortDay(value, now = new Date()) {
  if (!value) return "";
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  let y;
  let m;
  let d;
  if (plain) {
    [y, m, d] = [Number(plain[1]), Number(plain[2]) - 1, Number(plain[3])];
  } else {
    const t = new Date(value);
    if (!Number.isFinite(t.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric" })
      .formatToParts(t)
      .reduce((o, p) => ((o[p.type] = p.value), o), {});
    [y, m, d] = [Number(parts.year), Number(parts.month) - 1, Number(parts.day)];
  }
  const thisYear = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric" }).format(now));
  return y === thisYear ? `${MONTHS[m]} ${d}` : `${MONTHS[m]} ${d}, ${y}`;
}
