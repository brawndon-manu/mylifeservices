// The QSClock Time and Attendance export: one row per scheduled shift, saying
// whether the person actually clocked in and out of it.
//
// This is the only source that can tell a punch someone CLOCKED from a punch
// someone TYPED IN afterwards, and that distinction turned out to be the whole
// story behind the bad data. Measured on 07/16-07/31: 447 of 1,272 shifts had
// no clock-in and 484 had no clock-out, and every malformed record chased so
// far sat on a day with no clock data at all.
//
// It never changes an hour or a premium. It only says how well each day is
// evidenced, so a premium can be signed off with confidence or set aside.

// relative, not "@/lib/xls" - the other modules in this folder are imported by
// the test runner and by one-off scripts outside Next, where the alias is not
// resolvable
import { readXlsTable } from "../xls.js";

const YES = (v) => String(v ?? "").trim().toLowerCase() === "yes";

// the clock report prints "7/16/2026"; the timesheet prints "07/16/26"
export function normalizeDate(v) {
  const s = String(v ?? "").trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3].slice(2)}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(s);
  if (m) return `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3]}`;
  return null;
}

// both exports print "Last, First", so this is mostly a tidy-up
export function clockKey(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

const REQUIRED = ["Employee Name", "Schedule Start Date", "No Clock In", "No Clock Out"];

// -> Map(clockKey -> { byDate: {date: "full"|"some"|"none"}, shifts, missingIn, missingOut })
export function parseClockReport(bytes) {
  const { headers, rows } = readXlsTable(bytes);
  const missing = REQUIRED.filter((h) => !headers.includes(h));
  if (missing.length) {
    // naming the columns beats "couldn't read that file" when someone has
    // exported the wrong report, which is the likeliest cause by far
    throw new Error(`that doesn't look like the QSClock Time and Attendance report (no ${missing.join(", ")})`);
  }

  const people = new Map();
  for (const r of rows) {
    const name = r["Employee Name"];
    const date = normalizeDate(r["Schedule Start Date"]);
    if (!name || !date) continue;
    const key = clockKey(name);
    let p = people.get(key);
    if (!p) {
      p = { name: String(name).trim(), days: new Map(), shifts: 0, missingIn: 0, missingOut: 0 };
      people.set(key, p);
    }
    const noIn = YES(r["No Clock In"]);
    const noOut = YES(r["No Clock Out"]);
    p.shifts++;
    if (noIn) p.missingIn++;
    if (noOut) p.missingOut++;
    let d = p.days.get(date);
    if (!d) { d = { shifts: 0, noIn: 0, noOut: 0 }; p.days.set(date, d); }
    d.shifts++;
    if (noIn) d.noIn++;
    if (noOut) d.noOut++;
  }

  // collapse each day to one word
  const out = new Map();
  for (const [key, p] of people) {
    const byDate = {};
    for (const [date, d] of p.days) {
      byDate[date] =
        d.noIn === d.shifts && d.noOut === d.shifts ? "none"
        : d.noIn > 0 || d.noOut > 0 ? "some"
        : "full";
    }
    out.set(key, {
      name: p.name,
      byDate,
      shifts: p.shifts,
      missingIn: p.missingIn,
      missingOut: p.missingOut,
    });
  }
  return out;
}

// How well is each premium hour evidenced?
//
//   recorded   - QSP's own records say so. A rest premium where the Rest
//                Periods Report covers that person; a meal premium on a day
//                clocked in and out of every shift.
//   supported  - corroborating evidence short of a record. Today that is a meal
//                premium on a day the schedule gave the person NO meal period
//                at all, which is a decent reason to think none was taken.
//   unverified - nothing behind it. These need a person.
//
// Graded per PREMIUM, not per day, because the two kinds have different
// witnesses. The schedule contains meal breaks but not one rest period in
// 1,986 entries, so it can speak to a meal question and never to a rest one.
//
// A timesheet that disagrees with the schedule on HOURS is deliberately not
// considered here. People work different hours than they were scheduled all the
// time; that is ordinary, and the timesheet is the record we go by.
export const SUPPORT = {
  recorded: { label: "Recorded by QSP", rank: 3 },
  supported: { label: "Corroborated", rank: 2 },
  unverified: { label: "Needs somebody to look", rank: 1 },
};

// `restCovered` says whether the Rest Periods Report holds this person at all.
// If it does, its count is what decided the violation, so the violation carries
// that report's authority.
export function gradePremium(kind, date, { clockDays, restCovered, scheduleByDate } = {}) {
  const clocked = clockDays?.[date] === "full";

  if (kind === "rest") {
    if (restCovered) return "recorded";
    if (clocked) return "recorded";
    return "unverified";
  }

  // meal
  if (clocked) return "recorded";
  const shifts = scheduleByDate?.[date]?.shifts || [];
  // scheduled a full day and never given a meal period - that is evidence, not
  // proof, and it is the commonest shape by a mile (221 of 259 last period)
  if (shifts.length && !shifts.some((s) => s.meal)) return "supported";
  return "unverified";
}

// Roll a sheet's premium hours up by how well each one is evidenced.
export function gradePremiums(days, opts) {
  const totals = { recorded: 0, supported: 0, unverified: 0 };
  const byDate = {};
  for (const d of days || []) {
    if (!d.mealViolation && !d.restViolation) continue;
    const marks = {};
    if (d.mealViolation) {
      const g = gradePremium("meal", d.date, opts);
      totals[g] += 1;
      marks.meal = g;
    }
    if (d.restViolation) {
      const g = gradePremium("rest", d.date, opts);
      totals[g] += 1;
      marks.rest = g;
    }
    byDate[d.date] = marks;
  }
  return { totals, byDate };
}
