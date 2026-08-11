// what an employee can tell us is wrong with their timesheet, and what
// accepting that changes.
//
// the kinds come in pairs on purpose. a break can be wrong in both directions:
// the punches show one that wasn't really taken, or one was taken that never
// got punched. those pull the premium in opposite directions, so both have to
// be sayable - otherwise the only reportable problems are the ones that happen
// to favour one side.
//
// nothing in here changes a figure on its own. an employee reporting something
// records a claim; the numbers only move when management accepts it. that's
// deliberate - these are payroll documents, and a hours figure should never
// move because of an unreviewed message.
//
// this module is deliberately free of any pdf/parse import so the signing page
// can use the labels without dragging the engine into the browser bundle.
// `recomputeSheet` takes applyOvertime as an argument for the same reason.

// §226.7 pays one hour per violation, max one meal + one rest premium a day.
const PREMIUM_HOURS_PER_VIOLATION = 1;

const r2 = (n) => Math.round((n || 0) * 100) / 100;

export const CORRECTION_KINDS = {
  hours: {
    label: "The hours for this day are wrong",
    help: "The total shown doesn't match what you actually worked.",
    scope: "day",
    // they tell us what it should be; management confirms before it moves
    asksHours: true,
    hint: "How many hours should this day be?",
    hoursHelp:
      "Total time on the clock, not counting an unpaid lunch. Decimals are fine - 7 hours 30 minutes is 7.5.",
  },
  meal_missed: {
    label: "It shows a lunch, but I worked through it",
    help:
      "Your punches have a meal break on this day, so no meal premium was added. If you worked through it, that time should be paid and a premium is owed.",
    scope: "day",
    asksHours: false,
  },
  meal_taken: {
    label: "I did take my lunch, it just isn't punched",
    help:
      "This day has no meal break in the punches, so a meal premium was added. If you did take it and forgot to clock out, that premium shouldn't be there.",
    scope: "day",
    asksHours: false,
  },
  meal_ontime: {
    label: "I took my lunch on time, the punch is wrong",
    help:
      "Your punches put this meal after the fifth hour, which owes a premium on its own. If you actually went on time and the clock-out is what's off, that premium shouldn't be there.",
    scope: "day",
    asksHours: false,
  },
  rest_missed: {
    label: "I didn't get my rest breaks",
    help:
      "Your punches show your rest breaks on this day. If you didn't actually get them, a rest premium is owed.",
    scope: "day",
    asksHours: false,
  },
  rest_taken: {
    label: "I did take my rest breaks, they just aren't punched",
    help:
      "This day is short on rest breaks in the punches, so a rest premium was added. If you took them without clocking out, that premium shouldn't be there.",
    scope: "day",
    asksHours: false,
  },
  day_missing: {
    label: "I worked a day that isn't listed",
    help: "A whole shift is missing from this timesheet.",
    scope: "newDay",
    asksHours: true,
    hint: "How many hours did you work that day?",
    hoursHelp:
      "Total time on the clock, not counting an unpaid lunch. Put the date in the box below so payroll knows which day.",
  },
  day_extra: {
    label: "There's a day here I didn't work",
    help: "This timesheet lists a shift that isn't mine.",
    scope: "day",
    asksHours: false,
  },
  other: {
    label: "Something else",
    help: "Tell us what's wrong and payroll will look at it.",
    scope: "sheet",
    asksHours: false,
    needsNote: true,
  },
};

export const CORRECTION_KEYS = Object.keys(CORRECTION_KINDS);

export function isCorrectionKind(k) {
  return Object.prototype.hasOwnProperty.call(CORRECTION_KINDS, k);
}

export function correctionLabel(kind) {
  return CORRECTION_KINDS[kind]?.label || "Something else";
}

// a one-line plain-English summary of what accepting this would do to the
// figures, so nobody is approving a change they can't see the effect of.
export function correctionEffect(kind, day, claimedHours) {
  const mealAdd = day?.mealMin ? r2(day.mealMin / 60) : 0;
  switch (kind) {
    case "hours": {
      if (claimedHours == null || !day) return "Sets the hours for this day.";
      const delta = r2(claimedHours - (day.paidHours || 0));
      if (!delta) return "No change to the hours.";
      return `${delta > 0 ? "Adds" : "Removes"} ${Math.abs(delta).toFixed(2)} hrs on this day.`;
    }
    case "meal_missed":
      return mealAdd
        ? `Adds ${mealAdd.toFixed(2)} hrs back and owes a 1 hr meal premium.`
        : "Owes a 1 hr meal premium.";
    case "meal_taken":
      return "Removes the 1 hr meal premium for this day.";
    case "meal_ontime":
      return "Removes the 1 hr late-meal premium for this day.";
    case "rest_missed":
      return "Owes a 1 hr rest premium for this day.";
    case "rest_taken":
      return "Removes the 1 hr rest premium for this day.";
    case "day_missing":
      return claimedHours
        ? `Adds a ${r2(claimedHours).toFixed(2)} hr day.`
        : "Adds a day to this timesheet.";
    case "day_extra":
      return "Removes this day from the timesheet.";
    default:
      return "No automatic change - handled by payroll.";
  }
}

// turn an accepted correction into a per-day patch. `day` is the stored day this
// is about (null for a day being added).
export function patchFor(kind, day, claimedHours) {
  switch (kind) {
    case "hours":
      return claimedHours == null ? {} : { paidHours: r2(claimedHours) };
    case "meal_missed": {
      // they worked through a punched meal: the unpaid gap becomes paid time
      // and the premium is owed. we know the gap length, so this one is exact.
      const patch = { mealViolation: true };
      if (day?.mealMin) patch.paidHours = r2((day.paidHours || 0) + day.mealMin / 60);
      return patch;
    }
    case "meal_taken":
      // they took it without punching. the premium comes off. hours are left
      // alone on purpose - docking someone for an unpunched break is a
      // management decision, so it goes through the hours kind explicitly.
      return { mealViolation: false };
    case "meal_ontime":
      // the meal happened, the clock-out time is what's wrong. same effect on
      // the premium; the punch itself isn't rewritten, since the sheet has to
      // keep showing what the clock actually recorded.
      return { mealViolation: false, mealLate: false };
    case "rest_missed":
      // rest is paid either way, so only the premium moves
      return { restViolation: true };
    case "rest_taken":
      return { restViolation: false };
    case "day_missing":
      return { added: true, paidHours: r2(claimedHours || 0) };
    case "day_extra":
      return { removed: true };
    default:
      return {};
  }
}

// merge a patch into whatever is already stored for that date
export function mergeOverride(overrides, date, patch) {
  if (!date || !patch || !Object.keys(patch).length) return overrides || {};
  const next = { ...(overrides || {}) };
  next[date] = { ...(next[date] || {}), ...patch };
  return next;
}

export function applyOverrides(days, overrides) {
  const ov = overrides || {};
  const out = [];

  for (const d of days) {
    const patch = ov[d.date];
    if (!patch) {
      out.push({ ...d });
      continue;
    }
    if (patch.removed) continue;
    const next = { ...d };
    if (patch.paidHours != null) next.paidHours = patch.paidHours;
    if (patch.mealViolation != null) next.mealViolation = patch.mealViolation;
    if (patch.mealLate != null) next.mealLate = patch.mealLate;
    if (patch.restViolation != null) next.restViolation = patch.restViolation;
    // A rest count the employee moved. Declining "that ten minutes was your
    // rest period" takes the credit back off, and the printed count has to
    // follow the premium or the sheet argues with itself - that disagreement
    // was already found once, lower on 66 days and higher on 22.
    if (patch.restTaken != null) next.restTaken = patch.restTaken;
    // A REST TIME THE EMPLOYEE GAVE US THEMSELVES. The repair we propose is a
    // mechanical guess - the first single-field fix that lands between ten and
    // fifteen minutes - so it can name the wrong ten minutes on a day a break
    // genuinely happened. Riding on the day row means the renderer sees it
    // through `data.days` on the on-demand path as well, without the batch's
    // shared restsByDate having to carry something that belongs to one person.
    if (patch.statedRest) next.statedRest = patch.statedRest;
    // EVERY break the employee told us about on a day nothing recorded. Rides
    // on the day row for the same reason statedRest does: the renderer reads
    // `data.days` on the on-demand path, and this belongs to one person rather
    // than to the batch's shared restsByDate.
    if (patch.statedBreaks) next.statedBreaks = patch.statedBreaks;
    // MINUTES THAT STOPPED BEING OFF-CLOCK TIME, and everything the sheet draws
    // from them. `restsOffClock*` is what stripes a cell and `addedHours` is
    // what prints "+0.17 added" beside the daily total.
    //
    // A WHITELIST IS WHY THIS WAS MISSED. `patchesFor` had been setting all
    // three since the answer started moving hours, and applyOverrides copied
    // none of them - so Uribe's daily total corrected to 6.00 while the comment
    // beside it still declared 0.17 added. Mánu 2026-08-11: "the daily total got
    // corrected but it still shows the +0.17 added." Nothing errors when a field
    // is left out here; it is silently ignored, which is the trap.
    if (patch.addedHours != null) next.addedHours = patch.addedHours;
    if (patch.restsOffClock != null) next.restsOffClock = patch.restsOffClock;
    if (patch.restsOffClockMin != null) next.restsOffClockMin = patch.restsOffClockMin;
    next.corrected = true;
    out.push(next);
  }

  // days added by hand don't exist in the original list
  for (const [date, patch] of Object.entries(ov)) {
    if (!patch?.added) continue;
    if (days.some((d) => d.date === date)) continue;
    out.push({
      date,
      paidHours: patch.paidHours || 0,
      rawHours: 0,
      regularHours: 0,
      otHours: 0,
      doubleHours: 0,
      mealViolation: patch.mealViolation ?? false,
      restViolation: patch.restViolation ?? false,
      mealCount: 0,
      restCount: 0,
      restRequired: 0,
      punches: [],
      breaks: [],
      corrected: true,
      addedByHand: true,
    });
  }

  out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return out;
}

// recompute a whole sheet from its stored days plus accepted overrides.
// overtime has to be redone rather than patched: changing one day's hours can
// push a whole workweek past 40, and the 7th-day rule depends on the shape of
// the week. `applyOvertime` is injected so this file stays client-safe.
export function recomputeSheet({ days, payPeriod, overrides }, applyOvertime, reentitle) {
  const patched = applyOverrides(days || [], overrides);
  // WHAT HANGS OFF THE HOURS HAS TO FOLLOW THE HOURS.
  //
  // An override that moves `paidHours` used to stop there, leaving the day with
  // the entitlement it was analysed with. Mánu 2026-08-11 found it on his own
  // sheet: answering that a ten belonged inside his shift took him from 6.17 to
  // 6.00, which puts the meal waiver back within reach and drops the second rest
  // - and neither happened, so his own answer left him charged two premium hours
  // he no longer owed.
  //
  // Only days the override actually touched are re-derived. A day nobody
  // answered about keeps exactly what the engine said at upload.
  const touched = new Set(Object.keys(overrides || {}));
  const rebanded = reentitle
    ? patched.map((d) => (touched.has(d.date) ? { ...d, ...reentitle(d, d.paidHours) } : d))
    : patched;
  const withOt = applyOvertime(rebanded, payPeriod || null);

  const mealDays = withOt.filter((d) => d.mealViolation).map((d) => d.date);
  const restDays = withOt.filter((d) => d.restViolation).map((d) => d.date);

  return {
    days: withOt.map((d) => ({
      ...d,
      paidHours: r2(d.paidHours),
      rawHours: r2(d.rawHours),
      regularHours: r2(d.regularHours),
      otHours: r2(d.otHours),
      doubleHours: r2(d.doubleHours),
    })),
    // summed from the days AS ROUNDED above, not from the unrounded ones, so a
    // recomputed sheet totals to what it prints. Mánu 2026-08-09, "the sheet
    // wins" - see totalsFromDays() in stored.js for why.
    totals: {
      rawHours: r2(withOt.reduce((n, d) => n + r2(d.rawHours || 0), 0)),
      paidHours: r2(withOt.reduce((n, d) => n + r2(d.paidHours || 0), 0)),
      regularHours: r2(withOt.reduce((n, d) => n + r2(d.regularHours || 0), 0)),
      otHours: r2(withOt.reduce((n, d) => n + r2(d.otHours || 0), 0)),
      doubleHours: r2(withOt.reduce((n, d) => n + r2(d.doubleHours || 0), 0)),
    },
    premiums: {
      mealDays,
      restDays,
      mealHours: mealDays.length * PREMIUM_HOURS_PER_VIOLATION,
      restHours: restDays.length * PREMIUM_HOURS_PER_VIOLATION,
      totalHours:
        (mealDays.length + restDays.length) * PREMIUM_HOURS_PER_VIOLATION,
    },
    partialWeekDates: withOt.filter((d) => d.weekPartial).map((d) => d.date),
  };
}

// a sheet can only be signed once nothing is outstanding
export function hasOpenCorrections(corrections) {
  return (corrections || []).some((c) => c.status === "open");
}
