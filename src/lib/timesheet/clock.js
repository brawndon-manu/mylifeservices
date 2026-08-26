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

// THE SAME DOCUMENT, READ IN FULL.
//
// `parseClockReport` above collapses this export to the one question premium
// grading asks: was every shift on this day clocked. It reads 4 of the 25
// columns and it must keep doing exactly that, because `gradePremium` decides
// whether a premium can be signed off and nothing here may move that.
//
// This reads the rest of them, for monitoring - who did not clock, who clocked
// with no location captured, and how long a shift actually ran. Mánu 2026-08-22:
// "we can get data about if they clock into their service shift, clck out, if
// they were geofenced." A second reader over one file rather than a second file.
//
// GPS IS THREE-VALUED AND THAT IS THE WHOLE TRAP. Measured on 08/16-08/22:
// "Yes" 360, blank 127, "No" 25 - and the blanks are not missing location, they
// are the shifts nobody clocked into, so there was never a location to capture.
// 123 of the 127 line up exactly with "No Clock In". Reading blank as missing
// would report 152 where there are 25, a six-fold overstatement, and would
// charge somebody twice for one missed clock-in. `null` means nothing to say.
const GPS = (v, clocked) => {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "yes") return "yes";
  if (s === "no") return "no";
  // blank on a shift they DID clock is still unknown rather than missing: four
  // rows on 08/16-08/22 say clocked-in with no time and no GPS, and guessing
  // about those is how a data oddity becomes an accusation.
  return clocked ? null : null;
};

// "02:45 PM" -> minutes past midnight
export function clockMinute(v) {
  const m = /^(\d{1,2}):(\d{2})\s*([AP])\.?M\.?$/i.exec(String(v ?? "").trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "P") h += 12;
  return h * 60 + Number(m[2]);
}

// minutes between two clock times, allowing a shift to cross midnight
export function spanMinutes(from, to) {
  const a = clockMinute(from);
  const b = clockMinute(to);
  if (a == null || b == null) return null;
  return b < a ? b - a + 1440 : b - a;
}

// A DATE AND A TIME AS ONE NUMBER, so two stamps can be subtracted.
//
// The audit compares a rostered time against a clocked one, and clock times
// alone cannot answer that across midnight: rostered 11:30 PM against a
// 12:05 AM clock-in is thirty-five minutes late, and plain minute arithmetic
// calls it 1,405 minutes early. The export prints a date beside every one of
// the four times, so it never has to be guessed.
//
// No row on 08/16-08/22 crosses midnight and none has an actual date differing
// from its scheduled one. That is one week, not a rule - overnight shifts exist
// in this agency's data, so the arithmetic is built to survive one.
export function stampMinutes(date, time) {
  const d = normalizeDate(date);
  const t = clockMinute(time);
  if (!d || t == null) return null;
  const [mm, dd, yy] = d.split("/").map(Number);
  return Date.UTC(2000 + yy, mm - 1, dd) / 60000 + t;
}

// how far the clock landed from the roster, in minutes. Positive is later than
// rostered at both ends: a late clock-in and a late clock-out.
const delta = (schedDate, schedTime, actualDate, actualTime) => {
  const a = stampMinutes(schedDate, schedTime);
  const b = stampMinutes(actualDate ?? schedDate, actualTime);
  return a == null || b == null ? null : b - a;
};

const REQUIRED_SHIFTS = ["Employee Name", "Schedule Start Date", "No Clock In", "No Clock Out"];

// WHAT QSP ITSELF SAYS ABOUT THE SHIFT, kept apart from what its own times say.
//
// The export carries six verdict columns of its own - late, early and on time,
// at each end. THEY DISAGREE WITH THE TIMES PRINTED BESIDE THEM. On 08/16-08/22,
// 179 shifts are flagged "Late Clock In" and on 135 of them the actual start
// time printed IS the scheduled start time, to the minute. Not one flagged-late
// row shows an actual time earlier than rostered.
//
// Two readings fit and this file cannot choose between them: QSP may measure
// lateness in seconds while printing minutes (clock in at 2:45:20 against a
// 2:45:00 roster and you are late, and it prints 02:45 PM), or the punch may
// have been edited afterwards to match the roster while the original verdict
// stuck to the row. The second is the thing an audit exists to catch.
//
// So both are carried and neither is resolved here. `startDelta` is ours, off
// the times; `says` is theirs. The audit screen shows the disagreement rather
// than picking a winner, because if it is the second reading, the disagreement
// is the finding.
const verdicts = (r) => ({
  lateIn: YES(r["Late Clock In"]),
  lateOut: YES(r["Late Clock Out"]),
  earlyIn: YES(r["Early Clock In"]),
  earlyOut: YES(r["Early Clock Out"]),
  onTimeIn: YES(r["On Time Clock In"]),
  onTimeOut: YES(r["On Time Clock Out"]),
});

// ONE SPREADSHEET ROW, NORMALISED. Split out from `clockShifts` so it can be
// driven directly by a test: the export it reads is a 280KB binary that is not
// in the repo, and a reader nothing can exercise without one is a reader nobody
// checks.
export function shiftFromRow(r) {
  const name = r["Employee Name"];
  const date = normalizeDate(r["Schedule Start Date"]);
  if (!name || !date) return null;
  const noIn = YES(r["No Clock In"]);
  const noOut = YES(r["No Clock Out"]);
  return {
    name: String(name).trim(),
    key: clockKey(name),
    date,
    client: String(r.Client ?? "").trim() || null,
    service: String(r["Service Type"] ?? "").trim() || null,
    // THE FOUR TIMES THEMSELVES, which durations cannot stand in for. The
    // audit's whole question is "rostered 12p-3p, clocked 12:08p-2:53p", and a
    // pair of durations answers a different one - two shifts three hours long
    // can start ninety minutes apart. Minutes past midnight; screens format them.
    schedFrom: clockMinute(r["Schedule Start Time"]),
    schedTo: clockMinute(r["Schedule End Time"]),
    // null on a shift nobody clocked, which is a quarter of them: 123 of 512
    // had no clock-in on 08/16-08/22. Absent is not "on time".
    actualFrom: noIn ? null : clockMinute(r["Actual Start Time"]),
    actualTo: noOut ? null : clockMinute(r["Actual End Time"]),
    startDelta: noIn
      ? null
      : delta(r["Schedule Start Date"], r["Schedule Start Time"],
              r["Actual Start Date"], r["Actual Start Time"]),
    endDelta: noOut
      ? null
      : delta(r["Schedule End Date"], r["Schedule End Time"],
              r["Actual End Date"], r["Actual End Time"]),
    scheduledMin: spanMinutes(r["Schedule Start Time"], r["Schedule End Time"]),
    workedMin: noIn || noOut ? null : spanMinutes(r["Actual Start Time"], r["Actual End Time"]),
    noIn,
    noOut,
    says: verdicts(r),
    gpsIn: GPS(r["GPS Captured on Clock In"], !noIn),
    gpsOut: GPS(r["GPS Captured on Clock Out"], !noOut),
    // a shift the field staff added themselves rather than one rostered for
    // them. Zero of these on 08/16-08/22, carried because a column that is
    // empty this week is not a column that stays empty.
    selfCreated: YES(r["Field Staff Created Shift"]),
    reason: String(r.Reason ?? "").replace(/\s*\n\s*/g, " ").trim() || null,
  };
}

// One normalised row per scheduled shift. Everything downstream reads these
// rather than the spreadsheet's own column names.
export function clockShifts(bytes) {
  const { headers, rows } = readXlsTable(bytes);
  const missing = REQUIRED_SHIFTS.filter((h) => !headers.includes(h));
  if (missing.length) {
    throw new Error(`that doesn't look like the QSClock Time and Attendance report (no ${missing.join(", ")})`);
  }

  const out = [];
  for (const r of rows) {
    const s = shiftFromRow(r);
    if (s) out.push(s);
  }
  return out;
}

// WHICH DAYS AN EXPORT ACTUALLY COVERS.
//
// The clock report is pulled a WEEK at a time - "08-16-2026-08-22-2026 QSClock
// Time and Attendance Report.xls" - and a pay period is a fortnight, so one
// period takes two of them. A card that says "512 shifts" without saying which
// days they came from cannot tell a period with one week loaded from a period
// where nobody worked the second week.
//
// Compared on the stamp rather than the printed string: "08/16/26" and
// "09/02/26" sort correctly as text only by accident of the year.
export function clockCoverage(rows) {
  const dates = [...new Set((rows || []).map((r) => r.date).filter(Boolean))];
  if (!dates.length) return { from: null, to: null, days: 0 };
  const key = (d) => stampMinutes(d, "12:00 AM") ?? 0;
  dates.sort((a, b) => key(a) - key(b));
  return { from: dates[0], to: dates[dates.length - 1], days: dates.length };
}

// WHERE QSP'S VERDICT AND QSP'S TIMES CANNOT BOTH BE RIGHT.
//
// 135 shifts in one week say "late clock-in" over a clock-in printed at the
// rostered minute. Whichever reading of that is true - seconds behind the
// display, or a punch edited to match the roster - the row is not what it
// appears to be, and the auditor should be the one to decide which.
//
// Silent where there is nothing to compare: a shift nobody clocked has no delta
// and so cannot contradict anything, and a verdict column left blank is QSP
// declining to say rather than QSP saying no.
export function clockDisagreements(s) {
  const out = [];
  const says = s?.says;
  if (!says) return out;
  const d = s.startDelta, e = s.endDelta;
  if (d != null) {
    if (says.lateIn && d <= 0) out.push({ end: "in", says: "late", show: d === 0 ? "on the minute" : `${-d} min early` });
    if (says.earlyIn && d >= 0) out.push({ end: "in", says: "early", show: d === 0 ? "on the minute" : `${d} min late` });
    if (says.onTimeIn && d !== 0) out.push({ end: "in", says: "on time", show: `${d > 0 ? d + " min late" : -d + " min early"}` });
  }
  if (e != null) {
    if (says.lateOut && e <= 0) out.push({ end: "out", says: "late", show: e === 0 ? "on the minute" : `${-e} min early` });
    if (says.earlyOut && e >= 0) out.push({ end: "out", says: "early", show: e === 0 ? "on the minute" : `${e} min late` });
    if (says.onTimeOut && e !== 0) out.push({ end: "out", says: "on time", show: `${e > 0 ? e + " min late" : -e + " min early"}` });
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
