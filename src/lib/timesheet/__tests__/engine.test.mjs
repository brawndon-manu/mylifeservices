// Engine tests. Run with `npm run test:timesheet`.
//
// These exist because the break rules are intricate, they were changed twice in
// one day, and both times the only thing standing behind the change was a script
// in a temp folder that no longer exists. Every assertion below is one that
// actually caught something, or guards an edge that would be silent if it broke.
//
// No test framework on purpose - node's built-in runner, no new dependency for a
// project that doesn't otherwise have one.
import { test } from "node:test";
import assert from "node:assert/strict";

import { PDFDocument } from "pdf-lib";

import {
  restsRequired, analyzeDay, applyOvertime, analyzeTimesheet, RULES, parseTimesheetPdf,
} from "../parse.js";
import { parseSchedulePdf } from "../schedule.js";
import {
  findAnomalies, suggestPunches, reviewSheet,
  scheduleConfirmsRepair, confirmedRepairs,
  scheduleAgreesWithCurrent, scheduledPaidHours, repairConfirmedDays, describePunchIssue,
} from "../anomalies.js";
import { recomputeSheet, patchFor, mergeOverride, CORRECTION_KINDS } from "../corrections.js";
import { compareToSchedule, scheduleKey, readSchedulePages } from "../schedule.js";
import { normalizeDate, clockKey, gradePremium, gradePremiums } from "../clock.js";
import { matchEmployee } from "../match.js";
import { indexByAccount, lookupAcross, suggestAlias } from "../identity.js";
import { buildEmployeeChecks, checkSummaryLine } from "../employee-checks.js";

// minutes from midnight, the way the parser holds a punch
const at = (h, m = 0) => ({ min: h * 60 + m });
const day = (punches, date = "07/20/26") => analyzeDay({ date, punches, printed: null });
// a day where the schedule actually rostered a "-Meal Break" block. Lateness
// only means anything once a meal was genuinely rostered - a gap credits nothing.
const mealDay = (punches, date = "07/20/26") =>
  analyzeDay({ date, punches, printed: null, mealScheduled: true });

// ---------------------------------------------------------------- rest periods

test("rest periods follow the major-fraction bands, not whole 4-hour blocks", () => {
  // CA: one per 4 hours worked "or major fraction thereof". A major fraction of
  // a 4-hour block is anything over two hours, which lands the bands off the
  // multiples of four. Counting whole blocks under-counts every shift between
  // six and eight hours, which is most of them.
  assert.equal(restsRequired(0), 0);
  assert.equal(restsRequired(3.5), 0, "exactly 3.5 owes nothing");
  assert.equal(restsRequired(3.6), 1, "just past 3.5 owes one");
  assert.equal(restsRequired(6), 1, "exactly 6 still owes one");
  assert.equal(restsRequired(6.1), 2, "just past 6 owes two");
  assert.equal(restsRequired(7), 2, "the band that whole-block counting got wrong");
  assert.equal(restsRequired(8), 2);
  assert.equal(restsRequired(10), 2);
  assert.equal(restsRequired(10.1), 3);
  assert.equal(restsRequired(14), 3);
  assert.equal(restsRequired(14.1), 4);
});

test("the old whole-block rule and the current one differ where it matters", () => {
  for (const h of [3.75, 6.5, 7, 7.5, 11]) {
    assert.notEqual(Math.floor(h / 4), restsRequired(h), `${h}h should differ`);
  }
  for (const h of [4, 5, 6, 8, 10]) {
    assert.equal(Math.floor(h / 4), restsRequired(h), `${h}h should agree`);
  }
});

// ------------------------------------------------------------------ meal timing

test("a meal must BEGIN by the end of the fifth hour, not merely happen", () => {
  // 8h shift, lunch after 4 hours worked
  const onTime = mealDay([at(8), at(12), at(12, 30), at(16, 30)]);
  assert.equal(onTime.mealCount, 1);
  assert.equal(onTime.mealLate, false);
  assert.equal(onTime.mealViolation, false);
  assert.equal(onTime.mealStartedAfterMin, 240);

  // same shift, lunch after six hours worked
  const late = mealDay([at(8), at(14), at(14, 30), at(16, 30)]);
  assert.equal(late.mealLate, true);
  assert.equal(late.mealMissing, false, "it happened, it was just late");
  assert.equal(late.mealViolation, true);
});

test("the fifth-hour boundary is exact", () => {
  const exactly300 = mealDay([at(8), at(13), at(13, 30), at(16, 30)]);
  assert.equal(exactly300.mealStartedAfterMin, 300);
  assert.equal(exactly300.mealLate, false, "300 minutes is the deadline, not past it");

  const oneMinuteLate = mealDay([at(8), at(13, 1), at(13, 31), at(16, 30)]);
  assert.equal(oneMinuteLate.mealLate, true);
});

test("missing and late are tracked apart but pay one premium between them", () => {
  const none = day([at(8), at(16, 30)]);
  assert.equal(none.mealMissing, true);
  assert.equal(none.mealLate, false, "you cannot be late for a meal you never took");
  assert.equal(none.mealViolation, true);
  assert.equal(RULES.premiumHoursPerViolation, 1);
});

test("a short day owes neither a meal nor a rest", () => {
  const short = day([at(9), at(12, 30)]); // 3.5 hours
  assert.equal(short.mealRequired, false);
  assert.equal(short.mealViolation, false);
  assert.equal(short.restRequired, 0);
});

// ---- a break only counts if something actually recorded it ----------------
//
// The Simple Timesheet is generated from the SCHEDULE, not from clock punches:
// on 114 days where the two disagree about a start time, the timesheet followed
// the schedule 93 times and the clock 0. A gap between punches is therefore a
// gap in the roster and proves nothing. Cost of this rule on 07/16-07/31: meal
// premium days 262 -> 319, rest 389 -> 399, total 651 -> 718.

test("a gap where no meal was rostered credits nothing", () => {
  const punches = [at(8), at(12), at(12, 30), at(16, 30)];
  const d = analyzeDay({ date: "07/20/26", punches, printed: null, mealScheduled: false });
  assert.equal(d.mealCount, 1, "the gap is still classified - that is what keeps it unpaid");
  assert.equal(d.mealViolation, true, "but it credits no meal period");
  assert.equal(d.mealMissing, true);
});

test("a rostered meal counts, and the gap still comes out of the hours", () => {
  const punches = [at(8), at(12), at(12, 30), at(16, 30)];
  const yes = analyzeDay({ date: "07/20/26", punches, printed: null, mealScheduled: true });
  const no = analyzeDay({ date: "07/20/26", punches, printed: null, mealScheduled: false });
  assert.equal(yes.mealViolation, false);
  assert.equal(no.mealViolation, true);
  assert.equal(yes.paidHours, no.paidHours, "HOURS DO NOT MOVE - only the violation does");
  assert.equal(yes.workedMin, no.workedMin);
});

test("no schedule for the day goes to a person, not onto the bill", () => {
  // 8 of these on 07/16-07/31. Charging them invents a violation we have no
  // document for; passing them invents compliance.
  const d = analyzeDay({ date: "07/20/26", punches: [at(8), at(16, 30)], printed: null, mealScheduled: null });
  assert.equal(d.mealRequired, true);
  assert.equal(d.mealUnknown, true);
  assert.equal(d.mealViolation, false, "not charged");
  assert.equal(d.mealMissing, false, "and not passed either");
});

test("a caller that forgets to say gets the answer that pays", () => {
  // absent is "not rostered", never "unknown". A wiring mistake must not
  // silently drop somebody's premium.
  const d = analyzeDay({ date: "07/20/26", punches: [at(8), at(16, 30)], printed: null });
  assert.equal(d.mealScheduled, false);
  assert.equal(d.mealUnknown, false);
  assert.equal(d.mealViolation, true);
});

// -------------------------------------------------------------------- overtime

test("daily overtime splits at 8 and double time at 12", () => {
  const [d] = applyOvertime([day([at(6), at(19, 50)])], null);
  assert.equal(d.regularHours, 8);
  assert.ok(Math.abs(d.otHours - 4) < 0.01);
  assert.ok(d.doubleHours > 1.8);
});

test("weekly overtime is drawn only from hours still at straight time", () => {
  // Mon 19.83h then four 8h days. The long Monday contributes 8 straight-time
  // hours, not 19.83, so the week lands on exactly 40 and no weekly OT triggers.
  // Pyramiding would wrongly push Thursday and Friday into overtime.
  const days = [
    day([at(8), at(11, 30), at(11, 40), at(20, 20)], "07/20/26"),
    day([at(8), at(16)], "07/21/26"),
    day([at(8), at(16)], "07/22/26"),
    day([at(8), at(16)], "07/23/26"),
    day([at(8), at(16)], "07/24/26"),
  ];
  const out = applyOvertime(days, { from: "07/20/26", to: "07/24/26" });
  const straight = out.reduce((n, d) => n + d.regularHours, 0);
  assert.ok(straight <= 40.01, `straight time should cap at 40, got ${straight}`);
});

// ------------------------------------------------------------- malformed punches

test("a clock-out before the clock-in is caught", () => {
  const found = findAnomalies({ punches: [at(15, 10), at(14, 30)] });
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, "backwards_segment");
});

test("an impossibly long stretch is caught", () => {
  // the real one: Garcia 07/20, a rest break whose second time took a PM
  const found = findAnomalies({ punches: [at(11, 30), at(23, 20)] });
  assert.equal(found[0].kind, "long_segment");
});

test("a break running backwards is caught", () => {
  const found = findAnomalies({ punches: [at(9), at(11, 5), at(11), at(13)] });
  assert.ok(found.some((f) => f.kind === "reversed_break"));
});

test("an ordinary day is not flagged", () => {
  assert.equal(findAnomalies({ punches: [at(8), at(12), at(12, 30), at(16, 30)] }).length, 0);
});

test("Garcia's real 07/20 punches resolve to an 8-hour day", () => {
  // the exact sequence from the export, and the schedule it was generated
  // from says 8.00
  const punches = [
    at(8, 30), at(11, 30), at(11, 30), at(23, 20), at(11, 30), at(13, 30),
    at(13, 30), at(15, 30), at(15, 30), at(16, 20), at(16, 30), at(16, 30),
  ];
  const before = day(punches);
  assert.ok(before.paidHours > 19, "as exported it reads as a 19+ hour day");
  const { punches: fixed } = suggestPunches({ punches });
  const after = analyzeDay({ date: "07/20/26", punches: fixed, printed: null });
  assert.ok(Math.abs(after.paidHours - 8) < 0.25, `expected ~8, got ${after.paidHours}`);
});

test("reversed pairs are FLAGGED and never silently corrected", () => {
  // Measured against a real pay period and its schedule: putting reversed pairs
  // back in order moved 18 of 23 people FURTHER from their schedule and only 3
  // closer, making total disagreement worse by 31.73 hours. Six people whose
  // hours agreed with their schedule EXACTLY were broken by it - Robinson went
  // from 0.00 off to 6.67 off.
  //
  // The reason: for most of these the daily total already comes out right
  // despite the reversal. QSP's own arithmetic absorbs it, our drift against
  // their printed figures is zero, and those figures agree with the schedule.
  // Swapping introduces an error into a total that was already correct.
  //
  // So: detect them, report them, leave the numbers alone. If you are here
  // because you want the engine to auto-correct reversed breaks, re-run that
  // comparison against a schedule export first.
  const punches = [at(9), at(11, 5), at(11), at(13)];
  const before = analyzeDay({ date: "07/20/26", punches, printed: null });

  assert.ok(findAnomalies({ punches }).length > 0, "it must be flagged");

  // and the day's hours must be untouched by the mere act of flagging
  const after = analyzeDay({ date: "07/20/26", punches, printed: null });
  assert.equal(after.paidHours, before.paidHours);
  assert.equal(after.workedMin, before.workedMin);
});

test("a repair is never offered unless it actually repairs the day", () => {
  // Purcell 07/31: the naive swap turns 16.29 hours into MINUS 8, so no
  // suggestion may be offered for it at all.
  const punches = [at(15, 15), at(17, 25), at(5, 15), at(19, 22)];
  const [row] = reviewSheet([{ date: "07/31/26", punches, printed: null }], analyzeDay);
  assert.ok(row, "the day must still be flagged");
  assert.equal(row.suggestion, null, "but no repair may be offered");
  assert.equal(row.needsHuman, true);
});

test("no suggestion anywhere is negative or absurd", () => {
  const cases = [
    [at(15, 15), at(17, 25), at(5, 15), at(19, 22)],
    [at(8, 36), at(12, 30), at(9, 31), at(12, 31), at(12, 30), at(12, 40)],
    [at(10), at(14, 50), at(15), at(11, 35)],
  ];
  for (const punches of cases) {
    const [row] = reviewSheet([{ date: "07/01/26", punches, printed: null }], analyzeDay);
    if (row?.suggestion) {
      assert.ok(row.suggestion.hours > 0 && row.suggestion.hours <= 16,
        `offered ${row.suggestion.hours} hours`);
    }
  }
});

// ------------------------------------------------------------------ corrections

test("recomputing with no overrides changes nothing", () => {
  const days = [
    { date: "07/20/26", paidHours: 8, rawHours: 8, mealViolation: false, restViolation: false, restCount: 2, restRequired: 2 },
    { date: "07/21/26", paidHours: 6, rawHours: 6, mealViolation: true, restViolation: false, restCount: 1, restRequired: 1 },
  ];
  const out = recomputeSheet({ days, payPeriod: null, overrides: null }, applyOvertime);
  assert.equal(out.totals.paidHours, 14);
  assert.equal(out.premiums.totalHours, 1);
});

test("a worked-through lunch adds the time back AND owes a premium", () => {
  const d = { date: "07/20/26", paidHours: 8, rawHours: 8, mealMin: 30, mealViolation: false, restViolation: false, restCount: 2, restRequired: 2 };
  const patch = patchFor("meal_missed", d, null);
  assert.equal(patch.mealViolation, true);
  assert.equal(patch.paidHours, 8.5);

  const out = recomputeSheet(
    { days: [d], payPeriod: null, overrides: mergeOverride(null, d.date, patch) },
    applyOvertime,
  );
  assert.equal(out.totals.paidHours, 8.5);
  assert.equal(out.premiums.totalHours, 1);
  assert.ok(out.totals.otHours > 0, "the extra half hour crosses 8 and becomes overtime");
});

test("every correction kind has copy and a defined shape", () => {
  for (const [key, spec] of Object.entries(CORRECTION_KINDS)) {
    assert.ok(spec.label, `${key} needs a label`);
    assert.ok(spec.help, `${key} needs help text`);
    assert.ok(["day", "newDay", "sheet"].includes(spec.scope), `${key} scope`);
  }
});

// -------------------------------------------------------------------- schedule

test("schedule names line up with timesheet names", () => {
  assert.equal(scheduleKey("Garcia, Stephanie"), scheduleKey("Stephanie Garcia"));
  assert.equal(scheduleKey("Rotter, B."), "b. rotter");
});

test("the schedule comparison only judges days inside the pay period", () => {
  // the schedule covers a whole month; a pay period is half of one. without the
  // window every sheet reports a fortnight of "missing" days from the other half.
  const timesheet = [{ date: "07/16/26", paidHours: 8 }, { date: "07/17/26", paidHours: 8 }];
  const schedule = [
    { date: "07/02/26", workHours: 8 },
    { date: "07/16/26", workHours: 8 },
    { date: "07/17/26", workHours: 8 },
  ];
  const cmp = compareToSchedule(timesheet, schedule);
  assert.equal(cmp.flagged.length, 0, "07/02 is outside the period and must be ignored");
});

test("a day that disagrees with the schedule is flagged", () => {
  const cmp = compareToSchedule(
    [{ date: "07/20/26", paidHours: 19.83 }],
    [{ date: "07/20/26", workHours: 8 }],
  );
  assert.equal(cmp.flagged.length, 1);
  assert.ok(Math.abs(cmp.flagged[0].diff - 11.83) < 0.01);
});

test("small differences are not flagged", () => {
  const cmp = compareToSchedule(
    [{ date: "07/20/26", paidHours: 8.25 }],
    [{ date: "07/20/26", workHours: 8 }],
  );
  assert.equal(cmp.flagged.length, 0);
});

// ------------------------------------------------------- schedule page breaks
//
// The QSP export has now broken parsing the same way three times: employees
// spanning pages, comments spilling onto their own page, and this one - a month
// calendar running onto a second page with the split landing MID-WEEK. The
// entries that don't fit carry on at the top of the next page with no day
// number above them and no "Employee:" header, so read page-by-page they look
// like nothing and get dropped. The scheduled total then comes out short and
// the checks screen accuses a day that was fine.
//
// The fixture is Ilean Solorzano, July 2026, off the real export. Her week of
// the 19th is the cut one: the 20th through the 23rd each have entries stranded
// on page 2. All four are genuinely 8.00 hour days. Before the fix they read
// 6.00 / 4.00 / 6.00 / 5.48, and every one of those raised a false anomaly -
// worse, "Correct this day" offered the short figure as the suggested fix, so
// accepting it would have used the tool to INTRODUCE a payroll error.

// lay text out the way pdfjs hands it over: {str, transform:[a,b,c,d,x,y], width}
const COLS = [100, 250, 400, 550, 700, 850, 1000]; // sun..sat, centres
const item = (str, x, y, width = 0) => ({ str, transform: [1, 0, 0, 1, x, y], width });
// day numbers are CENTRED in their cell - that centring is what broke an earlier
// attempt at this parser, so the fixture reproduces it rather than faking it
const dayNum = (n, col, y) => {
  const w = String(n).length * 8;
  return item(String(n), COLS[col] - w / 2, y, w);
};
// entries are left-aligned in the cell and sit below the day number
const entry = (text, col, y) => item(text, COLS[col] - 8, y);

const ROWS = [800, 650, 500, 350, 200];

function solorzanoPage1() {
  const items = [
    item("Employee: Ilean Solorzano", 400, 950),
    item("July 2026", 400, 920),
  ];
  // the grid: July 2026 opens on a Wednesday
  const grid = [
    [null, null, null, 1, 2, 3, 4],
    [5, 6, 7, 8, 9, 10, 11],
    [12, 13, 14, 15, 16, 17, 18],
    [19, 20, 21, 22, 23, 24, 25],
  ];
  grid.forEach((week, r) =>
    week.forEach((d, c) => d && items.push(dayNum(d, c, ROWS[r]))),
  );

  // only the cut week is filled in - the rest of the month is grid, and the
  // grid is all the parser needs from it
  const y = ROWS[3] - 15;
  const add = (col, lines) =>
    lines.forEach((t, i) => items.push(entry(t, col, y - i * 12)));

  add(0, ["10:30a-11:30a Huerta, F-ILS Service(1:00)"]);
  add(1, [
    "8:30a-10:30a Montiel, A-ILS Service(2:00)",
    "10:30a-12:30p Hernandez, T-ILS Service(2:00)",
    "12:30p-2:30p Velasquez, F-ILS Service(2:00)",
  ]);
  add(2, [
    "8a-9:30a Tran, N-ILS Service(1:30)",
    "9:30a-10a Soriano, R-ILS Service(0:30)",
    "10a-11:30a -ILS Admin(1:30)",
    "12p-12:30p Flores, E-ILS Service(0:30)",
  ]);
  add(3, [
    "7:30a-9:30a Gonzalez, G-ILS Service(2:00)",
    "9:30a-11:30a Uribe, P-ILS Service(2:00)",
    "11:30a-12:45p -ILS Admin(1:15)",
    "1:30p-2:15p Gonzalez, A-ILS Service(0:45)",
  ]);
  add(4, [
    "8:37a-10:37a Lorenzana, S-ILS Service(2:00)",
    "10:37a-12:06p Flores, E-ILS Service(1:29)",
    "12:06p-2:06p Hernandez, J-ILS Service(2:00)",
  ]);
  add(5, [
    "8:30a-10:30a Mino, J-ILS Service(2:00)",
    "10:30a-12:30p Huerta, S-ILS Service(2:00)",
    "12:30p-2:30p -ILS Admin(2:00)",
    "4:30p-6:30p Ho, C-ILS Service(2:00)",
  ]);
  return items;
}

function solorzanoPage2() {
  // NO "Employee:" header and NO month - this is the whole difficulty
  const items = [];

  // the tail of the week of the 19th, stranded above everything, with no day
  // number anywhere near it to say which day it belongs to
  const spillY = 900;
  const spill = (col, lines) =>
    lines.forEach((t, i) => items.push(entry(t, col, spillY - i * 12)));

  spill(1, [
    "2:30p-3:30p Botello, I-ILS Service(1:00)",
    "3:30p-4:30p Gonzalez, G-ILS Service(1:00)",
  ]);
  spill(2, [
    "12:30p-1:30p Munoz, O-ILS Service(1:00)",
    "1:30p-3:30p Gonzalez, C-ILS Service(2:00)",
    "3:30p-4:30p Burkey, K-ILS Service(1:00)",
  ]);
  spill(3, [
    "2:30p-3:30p Martinez-Andraca, M-ILS Service(1:00)",
    "4p-5p Villa, E-ILS Service(1:00)",
  ]);
  spill(4, [
    "2:06p-2:44p Martinez, M-ILS Service(0:38)",
    "3p-3:35p Gonzalez, G-ILS Service(0:35)",
    "3:35p-3:50p Botello, I-ILS Service(0:15)",
    "4p-4:49p Sosa, A-ILS Service(0:49)",
    "4:50p-5:04p Zambrano, D-ILS Service(0:14)",
  ]);

  // then the last week of the month, a normal row that happens to be on page 2
  [26, 27, 28, 29, 30, 31].forEach((d, c) => items.push(dayNum(d, c, ROWS[0])));
  const y = ROWS[0] - 15;
  const add = (col, lines) =>
    lines.forEach((t, i) => items.push(entry(t, col, y - i * 12)));
  add(0, [
    "8:30a-8:50a Tran, N-ILS Service(0:20)",
    "8:50a-9:26a Zambrano, D-ILS Service(0:36)",
    "9:30a-9:45a Gonzalez, A-ILS Service(0:15)",
    "9:45a-10:45a Pina, A-ILS Service(1:00)",
  ]);
  add(5, [
    "8:30a-10:30a Tran, N-ILS Service(2:00)",
    "10:30a-11:30a Le, T-ILS Service(1:00)",
    "1p-1:30p -Meal Break(0:30)",
    "1:30p-2:30p Gonzalez, G-ILS Service(1:00)",
    "2:30p-4:30p Burkey, K-ILS Service(2:00)",
    "4:30p-6:30p Zambrano, D-ILS Service(2:00)",
  ]);
  return items;
}

const solorzano = () => {
  const [person] = readSchedulePages([solorzanoPage1(), solorzanoPage2()]);
  return { person, byDate: new Map(person.days.map((d) => [d.date, d])) };
};

test("a page with no header continues the person before it", () => {
  const { person } = solorzano();
  assert.equal(person.employee, "Ilean Solorzano");
  assert.deepEqual(person.pages, [1, 2], "both pages belong to the one person");
});

test("a week cut by the page break is stitched back to full days", () => {
  const { byDate } = solorzano();
  // every one of these is really an 8-hour day. the number in the comment is
  // what the parser used to report when it read page 2 as nothing.
  assert.equal(byDate.get("07/20/26").workHours, 8, "was 6.00");
  assert.equal(byDate.get("07/21/26").workHours, 8, "was 4.00");
  assert.equal(byDate.get("07/22/26").workHours, 8, "was 6.00");
  assert.equal(byDate.get("07/23/26").workHours, 8, "was 5.48");
  // the 24th sits in the same cut week but had nothing stranded, so it must be
  // untouched - the stitching has to be able to add nothing
  assert.equal(byDate.get("07/24/26").workHours, 8);
});

test("the stitched day keeps the shifts from both pages, in order", () => {
  const { byDate } = solorzano();
  const texts = byDate.get("07/21/26").entries.map((e) => e.text);
  assert.equal(texts.length, 7, "four off page 1, three off page 2");
  assert.match(texts[0], /^8a-9:30a Tran/);
  assert.match(texts.at(-1), /^3:30p-4:30p Burkey/);
});

test("a day split across pages records both pages", () => {
  const { byDate } = solorzano();
  assert.deepEqual(byDate.get("07/21/26").pages, [1, 2], "the cut day is on both");
  assert.deepEqual(byDate.get("07/24/26").pages, [1], "an intact day is on one");
  assert.deepEqual(byDate.get("07/31/26").pages, [2], "a whole week can start on page 2");
});

test("a whole row living on the continuation page still reads", () => {
  const { byDate } = solorzano();
  // 0:20 + 0:36 + 0:15 + 1:00
  assert.equal(byDate.get("07/26/26").workHours, 2.18);
  // and meals stay excluded from work even on a continuation page
  const d31 = byDate.get("07/31/26");
  assert.equal(d31.workHours, 8, "the half-hour meal is not paid time");
  assert.equal(d31.mealHours, 0.5);
});

test("the page-break bug would have raised four false anomalies", () => {
  // the end-to-end point of all of the above: with the week stitched, Solorzano's
  // timesheet agrees with her schedule and nothing is flagged. Without it, four
  // correct days get accused - and the suggested "fix" is the short figure.
  const { byDate } = solorzano();
  const dates = ["07/20/26", "07/21/26", "07/22/26", "07/23/26"];
  const cmp = compareToSchedule(
    dates.map((date) => ({ date, paidHours: 8 })),
    dates.map((date) => byDate.get(date)),
  );
  assert.equal(cmp.flagged.length, 0, "a correct timesheet must not be accused");
});

// B. Rotter, July 2026, the case section 0b of the checklist is written around.
//
// Structurally different from Solorzano and worth its own fixture: her page 2
// carries NO day numbers whatsoever - it is nothing but the tail of the last
// week. So the column grid has to come from the page before (there is nothing to
// derive it from), there is no "first day-number row" to measure spill against,
// and the whole page has to be recognised as belonging to the previous person's
// last row. A page like this is the one that used to be discarded outright.
function rotterPage1() {
  const items = [
    item("Employee: B. Rotter", 400, 950),
    item("July 2026", 400, 920),
  ];
  const grid = [
    [null, null, null, 1, 2, 3, 4],
    [5, 6, 7, 8, 9, 10, 11],
    [12, 13, 14, 15, 16, 17, 18],
    [19, 20, 21, 22, 23, 24, 25],
    [26, 27, 28, 29, 30, 31, null],
  ];
  grid.forEach((week, r) =>
    week.forEach((d, c) => d && items.push(dayNum(d, c, ROWS[r]))),
  );

  // only the last week is filled in - that's the cut one
  const y = ROWS[4] - 15;
  const add = (col, lines) =>
    lines.forEach((t, i) => items.push(entry(t, col, y - i * 12)));

  // the 26th is genuinely empty, on both pages
  add(1, [
    "8a-9a Slade, G-ILS Service(1:00)",
    "9a-11:30a Weiner, C-ILS Service(2:30)",
    "11:30a-1:30p Reyes, N-ILS Service(2:00)",
  ]);
  add(2, [
    "9a-11:30a Bedard, P-ILS Service(2:30)",
    "11:30a-2p Auger, L-ILS Service(2:30)",
    "2p-2:30p -Meal Break(0:30)",
  ]);
  add(3, [
    "10a-11a -ILS Admin(1:00)",
    "11a-2p Jemison, J-ILS Service(3:00)",
    "2p-4p Fuerte, J-ILS Service(2:00)",
  ]);
  add(4, [
    "10a-1p Durfey, S-ILS Service(3:00)",
    "1p-4p Blaes, H-ILS Service(3:00)",
    "4:30p-5p -Meal Break(0:30)",
  ]);
  add(5, [
    "11:30a-1p Jemison, J-ILS Service(1:30)",
    "1p-2p Hurtado, N-ILS Service(1:00)",
    "2p-5p Mc Carter Jr., W-ILS Service(3:00)",
  ]);
  return items;
}

function rotterPage2() {
  // no header, no month, and no day numbers anywhere. read on its own this page
  // is unattributable - it only means anything relative to the page before it.
  const items = [];
  const y = 900;
  const add = (col, lines) =>
    lines.forEach((t, i) => items.push(entry(t, col, y - i * 12)));

  add(1, [
    "1:30p-2p -Meal Break(0:30)",
    "2p-3p Hurtado, N-ILS Service(1:00)",
    "5p-6:30p Sanchez, P-ILS Service(1:30)",
  ]);
  // the shift the checklist is named after: without it the 28th reads 5.00
  add(2, ["2:30p-5:30p Dawson, N-ILS Service(3:00)"]);
  add(3, [
    "4:30p-5p -Meal Break(0:30)",
    "5p-6p Fisher, J-ILS Service(1:00)",
    "6p-7p Schuster, J-ILS Service(1:00)",
  ]);
  add(4, [
    "5p-6p Fuerte, J-ILS Service(1:00)",
    "6p-7p Dawson, N-ILS Service(1:00)",
  ]);
  add(5, [
    "5p-5:30p -Meal Break(0:30)",
    "5:30p-6:30p Martinez, O-ILS Service(1:00)",
    "6:30p-7p Dawson, N-ILS Service(0:30)",
    "7p-8p Schuster, J-ILS Service(1:00)",
  ]);
  return items;
}

const rotter = () => {
  const [person] = readSchedulePages([rotterPage1(), rotterPage2()]);
  return { person, byDate: new Map(person.days.map((d) => [d.date, d])) };
};

test("a continuation page with NO day numbers still attaches", () => {
  // there is nothing on this page to derive a column grid from, so it has to be
  // carried forward from the page before or every entry lands in no column
  const { person } = rotter();
  assert.equal(person.employee, "B. Rotter");
  assert.deepEqual(person.pages, [1, 2]);
});

test("Rotter's last week reads 8.00 every day once stitched", () => {
  const { byDate } = rotter();
  // the figures in the comments are what the checks screen showed before the fix
  assert.equal(byDate.get("07/27/26").workHours, 8, "was 5.50");
  assert.equal(byDate.get("07/28/26").workHours, 8, "was 5.00 - the missing Dawson");
  assert.equal(byDate.get("07/29/26").workHours, 8, "was 6.00");
  assert.equal(byDate.get("07/30/26").workHours, 8, "was 6.00");
  assert.equal(byDate.get("07/31/26").workHours, 8, "was 5.50");
});

test("the 2:30p-5:30p Dawson shift is the one that was being lost", () => {
  const { byDate } = rotter();
  const d28 = byDate.get("07/28/26");
  assert.ok(
    d28.entries.some((e) => /Dawson/.test(e.text) && e.minutes === 180),
    "the 3-hour Dawson shift must survive the page break",
  );
  assert.equal(d28.mealHours, 0.5, "and the meal stays unpaid");
  assert.deepEqual(d28.pages, [1, 2]);
});

test("a day empty on both pages never appears", () => {
  // the 26th is a genuinely unscheduled Sunday. it must not turn into a
  // zero-hour day that then reads as "on the schedule, but no punches".
  const { byDate } = rotter();
  assert.equal(byDate.get("07/26/26"), undefined);
});

test("the comparison carries the scheduled shifts, not just the total", () => {
  // "schedule has 4.12" says the two disagree but not how. The shifts are what
  // make a wrong reading obvious at a glance.
  const { byDate } = solorzano();
  const cmp = compareToSchedule(
    [{ date: "07/21/26", paidHours: 16.5 }],
    [byDate.get("07/21/26")],
  );
  const [row] = cmp.flagged;
  assert.equal(row.shifts.length, 7);
  assert.match(row.shifts[0].text, /8a-9:30a/);
  assert.deepEqual(row.schedulePages, [1, 2], "so the snippet can link to both");
});

// ------------------------------------------------------- premium evidence
//
// Every premium hour is graded by how well the day behind it is evidenced, so
// the number handed to management splits into "stands up on its own" and
// "somebody needs to look at this". On 07/16-07/31 that was 386 clock-confirmed,
// 215 corroborated by the schedule, and 21 with neither.
//
// The grading must NEVER change an hour or a premium. It only labels them.

test("the two exports print dates differently and both have to line up", () => {
  assert.equal(normalizeDate("7/16/2026"), "07/16/26", "clock report style");
  assert.equal(normalizeDate("07/16/26"), "07/16/26", "timesheet style");
  assert.equal(normalizeDate("12/1/2026"), "12/01/26");
  assert.equal(normalizeDate(""), null);
  assert.equal(normalizeDate("nonsense"), null);
});

test("employee names line up between the clock report and the timesheet", () => {
  assert.equal(clockKey("Rotter, B."), clockKey("rotter,  b."));
  assert.notEqual(clockKey("Garcia, Stephanie"), clockKey("Garcia, Steven"));
});

test("a rest premium is recorded when QSP's rest report covers the person", () => {
  // the rest report decided the violation, so the violation carries its authority
  const opts = { clockDays: null, restCovered: true, scheduleByDate: {} };
  assert.equal(gradePremium("rest", "07/20/26", opts), "recorded");
});

test("a rest premium with no rest report falls back to the clock", () => {
  assert.equal(
    gradePremium("rest", "07/20/26", { clockDays: { "07/20/26": "full" }, restCovered: false }),
    "recorded",
    "a fully clocked day makes the punch gaps real",
  );
  assert.equal(
    gradePremium("rest", "07/20/26", { clockDays: { "07/20/26": "none" }, restCovered: false }),
    "unverified",
    "typed-in times with no rest report behind them prove nothing",
  );
});

test("the schedule can corroborate a MEAL premium but never a rest one", () => {
  // the schedule holds meal breaks and not one rest period in 1,986 entries
  const scheduled = { scheduleByDate: { "07/20/26": { shifts: [{ text: "9a-5p Smith", meal: false }] } } };
  assert.equal(
    gradePremium("meal", "07/20/26", { clockDays: null, restCovered: false, ...scheduled }),
    "supported",
    "a full day with no meal period scheduled is evidence none was taken",
  );
  assert.equal(
    gradePremium("rest", "07/20/26", { clockDays: null, restCovered: false, ...scheduled }),
    "unverified",
    "the same schedule says nothing at all about rest breaks",
  );
});

test("a meal that WAS scheduled but never punched is not corroborated", () => {
  const g = gradePremium("meal", "07/20/26", {
    clockDays: null,
    restCovered: false,
    scheduleByDate: { "07/20/26": { shifts: [{ text: "1p-1:30p -Meal Break", meal: true }] } },
  });
  assert.equal(g, "unverified", "they may well have taken it and not clocked it");
});

test("hours differing from the schedule never affects the grade", () => {
  // people work different hours than they were scheduled. That is ordinary, and
  // the timesheet is the record we go by - it must not weaken any premium.
  const base = { clockDays: { "07/20/26": "full" }, restCovered: true, scheduleByDate: {} };
  assert.equal(gradePremium("meal", "07/20/26", base), "recorded");
  assert.equal(gradePremium("rest", "07/20/26", base), "recorded");
});

test("meal and rest on the same day are graded separately", () => {
  const days = [{ date: "07/20/26", mealViolation: true, restViolation: true }];
  const { totals, byDate } = gradePremiums(days, {
    clockDays: null,
    restCovered: true,
    scheduleByDate: { "07/20/26": { shifts: [{ text: "9a-5p", meal: false }] } },
  });
  assert.equal(byDate["07/20/26"].rest, "recorded", "rest report covers it");
  assert.equal(byDate["07/20/26"].meal, "supported", "no meal was scheduled");
  assert.equal(totals.recorded + totals.supported + totals.unverified, 2);
});

// ---------------------------------------------------- one person, many names
//
// QSP does not print one name per person across its own reports. The Simple
// Timesheet says "Delgado Pineda, Ruth"; the clock and rest reports say
// "Delgado Pineda, Angel". Her portal account settles it - she is Ruth, and her
// preferred name is Angel - so both spellings are resolved through the staff
// list rather than compared to each other.
//
// Getting this wrong is expensive in both directions: miss the link and 37
// premium hours sit in "needs somebody to look" over spelling; guess at it and
// somebody's payroll evidence is attributed from another person's record.

const STAFF = [
  { id: "u-ruth", name: "Ruth Delgado Pineda", preferredFirstName: "Angel" },
  { id: "u-jen", name: "Jennifer Delgado Pineda" },
  { id: "u-frank", name: "Frank Velasquez" },
  { id: "u-jess", name: "Jessica Zermeno" },
];

test("a preferred name links the same person across two reports", () => {
  const byUser = indexByAccount(["Delgado Pineda, Angel", "Delgado Pineda, Jennifer"], STAFF);
  const hit = lookupAcross("Delgado Pineda, Ruth", matchEmployee("Delgado Pineda, Ruth", STAFF), {
    get: (k) => (k === "delgado pineda, angel" ? { shifts: 40 } : null),
    keyOf: clockKey,
    byUser,
  });
  assert.ok(hit.value, "her clock record must be found under her preferred name");
  assert.equal(hit.via, "Delgado Pineda, Angel", "and the screen must be told which spelling was used");
});

test("the name as printed always wins - no alias hop when it matches", () => {
  const hit = lookupAcross("Velasco, Brenda", matchEmployee("Velasco, Brenda", STAFF), {
    get: () => ({ shifts: 121 }),
    keyOf: clockKey,
    byUser: new Map([["anyone", "Someone, Else"]]),
  });
  assert.ok(hit.value);
  assert.equal(hit.via, null, "nothing was substituted, so nothing to declare");
});

test("a PARTIAL name match IS followed, but never silently", () => {
  // "Velasquez, Francisco" scores 50% against an account named Frank Velasquez.
  // With no other candidate in the building that is who it is, so the link is
  // made - Mánu's call, and the safe direction, since the alternative is
  // throwing away her evidence over a nickname.
  //
  // What a partial does not get is silence. The confidence rides along with the
  // result so a 50% link always reads as a 50% link.
  const m = matchEmployee("Velasquez, Francisco", STAFF);
  assert.equal(m.userId, "u-frank");
  assert.notEqual(m.method, "exact", "it is only a partial match");

  const byUser = indexByAccount(["Velasquez, Frank"], STAFF);
  const hit = lookupAcross("Velasquez, Francisco", m, {
    get: (k) => (k === "velasquez, frank" ? { shifts: 10 } : null),
    keyOf: clockKey,
    byUser,
  });
  assert.ok(hit.value, "the record is found");
  assert.equal(hit.via, "Velasquez, Frank");
  assert.equal(hit.exact, false, "and it must not claim to be certain");
  assert.equal(hit.confidence, 50, "the estimate travels with it");
});

test("a name that matches as printed is reported as certain", () => {
  const hit = lookupAcross("Velasco, Brenda", matchEmployee("Velasco, Brenda", STAFF), {
    get: () => ({ shifts: 121 }),
    keyOf: clockKey,
    byUser: new Map(),
  });
  assert.equal(hit.exact, true);
  assert.equal(hit.confidence, 100);
});

test("the guess that IS offered reports the weaker of the two links", () => {
  // "Velasquez, Frank" matches its own account 100%. Saying so would be true
  // and beside the point - the open question is whether Francisco is Frank.
  const g = suggestAlias("Velasquez, Francisco", ["Velasquez, Frank"], STAFF);
  assert.equal(g.name, "Velasquez, Frank");
  assert.equal(g.confidence, 50, "the uncertain side is the one to report");
});

test("nobody is offered when there is no candidate", () => {
  assert.equal(suggestAlias("Zermeno, Jessica", ["Velasquez, Frank"], STAFF), null);
});

test("two people sharing a surname never collapse into one", () => {
  const byUser = indexByAccount(["Delgado Pineda, Jennifer"], STAFF);
  const hit = lookupAcross("Delgado Pineda, Ruth", matchEmployee("Delgado Pineda, Ruth", STAFF), {
    get: (k) => (k === "delgado pineda, jennifer" ? { shifts: 43 } : null),
    keyOf: clockKey,
    byUser,
  });
  assert.equal(hit.value, null, "Ruth must never be handed Jennifer's record");
});

// -------------------------------------------- the timesheet is the record
//
// Mánu's ruling: the QSP Simple Timesheet is what we go off, because it is the
// document staff sign. The schedule, clock and rest reports are support for what
// the timesheet cannot answer, and a supporting document must never overrule it
// to somebody's cost.
//
// For rest breaks that means: whichever source shows FEWER breaks decides, so
// the support can only ever ADD a premium.

const restDay = (punches, recorded) =>
  analyzeDay({ date: "07/20/26", punches, printed: null, restRecorded: recorded });

test("the rest report is now the ONLY thing that credits a rest break", () => {
  // 8 hours with two ten-minute gaps. Those are gaps in the ROSTER, since the
  // timesheet is generated from the schedule, so they credit nothing.
  const punches = [at(8), at(11), at(11, 10), at(14), at(14, 10), at(17)];
  assert.equal(restDay(punches, null).restViolation, true, "gaps are not evidence of a break");
  assert.equal(restDay(punches, 2).restViolation, false, "the report recording two clears it");
  assert.equal(restDay(punches, 1).restViolation, true, "one of two owed is still short");
});

test("no rest report coverage means no record, so the premium is owed", () => {
  // the change that costs 10 days on 07/16-07/31: somebody the report does not
  // cover has nothing crediting a break, and the reading that pays is the one
  // we take.
  const d = restDay([at(8), at(11), at(11, 10), at(14), at(14, 10), at(17)], null);
  assert.equal(d.restSource, "none");
  assert.equal(d.restTaken, 0);
  assert.equal(d.restViolation, true);
});

test("the report can never credit more breaks than were owed", () => {
  const punches = [at(8), at(17)];
  assert.equal(restDay(punches, 2).restViolation, false, "two owed, two recorded");
  assert.equal(restDay(punches, 1).restViolation, true, "two owed, one recorded");
});

// ---------------------------------------------------------------------------
// what the employee is actually told
//
// The email used to say "Break premium hours owed: 12 hrs" and stop. A number
// with no basis cannot be checked, argued with, or learned from - and these are
// the only people who know whether a break really happened.

const sheet = (over) => ({
  days: [],
  scheduleCheck: { byDate: {}, flagged: [] },
  punchCorrections: [],
  ...over,
});

test("a day that pays nothing is the first thing they are told", () => {
  // Romero-Alba 07/30 and Rotter 07/27. Every other item on the list PAYS them
  // something; this one is hours they may simply not be getting, so it leads.
  const checks = buildEmployeeChecks(sheet({
    days: [{ date: "07/29/26", paidHours: 8, mealViolation: true, restViolation: true,
             restTaken: 0, restRequired: 2 }],
    scheduleCheck: {
      byDate: {},
      flagged: [{ date: "07/30/26", flag: "missing-from-timesheet", schedule: 8 }],
    },
  }));
  assert.equal(checks[0].kind, "missingDay", "it has to come first");
  assert.equal(checks[0].tone, "urgent");
  assert.deepEqual(checks[0].rows, [{ date: "07/30/26", hours: 8 }]);
});

test("rest days split by whether there is a gap to point at", () => {
  // with a gap the question answers itself - you look at "1p-1:15p" and you
  // know whether you stopped. without one there is nothing to show them.
  const checks = buildEmployeeChecks(sheet({
    days: [
      { date: "07/16/26", paidHours: 6.5, restViolation: true, restTaken: 0, restRequired: 2 },
      { date: "07/24/26", paidHours: 7, restViolation: true, restTaken: 0, restRequired: 2 },
    ],
    scheduleCheck: {
      flagged: [],
      byDate: {
        "07/16/26": { shifts: [
          { text: "11a-1p Rincon, R-ILS Service (2:00)", minutes: 120, meal: false },
          { text: "1:15p-3:15p Moore, R-ILS Service(2:00)", minutes: 120, meal: false },
        ] },
        "07/24/26": { shifts: [
          { text: "7a-9a Rincon, R-ILS Service (2:00)", minutes: 120, meal: false },
          { text: "12:15p-5:15p -ILS Admin(5:00)", minutes: 300, meal: false },
        ] },
      },
    },
  }));
  const gap = checks.find((c) => c.kind === "restGap");
  const noGap = checks.find((c) => c.kind === "restNoGap");
  assert.deepEqual(gap.rows.map((r) => r.date), ["07/16/26"]);
  assert.deepEqual(gap.rows[0].gaps, ["1p-1:15p"]);
  assert.deepEqual(noGap.rows.map((r) => r.date), ["07/24/26"],
    "a 3-hour hole between two clients is not a rest break and is not offered as one");
});

test("a rostered meal break is never offered as an unexplained gap", () => {
  const checks = buildEmployeeChecks(sheet({
    days: [{ date: "07/27/26", paidHours: 7, restViolation: true, restTaken: 0, restRequired: 2 }],
    scheduleCheck: { flagged: [], byDate: { "07/27/26": { shifts: [
      { text: "10a-2p -ILS Admin(4:00)", minutes: 240, meal: false },
      { text: "2p-2:30p -Meal Break(0:30)", minutes: 30, meal: true },
      { text: "2:30p-5:30p -ILS Admin(3:00)", minutes: 180, meal: false },
    ] } } },
  }));
  assert.equal(checks.find((c) => c.kind === "restGap"), undefined);
  assert.ok(checks.find((c) => c.kind === "restNoGap"), "it is still a missed rest");
});

test("a missed meal and a late meal are different messages", () => {
  const checks = buildEmployeeChecks(sheet({
    days: [
      { date: "07/16/26", paidHours: 6.5, mealViolation: true, mealLate: false },
      { date: "07/27/26", paidHours: 8, mealViolation: true, mealLate: true, mealStartedAfterMin: 370 },
    ],
  }));
  const missed = checks.find((c) => c.kind === "mealMissing");
  const late = checks.find((c) => c.kind === "mealLate");
  assert.deepEqual(missed.rows.map((r) => r.date), ["07/16/26"]);
  assert.deepEqual(late.rows.map((r) => r.date), ["07/27/26"]);
  assert.equal(late.rows[0].startedAfter, 370, "so the email can say how late");
});

test("a day we could not check is asked about, not asserted", () => {
  const checks = buildEmployeeChecks(sheet({
    days: [{ date: "07/20/26", paidHours: 8, mealUnknown: true }],
  }));
  const u = checks.find((c) => c.kind === "mealUnknown");
  assert.equal(u.tone, "ask");
  assert.match(checkSummaryLine(u), /could not check/);
});

test("a clean sheet is told nothing at all", () => {
  assert.deepEqual(buildEmployeeChecks(sheet({
    days: [{ date: "07/16/26", paidHours: 8, mealViolation: false, restViolation: false }],
  })), []);
  assert.deepEqual(buildEmployeeChecks(null), [], "and a missing sheet does not throw");
});

test("punches we changed are declared, not slipped in", () => {
  const checks = buildEmployeeChecks(sheet({
    punchCorrections: [{ date: "07/27/26", hoursBefore: 7.17, hoursAfter: 7 }],
  }));
  const c = checks.find((x) => x.kind === "corrected");
  assert.deepEqual(c.rows, [{ date: "07/27/26", before: 7.17, after: 7 }]);
});

// ---------------------------------------------------------------------------
// the schedule has to be found under the OTHER spelling too
//
// The clock and rest reports were converted to resolve a person through their
// portal account; the schedule was left on a plain name lookup and nobody
// noticed. On 07/16-07/31 that cost Ruth Delgado Pineda (Angel elsewhere) and
// Francisco Velasquez (Frank) their schedule cross-check entirely: 97 hours and
// 14 premium hours with no second opinion, and one 5.9-hour punch question that
// nothing could settle. All of it over a spelling.

test("the schedule resolves through the account, like the other two reports", () => {
  const staff = [
    { id: "u1", name: "Ruth Delgado Pineda", preferredFirstName: "Angel" },
    { id: "u2", name: "Jennifer Delgado Pineda" },
  ];
  // the schedule PDF spells her the way the OTHER reports do
  const scheduleNames = ["Delgado Pineda, Angel"];
  const byUser = indexByAccount(scheduleNames, staff);
  const schedules = new Map([[scheduleKey("Delgado Pineda, Angel"), { employee: "Delgado Pineda, Angel" }]]);

  // the timesheet spells her Ruth, so the direct key misses
  assert.equal(schedules.get(scheduleKey("Delgado Pineda, Ruth")) ?? null, null);

  const hit = lookupAcross("Delgado Pineda, Ruth", matchEmployee("Delgado Pineda, Ruth", staff), {
    get: (k) => schedules.get(k) || null,
    keyOf: scheduleKey,
    byUser,
  });
  assert.ok(hit.value, "her schedule has to be found under Angel");
  assert.equal(hit.via, "Delgado Pineda, Angel", "and the screen must be able to say which spelling");
});

test("a schedule found under an exact name reports no alias", () => {
  const staff = [{ id: "u1", name: "Kristy Hatt" }];
  const schedules = new Map([[scheduleKey("Hatt, Kristy"), { employee: "Hatt, Kristy" }]]);
  const hit = lookupAcross("Hatt, Kristy", matchEmployee("Hatt, Kristy", staff), {
    get: (k) => schedules.get(k) || null,
    keyOf: scheduleKey,
    byUser: indexByAccount(["Hatt, Kristy"], staff),
  });
  assert.ok(hit.value);
  assert.equal(hit.via, null, "nothing to say when the name matched outright");
  assert.equal(hit.exact, true);
});

test("a schedule is never handed to the wrong person of the same surname", () => {
  // the guard that makes the loose matching safe at all
  const staff = [
    { id: "u1", name: "Ruth Delgado Pineda" },
    { id: "u2", name: "Jennifer Delgado Pineda" },
  ];
  const schedules = new Map([[scheduleKey("Delgado Pineda, Jennifer"), { employee: "Delgado Pineda, Jennifer" }]]);
  const hit = lookupAcross("Delgado Pineda, Ruth", matchEmployee("Delgado Pineda, Ruth", staff), {
    get: (k) => schedules.get(k) || null,
    keyOf: scheduleKey,
    byUser: indexByAccount(["Delgado Pineda, Jennifer"], staff),
  });
  assert.equal(hit.value, null, "Ruth must never be given Jennifer's schedule");
});

// ---------------------------------------------------------------------------
// what the checks screen SAYS about a flagged day
//
// These exist because the screen crashed on every batch that already existed.
// The label was a chain of ternaries in the JSX, and
// `row.effect?.restPremium !== "same"` is TRUE when effect is missing, so the
// branch ran and dereferenced it. Build, lint and 68 tests all passed.
//
// The shapes below are the ones that actually turn up in storage, including the
// old ones. If a row shape can reach the screen, it belongs here.
const REPAIR = { hours: 7, punches: [], applied: ["swapped a break's two times"] };

test("screen: a day stored before `effect` existed does not blow up", () => {
  // THE ONE THAT BROKE. No effect key at all - it must read as "we don't know",
  // never as "a premium moved".
  const say = describePunchIssue({ date: "07/27/26", hoursNow: 7.17, suggestion: REPAIR }, 7);
  assert.equal(say.tone, "repair");
  assert.equal(say.restPremium, null, "no reading is not the same as a change");
  assert.equal(say.mealPremium, null);
  assert.equal(say.hours, 7);
  assert.equal(say.was, 7.17);
});

test("screen: a premium change is named when we actually know", () => {
  const say = describePunchIssue(
    {
      date: "07/27/26", hoursNow: 7.17, suggestion: REPAIR,
      effect: { hours: -0.17, restPremium: "removed", mealPremium: "same", changesNothing: false },
    },
    7,
  );
  assert.equal(say.tone, "repair");
  assert.equal(say.restPremium, "removed");
  assert.equal(say.mealPremium, null, "unchanged premiums stay quiet");
});

test("screen: a repair that moves nothing is inert and stays shut", () => {
  const say = describePunchIssue({
    date: "07/28/26", hoursNow: 6.5, suggestion: { ...REPAIR, hours: 6.5 },
    effect: { hours: 0, restPremium: "same", mealPremium: "same", changesNothing: true },
  }, 6);
  assert.equal(say.tone, "inert");
  assert.equal(say.open, false);
});

test("screen: no repair but the schedule agrees reads settled, and stays shut", () => {
  // Rotter 07/28
  const say = describePunchIssue({ date: "07/28/26", hoursNow: 8, suggestion: null }, 8);
  assert.equal(say.tone, "settled");
  assert.equal(say.open, false, "nobody has to act on this one");
  assert.equal(say.hours, 8);
});

test("screen: no repair and no schedule still opens red", () => {
  // Urena 07/27, and the no-schedule case
  assert.equal(describePunchIssue({ hoursNow: 8.25, suggestion: null }, 7.92).tone, "human");
  assert.equal(describePunchIssue({ hoursNow: 8.25, suggestion: null }, null).tone, "human");
  assert.equal(describePunchIssue({ hoursNow: 8.25, suggestion: null }, null).open, true);
});

test("screen: every stored row shape produces a label without throwing", () => {
  // the crash was a shape nobody had rendered. so: throw the whole cross product
  // at it, including the half-populated ones.
  const shapes = [
    {},
    { hoursNow: 8 },
    { hoursNow: 8, suggestion: null },
    { hoursNow: 8, suggestion: REPAIR },
    { hoursNow: 8, suggestion: REPAIR, effect: null },
    { hoursNow: 8, suggestion: REPAIR, effect: {} },
    { hoursNow: 8, suggestion: { hours: 8 }, effect: { changesNothing: true } },
    { hoursNow: 8, suggestion: { hours: 8, applied: undefined } },
    { hoursNow: undefined, suggestion: null },
  ];
  for (const s of shapes) {
    for (const sched of [null, undefined, 8, 7.5]) {
      const say = describePunchIssue(s, sched);
      assert.ok(say, `no label for ${JSON.stringify(s)} @ ${sched}`);
      assert.ok(
        ["repair", "inert", "settled", "human"].includes(say.tone),
        `bad tone ${say.tone} for ${JSON.stringify(s)}`,
      );
      // the screen calls .join on this whenever tone is "repair"
      if (say.tone === "repair") assert.ok(Array.isArray(say.applied));
    }
  }
  assert.equal(describePunchIssue(null), null);
});

// ---------------------------------------------------------------------------
// THE PIPELINE, end to end
//
// Every browser-shaped check passed the day the apply step shipped doing
// nothing. The parse worked, the schedule matched, the repairs were found, the
// flags cleared, the corrections were recorded on the sheet - and not one hour
// moved, because the repaired days still hit the floor at QSP's printed figure.
// No screen would have caught that. Only asserting the figures does.
//
// Fixture is Zuchniak's real shape off 07/16-07/31: 10:00a-12:10p then
// 12:00p-1:00p, two pairs overlapping by ten minutes, printed by QSP as 8.17.
//
//   8a -> 12:10p   250 min        the noon break's two times went in reversed,
//   12p -> 2p      120 min        so these two pairs overlap 12:00-12:10 and
//   2:30p -> 4:30p 120 min        the same ten minutes are billed twice
//                  ------- 490 min = 8.17, which is what QSP prints
//
// read the other way it is 8:00a-12:00p, a ten minute rest, 12:10p-2:00p, a
// meal, then 2:30p-4:30p = 480 min = exactly 8.00, which the schedule says.
const zDay = (date) => ({
  date,
  punches: [
    { min: 480, raw: "8a" }, { min: 730, raw: "12:10p" },
    { min: 720, raw: "12p" }, { min: 840, raw: "2p" },
    { min: 870, raw: "2:30p" }, { min: 990, raw: "4:30p" },
  ],
  printed: { daily: 8.17 },
});
const zSchedule = (date) => ({ date, workHours: 8 });
const PERIOD = { from: "07/16/26", to: "07/17/26" };

function runPipeline({ days, schedule }) {
  const parsed = { employee: "Zuchniak, Mariel", payPeriod: PERIOD, days };
  const first = analyzeTimesheet(parsed);
  const repair = repairConfirmedDays(parsed.days, first.days, schedule, analyzeDay);
  const final = repair.corrections.length
    ? analyzeTimesheet({ ...parsed, days: repair.days })
    : first;
  return { before: first, after: final, corrections: repair.corrections };
}

test("pipeline: a schedule-confirmed repair actually moves the hours", () => {
  const dates = ["07/16/26", "07/17/26"];
  const out = runPipeline({
    days: dates.map(zDay),
    schedule: dates.map(zSchedule),
  });

  assert.equal(out.corrections.length, 2, "both days confirmed by the schedule");
  assert.ok(
    Math.abs(out.before.totals.paidHours - 16.34) < 0.02,
    `as exported it reads 16.34, got ${out.before.totals.paidHours}`,
  );
  // THE ASSERTION THAT WOULD HAVE CAUGHT IT
  assert.ok(
    Math.abs(out.after.totals.paidHours - 16) < 0.02,
    `the repair has to reach the total, got ${out.after.totals.paidHours}`,
  );
  for (const d of out.after.days) {
    assert.ok(Math.abs(d.paidHours - 8) < 0.01, `${d.date} should be 8.00, got ${d.paidHours}`);
  }
});

test("pipeline: the overtime that only existed because of the double count goes", () => {
  // 8.17 tips past 8 and books 0.17 of daily OT. Corrected, the day is exactly
  // 8.00 and the OT was never real. On the live batch this removed every one of
  // Zuchniak's 1.19 OT hours.
  const dates = ["07/16/26", "07/17/26"];
  const out = runPipeline({ days: dates.map(zDay), schedule: dates.map(zSchedule) });

  assert.ok(out.before.totals.otHours > 0.3, "as exported both days carry OT");
  assert.equal(out.after.totals.otHours, 0, "corrected, there is none");
});

test("pipeline: a repaired day's punch times match its own hours", () => {
  // suggestPunches swaps the .min values and leaves .raw where it was, so a
  // repaired sheet can print the ORIGINAL times beside corrected hours. The
  // renderer prints raw, so this is what the reader would actually see.
  const out = runPipeline({ days: [zDay("07/16/26")], schedule: [zSchedule("07/16/26")] });
  const day = out.after.days[0];

  const raws = day.punches.map((p) => p.raw);
  assert.deepEqual(raws, ["8a", "12p", "12:10p", "2p", "2:30p", "4:30p"]);

  // and the printed strings have to agree with the figure beside them
  const mins = day.punches.map((p) => p.min);
  assert.deepEqual(mins, [480, 720, 730, 840, 870, 990], "raw and min must not disagree");
});

test("pipeline: no schedule means nothing is applied", () => {
  const out = runPipeline({ days: [zDay("07/16/26")], schedule: null });
  assert.equal(out.corrections.length, 0);
  assert.ok(
    Math.abs(out.after.totals.paidHours - 8.17) < 0.01,
    "with no second opinion the day stands as QSP printed it",
  );
});

test("pipeline: a schedule that disagrees with the repair blocks it", () => {
  // the schedule says 8.17 too, so the repair is not corroborated and the day is
  // left alone. This is the 15-of-24 case that makes blanket repair unsafe.
  const out = runPipeline({
    days: [zDay("07/16/26")],
    schedule: [{ date: "07/16/26", workHours: 8.17 }],
  });
  assert.equal(out.corrections.length, 0);
  assert.ok(Math.abs(out.after.totals.paidHours - 8.17) < 0.01);
});

test("pipeline: premiums are unchanged by a repair", () => {
  // the repair moves hours, never what someone is owed. On the live batch all
  // nine confirmed repairs left every premium exactly where it was.
  const dates = ["07/16/26", "07/17/26"];
  const out = runPipeline({ days: dates.map(zDay), schedule: dates.map(zSchedule) });
  assert.equal(out.after.premiums.totalHours, out.before.premiums.totalHours);
  assert.deepEqual(out.after.premiums.mealDays, out.before.premiums.mealDays);
  assert.deepEqual(out.after.premiums.restDays, out.before.premiums.restDays);
});

test("pipeline: a repaired day stops being flagged", () => {
  const out = runPipeline({ days: [zDay("07/16/26")], schedule: [zSchedule("07/16/26")] });
  assert.ok(reviewSheet(out.before.days, analyzeDay).length > 0, "flagged before");
  assert.equal(reviewSheet(out.after.days, analyzeDay).length, 0, "and not after");
});

// ---------------------------------------------------------------------------
// only a repair a second document confirms may be applied on its own
//
// The numbers in these cases are the real ones off 07/16-07/31. The whole point
// of the rule is that "always assume a reversal" was measured and found wrong on
// 15 of 24 judgeable days, so the cases that must NOT auto-apply matter more
// than the ones that must.
const revRow = (over) => ({
  date: "07/27/26",
  anomalies: [{ kind: "reversed_break", at: 1 }],
  hoursNow: 7.17,
  suggestion: { hours: 7, rests: 1 },
  ...over,
});

test("a flag whose repair moves no figure is marked as such", () => {
  // Mánu's real 07/28. The punches are genuinely out of order, but reading them
  // either way gives 6.50 hrs and the same premiums, so there is nothing for a
  // person to decide. It used to present exactly like a day that was hours out.
  const punches = [at(10), at(12), at(12, 10), at(12), at(12, 15), at(14, 15), at(14, 30), at(16, 30)];
  const [row] = reviewSheet([{ date: "07/28/26", punches, restRecorded: 1 }], analyzeDay);

  assert.ok(row.suggestion, "a repair is still offered");
  assert.equal(row.effect.hours, 0, "the day pays the same either way");
  assert.equal(row.effect.restPremium, "same");
  assert.equal(row.effect.mealPremium, "same");
  assert.equal(row.effect.changesNothing, true);
});

test("a flag that DOES move a figure is not marked inert", () => {
  // Mánu's 07/31: the same shape, but this one is worth 0.17 hrs.
  const punches = [at(8), at(9, 30), at(10), at(12), at(12, 10), at(12), at(13), at(16)];
  const [row] = reviewSheet([{ date: "07/31/26", punches, restRecorded: 1 }], analyzeDay);

  assert.ok(row.effect.hours > 0, `expected a gain, got ${row.effect.hours}`);
  assert.equal(row.effect.changesNothing, false);
});

test("a day with no safe reading carries no effect at all", () => {
  // Aranda 07/16, off the real export. The obvious swap doesn't clear the day,
  // so no repair is offered and there is nothing to describe the effect of.
  // A muted "pays the same either way" on one of these would be a lie.
  const punches = [
    at(9), at(10), at(10), at(12, 30), at(12, 30), at(13),
    at(13), at(15), at(15, 10), at(14, 30), at(14, 30), at(17),
  ];
  const [row] = reviewSheet([{ date: "07/16/26", punches }], analyzeDay);
  assert.equal(row.needsHuman, true, "this one genuinely needs a person");
  assert.equal(row.suggestion, null);
  assert.equal(row.effect, null);
});

test("an unrepairable day the schedule already settles is not left shouting", () => {
  // B. Rotter 07/28, off the real export. Five pairs, one running 30 minutes
  // backwards, and no single swap clears it - fixing the backwards pair creates
  // a reversed break after it. Her day still comes to 8.00 and her schedule
  // says 8.00 too, and the timesheet was generated from it.
  const punches = [
    at(9), at(11, 30), at(11, 30), at(11), at(11, 10),
    at(14), at(14, 30), at(17, 20), at(17, 30), at(17, 30),
  ];
  const [row] = reviewSheet([{ date: "07/28/26", punches }], analyzeDay);

  assert.equal(row.needsHuman, true, "no repair holds up, which is correct");
  assert.ok(Math.abs(row.hoursNow - 8) < 0.01, `expected 8.00, got ${row.hoursNow}`);
  assert.equal(scheduleAgreesWithCurrent(row, 8), true, "but the schedule settles the total");
});

test("a day the schedule does NOT settle keeps shouting", () => {
  // Urena 07/27: no repair on offer and the schedule says 7.92 against our 8.25.
  // This is one of the three that genuinely needs a person.
  const row = { date: "07/27/26", hoursNow: 8.25, suggestion: null, needsHuman: true };
  assert.equal(scheduleAgreesWithCurrent(row, 7.92), false);
});

test("a day with a credible repair is never marked settled", () => {
  // that case is described by `effect`, not by this. offering both readings at
  // once would be two different answers on the same card.
  const row = { date: "07/27/26", hoursNow: 7.17, suggestion: { hours: 7 } };
  assert.equal(scheduleAgreesWithCurrent(row, 7.17), false);
});

test("no schedule for the day settles nothing", () => {
  const row = { date: "07/19/26", hoursNow: 7.28, suggestion: null, needsHuman: true };
  assert.equal(scheduleAgreesWithCurrent(row, null), false);
  assert.equal(scheduledPaidHours(null), null);
  assert.equal(scheduledPaidHours({ shifts: [] }), null);
});

test("scheduled paid hours leave the meal out", () => {
  // same figure compareToSchedule builds, so the two can be compared at all
  const entry = {
    shifts: [
      { minutes: 150, meal: false },
      { minutes: 150, meal: false },
      { minutes: 30, meal: true },
      { minutes: 180, meal: false },
    ],
  };
  assert.equal(scheduledPaidHours(entry), 8);
});

test("a repaired day is exempt from the floor at QSP's printed figure", () => {
  // Mánu's real 07/27. The two middle punches are reversed, so 10:00a-12:10p and
  // 12:00p-2:00p overlap and the same ten minutes are billed twice. QSP printed
  // 7.17 off those same punches.
  const punches = [at(10), at(12, 10), at(12), at(14), at(14, 30), at(17, 30)];
  const printed = { daily: 7.17 };

  const asExported = analyzeDay({ date: "07/27/26", punches, printed });
  assert.ok(Math.abs(asExported.paidHours - 7.17) < 0.01, "reproduces QSP exactly");

  // repaired, but still carrying QSP's printed figure: the floor would undo it
  const fixed = suggestPunches({ punches }).punches;
  const floored = analyzeDay({ date: "07/27/26", punches: fixed, printed });
  assert.ok(
    Math.abs(floored.paidHours - 7.17) < 0.01,
    "without the exemption the floor puts the double count straight back",
  );

  // with the exemption it lands on the true figure, which the schedule agrees with
  const repaired = analyzeDay({ date: "07/27/26", punches: fixed, printed, repaired: true });
  assert.ok(
    Math.abs(repaired.paidHours - 7) < 0.01,
    `a repaired day may pay under the export, got ${repaired.paidHours}`,
  );
});

test("the floor still protects every day we did NOT repair", () => {
  // the guard exists because QSP rounds each segment its own way and ours can
  // land a hundredth short. that must keep working for ordinary days.
  const punches = [at(8), at(12), at(12, 30), at(16, 30)];
  const d = analyzeDay({ date: "07/20/26", punches, printed: { daily: 8.25 } });
  assert.equal(d.paidHours, 8.25, "an unrepaired day never pays under the export");
});

test("a reversal the schedule agrees with is confirmed", () => {
  // Mánu's own 07/27: 10:00a-12:10p and 12:00p-2:00p overlap, so ten minutes
  // are billed twice. Schedule says 7.00 and so does the repair.
  assert.equal(scheduleConfirmsRepair(revRow(), 7), true);
});

test("a reversal the schedule contradicts is NOT confirmed", () => {
  // Devine 07/23: swapping would cut a 9.00 hr day to 4.67 and the schedule
  // says 9.00. This is the case that makes blanket auto-repair unsafe.
  const devine = revRow({ date: "07/23/26", hoursNow: 9, suggestion: { hours: 4.67, rests: 1 } });
  assert.equal(scheduleConfirmsRepair(devine, 9), false);
});

test("a small change is not the same as a safe one", () => {
  // Aranda 07/21 moves the day by 0.08 and is still wrong - the schedule backs
  // the figure we already hold. Nothing may key off the size of the change.
  const aranda = revRow({ hoursNow: 8.08, suggestion: { hours: 8, rests: 1 } });
  assert.equal(scheduleConfirmsRepair(aranda, 8.08), false);
});

test("no schedule means no automatic repair", () => {
  // Delgado Pineda 07/19 has no schedule row at all, and the repair would take
  // her from 7.28 to 1.38. With no second opinion it must stay a suggestion.
  const ruth = revRow({ hoursNow: 7.28, suggestion: { hours: 1.38, rests: 0 } });
  assert.equal(scheduleConfirmsRepair(ruth, null), false);
  assert.deepEqual(confirmedRepairs([ruth], {}), []);
});

test("a schedule that agrees with both figures settles nothing", () => {
  const row = revRow({ hoursNow: 7, suggestion: { hours: 7, rests: 1 } });
  assert.equal(scheduleConfirmsRepair(row, 7), false);
});

test("only the reversed-break shape can auto-apply", () => {
  // a backwards segment is a different animal, and none were confirmed on the
  // real period. it stays a suggestion however well the schedule lines up.
  const backwards = revRow({ anomalies: [{ kind: "backwards_segment", at: 0 }] });
  assert.equal(scheduleConfirmsRepair(backwards, 7), false);
  // and a day carrying a reversal PLUS something else is not a clean case
  const mixed = revRow({
    anomalies: [{ kind: "reversed_break", at: 1 }, { kind: "long_segment", at: 0 }],
  });
  assert.equal(scheduleConfirmsRepair(mixed, 7), false);
});

test("a day with no credible repair is never confirmed", () => {
  assert.equal(scheduleConfirmsRepair(revRow({ suggestion: null }), 7), false);
});

test("confirmedRepairs picks out only the corroborated days", () => {
  const rows = [
    revRow(),
    revRow({ date: "07/23/26", hoursNow: 9, suggestion: { hours: 4.67, rests: 1 } }),
    revRow({ date: "07/30/26", hoursNow: 8.34, suggestion: { hours: 8, rests: 2 } }),
  ];
  const got = confirmedRepairs(rows, { "07/27/26": 7, "07/23/26": 9, "07/30/26": 8 });
  assert.deepEqual(got.map((r) => r.date), ["07/27/26", "07/30/26"]);
});

// ---------------------------------------------------------------------------
// the PDF parsers must not eat the caller's bytes
//
// pdfjs takes ownership of the array it's handed and DETACHES the buffer. the
// upload parses the timesheet and then uploads the same array to Blob, so this
// silently wrote a zero-byte file for every batch ever uploaded, and "open the
// QSP export at this page" opened a 0-page PDF. nothing caught it: it builds,
// it lints, the parse works fine, and the batch page looks completely normal.
// the only visible symptom is a blank PDF viewer.
async function tinyPdf() {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]).drawText("x", { x: 10, y: 10, size: 12 });
  return new Uint8Array(await doc.save());
}

for (const [name, parse] of [
  ["parseTimesheetPdf", parseTimesheetPdf],
  ["parseSchedulePdf", parseSchedulePdf],
]) {
  test(`${name} leaves the caller's bytes intact`, async () => {
    const bytes = await tinyPdf();
    const before = bytes.length;
    assert.ok(before > 0);

    // it may well throw - a blank page is not a QSP export. the point is what
    // the array looks like afterwards, not whether the parse succeeded.
    try {
      await parse(bytes);
    } catch {
      // expected for a document with no timesheet in it
    }

    assert.equal(bytes.length, before, `${name} detached the caller's buffer`);
    assert.equal(
      Buffer.from(bytes).length,
      before,
      "the bytes have to still be uploadable to Blob after parsing",
    );
  });
}

test("hours are never touched by the rest report", () => {
  // two ten-minute gaps: enough rests by the punches, one short by the report.
  // The violation moves, the hours must not - the ten minutes stay paid time
  // either way, because that comes off the timesheet.
  const punches = [at(8), at(11), at(11, 10), at(14), at(14, 10), at(17)];
  const a = restDay(punches, null);
  const b = restDay(punches, 1);
  const c = restDay(punches, 2);
  for (const x of [b, c]) {
    assert.equal(a.paidHours, x.paidHours, "paid hours come from the timesheet, full stop");
    assert.equal(a.workedMin, x.workedMin);
    assert.equal(a.restMin, x.restMin, "and the rest time added back is unchanged");
  }
  assert.equal(a.restViolation, true);
  assert.equal(c.restViolation, false, "only the violation moves");
});
