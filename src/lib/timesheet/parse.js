// timesheet engine: parse a QSP "Simple Timesheet" PDF export into per-day
// punches, classify each break, recompute paid hours, and apply CA overtime.
// server-only (uses the pdfjs legacy build + node Buffer).
//
// full derivation of these rules, and the validation runs behind them, are
// written up in docs/week8/week8.md.

// pdfjs is loaded lazily so importing this module from a client bundle or an
// edge route never drags the whole PDF stack in.
// pdfjs reaches for a few browser globals as it loads. node doesn't have them,
// so on a server it dies with "DOMMatrix is not defined" before parsing
// anything. we only ever read text positions - none of the canvas drawing that
// would actually use these - so minimal stand-ins are enough to get it loaded.
function ensurePdfGlobals() {
  const g = globalThis;
  if (typeof g.DOMMatrix === "undefined") {
    g.DOMMatrix = class DOMMatrix {
      constructor(init) {
        const m = Array.isArray(init) ? init : [1, 0, 0, 1, 0, 0];
        [this.a, this.b, this.c, this.d, this.e, this.f] = m;
      }
      // pdfjs only ever composes transforms on the paths we don't take
      multiply() {
        return this;
      }
      invertSelf() {
        return this;
      }
      translate() {
        return this;
      }
      scale() {
        return this;
      }
    };
  }
  if (typeof g.Path2D === "undefined") {
    g.Path2D = class Path2D {
      addPath() {}
      moveTo() {}
      lineTo() {}
      closePath() {}
      rect() {}
      bezierCurveTo() {}
      quadraticCurveTo() {}
    };
  }
  if (typeof g.ImageData === "undefined") {
    g.ImageData = class ImageData {
      constructor(width, height) {
        this.width = width;
        this.height = height;
        this.data = new Uint8ClampedArray(Math.max(0, width * height * 4));
      }
    };
  }
}

let pdfjsPromise = null;
function getPdfjs() {
  if (!pdfjsPromise) {
    ensurePdfGlobals();
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs");
  }
  return pdfjsPromise;
}

// ---- rules (tune in one place) ----
//
// these started out reverse-engineered from two sample exports. they now follow
// the written spec David has been running by hand, which is the source of truth
// where the two ever disagreed - see docs/week8/week8.md.
export const RULES = {
  // a gap this short is a punch artifact (clock-out/in at the same minute), not
  // a break - it neither counts as a rest break nor costs unpaid time.
  ignoreGapMaxMin: 1,
  // paid 10-minute rest break. a range, since real punches drift a minute or two.
  restMinMin: 2,
  restMaxMin: 20,
  // unpaid 30-minute meal period.
  mealMinMin: 21,
  mealMaxMin: 90,
  // one rest break per 4 hours worked "or major fraction thereof". a major
  // fraction of a 4-hour block is anything over 2 hours, which is what produces
  // the DLSE's bands - see restsRequired() below. the figure is kept here for
  // anything that still wants the plain block size.
  restPerHours: 4,
  // a meal period is owed once the day passes 5 hours worked...
  mealRequiredAfterHours: 5,
  // ...and it has to BEGIN by the end of the fifth hour worked (Lab. Code §512,
  // Brinker). a meal that was taken but taken late is still a violation, which
  // is why counting meals alone isn't enough.
  mealMustStartByMin: 300,
  // §226.7: max one meal premium + one rest premium per workday, 1 hr each.
  premiumHoursPerViolation: 1,
  // CA overtime. nobody is supposed to run over, but it still has to be
  // computed - an unnoticed long day is exactly the kind of thing that turns
  // into a wage claim.
  dailyOtAfterHours: 8,      // >8 in a day -> time and a half
  dailyDoubleAfterHours: 12, // >12 in a day -> double time
  weeklyOtAfterHours: 40,    // >40 straight-time hours in a workweek -> OT
  // MLS runs a MONDAY-Sunday workweek (confirmed against QSP's own scheduler:
  // the 22nd and the 26th report the same weekly total, the 29th a different
  // one). 0=Sunday, 1=Monday.
  workweekStartsOn: 1,
  // 7th consecutive day worked in one workweek: first 8 hrs OT, rest double.
  seventhDayRule: true,
};

const toMin = (t) => {
  // "8a" | "10:41a" | "12:30p" | "4p" -> minutes since midnight
  const m = /^(\d{1,2})(?::(\d{2}))?\s*([ap])$/i.exec(t.trim());
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const pm = m[3].toLowerCase() === "p";
  if (h === 12) h = 0;
  return (pm ? h + 12 : h) * 60 + min;
};

const isTime = (s) => /^\d{1,2}(:\d{2})?\s*[ap]$/i.test(s.trim());
const isDate = (s) => /^\d{2}\/\d{2}\/\d{2}$/.test(s.trim());

// QSP rounds each punch segment UP to the nearest hundredth of an hour and then
// sums those, which is why its printed daily total (e.g. 7.68) is a hair above
// the exact figure (7.6667). we mirror that so the "as exported" column
// reconciles against their document line for line.
const ceil2 = (n) => Math.ceil(n * 100 - 1e-9) / 100;

// pull the visual rows (grouped by y) out of one page
async function pageRows(page) {
  const content = await page.getTextContent();
  const items = content.items
    .filter((i) => (i.str || "").trim())
    .map((i) => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5] }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const rows = [];
  let cur = [];
  let curY = null;
  for (const it of items) {
    if (curY === null || Math.abs(it.y - curY) < 3) {
      cur.push(it);
      if (curY === null) curY = it.y;
    } else {
      rows.push({ y: curY, items: cur });
      cur = [it];
      curY = it.y;
    }
  }
  if (cur.length) rows.push({ y: curY, items: cur });
  return rows;
}

// stitch adjacent text fragments into words (pdf.js splits "Miranda, Gabriel")
const joinRow = (row) => row.items.map((i) => i.s).join(" ").replace(/\s+/g, " ").trim();

const isNumCell = (s) => /^\.?\d+(\.\d+)?$/.test(s.trim());

// the numeric columns QSP prints, by their centre x. we READ these rather than
// re-derive them: QSP's own hour rounding isn't reproducible from the punches
// (the same 460 worked minutes prints as 7.66 on one sheet and 7.68 on another),
// so its figures are treated as the "as exported" record and our corrected
// hours are computed from exact minutes instead.
const NUM_COLS = {
  regular: 275, otExempt: 315, overtime: 357, doubleTime: 391, holiday: 424, daily: 463,
};
// the numeric band ends before the Comments column (~x482), which carries
// footnote reference numbers like "1" pointing at the Comments Details block.
// without this cutoff a footnote marker gets read as the Daily Total and
// silently replaces the real figure.
const NUM_BAND_START = 250;
const NUM_BAND_END = 480;

function numColOf(x, w = 0) {
  if (x < NUM_BAND_START || x >= NUM_BAND_END) return null;
  const c = x + w / 2;
  let best = null;
  let bd = Infinity;
  for (const [k, cx] of Object.entries(NUM_COLS)) {
    const d = Math.abs(c - cx);
    if (d < bd) { bd = d; best = k; }
  }
  return bd < 24 ? best : null;
}

// parse one page into { employee, payPeriod, days, comments }
function parsePage(rows) {
  let employee = null;
  let payPeriod = null;
  const byDate = new Map();
  const order = [];
  const comments = [];
  let inComments = false;

  for (const row of rows) {
    const text = joinRow(row);

    if (!employee) {
      const m = /Employee\s+Name:\s*(.+)$/i.exec(text);
      if (m) employee = m[1].trim();
    }
    if (!payPeriod) {
      const m = /Pay\s+Period:\s*(\d{2}\/\d{2}\/\d{2})\s*to\s*(\d{2}\/\d{2}\/\d{2})/i.exec(text);
      if (m) payPeriod = { from: m[1], to: m[2] };
    }

    // everything after "Comments Details:" is the free-text note block, which can
    // spill onto its own page. captured so the corrected sheet can reprint it.
    if (/^Comments\s+Details:/i.test(text)) { inComments = true; continue; }
    if (inComments) {
      if (/^Printed\s+by:/i.test(text)) { inComments = false; continue; }
      if (text) comments.push(text);
      continue;
    }

    // a data row starts with a date in the far-left column
    const first = row.items[0];
    if (!first || !isDate(first.s) || first.x > 60) continue;

    const date = first.s;
    const punches = row.items
      .slice(1)
      .filter((i) => i.x < 250 && isTime(i.s))
      .map((i) => ({ raw: i.s, min: toMin(i.s), x: i.x }))
      .filter((p) => p.min !== null)
      .sort((a, b) => a.x - b.x);

    // QSP's own figures for this day, if this is the day's final row
    const printed = {};
    const refs = [];
    for (const i of row.items) {
      if (i.x < NUM_BAND_START || !isNumCell(i.s)) continue;
      const col = numColOf(i.x, i.w);
      if (col) printed[col] = parseFloat(i.s);
      else if (i.x >= NUM_BAND_END) refs.push(i.s); // footnote marker
    }

    if (!byDate.has(date)) {
      byDate.set(date, { date, punches: [], printed: {}, refs: [] });
      order.push(date);
    }
    const entry = byDate.get(date);
    entry.punches.push(...punches);
    Object.assign(entry.printed, printed);
    entry.refs.push(...refs);
  }

  return { employee, payPeriod, days: order.map((d) => byDate.get(d)), comments };
}

// classify one day's punches into worked segments + typed breaks
// how many 10-minute rest periods a shift owes.
//
// CA is "per four hours worked OR MAJOR FRACTION THEREOF". a major fraction of
// a 4-hour block is anything over two hours, so the bands land at 3.5 / 6 / 10 /
// 14 rather than on clean multiples of four - a 7-hour shift owes two rests,
// not one. counting whole 4-hour blocks (floor(h/4)) quietly under-counts every
// shift between 6 and 8 hours, which is most of them.
//
// the bottom band is exclusive on purpose. the wage order excuses a rest period
// only when daily work time is "less than three and one-half hours", and Brinker
// puts the entitlement at "from three and one-half to six hours", so a day of
// EXACTLY 3.5 owes one. we used to write this <= and gave those days nothing.
export function restsRequired(hours) {
  const h = hours || 0;
  if (h < 3.5) return 0;
  if (h <= 6) return 1;
  return 1 + Math.ceil((h - 6) / 4);
}

export function analyzeDay(day) {
  const p = day.punches;
  const segments = [];
  const breaks = [];

  // running total of time actually on the clock, so each break knows how much
  // work came before it. that's what the meal-timing rule turns on.
  let workedBefore = 0;
  for (let i = 0; i + 1 < p.length; i += 2) {
    const seg = { start: p[i], end: p[i + 1], min: p[i + 1].min - p[i].min };
    segments.push(seg);
    workedBefore += seg.min;
    // the gap to the next segment, if there is one
    const next = p[i + 2];
    if (next) {
      const gap = next.min - p[i + 1].min;
      if (gap <= RULES.ignoreGapMaxMin) continue;
      const at = { min: gap, start: p[i + 1], end: next, workedBefore };
      if (gap >= RULES.restMinMin && gap <= RULES.restMaxMin) {
        breaks.push({ kind: "rest", ...at });
      } else if (gap >= RULES.mealMinMin && gap <= RULES.mealMaxMin) {
        breaks.push({ kind: "meal", ...at });
      } else {
        breaks.push({ kind: "other", ...at });
      }
    }
  }

  const workedMin = segments.reduce((n, s) => n + s.min, 0);
  const restMin = breaks.filter((b) => b.kind === "rest").reduce((n, b) => n + b.min, 0);
  const mealCount = breaks.filter((b) => b.kind === "meal").length;
  const restCount = breaks.filter((b) => b.kind === "rest").length;

  // what QSP printed for this day, if we have it
  const printedDailyForFloor = day.printed?.daily ?? null;

  // Paid time = time on the clock, plus any rest break QSP punched OUT of it.
  //
  // On 2026-08-06 QSP stopped deducting rest breaks: they are simply no longer
  // punched, so they sit inside the work segments and are already paid. Adding
  // them back on top would pay them twice - measured at +23.58 hours across the
  // 07/16-07/31 period, on a total the timesheet and the payroll report agree on
  // to the penny (4049.41).
  //
  // `restsArePaidBySource` says the export already pays them. It is derived, not
  // configured: if no rest break was punched out on the day, there is nothing to
  // add back and the sum is the same either way. The flag exists so the intent
  // is legible rather than an accident of the arithmetic.
  const restsArePaidBySource = day.restsAlreadyPaid === true;
  const restMinToAddBack = restsArePaidBySource ? 0 : restMin;
  const paidMin = workedMin + restMinToAddBack;
  // the correction only ever ADDS unpaid rest time back, so the corrected hours
  // must never come out below what payroll already exported. QSP rounds each
  // punch segment its own way, which can leave our exact figure a hundredth or
  // two short - handing someone a signed timesheet showing fewer hours than
  // payroll reported is indefensible, so floor it at their number.
  //
  // ONE EXCEPTION: a day whose punches we corrected. QSP's printed figure was
  // computed from the punches we just fixed, so flooring at it puts the error
  // straight back and the repair does nothing at all. A reversed break makes two
  // punch pairs overlap, so the printed figure counts the same ten minutes
  // twice - paying less than that is the whole point, and it is the only case
  // where paying under the export is right rather than indefensible.
  const computedPaidHours = paidMin / 60;
  const floorAt = day.repaired ? null : printedDailyForFloor;
  const paidHours =
    floorAt !== null && computedPaidHours < floorAt ? floorAt : computedPaidHours;
  // what QSP printed for this day, reproduced exactly (see ceil2 above).
  const rawHoursAsPrinted = segments.reduce((n, s) => n + ceil2(s.min / 60), 0);

  // Hours credited against time actually on site.
  //
  // Two client bookings can overlap, and QSP credits both in full: Delgado
  // Pineda 07/19 is 7.28 hours inside a window running 12:10p to 4:30p, which is
  // 4.33 hours. Flores 07/26 is 7.07 in 4.07. Break entitlement is worked out
  // from hours worked, so a compressed day can earn a second rest period and a
  // meal that nobody could physically have taken in the time available.
  //
  // The entitlement is NOT adjusted here. California measures it on hours
  // worked, and quietly paying less because the arithmetic looks odd is exactly
  // the move this engine exists to avoid. It is flagged instead, so a person
  // looks: 16 such days on 07/16-07/31, 4 of them gaining a rest period and 3
  // gaining a meal.
  const firstPunch = p.length ? p[0].min : null;
  const lastPunch = p.length ? p[p.length - 1].min : null;
  const onSiteMin = firstPunch != null && lastPunch != null ? lastPunch - firstPunch : null;
  const compressedDay = onSiteMin != null && workedMin > onSiteMin + 1;

  const restRequired = restsRequired(paidHours);
  const mealRequired = paidHours > RULES.mealRequiredAfterHours;

  // ---- what counts as a break TAKEN -------------------------------------
  //
  // A GAP IS NOT A BREAK. This used to infer both kinds from gaps between
  // punches, and that turned out to be reading the roster back at itself: the
  // Simple Timesheet is generated from the schedule, not from clock punches.
  // Measured on 114 days where the schedule and QSClock disagree about when
  // somebody started, the timesheet followed the schedule 93 times and the
  // clock 0. So a "break" found in the punches is just a gap in the roster, and
  // it is evidence of nothing at all.
  //
  // A break now only counts if something actually recorded it:
  //   meals - an explicit "-Meal Break" block on the schedule
  //   rests - a row in QSP's Rest Periods Report
  //
  // Gaps are still classified above, because that is what decides PAID HOURS:
  // a rest gap is paid time added back, a meal gap is unpaid. Hours come from
  // the timesheet and none of this touches them.
  //
  // `day.restRecorded` is the Rest Periods Report's count. No coverage means no
  // record, which means none taken - the reading that pays the employee.
  const recorded = Number.isFinite(day.restRecorded) ? day.restRecorded : null;
  const restTaken = recorded === null ? 0 : recorded;

  // Can ANY source speak to whether a rest break happened on this day?
  //
  // Until 2026-08-06 two could: the Rest Periods Report, and the punches
  // themselves when a break was punched out. With the export set cut to three
  // reports the first is gone, and QSP no longer punches rest breaks at all, so
  // on most days nothing can say either way.
  //
  // That is NOT the same as "no break was taken". Charging a premium because we
  // stopped receiving the evidence would have taken this period from 410 rest
  // premium hours to 961. Marking it unknown keeps the day visible and out of
  // the total, which is the same thing `mealUnknown` does when there is no
  // schedule for a day. The engine's job here is to flag, not to decide.
  // Only the Rest Periods Report can say a break happened. A gap between
  // punches is a gap in the roster and proves nothing - that was settled on
  // 2026-08-06 and it has not changed. So evidence means the report, and
  // nothing else.
  const restEvidence = recorded !== null;
  //
  // Unanswerable ONLY when no rest source was collected for the batch at all.
  //
  // This was briefly keyed to whether the export pays rest breaks, which
  // conflated two different questions - whether the hours already include the
  // break, and whether anything recorded that it happened. The result was that
  // 18 people the Rest Periods Report simply does not cover came back
  // "unknown" instead of owed, dropping 125 premium hours on a batch where the
  // report WAS uploaded.
  //
  // If the report was collected and does not cover somebody, Mánu's ruling of
  // 2026-08-03 applies: staff are expected to punch, so the premium stands and
  // the gap is a training problem. Defaults to "a source exists", so the only
  // way to get an unknown day is to say outright that none was collected.
  const restSourceCollected = day.restSourceAvailable !== false;
  const restUnknown = restRequired > 0 && !restEvidence && !restSourceCollected;

  // `day.mealScheduled`: true = rostered, false = the schedule covers this day
  // and rosters no meal, null = no schedule for this day so we cannot say.
  // ABSENT is treated as false rather than null on purpose - a caller that
  // forgets to wire it gets the conservative answer that pays the premium,
  // never the silent one that drops it.
  const mealScheduled = day.mealScheduled === undefined ? false : day.mealScheduled;
  const mealTaken = mealScheduled === true;
  // no schedule at all is not a violation and not a pass. it goes to a person.
  const mealUnknown = mealRequired && mealScheduled === null;

  // the meal has to START by the end of the fifth hour worked. a late lunch is
  // its own violation - the break happened, but not when it was owed. only
  // meaningful once we know a meal was actually rostered.
  const firstMeal = breaks.find((b) => b.kind === "meal") || null;
  const mealStartedAfterMin = firstMeal ? firstMeal.workedBefore : null;
  const mealLate =
    mealRequired &&
    mealTaken &&
    !!firstMeal &&
    firstMeal.workedBefore > RULES.mealMustStartByMin;

  // sanity check against QSP's own printed figure for the day. small gaps are
  // their rounding; a real gap means we misread the punches and must not be
  // trusted silently on a payroll document.
  const printedDaily = printedDailyForFloor;
  const drift = printedDaily === null ? null : Math.abs(workedMin / 60 - printedDaily);
  const oddPunches = p.length % 2 !== 0;

  return {
    ...day,
    segments,
    breaks,
    workedMin,
    restMin,
    paidMin,
    paidHours,
    // "as exported" = QSP's own number when we have it, so the reconciliation
    // line always ties out to their document exactly.
    rawHours: printedDaily ?? rawHoursAsPrinted,
    rawHoursExact: workedMin / 60,
    drift,
    needsReview: oddPunches || (drift !== null && drift > 0.05),
    mealCount,
    restCount,
    // what QSP's Rest Periods Report says was actually taken that day, when we
    // have it. `restCount` above is inferred from gaps between punches, which
    // can't tell a break from travel between two clients - so where the report
    // covers someone, its count is the one that decides the violation.
    //
    // Note this only ever moves the VIOLATION. Paid hours still come from the
    // punches, because the timesheet is the document staff sign.
    restRecorded: recorded,
    restTaken,
    restSource: recorded === null ? "none" : "rest-report",
    restRequired,
    mealRequired,
    mealScheduled,
    // no schedule for the day, so whether a meal was provided is unanswerable
    // from anything we hold. NOT charged and NOT passed - it goes to a person.
    mealUnknown,
    // never rostered, or rostered but started too late - §226.7 pays one
    // premium either way, so these collapse into one violation rather than
    // stacking.
    mealMissing: mealRequired && !mealUnknown && !mealTaken,
    mealLate,
    mealStartedAfterMin,
    mealViolation: mealRequired && !mealUnknown && (!mealTaken || mealLate),
    restUnknown,
    // hours credited exceed the clock window they sit in, so two bookings
    // overlap. flagged, never silently corrected.
    compressedDay,
    onSiteMin,
    // an unverifiable day is not a violation. it is a day we cannot answer.
    restViolation: !restUnknown && restTaken < restRequired,
  };
}

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

export function analyzeTimesheet(parsed) {
  const days = applyOvertime(parsed.days.map(analyzeDay), parsed.payPeriod);
  const mealDays = days.filter((d) => d.mealViolation).map((d) => d.date);
  const restDays = days.filter((d) => d.restViolation).map((d) => d.date);
  return {
    ...parsed,
    days,
    totals: {
      rawHours: days.reduce((n, d) => n + d.rawHours, 0),
      paidHours: days.reduce((n, d) => n + d.paidHours, 0),
      regularHours: days.reduce((n, d) => n + d.regularHours, 0),
      otHours: days.reduce((n, d) => n + d.otHours, 0),
      doubleHours: days.reduce((n, d) => n + d.doubleHours, 0),
    },
    // weeks cut off by the pay-period boundary: their >40 overtime is
    // provisional until the neighbouring period's hours are known.
    partialWeekDates: days.filter((d) => d.weekPartial).map((d) => d.date),
    premiums: {
      mealDays,
      restDays,
      mealHours: mealDays.length * RULES.premiumHoursPerViolation,
      restHours: restDays.length * RULES.premiumHoursPerViolation,
      totalHours:
        (mealDays.length + restDays.length) * RULES.premiumHoursPerViolation,
    },
  };
}

// a QSP export holds every employee back to back. one person can run over
// several pages: the table spills, and the "Comments Details" block can take a
// page of its own. only the FIRST page of a person carries "Employee Name:", so
// any page without one continues whoever came before.
export async function parseTimesheetPdf(bytes) {
  const pdfjs = await getPdfjs();
  // pdfjs TAKES OWNERSHIP of whatever array it's handed and detaches the
  // underlying buffer, so the caller's bytes come back length 0. hand it a copy.
  // this cost us the stored copy of every timesheet export: the upload parsed
  // first and uploaded second, so `Buffer.from(bytes)` wrote an empty file and
  // "open the QSP export at this page" opened a 0-page PDF.
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const data = view.slice();
  // we only read text positions, never rasterise, so no fonts need loading.
  // useSystemFonts makes pdfjs go looking at the host's font files, which is
  // fine on a laptop and a good way to fail on a serverless host that has
  // none. isEvalSupported off keeps it away from eval under a strict CSP.
  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: false,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;

  const sheets = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const rows = await pageRows(await doc.getPage(i));
    const parsed = parsePage(rows);

    // which page a day was read off, so anyone reading a figure on the checks
    // screen can open the page it came from. a day whose row is split by the
    // page break ends up with two.
    for (const d of parsed.days) d.pages = [i];

    if (parsed.employee) {
      sheets.push({ ...parsed, pages: [i] });
      continue;
    }

    // continuation page - fold it into the person before it
    const prev = sheets[sheets.length - 1];
    if (!prev) continue; // stray leading page, nothing to attach to
    prev.pages.push(i);
    prev.comments.push(...parsed.comments);
    for (const d of parsed.days) {
      const existing = prev.days.find((x) => x.date === d.date);
      if (existing) {
        existing.punches.push(...d.punches);
        Object.assign(existing.printed, d.printed);
        if (!existing.pages.includes(i)) existing.pages.push(i);
      } else {
        prev.days.push(d);
      }
    }
  }

  // employees with no punches at all this period (no hours worked) still come
  // back, flagged, so the operator can see them rather than wonder why they
  // silently vanished from the batch.
  return sheets.map((s) => ({ ...s, empty: s.days.length === 0 }));
}
