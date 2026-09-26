// TIME OFF ON THE DAY CALENDAR: sick pay or PTO on a day that's known, drawn
// as a card placed beside the day's work and faded at both ends, because the
// hours were placed, not recorded.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { placeTimeOff, timeOffByDate, TIME_OFF_DEFAULT_START, TIME_OFF_EARLIEST } from "../time-off.js";

const read = (p) => fs.readFileSync(p, "utf8");
const page = read("src/app/t/[token]/page.js");
const byDay = read("src/app/t/[token]/DayByDay.js");
const cal = read("src/app/t/[token]/DayCalendar.js");
const css = read("src/app/t/[token]/ReviewFlow.module.css");
const globals = read("src/app/globals.css");
const at = (h, m = 0) => h * 60 + m;

test("it ends where the day's first shift starts: an admin hour at 5, five hours of sick pay, 12 to 5", () => {
  assert.deepEqual(placeTimeOff([{ from: at(17), to: at(18) }], 5), { from: at(12), to: at(17) });
  // the first shift is the earliest one, whatever order they come in
  assert.deepEqual(placeTimeOff([{ from: at(16), to: at(18) }, { from: at(13), to: at(15) }], 3), { from: at(10), to: at(13) });
  // part hours
  assert.deepEqual(placeTimeOff([{ from: at(14), to: at(16) }], 4.5), { from: at(9, 30), to: at(14) });
});

test("an unscheduled gap between shifts long enough to hold it comes first, from its start", () => {
  // training 9-10, admin 3:30-4, four hours of sick pay: 10 to 2, in the gap
  assert.deepEqual(placeTimeOff([{ from: at(9), to: at(10) }, { from: at(15, 30), to: at(16) }], 4), { from: at(10), to: at(14) });
  // exactly the gap's length fills it
  assert.deepEqual(placeTimeOff([{ from: at(9), to: at(10) }, { from: at(14), to: at(16) }], 4), { from: at(10), to: at(14) });
  // the first gap that fits, not the first gap
  assert.deepEqual(
    placeTimeOff([{ from: at(8), to: at(9) }, { from: at(10), to: at(11) }, { from: at(16), to: at(17) }], 3),
    { from: at(11), to: at(14) },
  );
  // too short a gap: the rule before it
  assert.deepEqual(placeTimeOff([{ from: at(13), to: at(15) }, { from: at(16), to: at(18) }], 3), { from: at(10), to: at(13) });
  // two bookings over each other are not a gap
  assert.deepEqual(placeTimeOff([{ from: at(9), to: at(13) }, { from: at(10), to: at(12) }, { from: at(18), to: at(19) }], 5), { from: at(13), to: at(18) });
});

test("a day with nothing else on it starts at 9:00 AM", () => {
  assert.equal(TIME_OFF_DEFAULT_START, at(9));
  assert.deepEqual(placeTimeOff([], 8), { from: at(9), to: at(17) });
  assert.deepEqual(placeTimeOff(null, 2), { from: at(9), to: at(11) });
});

test("before 6:00 AM is too early, so it follows the last shift instead", () => {
  assert.equal(TIME_OFF_EARLIEST, at(6));
  assert.deepEqual(placeTimeOff([{ from: at(7), to: at(10) }], 4), { from: at(10), to: at(14) });
  // starting exactly at 6 is fine
  assert.deepEqual(placeTimeOff([{ from: at(10), to: at(12) }], 4), { from: at(6), to: at(10) });
  // neither fits the day: before the first shift, from midnight at the earliest
  assert.deepEqual(placeTimeOff([{ from: at(2), to: at(23) }], 5), { from: 0, to: at(5) });
});

test("no hours, no card", () => {
  for (const h of [0, -2, null, undefined, "x", NaN]) assert.equal(placeTimeOff([{ from: at(9), to: at(10) }], h), null, String(h));
});

test("one card a day: the office's entry wins a date the person also named", () => {
  const entries = [{ date: "09/10/26", kind: "sick", hours: 3 }];
  const said = [{
    kind: "time_off", choice: "yes",
    timeOff: [
      { date: "09/10/26", kind: "pto", hours: 8 },
      { date: "09/11/26", kind: "sick", hours: 4.5 },
      { date: "09/12/26", kind: "holiday", hours: 2 },
      { date: "09/13/26", kind: "pto", hours: 0 },
      { kind: "pto", hours: 3 },
    ],
  }];
  assert.deepEqual(timeOffByDate(entries, said), {
    "09/10/26": { kind: "sick", hours: 3, source: "entry" },
    "09/11/26": { kind: "sick", hours: 4.5, source: "said" },
  });
  // a "no" says nothing was taken
  assert.deepEqual(timeOffByDate([], [{ kind: "time_off", choice: "no", timeOff: [{ date: "09/11/26", kind: "sick", hours: 4 }] }]), {});
  assert.deepEqual(timeOffByDate(null, null), {});
});

test("the page fetches the rows once and hands the days to both day lists", () => {
  assert.match(page, /import \{ periodDates, timeOffAnswerOf, timeOffByDate \} from "@\/lib\/timesheet\/time-off";/);
  assert.match(page, /const timeOffDays = timeOffByDate\(timeOffRows, ts\.corrections\);/);
  assert.equal((page.match(/timeOffByDate=\{timeOffDays\}/g) || []).length, 2);
});

test("the day list hands each calendar its day's time off, and a day with only time off draws the calendar", () => {
  assert.match(byDay, /timeOffByDate = \{\},\n\}\) \{/);
  assert.equal((byDay.match(/timeOff=\{timeOffByDate\[day\.date\] \|\| null\}/g) || []).length, 2);
  assert.match(byDay, /const emptyDay = day\.reviewOnly && !span && !timeOffByDate\[day\.date\];/);
});

test("the calendar places the card, sizes the day around it, and draws it faded in leave's colours", () => {
  assert.match(cal, /import \{ placeTimeOff \} from "@\/lib\/timesheet\/time-off";/);
  // a day program day already marked PTO keeps its nominal punches for it
  assert.match(cal, /const off = timeOff && !\(day\.isPto && timeOff\.kind === "pto"\) \? placeTimeOff\(shifts, timeOff\.hours\) : null;\n\s*if \(!shifts\.length && !off\) return null;/);
  // the window takes the card in, and copes with a day that has no shifts
  assert.match(cal, /\.\.\.\(off \? \[\{ min: off\.from, minutes: off\.to - off\.from \}\] : \[\]\)/);
  assert.match(cal, /let lo = shifts\.length \? shifts\[0\]\.from : Infinity;/);
  assert.match(cal, /if \(!Number\.isFinite\(lo\) \|\| !Number\.isFinite\(hi\)\) return \{ from: 9 \* 60, to: 17 \* 60 \};/);
  // the words: the kind and the hours, no times
  assert.match(cal, /const TIME_OFF_LABEL = \{ sick: "Sick pay", pto: "PTO" \};/);
  assert.match(cal, /<span className="tabular-nums">\{Number\(timeOff\.hours\)\.toFixed\(2\)\} hrs<\/span>/);
  // the colours leave already wears, on a wash light enough for 5:1
  assert.match(cal, /sick: \{ edge: "var\(--leave-sick\)", wash: "color-mix\(in srgb, var\(--leave-sick\) 24%, transparent\)", ink: "var\(--leave-sick-ink\)" \}/);
  assert.match(cal, /pto: \{ edge: "var\(--leave-pto\)", wash: "color-mix\(in srgb, var\(--leave-pto\) 24%, transparent\)", ink: "var\(--leave-pto-ink\)" \}/);
  assert.match(cal, /\$\{reviewStyles\.timeOffCard\}/);
  // and the screen reader hears the same words
  assert.match(cal, /spoken\(day, shifts, rests, staged, scheduled, off && timeOff, off\)/);
  // a gap the card sits in draws, labels and speaks only what the card leaves
  assert.match(cal, /\.\.\.gapsOf\(day, shifts, scheduled\)\.flatMap\(\(g\) => \{\n\s*const left = gapLeftBy\(g, off\);/);
  assert.match(cal, /const left = gapLeftBy\(whole, off\);\n\s*if \(!left\) continue;/);
  assert.match(cal, /if \(timeOff\) bits\.push\(`\$\{timeOff\.kind === "sick" \? "sick pay" : "PTO"\}, \$\{Number\(timeOff\.hours\)\.toFixed\(2\)\} hours`\);/);
});

test("the card fades out at both ends, and PTO's words have a darker cut in light", () => {
  assert.match(css, /\.timeOffCard \{\n\s*-webkit-mask-image: linear-gradient\(to bottom, transparent 0, #000 min\(44px, 28%\), #000 calc\(100% - min\(44px, 28%\)\), transparent 100%\);/);
  assert.match(globals, /--leave-pto-ink: #5b3f86;/);
  assert.match(globals, /--leave-pto-ink: #c7b1ed;/);
});
