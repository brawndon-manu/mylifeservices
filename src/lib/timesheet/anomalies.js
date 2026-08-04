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
      after = analyzeDay({ ...d, punches, printed: null });
    } catch {
      after = null;
    }
    const credible = isCredible(after ? { ...after, punches } : null);

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
      needsHuman: !credible,
    });
  }
  return rows;
}

export function anomalyLabel(kind) {
  return ANOMALY_KINDS[kind]?.label || "Punch entry looks wrong";
}
