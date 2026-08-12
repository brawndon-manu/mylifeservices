// What gets written into Timesheet.data.days.
//
// This is a deliberate projection, not the whole analyzed day: punches and
// breaks are kept so a sheet can be recomputed and re-rendered after a
// correction without going back to the source export, and the rest is what the
// screens and the email read.
//
// IT LIVES HERE SO IT CAN BE TESTED. It used to be an inline object literal
// inside uploadBatch, and when three new fields were added to analyzeDay -
// restTaken, mealScheduled, mealUnknown - nobody added them here. The engine
// computed correctly, the premium totals were right, and the stored day quietly
// lost the three fields the email and every recompute read back. Build, lint
// and 100 tests all passed, and nothing on screen changed - every consumer
// happens to defend itself with `?? 0`. The real exposure is a recompute after
// an employee correction: mealScheduled comes back absent, absent means "not
// rostered", and a rostered meal gets charged a premium it does not owe.
//
// If you add a field to analyzeDay that anything downstream reads, add it here
// and to REQUIRED_DAY_FIELDS below.

const r2 = (n) => Math.round((n || 0) * 100) / 100;

// every field a consumer of a stored day relies on. the test walks this list, so
// forgetting one here is the only way to forget it at all.
export const REQUIRED_DAY_FIELDS = [
  "date", "paidHours", "rawHours", "regularHours", "otHours", "doubleHours",
  "mealRequired", "mealViolation", "mealMissing", "mealLate", "mealStartedAfterMin",
  "mealCount", "mealScheduled", "mealUnknown", "mealWaived",
  "mealGapKind", "mealGapMin",
  "mealsRostered", "secondMealRequired", "secondMealViolation", "secondMealUnknown",
  "restTackedOn", "restsInsideMeal", "restsOutsideShift", "restsUnpaid",
  // the 2026-08-09 rulings. `addedHours` is what the SHEET prints as "added",
  // so a batch stored without it renders a daily total above the export with no
  // explanation beside it - which is the one thing that must never happen on a
  // document somebody signs.
  "restsOffClock", "restsOffClockMin", "addedHours", "mealInsideBooking",
  // the 2026-08-09 EVENING rulings, read back by `buildQuestions` to decide
  // whether a correction we already applied still needs confirming
  "restsFromShortMeals",
  "restsOutsideScheduled", "restsOutsideScheduledMin", "restsOutsideScheduledDetail",
  "restRequired", "restViolation", "restCount", "restRecorded", "restTaken", "restSource",
  "restUnknown", "compressedDay", "onSiteMin",
  "seventhDay", "weekPartial", "mealMin", "restMin", "workedMin", "punches", "breaks",
  // these two travel together and MUST NOT be separated. `printed` is what
  // analyzeDay floors a day at; `repaired` is what exempts a corrected day from
  // that floor. store printed without repaired and every repaired day gets
  // pushed back up to the figure the repair exists to correct, which is the bug
  // 2f0b194 fixed. store repaired without printed and the floor never applies.
  "printed", "repaired",
];

// THE TOTALS A SHEET PRINTS, AND THEREFORE THE TOTALS WE STORE.
//
// Mánu's ruling 2026-08-09: "the sheet wins". A timesheet is the document
// somebody signs, and the first thing anyone does with one is add up the daily
// column. If that sum does not equal the printed total the document is wrong in
// the way that matters, whatever the database thinks.
//
// So totals are summed from the ROUNDED days rather than rounded once from the
// unrounded ones. Those two differ: April's eleven days of 8.1667 round to 8.17
// each and sum to 89.87, while the unrounded sum rounds once to 89.83. Her sheet
// printed 89.87 against a stored 89.83, and 15 of 59 sheets in the batch
// disagreed with themselves that way - a note in render-sheet.js records 11 of
// 59 doing it before the added hours existed, so this predates them.
//
// Every caller that produces totals uses this, so the sheet, the stored columns
// and the payout report cannot drift apart again.
export function totalsFromDays(days) {
  const sum = (k) => r2((days || []).reduce((n, d) => n + (d[k] || 0), 0));
  return {
    rawHours: sum("rawHours"),
    paidHours: sum("paidHours"),
    regularHours: sum("regularHours"),
    otHours: sum("otHours"),
    doubleHours: sum("doubleHours"),
  };
}

export function storedDay(d) {
  return {
    date: d.date,
    pages: d.pages || [],
    paidHours: r2(d.paidHours),
    rawHours: r2(d.rawHours),
    regularHours: r2(d.regularHours),
    otHours: r2(d.otHours),
    doubleHours: r2(d.doubleHours),
    mealViolation: d.mealViolation,
    restViolation: d.restViolation,
    // a signed waiver cleared the day. stored rather than recomputed because a
    // waiver is a fact about paperwork at the time the sheet was produced, and
    // the sheet has to keep saying what it said when it was signed.
    mealWaived: !!d.mealWaived,
    // what the roster says the day's lunch-shaped gap was. stored because it is
    // read off the SCHEDULE, and recompute never sees the schedule again.
    mealGapKind: d.mealGapKind ?? null,
    mealGapMin: d.mealGapMin ?? null,
    // the second meal period. `mealsRostered` is how many the schedule gave
    // them, which is the only thing that can witness a second one.
    mealsRostered: d.mealsRostered ?? null,
    secondMealRequired: !!d.secondMealRequired,
    secondMealViolation: !!d.secondMealViolation,
    secondMealUnknown: !!d.secondMealUnknown,
    // rests taken hard against the rostered lunch. reported, never charged.
    restTackedOn: d.restTackedOn ?? null,
    // recorded inside the lunch. it COUNTS as a rest taken and the minutes are
    // paid under the off-clock rule, so this is reported only.
    restsInsideMeal: d.restsInsideMeal ?? null,
    // a rest logged outside the shift, and a rest that fell in an unpaid
    // gap. both reported only, neither moves a figure.
    restsOutsideShift: d.restsOutsideShift ?? null,
    restsUnpaid: d.restsUnpaid ?? null,
    restsOffClock: d.restsOffClock ?? null,
    restsOffClockMin: d.restsOffClockMin ?? 0,
    addedHours: r2(d.addedHours),
    // The 2026-08-09 EVENING rulings. `buildQuestions` reads all three off the
    // STORED day to decide whether to ask somebody to confirm a correction we
    // already made, and the raw inputs they are derived from - scheduleBlocks
    // and restTimes - are deliberately not stored. So if these are dropped here
    // the question can never be asked again for the life of the batch, and the
    // employee is never told their hours moved. Exactly the failure this file
    // was written to stop.
    restsFromShortMeals: d.restsFromShortMeals ?? 0,
    restsOutsideScheduled: d.restsOutsideScheduled ?? null,
    restsOutsideScheduledMin: d.restsOutsideScheduledMin ?? 0,
    restsOutsideScheduledDetail: d.restsOutsideScheduledDetail ?? [],
    mealInsideBooking: !!d.mealInsideBooking,
    mealMissing: d.mealMissing,
    mealLate: d.mealLate,
    mealStartedAfterMin: d.mealStartedAfterMin ?? null,
    mealCount: d.mealCount,
    restCount: d.restCount,
    restRecorded: d.restRecorded ?? null,
    // what actually credited a break, and what the violation was decided on
    restTaken: d.restTaken ?? 0,
    restSource: d.restSource || "none",
    // true when NO source could speak to whether a rest break happened, which
    // since the export set was cut to three reports is most days. Not a
    // violation and not a clean day: a day nobody can answer. Same shape as
    // mealScheduled: null - the difference between "no break" and "no record"
    // is the difference between charging somebody and asking them.
    restUnknown: d.restUnknown || false,
    // credited hours exceed the window they sit in, so two client bookings
    // overlap. the entitlement is still worked out from hours worked; this only
    // marks the day so somebody looks at it.
    compressedDay: d.compressedDay || false,
    onSiteMin: d.onSiteMin ?? null,
    restRequired: d.restRequired,
    mealRequired: d.mealRequired,
    // true = a meal was rostered, false = the schedule covers the day and
    // rosters none, null = no schedule for the day so nobody can say
    mealScheduled: d.mealScheduled ?? null,
    mealUnknown: d.mealUnknown || false,
    seventhDay: d.seventhDay || false,
    weekPartial: d.weekPartial || false,
    // what a worked-through meal would add back
    mealMin: (d.breaks || []).filter((b) => b.kind === "meal").reduce((n, b) => n + b.min, 0),
    restMin: d.restMin,
    workedMin: d.workedMin,
    punches: d.punches,
    breaks: d.breaks,
    // QSP's own printed figures for the day. `daily` is what analyzeDay floors
    // the day at, and without it here a recompute cannot floor at all - two days
    // on 07/16-07/31 fell 7.49 -> 7.4833 when re-analyzed. The rest of the
    // object is QSP's printed overtime/holiday/double, which the parser has
    // always captured and thrown away; TASKS.md #69 wants exactly this.
    printed: d.printed || null,
    // set when this day's punches were corrected. it exempts the day from the
    // floor above, so a repair is not pushed back to the figure it corrects.
    repaired: d.repaired || false,
  };
}
