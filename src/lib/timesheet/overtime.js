// CALIFORNIA OVERTIME, IN A FILE A BROWSER CAN IMPORT.
//
// MOVED OUT OF parse.js ON 2026-09-17, NOT REWRITTEN. Every line below is the
// engine's own, byte for byte - the split exists so the employee's review page
// can show what a reported day does to their overtime, and the alternative was
// a second copy of a payroll rule, which is the one thing this codebase does
// not do. parse.js imports it back and re-exports it, so nothing that read it
// from there had to change.
//
// WHY IT COULD NOT STAY: parse.js is server-only - it loads the pdfjs stack for
// reading QSP exports - and the review summary is a client component, because a
// DRAFTED report exists only in the browser. Mánu 2026-09-17, on an 11.50 hour
// day still showing the old overtime: "why didnt ot change".
//
// THE RULES LIVE HERE NOW and parse.js spreads them into its own RULES table,
// so there is still one definition and still one table to read.
export const OT_RULES = {
  dailyOtAfterHours: 8,      // >8 in a day -> time and a half
  dailyDoubleAfterHours: 12, // >12 in a day -> double time
  weeklyOtAfterHours: 40,    // >40 straight-time hours in a workweek -> OT
  // 0 = Sunday, 1 = Monday. California's workweek is an employer choice; ours
  // starts Monday, which is what the QSP schedule export lines up with.
  workweekStartsOn: 1,
  seventhDayRule: true,
};

// the block below was written against a `RULES` table, and reads the same four
// values out of this one
const RULES = OT_RULES;

// "07/16/26" -> Date (assumes 20xx, which is what QSP prints)
function parseSheetDate(mmddyy) {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(mmddyy);
  if (!m) return null;
  return new Date(2000 + +m[3], +m[1] - 1, +m[2]);
}

// which workweek a date falls in, as a sortable key
function weekKey(date) {
  const d = new Date(date);
  const shift = (d.getDay() - RULES.workweekStartsOn + 7) % 7;
  d.setDate(d.getDate() - shift);
  return d.toISOString().slice(0, 10);
}

// split each day's paid hours into regular / overtime / double-time.
//
// order matters: daily OT is computed first, then weekly OT is topped up from
// whatever is still straight time, so the same hour is never counted twice.
// the 7th-consecutive-day rule overrides the daily split for that day.
export function applyOvertime(days, payPeriod = null) {
  const withDates = days.map((d) => ({ ...d, _date: parseSheetDate(d.date) }));

  // pay periods run 1st-15th and 16th-EOM, but the workweek is Mon-Sun, so the
  // weeks at each end of an export are cut off by the period boundary. their
  // >40 total can't be judged from this file alone - the missing days live in
  // the neighbouring pay period - so those weeks get flagged as provisional.
  const ppStart = payPeriod?.from ? parseSheetDate(payPeriod.from) : null;
  const ppEnd = payPeriod?.to ? parseSheetDate(payPeriod.to) : null;
  const weekSpansBoundary = (weekStartKey) => {
    if (!ppStart || !ppEnd) return false;
    const start = new Date(weekStartKey + "T00:00:00");
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return start < ppStart || end > ppEnd;
  };

  // group into workweeks to find both the >40 bucket and 7th-day streaks
  const weeks = new Map();
  for (const d of withDates) {
    if (!d._date) continue;
    const k = weekKey(d._date);
    if (!weeks.has(k)) weeks.set(k, []);
    weeks.get(k).push(d);
  }

  for (const [wk, week] of weeks) {
    week.sort((a, b) => a._date - b._date);
    const partial = weekSpansBoundary(wk);
    for (const d of week) d.weekPartial = partial;

    // a "7th consecutive day" only counts inside the same workweek
    let seventhDay = null;
    if (RULES.seventhDayRule && week.length >= 7) {
      let run = 1;
      for (let i = 1; i < week.length; i++) {
        const gapDays = Math.round((week[i]._date - week[i - 1]._date) / 86400000);
        run = gapDays === 1 ? run + 1 : 1;
        if (run === 7) {
          seventhDay = week[i];
          break;
        }
      }
    }

    // pass 1 - daily thresholds
    for (const d of week) {
      const h = d.paidHours;
      if (d === seventhDay) {
        d.otHours = Math.min(h, RULES.dailyOtAfterHours);
        d.doubleHours = Math.max(0, h - RULES.dailyOtAfterHours);
        d.regularHours = 0;
        d.seventhDay = true;
        continue;
      }
      d.doubleHours = Math.max(0, h - RULES.dailyDoubleAfterHours);
      d.otHours = Math.max(0, Math.min(h, RULES.dailyDoubleAfterHours) - RULES.dailyOtAfterHours);
      d.regularHours = h - d.otHours - d.doubleHours;
      d.seventhDay = false;
    }

    // pass 2 - weekly >40, drawn only from hours still at straight time
    let straight = 0;
    for (const d of week) {
      const room = Math.max(0, RULES.weeklyOtAfterHours - straight);
      const toOt = Math.max(0, d.regularHours - room);
      if (toOt > 0) {
        d.regularHours -= toOt;
        d.otHours += toOt;
      }
      straight += Math.min(d.regularHours, room);
    }

    // pass 3 - on a PARTIAL week, take QSP's overtime where it is higher.
    //
    // A week cut by the pay-period boundary has days we cannot see: 07/13-07/15
    // live in the previous export. Somebody who worked those days had already
    // passed 40 by Sunday, and we have no way to know it. QSP does, because it
    // holds both periods. On 07/16-07/31 every real overtime difference between
    // us and QSP was exactly this - five days, all of them 07/19, worth 4.42
    // hours - and on COMPLETE weeks the two agree to within 0.02 across all 59
    // people. That is what says this is a visibility problem and not a rule
    // one, and it is why #67 and #71 turned out to be the same item.
    //
    // MAX, never replace. Where our own figure is higher we keep it, so this
    // can only ever move somebody up. Handing a person a corrected sheet paying
    // less overtime than payroll already issued is the thing this engine exists
    // to avoid, and trusting a number we cannot derive is the lesser evil only
    // while it runs in their favour.
    //
    // Complete weeks are left alone on purpose: there we can prove the split
    // from the punches, so we compute it rather than take it on trust.
    //
    // AND IT IMPORTS QSP'S MISTAKES ALONG WITH ITS KNOWLEDGE. Jones, Aaron
    // 08/02/26 - a Sunday - reads paid 4.00, regular 1, overtime 3, because that
    // is what QSP printed. Mánu confirmed 2026-08-12 that the row is a QSP data
    // error: he holds no timesheet for Aaron in 07/16-07/31, so there is no
    // cross-boundary week for those three hours to have come from. That is the
    // whole of it across both live batches - 5 days and 7.42 hours at 1.5x, of
    // which the four on 07/19 above are genuine and this one is not.
    //
    // The fix considered and NOT taken: defer only where we cannot see the
    // adjoining days. Aaron's invisible half-week (07/27-08/01) is in a batch we
    // DO hold and he has no sheet in it, so we could compute it ourselves, while
    // the July four's invisible days sit in a period we do not hold and would
    // still defer. It needs adjoining-period coverage threaded into a function
    // that is currently pure over one sheet, and it moves overtime on a payroll
    // document, so Mánu's call 2026-08-12 was to leave it and revisit it as its
    // own piece of work rather than fold it into the rest-break fix.
    if (partial) {
      for (const d of week) {
        const printedOt = Number(d.printed?.overtime || 0);
        if (!(printedOt > d.otHours + 0.005)) continue;
        // fund it from straight time first, then from double time, so the
        // day's paid hours never change - only which bucket they sit in.
        const gain = Math.min(printedOt - d.otHours, d.regularHours + d.doubleHours);
        const fromRegular = Math.min(gain, d.regularHours);
        d.regularHours -= fromRegular;
        d.doubleHours -= gain - fromRegular;
        d.otHours += gain;
        d.otFromPrinted = true;
      }
    }
  }

  // days QSP printed without a parseable date still need the fields set
  for (const d of withDates) {
    if (d.regularHours === undefined) {
      d.regularHours = d.paidHours;
      d.otHours = 0;
      d.doubleHours = 0;
      d.seventhDay = false;
    }
    delete d._date;
  }
  return withDates;
}
