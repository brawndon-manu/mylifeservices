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
