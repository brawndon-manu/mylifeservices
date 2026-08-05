// punch entries that don't make sense on their face.
//
// staff clock out and back in for their 10-minute rest periods, entering the
// time out on the left and the time in on the right. those two get swapped, or
// one of them picks up the wrong AM/PM, and QSP stores it exactly as typed. The
// timesheet export then carries a stretch of work that never happened, or a
// stretch of negative time that quietly eats real hours.
//
// none of this is our arithmetic going wrong - we reproduce QSP's own printed
// daily figures to the hundredth. it's the source data. so the job here is to
// spot it, say what it probably should have been, and let a person decide. we
// never rewrite a punch on our own.

const r2 = (n) => Math.round((n || 0) * 100) / 100;

// one continuous stretch on the clock longer than this is not a real shift
const LONG_SEGMENT_MIN = 600; // 10 hours
const HALF_DAY_MIN = 720; // the 12 hours an AM/PM slip moves a time by

export const ANOMALY_KINDS = {
  long_segment: {
    label: "Impossibly long stretch on the clock",
    why: "A single clock-in to clock-out runs over 10 hours. This is usually a rest period where one of the two times picked up the wrong AM or PM.",
  },
  backwards_segment: {
    label: "Clocked out before clocking in",
    why: "The clock-out is earlier than the clock-in, so this stretch counts as negative time and quietly reduces the day.",
  },
  reversed_break: {
    label: "Clocked back in before clocking out",
    why: "The time out and time in look swapped - the break reads backwards, so it isn't counted as a rest period at all.",
  },
};

// minutes-from-midnight back to the way QSP prints a punch. exported because the
// checks screen shows raw punches for schedule disagreements too, and those
// aren't anomalies - two formatters would drift.
export const hm = (m) => {
  const h24 = Math.floor(((m % 1440) + 1440) % 1440 / 60);
  const mm = Math.round(((m % 60) + 60) % 60);
  const ap = h24 >= 12 ? "p" : "a";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(mm).padStart(2, "0")}${ap}`;
};

// walk a day's punches and describe anything that can't be right. returns [] for
// a clean day, which is most of them.
export function findAnomalies(day) {
  const p = day.punches || [];
  const out = [];

  for (let i = 0; i + 1 < p.length; i += 2) {
    const dur = p[i + 1].min - p[i].min;

    if (dur >= LONG_SEGMENT_MIN) {
      out.push({
        kind: "long_segment",
        at: i,
        shown: `${hm(p[i].min)} to ${hm(p[i + 1].min)}`,
        countedMin: dur,
        note: `counted as ${(dur / 60).toFixed(2)} hours of work`,
      });
    } else if (dur < 0) {
      out.push({
        kind: "backwards_segment",
        at: i,
        shown: `${hm(p[i].min)} to ${hm(p[i + 1].min)}`,
        countedMin: dur,
        note: `counted as ${(dur / 60).toFixed(2)} hours, so it subtracts from the day`,
      });
    }

    const next = p[i + 2];
    if (next) {
      const gap = next.min - p[i + 1].min;
      if (gap < 0) {
        out.push({
          kind: "reversed_break",
          at: i + 1,
          shown: `out ${hm(p[i + 1].min)}, back in ${hm(next.min)}`,
          countedMin: gap,
          note: "the break reads backwards so no rest period is credited",
        });
      }
    }
  }
  return out;
}

// what the punches most likely should have been. deliberately conservative: one
// pass, only the obvious repairs, and the result is always shown to a person
// beside the original before anything moves.
export function suggestPunches(day) {
  const p = (day.punches || []).map((x) => ({ ...x }));
  const applied = [];

  for (let i = 0; i + 1 < p.length; i += 2) {
    // an over-long stretch: pull the wrong meridiem off the end, then fix the
    // order if that leaves it running backwards. Garcia's 11:30a-11:20p becomes
    // 11:20a-11:30a, which is the ten minute rest it was meant to be.
    if (p[i + 1].min - p[i].min >= LONG_SEGMENT_MIN) {
      p[i + 1].min -= HALF_DAY_MIN;
      applied.push("moved a PM back to AM");
    }
    if (p[i + 1].min < p[i].min) {
      const t = p[i].min;
      p[i].min = p[i + 1].min;
      p[i + 1].min = t;
      applied.push("swapped a time out and time in");
    }
    const next = p[i + 2];
    if (next && next.min < p[i + 1].min) {
      const t = p[i + 1].min;
      p[i + 1].min = next.min;
      next.min = t;
      applied.push("swapped a break's two times");
    }
  }

  return { punches: p, applied: [...new Set(applied)] };
}

// a repair is only worth showing if it actually repairs the day. these punch
// scrambles vary more than the three tidy shapes suggest, and a naive swap can
// leave a day worse than it started - one real example turned 16.29 hours into
// MINUS 8. so a suggestion has to clear every anomaly it was meant to fix AND
// land somewhere a human shift could plausibly live, or it isn't offered at all
// and the day goes to someone to work out by hand.
function isCredible(after) {
  if (!after) return false;
  const h = after.paidHours;
  if (!(h > 0 && h <= 16)) return false;
  // the repair has to leave nothing behind
  return findAnomalies({ punches: after.punches || [] }).length === 0;
}

// a whole sheet's worth, with the corrected figures worked out by re-running the
// same day analysis on the suggested punches - so any number offered is produced
// by the engine proper, not by arithmetic invented here.
export function reviewSheet(days, analyzeDay) {
  const rows = [];
  for (const d of days) {
    const found = findAnomalies(d);
    if (!found.length) continue;
    const before = analyzeDay(d);
    const { punches, applied } = suggestPunches(d);

    let after = null;
    try {
      // `repaired` rather than `printed: null`: it skips the floor at QSP's
      // printed figure the same way, but keeps the printed figure itself, so the
      // number offered here is computed exactly as the applied one will be.
      after = analyzeDay({ ...d, punches, repaired: true });
    } catch {
      after = null;
    }
    const credible = isCredible(after ? { ...after, punches } : null);

    // what the repair would actually MOVE. bad source data that changes no
    // figure is still worth fixing in QSP, but it costs nobody anything here,
    // and on a screen where every card looks identical that needs saying out
    // loud - 4 of the 55 flags on 07/16-07/31 are inert like this. Without it
    // people spend the same attention on a day that pays the same either way as
    // on one that is 4 hours out.
    const moved = (b, a) => (b === a ? "same" : a ? "added" : "removed");
    const effect = credible
      ? {
          hours: r2(after.paidHours - before.paidHours),
          restPremium: moved(before.restViolation, after.restViolation),
          mealPremium: moved(before.mealViolation, after.mealViolation),
        }
      : null;
    if (effect) {
      effect.changesNothing =
        effect.hours === 0 && effect.restPremium === "same" && effect.mealPremium === "same";
    }

    rows.push({
      date: d.date,
      anomalies: found,
      applied,
      shownPunches: (d.punches || []).map((x) => hm(x.min)),
      hoursNow: Math.round((before.paidHours || 0) * 100) / 100,
      restsNow: before.restCount,
      // only populated when the repair holds up
      suggestion: credible
        ? {
            punches: punches.map((x) => hm(x.min)),
            applied,
            hours: Math.round(after.paidHours * 100) / 100,
            rests: after.restCount,
          }
        : null,
      effect,
      needsHuman: !credible,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// A repair a SECOND DOCUMENT confirms, which is the only kind safe to apply.
//
// Mánu's rule was "if the two times of a break are inverted, assume a reversal".
// Measured on 07/16-07/31 that is wrong more often than it is right: of the 24
// reversed breaks the schedule could judge, swapping was correct on 9 and WRONG
// on 15, and applying it blind would have stripped 15.58 hours off eleven
// people - Flores 07/26 from 7.07 down to 1.07, Devine 07/23 from 9.00 to 4.67.
// The engine can see the shape `12:10p, 12:00p`, but it cannot tell a reversed
// ten-minute break from punches that are out of order for some other reason.
//
// Size does not separate them either, which was the obvious next idea: Aranda
// 07/21 is a 0.08 hr change and the schedule still says leave it alone.
//
// What does separate them is the schedule agreeing with the repaired figure and
// not with the current one. That was right 9 times out of 9. Every one is the
// same shape as Mánu's own 07/27: two punch pairs that overlap, so ten minutes
// get billed twice and the day reads high by 0.17.
export function scheduleConfirmsRepair(row, scheduledHours, tolerance = 0.05) {
  if (!row || !row.suggestion || scheduledHours == null) return false;
  // only ever the reversed-break shape. a backwards segment or an AM/PM slip is
  // a different animal and none of them were confirmed on the real period.
  const kinds = row.anomalies || [];
  if (!kinds.length || !kinds.every((a) => a.kind === "reversed_break")) return false;

  const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
  // the schedule has to back the repair AND disagree with what we hold now.
  // agreeing with both means it can't tell them apart and settles nothing.
  return near(row.suggestion.hours, scheduledHours) && !near(row.hoursNow, scheduledHours);
}

// the confirmed subset of a sheet's review rows, given the schedule's own paid
// hours per date. returns [] when there is no schedule, which is the safe
// answer - no second opinion, no automatic change.
export function confirmedRepairs(rows, scheduledHoursByDate) {
  if (!rows?.length || !scheduledHoursByDate) return [];
  return rows.filter((r) => scheduleConfirmsRepair(r, scheduledHoursByDate[r.date] ?? null));
}

// The whole apply step, in one place so a test can drive exactly what the upload
// drives. It used to live inside uploadBatch, where nothing could reach it - and
// the first version silently did nothing, because the repaired days still hit
// the floor at QSP's printed figure and were pushed straight back to the number
// the repair exists to correct. Every flag cleared, every correction recorded,
// not one hour moved.
//
// `parsedDays` are the raw days (punches + QSP's printed figures), `analyzedDays`
// the same days after analyzeDay. Returns the parsed days with confirmed repairs
// applied, plus a record of what changed. Returns them untouched when there is no
// schedule, which is the safe answer: no second opinion, no automatic change.
export function repairConfirmedDays(parsedDays, analyzedDays, scheduleDays, analyzeDay) {
  const none = { days: parsedDays, corrections: [] };
  if (!scheduleDays?.length || !parsedDays?.length) return none;

  const scheduledHours = {};
  for (const d of scheduleDays) scheduledHours[d.date] = d.workHours;

  const confirmed = confirmedRepairs(reviewSheet(analyzedDays, analyzeDay), scheduledHours);
  if (!confirmed.length) return none;

  const fixDates = new Set(confirmed.map((r) => r.date));
  const byDate = new Map(analyzedDays.map((d) => [d.date, d]));

  return {
    days: parsedDays.map((d) =>
      fixDates.has(d.date)
        ? // `repaired` exempts the day from the floor. Without it this function
          // returns days that look corrected and analyze to the old figure.
          { ...d, punches: repairedPunches(byDate.get(d.date) || d), repaired: true }
        : d,
    ),
    corrections: confirmed.map((r) => ({
      date: r.date,
      was: r.shownPunches,
      now: r.suggestion.punches,
      hoursBefore: r.hoursNow,
      hoursAfter: r.suggestion.hours,
      applied: r.suggestion.applied,
      confirmedBy: "schedule",
      scheduleHours: scheduledHours[r.date] ?? null,
    })),
  };
}

// scheduled PAID hours for one day, off the stored shift list. meals are unpaid
// so they stay out of it, the same way compareToSchedule builds its own figure.
export function scheduledPaidHours(entry) {
  if (!entry?.shifts?.length) return null;
  return r2(entry.shifts.reduce((n, s) => n + (s.meal ? 0 : s.minutes || 0), 0) / 60);
}

// No repair could be offered, but the schedule already agrees with the figure we
// hold. The punches are still a mess and still worth fixing in QSP; the day just
// isn't unresolved, and "needs working out by hand" says it is.
//
// B. Rotter 07/28 is the case: five punch pairs, one running 30 minutes
// backwards, and no single-pass swap clears it - fixing the backwards pair just
// creates a reversed break after it, so `isCredible` refuses and the day falls
// through to the loudest label on the screen. Her total is 8.00 and her schedule
// independently says 8.00. On 07/16-07/31 that is true of 11 of the 14 days
// marked for hand-working, so the label was sending people to check ten days
// that a second document had already settled.
export function scheduleAgreesWithCurrent(row, scheduledHours, tolerance = 0.05) {
  // only for days with no repair on offer - a day WITH a credible repair is a
  // different conversation, and `effect` already describes that one.
  if (!row || row.suggestion || scheduledHours == null) return false;
  return Math.abs((row.hoursNow ?? 0) - scheduledHours) <= tolerance;
}

// Which of the four things a flagged day is, decided once, in one place.
//
// This used to be a chain of ternaries inside the JSX, and it shipped a crash:
// `row.effect?.restPremium !== "same"` is TRUE when `effect` is missing, which
// is every batch stored before `effect` existed. The guard read as "this changes
// a premium", the branch ran, and the next line dereferenced the thing that
// wasn't there. It took the whole checks screen down for every existing batch,
// and the build, the linter and 68 tests all went straight past it.
//
// Pulling the decision out means the shapes can be tested without rendering
// anything, and the JSX only has to switch on `tone`.
//
//   repair   a credible repair that moves a figure
//   inert    a credible repair that moves nothing
//   settled  no repair holds up, but the schedule agrees with what we hold
//   human    no repair, and nothing else settles it either
export function describePunchIssue(row, scheduledHours = null) {
  if (!row) return null;

  if (!row.suggestion) {
    return scheduleAgreesWithCurrent(row, scheduledHours)
      ? { tone: "settled", open: false, hours: row.hoursNow }
      : { tone: "human", open: true };
  }

  // `effect` is absent on anything stored before it existed. that is "we don't
  // know", not "nothing changed" and not "a premium moved" - say nothing.
  const e = row.effect || null;
  if (e?.changesNothing) return { tone: "inert", open: false, hours: row.suggestion.hours };

  return {
    tone: "repair",
    open: false,
    hours: row.suggestion.hours,
    was: row.hoursNow,
    applied: row.suggestion.applied || [],
    // only ever set when we actually have a reading
    restPremium: e && e.restPremium !== "same" ? e.restPremium : null,
    mealPremium: e && e.mealPremium !== "same" ? e.mealPremium : null,
  };
}

// QSP's own way of writing a punch: no ":00" on the hour. worth matching,
// because a repaired punch sits in a row beside untouched ones and "12:00p"
// next to "1p" reads like two different documents.
export function qspTime(min) {
  const h24 = Math.floor((((min % 1440) + 1440) % 1440) / 60);
  const mm = ((min % 60) + 60) % 60;
  const ap = h24 >= 12 ? "p" : "a";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return mm === 0 ? `${h}${ap}` : `${h}:${String(mm).padStart(2, "0")}${ap}`;
}

// the repaired punches for a day, with `raw` restamped on the ones that moved.
//
// THIS IS THE BIT THAT BITES: suggestPunches swaps the `.min` values and leaves
// each punch's `.raw` string on the object it started on. The renderer prints
// `raw`, so applying a repair without this shows the ORIGINAL times beside
// corrected hours - a sheet that looks like the arithmetic is broken. Caught in
// a mock, not by the build, the linter or the tests.
export function repairedPunches(day) {
  const { punches } = suggestPunches(day);
  const before = day.punches || [];
  return punches.map((p, i) => (p.min === before[i]?.min ? p : { ...p, raw: qspTime(p.min) }));
}

export function anomalyLabel(kind) {
  return ANOMALY_KINDS[kind]?.label || "Punch entry looks wrong";
}
