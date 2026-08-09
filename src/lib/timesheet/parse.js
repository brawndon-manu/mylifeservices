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
  // a SECOND meal period is owed once the day passes 10 hours worked, and it
  // has to begin by the end of the tenth hour. §226.7 still caps the day at one
  // meal premium, so a missed second meal only ever costs anything on a day
  // where the first one was actually provided.
  secondMealRequiredAfterHours: 10,
  secondMealMustStartByMin: 600,
  // a meal period can be waived by mutual written consent when the day is 6
  // hours or less (Lab. Code §512(a)). the waiver only reaches a day where no
  // meal was provided at all - it cannot excuse one that was provided late.
  mealWaiverMaxHours: 6,
  // every current member of staff has a signed waiver on file. that is Mánu's
  // statement of fact 2026-08-08, not an assumption the engine made: the forms
  // exist on paper and are not in the portal yet, because the portal has not
  // been rolled out to staff. once they are stored per person this flips to
  // reading the real submission and the default disappears.
  mealWaiverOnFileByDefault: true,
  // how close a punch has to land to a rostered time before we call it the same
  // moment. real punches drift a few minutes either side of the roster.
  gapSeamToleranceMin: 10,
  // a rest period belongs in the first four hours of work, and the second in
  // the last four. Unlike the meal deadline this is NOT a hard statutory line -
  // the standard is the middle of each work period "insofar as practicable" -
  // so a rest past this mark is FLAGGED and never charged. Mánu's call
  // 2026-08-08: a hard cutoff here would manufacture premiums the statute does
  // not clearly require, and 7 of the 13 candidates sit within half an hour of
  // the mark, which is the zone that wording exists to cover.
  restWindowMin: 240,
  // how close a rest has to sit to the rostered lunch before the two are really
  // one break. Measured on 07/16-07/31: the six real cases are EXACTLY
  // contiguous, and the count is identical anywhere from 0 to 5 minutes. Past
  // 10 it starts catching rests that are merely nearby, so it stays tight.
  restTackedOnToleranceMin: 2,
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
  // how much of QSP's own printed hours the punch grid has to account for
  // before we believe we read the file. see punchCoverage() for why.
  // 0.95 is miles clear of both sides of the real case, deliberately.
  minPunchCoverage: 0.95,
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

// Minutes actually ON the clock before an instant, from punches in document
// order. This is the measure every timing question here uses, and it is not
// the same as elapsed time from the first punch: a split shift with a two hour
// unpaid hole makes a rest look five hours into the day when it is three hours
// of work in. Measuring the wrong one turned 45 late rests into 54.
export function workedBeforeMin(punches, at) {
  const p = (punches || []).map((x) => x.min);
  let n = 0;
  for (let i = 0; i + 1 < p.length; i += 2) {
    const [a, b] = [p[i], p[i + 1]];
    if (b > a) n += Math.max(0, Math.min(b, at) - a);
  }
  return n;
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

  // ---- a "rest" recorded inside the lunch is not a rest period ------------
  //
  // A rest period is PAID and counts as hours worked. A meal period is unpaid.
  // Ten minutes sitting inside an unpaid thirty minute meal cannot satisfy the
  // rest obligation, whatever the report calls it - most often it is part of
  // the lunch that got logged as a break.
  //
  // Mánu's ruling 2026-08-08: the opportunity to take a ten minute rest always
  // exists here - staff are in the field, choose their own moment, and somebody
  // chases anyone who has not taken one - so a rest that landed inside the
  // lunch was not one the employer failed to provide. It simply was not taken,
  // and the premium follows. THIS IS THE ONE PLACE A RECORDED REST IS
  // DISCOUNTED, and it has to be computed before restTaken is decided below.
  //
  // Adjacent is a different thing and still counts: taking your ten right
  // before or after lunch is a compliance habit, not an uncompensated break.
  const restTimes = Array.isArray(day.restTimes) ? day.restTimes : null;
  const rosteredMeals = Array.isArray(day.scheduleBlocks)
    ? day.scheduleBlocks.filter((b) => b.meal)
    : null;
  const usableRests = (restTimes || []).filter(
    (r) => r && Number.isFinite(r.out) && Number.isFinite(r.in) && r.in > r.out,
  );
  const insideMeal = (r) =>
    !!rosteredMeals && rosteredMeals.some((m) => r.out >= m.start && r.in <= m.end);

  // The same principle, applied to the other end of the day: a rest logged
  // before clock-in or after clock-out is not paid time either, so it was not a
  // rest period. Mánu 2026-08-08: "that is on us for not catching it during the
  // work day" - the entry is a records failure on the employer's side, and the
  // employee is not made to carry it.
  //
  // Eleven of the sixteen on 07/16-07/31 are one person's 7:00-7:10 on an 8:00
  // shift, twelve days running. A default nobody changed, clearing a premium
  // every single day.
  const shiftMins = p.map((x) => x.min);
  const shiftStart = shiftMins.length ? Math.min(...shiftMins) : null;
  const shiftEnd = shiftMins.length ? Math.max(...shiftMins) : null;
  const outsideShift = (r) =>
    shiftStart != null && (r.out < shiftStart || r.in > shiftEnd);

  // And the third way a recorded rest is not a rest: it fell inside a
  // punched-OUT gap, so the person was off the clock for it. Same principle
  // again, Mánu 2026-08-08 - a rest period is paid time, and unpaid minutes
  // were never one, wherever in the day they sit.
  const unpaidRest = (r) => {
    if (shiftStart == null || outsideShift(r)) return false;
    for (let i = 1; i + 1 < shiftMins.length; i += 2) {
      if (shiftMins[i] <= r.out && shiftMins[i + 1] >= r.in) return true;
    }
    return false;
  };

  const restsInsideMeal = restTimes && rosteredMeals
    ? usableRests.filter(insideMeal).length
    : null;
  const restsOutsideShift = restTimes && shiftStart != null
    ? usableRests.filter(outsideShift).length
    : null;
  // the UNION of all three, because one rest can be more than one of these and
  // must only be discounted once. Inside the lunch is usually also unpaid.
  const restsNotCounted = restTimes
    ? usableRests.filter((r) => insideMeal(r) || outsideShift(r) || unpaidRest(r)).length
    : 0;

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
  // ...less any that landed inside the lunch, which are unpaid minutes and so
  // were never rest periods. See the ruling above. This is the only place the
  // report's own count is reduced, and it can only ever move the day toward
  // owing a premium, never away from one.
  const restTaken = Math.max(0, (recorded === null ? 0 : recorded) - restsNotCounted);

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

  // HOW MANY meals the schedule rostered, which is a different question from
  // whether it rostered any. Only the blocks can answer it, so a caller that
  // hands in `mealScheduled` alone leaves this null and the second meal goes to
  // a person rather than being charged or silently passed.
  const mealsRostered = Array.isArray(day.scheduleBlocks)
    ? day.scheduleBlocks.filter((b) => b.meal).length
    : null;

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

  // ---- the second meal period -------------------------------------------
  //
  // Owed past ten hours worked, and it has to begin by the end of the tenth.
  // The statute allows it to be waived when the day is 12 hours or less AND the
  // first meal was not waived, but no such waiver is held anywhere, so none is
  // assumed - the day is charged and the paperwork can clear it later.
  //
  // Same evidence rule as the first meal: only the schedule can say a meal was
  // provided, and here it has to say so TWICE.
  const secondMealRequired = paidHours > RULES.secondMealRequiredAfterHours;
  const secondMealUnknown = secondMealRequired && (mealUnknown || mealsRostered === null);
  const secondMealTaken = mealsRostered !== null && mealsRostered >= 2;
  const secondMeal = breaks.filter((b) => b.kind === "meal")[1] || null;
  const secondMealLate =
    secondMealRequired &&
    secondMealTaken &&
    !!secondMeal &&
    secondMeal.workedBefore > RULES.secondMealMustStartByMin;
  const secondMealViolation =
    secondMealRequired && !secondMealUnknown && (!secondMealTaken || secondMealLate);

  // ---- a rest taken right up against the lunch ---------------------------
  //
  // Ten minutes abutting a thirty minute lunch is a forty minute break, not a
  // lunch and a rest. FLAGGED, never charged, and the reason is that the
  // schedule cannot roster a rest period at all - it holds meal breaks only -
  // so an adjacency here is always the employee's choice against a standalone
  // lunch the employer did roster. Where the opportunity was provided the
  // premium is not owed, so `restTaken` is left alone and this only reports.
  //
  // `day.restTimes` is [{out, in}] in minutes, from the Rest Periods Report.
  // Absent, the question is unanswerable and the count stays null. Both it and
  // the rostered meals are worked out further up, because `restsInsideMeal`
  // has to be known before `restTaken` is decided.
  //
  // UNPAID, reported. The count is kept so the screen can name the days; the
  // discount itself happens in `restsNotCounted` above, alongside the other two.
  //
  // NOTE the hours are still NOT adjusted. Those ten minutes were worked and
  // went unpaid, which is wages owed on top of the premium, and paying above
  // what the export says is the one direction this engine has never gone. The
  // premium follows from the rest not having been taken; the wages are a
  // separate thing somebody still has to decide about.
  const restsUnpaid = restTimes && p.length ? usableRests.filter(unpaidRest).length : null;

  // Adjacent, but NOT inside. The two are mutually exclusive now: one is
  // reported and still counts, the other is discounted and pays a premium, so
  // a row appearing under both headings would be telling two stories about the
  // same ten minutes.
  let restTackedOn = null;
  if (restTimes && rosteredMeals) {
    const tol = RULES.restTackedOnToleranceMin;
    restTackedOn = usableRests.filter((r) =>
      !rosteredMeals.some((m) => r.out >= m.start && r.in <= m.end) &&
      rosteredMeals.some((m) => r.out <= m.end + tol && r.in >= m.start - tol),
    ).length;
  }

  // a signed waiver clears the day, but only the narrow case the statute
  // allows: the day is 6 hours or less AND no meal was provided at all. a late
  // meal is never waivable, and neither is a day past 6 hours, so both fall
  // through to the violation below however the paperwork reads.
  const mealWaiverOnFile =
    day.mealWaiverOnFile === undefined ? RULES.mealWaiverOnFileByDefault : day.mealWaiverOnFile;
  const mealWaived =
    mealRequired &&
    !mealUnknown &&
    !mealTaken &&
    mealWaiverOnFile &&
    paidHours <= RULES.mealWaiverMaxHours;

  // WHERE DOES THE DAY'S LONGEST GAP FALL, relative to what was rostered?
  //
  // Measured 2026-08-08 over the 67 days that carry a meal premium with a
  // lunch-shaped gap on them: 63 sit exactly between two consecutive client
  // bookings, 3 are days whose bookings overlap, and one is a genuine
  // step-away. So a gap is nearly always the seam the ROSTER created, not a
  // lunch anybody took. The control matters as much as the finding: over days
  // where a meal WAS rostered the same test lands on a seam 6% of the time, so
  // it is not answering "yes" by construction.
  //
  // This CLASSIFIES and never decides. `mealViolation` is untouched above: the
  // premium still stands, and all this does is say what the evidence behind it
  // looks like, so nobody has to re-derive it by hand next period.
  const blocks = Array.isArray(day.scheduleBlocks) ? day.scheduleBlocks : null;
  let longestGap = null;
  for (let i = 1; i + 1 < p.length; i += 2) {
    const min = p[i + 1].min - p[i].min;
    if (min > 0 && (!longestGap || min > longestGap.min)) {
      longestGap = { start: p[i].min, end: p[i + 1].min, min };
    }
  }
  const mealShaped =
    longestGap && longestGap.min >= RULES.mealMinMin && longestGap.min <= RULES.mealMaxMin;
  let mealGapKind = null;
  if (mealShaped) {
    if (compressedDay) {
      // two bookings running at once, which QSP writes as one run of punches.
      // the "gap" is the seam between them and nobody was away for it.
      mealGapKind = "overlap-artifact";
    } else if (!blocks || !blocks.length) {
      mealGapKind = "no-schedule";
    } else if (
      mealTaken &&
      rosteredMeals &&
      rosteredMeals.some((m) => longestGap.start <= m.end && longestGap.end >= m.start)
    ) {
      // the gap IS the rostered lunch. it used to come back
      // "scheduled-transition" on 130 days across 31 people, because the seam
      // test excludes meal blocks and so the two work blocks either side of a
      // lunch look exactly like two consecutive bookings. Calling somebody's
      // lunch a transition between clients is a sentence nobody should read.
      mealGapKind = "rostered-meal";
    } else {
      // meal blocks are excluded: we are asking about the seams between WORK,
      // and a rostered meal is not a seam, it is the break itself.
      const work = blocks.filter((b) => !b.meal);
      const tol = RULES.gapSeamToleranceMin;
      const onSeam = work.some((b, i) => {
        const next = work[i + 1];
        return next &&
          Math.abs(b.end - longestGap.start) <= tol &&
          Math.abs(next.start - longestGap.end) <= tol;
      });
      const inside = work.some(
        (b) => longestGap.start > b.start + tol && longestGap.end < b.end - tol,
      );
      mealGapKind = onSeam ? "scheduled-transition" : inside ? "inside-booking" : "unclear";
    }
  }

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
    // the meal was owed and not provided, but a signed waiver covers the day.
    // kept as its own field rather than folded into mealMissing, because a
    // waived day and a compliant day are different claims and the sheet says so.
    mealWaived,
    // the second meal period, owed past ten hours. kept as its own set of
    // fields rather than folded into the first, because "they got no lunch at
    // all" and "they got the first one and not the second" are different things
    // to say to somebody, even though §226.7 pays the same one hour for either.
    mealsRostered,
    secondMealRequired,
    secondMealTaken,
    secondMealLate,
    secondMealUnknown,
    secondMealViolation,
    // how many of the day's rests were taken hard against the rostered lunch.
    // reported, never charged - see the note above. null when unanswerable.
    restTackedOn,
    // recorded inside the lunch, so discounted from restTaken above. the ONE
    // rest finding that moves a figure.
    restsInsideMeal,
    // rests logged outside the shift, and rests that fell in an unpaid gap.
    // both reported, both leave restTaken and paidHours alone.
    restsOutsideShift,
    restsUnpaid,
    // what the day's longest lunch-shaped gap actually is, per the roster.
    // "scheduled-transition" | "overlap-artifact" | "inside-booking" |
    // "unclear" | "no-schedule", or null when there is no such gap. Evidence
    // about the premium, never a change to it.
    mealGapKind,
    mealGapMin: mealShaped ? longestGap.min : null,
    // ONE premium per workday however many meals were missed (§226.7), so this
    // stays a single boolean. A day that misses both meals pays one hour, the
    // same as a day that misses either.
    mealViolation:
      (mealRequired && !mealUnknown && !mealWaived && (!mealTaken || mealLate)) ||
      secondMealViolation,
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

// HOW MUCH OF QSP'S OWN HOURS DID WE ACTUALLY READ OFF THE PUNCH GRID?
//
// The punches and QSP's printed daily column are two independent readings of the
// same day, so they should agree to a rounding error. When they do not, we
// misread the file.
//
// The case this exists for: a print-to-PDF of the Simple Timesheet. It is a
// COMPLETE document - every punch time is in it, 4,162 am/pm tokens, same as the
// download - but printing merges adjacent text runs, so `10:53a 12:44p` arrives
// as ONE text item sitting at the Time In column and everything after the first
// value is lost. Nothing errors. Every employee, every row and every printed
// daily figure survives, and because each day floors up to that printed figure
// the batch lands on a plausible premium total that is simply wrong.
//
// Measured on 07/16-07/31/26, same export saved two ways:
//
//     download  punches account for 4049.35 of QSP's 4049.41    0 days drifting
//     print     punches account for 3133.67 of QSP's 4049.41  248 days drifting
//                                                             premium 724 not 680
//
// TWO KINDS OF DAY ARE DELIBERATELY NOT COUNTED, and picking them right is what
// makes the threshold safe rather than lucky:
//
//   no printed figure  - nothing to compare against. silence is not a failure.
//   NO PUNCHES AT ALL  - somebody who never clocked in is a QSClock setup
//                        problem, surfaced elsewhere, and has nothing to do with
//                        whether we read the file. Counting them would let three
//                        non-punching staff drag a perfectly good export under
//                        the line. The first draft of this did exactly that and
//                        a test caught it.
//
// Over the days where somebody actually punched:
//
//     download  4049.35 of 4049.41 = 100.00%
//     print     3133.67 of 3920.33 =  79.93%
//
// so the line sits at 95%, twenty points clear of the failure and on the nose
// of the good file, with the false-positive case removed by construction rather
// than by loosening the threshold.
export function punchCoverage(sheets) {
  let punchHours = 0;
  let printedHours = 0;
  let driftDays = 0;
  let comparedDays = 0;
  let neverPunchedDays = 0;
  for (const s of sheets || []) {
    for (const d of s.days || []) {
      const printed = d.printed?.daily;
      if (printed == null) continue;
      const p = d.punches || [];
      if (!p.length) {
        neverPunchedDays++;
        continue;
      }
      let worked = 0;
      for (let i = 0; i + 1 < p.length; i += 2) worked += p[i + 1].min - p[i].min;
      comparedDays++;
      punchHours += worked / 60;
      printedHours += printed;
      if (Math.abs(worked / 60 - printed) > 0.03) driftDays++;
    }
  }
  // nothing comparable is no evidence, not a failure. a ratio of 1 keeps this
  // from refusing an export it is in no position to judge.
  const ratio = printedHours > 0 ? punchHours / printedHours : 1;
  return {
    punchHours,
    printedHours,
    driftDays,
    comparedDays,
    neverPunchedDays,
    ratio,
    ok: ratio >= RULES.minPunchCoverage,
  };
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
