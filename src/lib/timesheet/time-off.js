// PTO AND SICK TIME THE SCHEDULE IS MISSING, asked on the day-program review.
//
// The day program has no export that carries time off - a PTO day is a day
// QSP prints nothing for - so the one person who reliably knows it happened is
// the person signing the sheet. This asks them. Their answer is a CLAIM on the
// correction row, never the record: the PtoEntry row only exists once someone
// with timesheet access accepts it on the calendar, the same rule every other
// correction follows ("nothing in here changes a figure on its own").
//
// ONE PLACE DECIDES WHAT THE QUESTION IS, the same reason questions.js gives:
// the card renders from this, the server action validates against this, and
// both emails word their lines from this. Client-safe on purpose - no parse.js,
// no prisma - so the card can import it without dragging the engine along.

const r2 = (n) => Math.round((n || 0) * 100) / 100;

// the kind the TimesheetCorrection row carries. Not "q_" prefixed: it is not
// an engine question and must never enter the buildQuestions machinery.
export const TIME_OFF_KIND = "time_off";

// its status. Distinct from "open" (which blocks signing - this never does)
// and from "accepted"/"declined" (which reviewChoices reads as review answers).
export const TIME_OFF_STATUS = "noted";

// what a day of time off can be. The label is what every surface prints.
export const TIME_OFF_TYPES = { pto: "PTO", sick: "Sick" };

// THE SHEET'S OWN SENTENCE for recorded time off, matching the mileage line
// it sits beside: "8.00 hrs PTO (08/18/26) - 8.00 hrs Sick (08/21/26)".
// Approved off the mock 2026-09-02. One entry per PtoEntry row, dot-joined -
// a person rarely holds more than a day or two in a fortnight.
const f2 = (n) => (Math.round((n || 0) * 100) / 100).toFixed(2);
export function timeOffLine(entries) {
  const parts = (entries || [])
    .filter((e) => e && Number(e.hours) > 0 && e.date)
    .map((e) => `${f2(e.hours)} hrs ${TIME_OFF_TYPES[e.kind] || "PTO"} (${e.date})`);
  return parts.length ? parts.join(" · ") : null;
}

// THE MISC-CLASSIFIED TIME OFF INSIDE A SHEET'S OWN HOURS. An MLS Misc block
// answered or classified as PTO or sick is already paid time in QSP's
// printed figures - Malacova's 88 holds her eleven PTO days - so on the
// payout surfaces those hours MOVE columns (out of worked, into PTO/Sick)
// rather than adding: payroll keys each bucket under its own code and sick
// balances track, and Total payable cannot change by construction. The day
// program's nominal-punch PTO days (isPto/ptoHours) ride the same way.
// Mánu 2026-09-03: "does ILS show the sick pay and PTO in the reports based
// off of what chosen for misc?" - it did not, and now it does.
export function miscTimeOffHours(days) {
  let pto = 0;
  let sick = 0;
  for (const d of days || []) {
    if (d?.miscKind === "pto") pto += (d.miscMin || 0) / 60;
    else if (d?.miscKind === "sick") sick += (d.miscMin || 0) / 60;
    if (d?.isPto) pto += d.ptoHours || 0;
  }
  return { pto: r2(pto), sick: r2(sick), total: r2(pto + sick) };
}

// the payout report's split: PTO and Sick summed apart, because payroll keys
// each under its own code, plus the total that joins Total payable.
export function timeOffTotals(entries) {
  let pto = 0;
  let sick = 0;
  for (const e of entries || []) {
    const h = Number(e?.hours);
    if (!Number.isFinite(h) || h <= 0) continue;
    if (e.kind === "sick") sick += h;
    else pto += h;
  }
  return { pto: r2(pto), sick: r2(sick), total: r2(pto + sick) };
}

export const isTimeOffType = (k) =>
  Object.prototype.hasOwnProperty.call(TIME_OFF_TYPES, k);

// "sick" reads wrong as a bare noun in a sentence ("8 hours of Sick"), so
// sentences get their own word for it.
const sentenceWord = (kind) => (kind === "sick" ? "sick time" : "PTO");

// "07/16/26" -> Date. QSP prints 2-digit years, always 20xx - the same rule
// parseSheetDate applies everywhere else.
function sheetDate(mmddyy) {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(mmddyy || "");
  if (!m) return null;
  return new Date(2000 + +m[3], +m[1] - 1, +m[2]);
}

const pad = (n) => String(n).padStart(2, "0");

// every date of the pay period, in the sheet's own "MM/DD/YY" format - the day
// list the card offers. Off the PERIOD and not off the sheet's days, because a
// PTO day is usually exactly a day the sheet has no row for. Capped at 62 so a
// malformed period cannot build an unbounded list.
export function periodDates(periodFrom, periodTo) {
  const from = sheetDate(periodFrom);
  const to = sheetDate(periodTo);
  if (!from || !to || to < from) return [];
  const out = [];
  for (let d = new Date(from); d <= to && out.length < 62; d.setDate(d.getDate() + 1)) {
    out.push(`${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${String(d.getFullYear()).slice(2)}`);
  }
  return out;
}

// what the server will store from what a browser sent: dates inside the
// period, a known type, hours a day can actually hold. One entry per day -
// the PtoEntry key it may become allows no more - so a duplicate date is
// dropped rather than letting the second row shadow the first.
export function cleanTimeOffEntries(raw, periodFrom, periodTo) {
  const days = new Set(periodDates(periodFrom, periodTo));
  const seen = new Set();
  const out = [];
  for (const e of Array.isArray(raw) ? raw.slice(0, 40) : []) {
    const date = String(e?.date || "");
    const kind = String(e?.kind || "");
    const hours = Number(e?.hours);
    if (!days.has(date) || seen.has(date)) continue;
    if (!isTimeOffType(kind)) continue;
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) continue;
    seen.add(date);
    out.push({ date, kind, hours: r2(hours) });
  }
  out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return out;
}

// "8" not "8.00", "4.5" not "4.50" - hours in a sentence, not in a table.
export const fmtTimeOffHours = (h) => String(r2(h));

const hoursPhrase = (e) =>
  `${fmtTimeOffHours(e.hours)} ${e.hours === 1 ? "hour" : "hours"} of ${sentenceWord(e.kind)}`;

// the one time_off row among a sheet's corrections, or null
export function timeOffAnswerOf(corrections) {
  return (corrections || []).find((c) => c?.kind === TIME_OFF_KIND) || null;
}

// the review-email items a time_off answer adds, in reviewChoices' own shape:
// [{ date, said, changes: [{ fact, action }] }]. Only a "yes" with entries
// says anything - a "no" agrees with the schedule and gets no line, the same
// rule qsp-changes.js applies to answers that agree with the record. `said` is
// the receipt in the employee's direction; `fact` and `action` are worded
// without "you" because the same fact line reaches both inboxes.
export function timeOffReviewItems(corrections) {
  const row = timeOffAnswerOf(corrections);
  if (!row || row.choice !== "yes") return [];
  const entries = Array.isArray(row.timeOff) ? row.timeOff : [];
  return entries
    .filter((e) => e?.date && isTimeOffType(e.kind) && Number(e.hours) > 0)
    .map((e) => ({
      date: e.date,
      said: `You said this day held ${hoursPhrase(e)} that is not on the schedule.`,
      changes: [{
        fact: `${hoursPhrase(e)} on this day is not on the schedule.`,
        action: "Add it to the schedule.",
      }],
      // for the corrections desk's marks - see reviewChoices
      correctionId: row.id,
    }));
}
