// A FULL DAY'S WORK, AS THE EMPLOYEE STATES IT.
//
// Mánu 2026-09-08: an hours correction used to be one number. "Ask for the
// corrected FULL DAY'S work hours, not the difference. Require every start/end
// work slot for that day, including unchanged slots." So a claim on `hours` or
// `day_missing` now carries the whole day's clock times, and the number has to
// agree with them.
//
// THE RULES LIVE HERE AND NOWHERE ELSE. The screen validates so the employee
// can fix it, and the server validates because a screen cannot be trusted. Both
// call this, so they cannot drift apart and a claim cannot arrive with slots
// the server never checked.
//
// NO OVERNIGHT. Every slot starts and ends on the day being corrected, and the
// end is after the start. A shift that genuinely crosses midnight is not this
// form's business - it goes to payroll under "Something else", which is the
// kind that carries a note and no automatic patch.
import { parseLooseTime, formatTimeDisplay } from "../loose-time.js";

const r2 = (n) => Math.round((n || 0) * 100) / 100;

export const MAX_SLOTS = 8;

// minutes past midnight -> "HH:MM", the shape parseLooseTime answers in and
// formatTimeDisplay reads. The engine keeps punch times as minutes and this
// form speaks the string form, so the conversion lives here rather than being
// retyped at each call.
export function minutesToClock(min) {
  if (!Number.isFinite(min)) return "";
  const t = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

// minutes -> "01:15 PM", for reading a slot back
export const clockLabel = (min) => formatTimeDisplay(minutesToClock(min));

// the day's own punch pairs, as slots to edit. `shiftsOf` is the engine's
// reader; this takes its output so the boxes open on exactly what the calendar
// draws, unchanged slots included.
export function slotsFromShifts(shifts) {
  return (shifts || [])
    .filter((s) => Number.isFinite(s?.from) && Number.isFinite(s?.to) && s.to > s.from)
    .map((s) => ({ from: clockLabel(s.from), to: clockLabel(s.to) }));
}

// one raw {from,to} as typed -> minutes, or null on either side.
export function readSlot(raw) {
  // parseLooseTime answers "" for unreadable, which slips through `== null`
  const from = parseLooseTime(raw?.from || "", { assumeWorkday: true }) || null;
  const to = parseLooseTime(raw?.to || "", { assumeWorkday: true }) || null;
  return { from, to };
}

const toMin = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// THE WHOLE CHECK. Returns { ok, code, message, minutes, hours, slots }.
// `slots` is the structured claim - minutes in, ready to store - and is only
// present once every slot reads clean.
export function checkWorkSlots(rawSlots, claimedHours) {
  const list = (rawSlots || []).filter((s) => (s?.from || "").trim() || (s?.to || "").trim());
  const target = Number(claimedHours);

  if (!list.length) {
    return { ok: false, code: "noSlots", message: "Add the day's work slots." };
  }
  if (list.length > MAX_SLOTS) {
    return { ok: false, code: "tooMany", message: `A day takes up to ${MAX_SLOTS} work slots.` };
  }
  if (claimedHours == null || claimedHours === "" || !Number.isFinite(target) || target <= 0 || target > 24) {
    return {
      ok: false,
      code: "badHours",
      message: "Enter the day's work hours, more than 0 and up to 24.",
    };
  }

  const parsed = [];
  for (const raw of list) {
    const { from, to } = readSlot(raw);
    if (from == null || to == null) {
      return { ok: false, code: "incomplete", message: "Every work slot needs a start and an end." };
    }
    const a = toMin(from);
    const b = toMin(to);
    if (a == null || b == null) {
      return { ok: false, code: "incomplete", message: "Every work slot needs a start and an end." };
    }
    if (b <= a) {
      // the overnight case lands here too, on purpose - see the header
      return {
        ok: false,
        code: "backwards",
        message: "Each slot has to end after it starts, on the same day.",
      };
    }
    parsed.push({ from: a, to: b });
  }

  const sorted = [...parsed].sort((x, y) => x.from - y.from);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].from < sorted[i - 1].to) {
      return {
        ok: false,
        code: "overlap",
        message: "Two work slots overlap. Each minute counts once.",
      };
    }
  }

  const minutes = parsed.reduce((n, s) => n + (s.to - s.from), 0);
  const hours = r2(minutes / 60);
  if (hours !== r2(target)) {
    return {
      ok: false,
      code: "mismatch",
      minutes,
      hours,
      message: `These slots come to ${hours.toFixed(2)} hours. The day says ${r2(target).toFixed(2)}.`,
    };
  }

  return {
    ok: true,
    code: "ok",
    minutes,
    hours,
    slots: sorted,
    message: `${hours.toFixed(2)} hours across ${sorted.length} ${sorted.length === 1 ? "slot" : "slots"}.`,
  };
}

// does this kind of correction carry a full day of slots?
export const kindTakesSlots = (kind) => kind === "hours" || kind === "day_missing";

// A BREAK RECORD AGAINST A CORRECTED CLOCK.
//
// A stored day's `breaks` are the GAPS BETWEEN ITS PUNCHES - analyzeDay walks
// the punch pairs and calls each gap a meal, a rest or other. Replace the
// punches and that list describes a day that no longer exists: a meal gap from
// the old clock can land in the middle of worked time on the new one, and
// DayCalendar would draw it there.
//
// On the ordinary path this never bites, because reanalyzeDays re-runs
// analyzeDay on the corrected punches and rebuilds the gaps by construction.
// It bites on the two paths that do NOT re-analyse: a day with no schedule
// shifts to rebuild from, and a frozen sheet. There the punches are replaced
// and the old gap list rides along.
//
// A gap FITS the corrected clock when two consecutive slots leave exactly that
// hole. Anything else is a record about a day nobody is claiming any more, and
// it is separated rather than deleted - the day says what it dropped so the
// sheet and the reviewer can be told, which is the whole point of doing this
// explicitly instead of letting the list go quietly wrong.
export function breaksAgainstSlots(breaks, slots) {
  const list = Array.isArray(breaks) ? breaks : [];
  const holes = new Set();
  const ordered = [...(slots || [])].sort((a, b) => a.from - b.from);
  for (let i = 1; i < ordered.length; i += 1) {
    if (ordered[i].from > ordered[i - 1].to) holes.add(`${ordered[i - 1].to}-${ordered[i].from}`);
  }
  const kept = [];
  const dropped = [];
  for (const b of list) {
    const from = b?.start?.min;
    const to = b?.end?.min;
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      // a gap we cannot place cannot be checked, so it is not claimed to fit
      dropped.push({ kind: b?.kind ?? null, from: from ?? null, to: to ?? null, why: "unreadable" });
      continue;
    }
    if (holes.has(`${from}-${to}`)) kept.push(b);
    else dropped.push({ kind: b?.kind ?? null, from, to, why: "outside the corrected clock" });
  }
  return { kept, dropped };
}

// "12:00 PM to 12:10 PM", for telling somebody which record no longer fits
export const droppedBreakLabel = (d) =>
  d.from == null || d.to == null
    ? `${d.kind || "break"} with unreadable times`
    : `${d.kind || "break"} ${clockLabel(d.from)} to ${clockLabel(d.to)}`;
