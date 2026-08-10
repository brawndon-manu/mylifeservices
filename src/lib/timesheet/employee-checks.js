// What one person needs to be told about their own timesheet.
//
// The email used to say "Break premium hours owed: 12 hrs" and stop there. A
// number with no basis is not something anyone can check, argue with, or learn
// from - and these are the people best placed to say whether a break actually
// happened.
//
// Kept as a pure function so the wording can be tested without rendering an
// email, and so the same list can feed the signable sheet later.
//
// Ordering is deliberate: the item where somebody might be UNDERPAID comes
// first. Everything else on this list pays them; a missing day pays nothing.

import { restKey, isMealLengthRest } from "./rests.js";
import { shortTime, recordedBreaksFor } from "./recorded-breaks.js";

const r2 = (n) => Math.round((n || 0) * 100) / 100;

// "10a-12p Rincon..." -> { s, e } in minutes
const toMin = (t) => {
  const m = /^(\d{1,2})(?::(\d{2}))?([ap])$/i.exec(String(t).trim());
  if (!m) return null;
  let h = +m[1];
  const mm = m[2] ? +m[2] : 0;
  if (h === 12) h = 0;
  return (m[3].toLowerCase() === "p" ? h + 12 : h) * 60 + mm;
};
const spanOf = (text) => {
  const m = /^(\d{1,2}(?::\d{2})?[ap])\s*-\s*(\d{1,2}(?::\d{2})?[ap])/i.exec(String(text).trim());
  if (!m) return null;
  const s = toMin(m[1]);
  const e = toMin(m[2]);
  return s == null || e == null ? null : { s, e, label: `${m[1]}-${m[2]}` };
};
const fmt = (min) => {
  const h24 = Math.floor(min / 60);
  const mm = min % 60;
  const ap = h24 >= 12 ? "p" : "a";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return mm === 0 ? `${h}${ap}` : `${h}:${String(mm).padStart(2, "0")}${ap}`;
};

// the unexplained holes in a day's roster - the gaps that are NOT a rostered
// break and NOT travel, which is where an informal ten minutes tends to hide
const MIN_GAP = 5;
const MAX_GAP = 20;
function scheduleGaps(entry) {
  const shifts = (entry?.shifts || [])
    .map((s) => ({ ...s, sp: spanOf(s.text) }))
    .filter((s) => s.sp && !s.meal)
    .sort((a, b) => a.sp.s - b.sp.s);
  const out = [];
  for (let i = 0; i + 1 < shifts.length; i++) {
    const g = shifts[i + 1].sp.s - shifts[i].sp.e;
    if (g >= MIN_GAP && g <= MAX_GAP) {
      out.push(`${fmt(shifts[i].sp.e)}-${fmt(shifts[i + 1].sp.s)}`);
    }
  }
  return out;
}

// `confirmed` is the set of "MM/DD/YY:meal" / "MM/DD/YY:rest" the employee has
// already told us they ARE owed - see confirmedFromAnswers in premium-split.js.
// A day in it is charged and no longer an assumption, and the email has to say
// so rather than telling somebody their penalty pay is still hypothetical.
export function buildEmployeeChecks(data, { restRows, sourceName, confirmed } = {}) {
  if (!data) return [];
  const owed = (date, kind) => !!confirmed && confirmed.has(`${date}:${kind}`);
  const days = data.days || [];
  const byDate = data.scheduleCheck?.byDate || {};
  const out = [];

  // 1. A DAY THAT PAYS NOTHING. First, always. Every other item on this list
  //    pays them something; this one is hours they may simply not be getting.
  const missing = (data.scheduleCheck?.flagged || [])
    .filter((f) => f.flag === "missing-from-timesheet")
    .map((f) => ({ date: f.date, hours: r2(f.schedule) }));
  if (missing.length) {
    out.push({
      kind: "missingDay",
      tone: "urgent",
      rows: missing,
      title: missing.length === 1 ? "A day with no hours on it" : "Days with no hours on them",
    });
  }

  // 2. no meal period rostered at all
  const mealNone = days.filter((d) => d.mealViolation && !d.mealLate).map((d) => ({
    date: d.date, hours: r2(d.paidHours), charged: owed(d.date, "meal"),
  }));
  if (mealNone.length) out.push({ kind: "mealMissing", tone: "info", rows: mealNone });

  // 3. rostered, but started too late to count
  const mealLate = days.filter((d) => d.mealLate).map((d) => ({
    date: d.date,
    hours: r2(d.paidHours),
    startedAfter: d.mealStartedAfterMin,
  }));
  if (mealLate.length) out.push({ kind: "mealLate", tone: "info", rows: mealLate });

  // 4. rest breaks. split by whether there is a gap in the roster to point at,
  //    because with one the question answers itself and without one it doesn't.
  const withGap = [];
  const noGap = [];
  for (const d of days) {
    if (!d.restViolation) continue;
    const gaps = scheduleGaps(byDate[d.date]);
    const row = {
      date: d.date,
      hours: r2(d.paidHours),
      taken: d.restTaken ?? 0,
      owed: d.restRequired,
      gaps,
      charged: owed(d.date, "rest"),
    };
    (gaps.length ? withGap : noGap).push(row);
  }
  if (withGap.length) out.push({ kind: "restGap", tone: "info", rows: withGap });
  if (noGap.length) out.push({ kind: "restNoGap", tone: "info", rows: noGap });

  // 5. punches we changed on their behalf. they signed nothing yet, but they
  //    are about to, so it cannot be a silent edit.
  const fixed = (data.punchCorrections || []).map((c) => ({
    date: c.date, before: c.hoursBefore, after: c.hoursAfter,
  }));
  if (fixed.length) out.push({ kind: "corrected", tone: "info", rows: fixed });

  // 6. a meal was owed and there is no schedule for the day at all, so nothing
  //    we hold can answer it. not charged, and not quietly dropped either.
  const unknown = days.filter((d) => d.mealUnknown).map((d) => ({
    date: d.date, hours: r2(d.paidHours),
  }));
  if (unknown.length) out.push({ kind: "mealUnknown", tone: "ask", rows: unknown });

  // 7. a THIRTY minute entry sitting in the rest break report. Ten is a rest,
  //    thirty is a meal, and nothing we hold says which this was. It is drawn on
  //    the sheet as a striped meal and charged as neither, so the email has to
  //    ask - saying "meal" would take a premium hour off them.
  //
  //    These live on the BATCH, not the sheet, so they arrive as an argument.
  //    Without restRows the check simply does not appear, which is why the
  //    caller has to select them.
  const mealLen = (restRows || [])
    .filter((r) => restKey(r.name) === restKey(sourceName || "") && isMealLengthRest(r))
    .map((r) => ({
      date: r.date,
      from: shortTime(r.reversed ? r.in : r.out),
      to: shortTime(r.reversed ? r.out : r.in),
      minutes: r.minutes,
    }));
  if (mealLen.length) out.push({ kind: "restIsMealLength", tone: "ask", rows: mealLen });

  // 8-10. everything the SHEET now draws differently, asked about in the same
  //       words. Classified by recordedBreaksFor so the email and the document
  //       cannot drift apart - one place decides what a break is.
  // only days the sheet actually lists, so the email never asks about a date
  // the person cannot see on their own timesheet
  const dates = new Set(days.map((d) => d.date));
  const rec = recordedBreaksFor(sourceName || "", restRows || [], byDate);
  const outside = [], noTimes = [], ampm = [];
  for (const [date, v] of rec) {
    if (!dates.has(date)) continue;
    for (const r of v.rests) {
      if (r.unknown) noTimes.push({ date, shift: `${r.shiftFrom}-${r.shiftTo}` });
      else if (r.outsideShift) outside.push({ date, from: r.from, to: r.to });
    }
    for (const m of v.meals) {
      if (m.ampmFixed) ampm.push({ date, was: `${m.wasFrom}-${m.wasTo}`, now: `${m.from}-${m.to}` });
    }
  }
  if (outside.length) out.push({ kind: "restOutsideShift", tone: "ask", rows: outside });
  if (noTimes.length) out.push({ kind: "restNoTimes", tone: "ask", rows: noTimes });
  if (ampm.length) out.push({ kind: "mealAmPm", tone: "ask", rows: ampm });

  return out;
}

// one line per kind, for the plain-text part of the email and for tests
export function checkSummaryLine(check) {
  const n = check.rows.length;
  const days = `${n} ${n === 1 ? "day" : "days"}`;
  switch (check.kind) {
    case "missingDay":
      return `${days} on your schedule with no hours recorded - tell us if you worked them`;
    case "mealMissing":
      return `${days} over 5 hours with no meal period recorded - assumed taken, nothing charged`;
    case "mealLate":
      return `${days} where your meal period started after the end of your fifth hour`;
    case "restGap":
      return `${days} with a gap in your schedule but no rest break recorded - assumed taken, nothing charged`;
    case "restNoGap":
      return `${days} with no rest break recorded - assumed taken, nothing charged`;
    case "corrected":
      return `${days} where punch times were recorded in reverse and have been corrected`;
    case "mealUnknown":
      return `${days} we could not check, because no schedule was found for them`;
    case "restIsMealLength":
      return `${days} with a 30 minute break filed as a rest break - tell us whether it was your meal`;
    case "restOutsideShift":
      return `${days} where your rest break was recorded outside your shift - paid, no premium owed`;
    case "restNoTimes":
      return `${days} with a rest break recorded and no times on it - tell us when you took it`;
    case "mealAmPm":
      return `${days} where your schedule rosters a meal in the middle of the night`;
    default:
      return days;
  }
}
