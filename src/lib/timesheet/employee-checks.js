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

export function buildEmployeeChecks(data) {
  if (!data) return [];
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
    date: d.date, hours: r2(d.paidHours),
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
      return `${days} over 5 hours with no meal period scheduled`;
    case "mealLate":
      return `${days} where your meal period started after the end of your fifth hour`;
    case "restGap":
      return `${days} with a gap in your schedule but no rest break recorded`;
    case "restNoGap":
      return `${days} with no rest break recorded`;
    case "corrected":
      return `${days} where punch times were recorded in reverse and have been corrected`;
    case "mealUnknown":
      return `${days} we could not check, because no schedule was found for them`;
    default:
      return days;
  }
}
