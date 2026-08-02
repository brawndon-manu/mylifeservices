// aggregate a batch of timesheets into the things payroll/HR actually act on:
// what the correction changed, what's owed, WHO is repeatedly missing breaks,
// WHICH days it happens on, and who still hasn't signed.
//
// pure function over the stored rows - no db, no prisma - so it can be tested
// against a real export without touching anything.

const r2 = (n) => Math.round((n || 0) * 100) / 100;

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// "07/16/26" -> Date (QSP prints 2-digit years, always 20xx)
function parseSheetDate(mmddyy) {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(mmddyy || "");
  if (!m) return null;
  return new Date(2000 + +m[3], +m[1] - 1, +m[2]);
}

export function buildBatchStats(rows) {
  const totals = {
    employees: rows.length,
    rawHours: 0,
    paidHours: 0,
    regularHours: 0,
    otHours: 0,
    doubleHours: 0,
    premiumHours: 0,
    mealPremiumHours: 0,
    restPremiumHours: 0,
  };

  // day-of-week violation counts - a violation clustering on one weekday is a
  // scheduling problem, not 60 individual mistakes.
  const byDow = DOW.map((label) => ({ label, meal: 0, rest: 0, worked: 0 }));
  // per-date, so a single bad day (short staffing, an event) stands out
  const byDate = new Map();

  const affected = [];
  let employeesWithPremium = 0;
  let employeesWithOt = 0;
  let daysWorked = 0;

  for (const t of rows) {
    totals.rawHours += t.rawHours || 0;
    totals.paidHours += t.paidHours || 0;
    totals.regularHours += t.regularHours || 0;
    totals.otHours += t.otHours || 0;
    totals.doubleHours += t.doubleHours || 0;
    totals.premiumHours += t.premiumHours || 0;

    const prem = t.data?.premiums || {};
    totals.mealPremiumHours += prem.mealHours || 0;
    totals.restPremiumHours += prem.restHours || 0;

    if ((t.premiumHours || 0) > 0) employeesWithPremium++;
    if ((t.otHours || 0) > 0 || (t.doubleHours || 0) > 0) employeesWithOt++;

    const days = Array.isArray(t.data?.days) ? t.data.days : [];
    let mealMissed = 0;
    let restMissed = 0;
    // did this person EVER punch out for a break? a break is only detectable as
    // a gap between punches, so someone who never clocks out looks identical to
    // someone denied every break. that distinction is the difference between a
    // real §226.7 liability and a timekeeping habit, so it's surfaced rather
    // than silently rolled into the premium total.
    let daysWithAnyBreak = 0;
    for (const d of days) {
      daysWorked++;
      const dt = parseSheetDate(d.date);
      const slot = dt ? byDow[dt.getDay()] : null;
      if (slot) slot.worked++;

      if (!byDate.has(d.date)) byDate.set(d.date, { date: d.date, meal: 0, rest: 0, worked: 0 });
      const dayEntry = byDate.get(d.date);
      dayEntry.worked++;

      if (d.mealViolation) {
        mealMissed++;
        if (slot) slot.meal++;
        dayEntry.meal++;
      }
      if (d.restViolation) {
        restMissed++;
        if (slot) slot.rest++;
        dayEntry.rest++;
      }
      // a detected rest break, or a meal gap, means they do punch for breaks
      if ((d.restCount || 0) > 0 || !d.mealViolation) daysWithAnyBreak++;
    }

    affected.push({
      id: t.id,
      name: t.displayName || t.sourceName,
      premiumHours: r2(t.premiumHours),
      otHours: r2((t.otHours || 0) + (t.doubleHours || 0)),
      paidHours: r2(t.paidHours),
      addedHours: r2((t.paidHours || 0) - (t.rawHours || 0)),
      mealMissed,
      restMissed,
      daysWorked: days.length,
      daysWithAnyBreak,
      // never punched a single break all period - almost certainly a
      // timekeeping habit, so their premiums need verifying before payout
      neverPunchedBreaks: days.length > 0 && daysWithAnyBreak === 0,
      signed: !!t.signedAt,
      sent: !!t.sentAt,
    });
  }

  for (const k of Object.keys(totals)) {
    if (k !== "employees") totals[k] = r2(totals[k]);
  }
  totals.addedHours = r2(totals.paidHours - totals.rawHours);

  // the correction's whole point: unpaid rest time that is now paid
  const avgAdded = rows.length ? r2(totals.addedHours / rows.length) : 0;

  const worstDow = [...byDow]
    .filter((d) => d.worked > 0)
    .sort((a, b) => b.meal + b.rest - (a.meal + a.rest));

  const worstDates = [...byDate.values()]
    .sort((a, b) => b.meal + b.rest - (a.meal + a.rest))
    .slice(0, 5);

  // people whose premiums are probably a punching habit rather than a denied
  // break. their share of the total is the number to verify before paying out.
  const neverPunched = affected.filter((a) => a.neverPunchedBreaks);
  const neverPunchedPremiumHours = r2(
    neverPunched.reduce((n, a) => n + a.premiumHours, 0),
  );

  return {
    totals: {
      ...totals,
      avgAdded,
      daysWorked,
      employeesWithPremium,
      employeesWithOt,
      neverPunchedCount: neverPunched.length,
      neverPunchedPremiumHours,
    },
    neverPunched: neverPunched.sort((a, b) => b.premiumHours - a.premiumHours),
    byDow,
    worstDow,
    worstDates,
    // most affected first - this is the list worth acting on
    mostAffected: [...affected]
      .filter((a) => a.premiumHours > 0)
      .sort((a, b) => b.premiumHours - a.premiumHours || b.restMissed - a.restMissed),
    withOt: [...affected].filter((a) => a.otHours > 0).sort((a, b) => b.otHours - a.otHours),
    signing: {
      sent: affected.filter((a) => a.sent).length,
      signed: affected.filter((a) => a.signed).length,
      outstanding: affected.filter((a) => a.sent && !a.signed),
      notSent: affected.filter((a) => !a.sent).length,
    },
  };
}
