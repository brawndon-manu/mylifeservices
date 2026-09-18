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

// WHAT THE PAYOUT PAYS AS TIME OFF, from every record of it at once.
//
// THREE SOURCES AND THEY ARE NOT THE SAME KIND OF THING, which is the whole
// reason this is one function rather than a sum at four call sites:
//
//   misc      classified inside the sheet's own hours. Already paid in QSP's
//             printed figures, so it MOVES columns - out of worked, into
//             PTO/Sick - and Total payable cannot change by construction.
//   calendar  PtoEntry rows, typed on the Calendar screen. Nothing else knows
//             about them, so they ADD.
//   QSP       the SickHr and PTO columns of the payroll report, or the
//             timesheet's own name line where no payroll report was uploaded.
//             `payroll.js` builds `paid` from regular, overtime and double
//             only, so these sit OUTSIDE paid hours and they ADD too.
//
// THE CALENDAR WINS WHERE IT EXISTS. A typed entry is somebody deciding, and
// the automatic figure is a default - the same precedence `qspSick` itself
// already uses, where the payroll report beats the name line. Summing them
// instead would pay twice for one absence the first time anybody records in
// the calendar what QuickSolve already reports.
//
// WHY QSP JOINED THIS AT ALL: the payout read the calendar and nothing else,
// and the calendar is a day program screen with no agency route into it. So an
// agency period showed 0.00 sick pay while 15 people had 167.37 hours of it
// printed on the timesheets they signed. The note on the query used to say the
// calendar carried this "until QSP catches up"; on sick it has.
export function payoutTimeOff(sheet, cal = null) {
  const misc = miscTimeOffHours(sheet?.data?.days);
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const calPto = n(cal?.pto);
  const calSick = n(cal?.sick);
  const addedPto = calPto > 0 ? calPto : n(sheet?.data?.qspPto);
  const addedSick = calSick > 0 ? calSick : n(sheet?.data?.qspSick);
  return {
    pto: r2(misc.pto + addedPto),
    sick: r2(misc.sick + addedSick),
    total: r2(misc.total + addedPto + addedSick),
    // already inside the sheet's paid hours, so the surfaces subtract it from
    // worked rather than adding it to the bill
    moved: misc.total,
    // outside them, so this is what Total payable grows by
    added: r2(addedPto + addedSick),
    // THE SAME `added`, SPLIT BY KIND. Mánu 2026-09-17: "its just PTO Sick pay"
    // - his own timesheet names them separately rather than lumping them, and
    // they are paid under separate codes with separately tracked balances, so
    // the split has to come from here rather than be re-derived by a screen.
    //
    // NOTHING ELSE MOVES. This is a breakdown of a figure that already existed,
    // so every payout surface reads exactly what it read before.
    //
    // HOLIDAY IS NOT IN IT YET, deliberately. `HolHr` exists on the payroll
    // report, the timesheet PDF has a Holiday column and render.js already
    // prints one - and across 2,668 day rows in seven periods not one carries
    // an hour. Folding an always-zero third bucket into what Total payable
    // grows by would be changing the pay rule for a case nobody has decided.
    addedBy: { pto: r2(addedPto), sick: r2(addedSick) },
  };
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

// THE SAME RULES, BUT SAYING WHAT THEY REJECTED.
//
// Mánu 2026-09-08: "Do not silently drop invalid entries." cleanTimeOffEntries
// FILTERS - a bad row just vanishes and the save reports success, so a person
// who typed three days and fumbled one was told "saved" and given two. The
// only thing that stopped a wholly invalid answer was the empty-list check
// after the fact.
//
// This checks the same conditions in the same order and stops at the first
// row that fails, naming the day so the message can point at it. The screen
// calls it so the employee can fix the row, and the answer action calls it so
// a hand-built request cannot get past it either. cleanTimeOffEntries stays as
// it is - it is the filter this is built on, and its own pins still hold.
export function checkTimeOffEntries(raw, periodFrom, periodTo) {
  const list = Array.isArray(raw) ? raw : [];
  if (!list.length) return { ok: false, code: "empty" };
  if (list.length > 40) return { ok: false, code: "tooMany" };
  const days = new Set(periodDates(periodFrom, periodTo));
  const seen = new Set();
  for (const e of list) {
    const date = String(e?.date || "");
    const kind = String(e?.kind || "");
    const hours = Number(e?.hours);
    if (!days.has(date)) return { ok: false, code: "date", at: date || null };
    if (seen.has(date)) return { ok: false, code: "duplicate", at: date };
    if (!isTimeOffType(kind)) return { ok: false, code: "kind", at: date };
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
      return { ok: false, code: "hours", at: date };
    }
    seen.add(date);
  }
  // every row passed, so the filter cannot drop one and the two agree
  return { ok: true, entries: cleanTimeOffEntries(list, periodFrom, periodTo) };
}

// what to tell the person, per code. One place, so the screen and the action
// cannot describe the same refusal differently.
export function timeOffProblem({ code, at } = {}) {
  const day = at ? `${at}: ` : "";
  switch (code) {
    case "empty":
      return "Add the day you were off.";
    case "tooMany":
      return "That is more days than this period holds.";
    case "date":
      return `${day}that day is not in this pay period.`;
    case "duplicate":
      return `${day}this day is already listed. Change the row it is on.`;
    case "kind":
      return `${day}pick PTO or sick pay.`;
    case "hours":
      return `${day}enter the hours you were off, more than 0 and up to 24.`;
    default:
      return "Check the days you entered.";
  }
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
