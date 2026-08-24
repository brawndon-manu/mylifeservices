// AN IN-PERSON SIGNING, AND THE SLOTS IT MAKES FOR ITSELF.
//
// Mánu 2026-08-22, after watching twenty session cards get filled in one at a
// time: "nah i dont like this. way too much work. this needs to be its own type
// of meeting format. We can call it in person signing... it should be way
// easier to set up. Manadatory should be an option. TIme slots as its own
// unique setup."
//
// He was right, and the repetition was the feature request. A Company Meeting
// asks you to describe every session because its sessions are genuinely
// different from one another - a Tuesday training and a Thursday one have
// different names, links, lengths. A signing week is the opposite: one room,
// one appointment length, the same hours every day. Describing it twenty times
// is writing out a rule the computer could have applied.
//
// So this takes the rule - which days, which hours, how long, how many at once -
// and produces the slots. The author fills six fields instead of twenty cards.
//
// WHAT COMES OUT IS AN ORDINARY MEETING OPTION, deliberately. Each slot is the
// same `{ id, label, at, tz, durationFromMin, capacity }` shape the picker, the
// roster, the reminders and the attestation already read, so none of them needs
// to know this format exists. Only the SETUP is new, which is the half that was
// actually painful.

// "09:00" -> 540. Returns null on anything that is not a real time of day, so a
// half-typed field generates nothing rather than a wall of garbage slots.
export function minutesOfDay(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

const pad = (n) => String(n).padStart(2, "0");

// 540 -> "9:00 AM". The label people read while choosing, so it is spelled the
// way a person says it rather than the way a clock stores it.
export function clockLabel(min) {
  const h24 = Math.floor(min / 60) % 24;
  const m = min % 60;
  const ampm = h24 < 12 ? "AM" : "PM";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${pad(m)} ${ampm}`;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// every date from `from` to `to` inclusive, as "YYYY-MM-DD".
//
// Built off a UTC noon anchor rather than local midnight: adding days to a
// midnight Date walks into a daylight-saving boundary and lands on the previous
// day, which is how a Sunday quietly appears in a Monday-to-Friday week.
export function datesBetween(from, to, { weekdaysOnly = true } = {}) {
  const start = /^\d{4}-\d{2}-\d{2}$/.test(String(from || "")) ? new Date(`${from}T12:00:00Z`) : null;
  const end = /^\d{4}-\d{2}-\d{2}$/.test(String(to || "")) ? new Date(`${to}T12:00:00Z`) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  if (end < start) return [];

  const out = [];
  const cur = new Date(start);
  // a runaway range is a typo, not a request: 366 days of half-hour slots is
  // 5,856 options and nothing good happens next
  for (let guard = 0; guard < 366 && cur <= end; guard++) {
    const dow = cur.getUTCDay();
    if (!weekdaysOnly || (dow !== 0 && dow !== 6)) {
      out.push({
        date: `${cur.getUTCFullYear()}-${pad(cur.getUTCMonth() + 1)}-${pad(cur.getUTCDate())}`,
        dayName: DAY_NAMES[dow],
      });
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

// how many slots one day's window yields. Exported because the setup screen says
// the count out loud BEFORE anything is generated - "Mon-Fri, 8:00 AM to 6:00
// PM, 30 minutes each = 100 slots" is the sentence that stops somebody
// publishing a hundred options by accident.
export function slotsPerDay(startMin, endMin, lengthMin) {
  if (startMin == null || endMin == null || !lengthMin || lengthMin <= 0) return 0;
  if (endMin <= startMin) return 0;
  return Math.floor((endMin - startMin) / lengthMin);
}

// THE WHOLE SETUP, AS SLOTS.
//
// A slot's `at` is an ISO instant built from the date, the time and the zone the
// author set it in - the same pairing every meeting option already carries, so
// each viewer sees it in their own timezone exactly as they do everywhere else.
//
// `zonedToInstant` is passed in rather than imported: it lives in a client
// component's helpers, and this file is read by node --test with no DOM. The
// caller has it; this only needs the rule.
export function generateSigningSlots({
  from,
  to,
  startTime = "08:00",
  endTime = "18:00",
  lengthMin = 30,
  capacity = 10,
  tz = null,
  weekdaysOnly = true,
  zonedToInstant = null,
} = {}) {
  const startMin = minutesOfDay(startTime);
  const endMin = minutesOfDay(endTime);
  const per = slotsPerDay(startMin, endMin, lengthMin);
  if (!per) return [];

  const cap = Number.isInteger(capacity) && capacity > 0 ? capacity : null;
  const out = [];
  for (const { date, dayName } of datesBetween(from, to, { weekdaysOnly })) {
    for (let i = 0; i < per; i++) {
      const min = startMin + i * lengthMin;
      const time = `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
      out.push({
        // stable and readable: regenerating the same setup produces the same
        // ids, so somebody's pick survives the author fixing a typo elsewhere
        id: `s-${date}-${time.replace(":", "")}`,
        label: `${dayName} ${clockLabel(min)}`,
        // the 24-hour form, NOT the label: zonedToInstant splits on ":" and
        // reads numbers, so "8:00 AM" hands it minutes of "00 AM" - NaN - and
        // every slot silently loses its instant. Caught on the first real run.
        at: zonedToInstant ? zonedToInstant(date, time, tz) || "" : "",
        tz: tz || null,
        durationFromMin: lengthMin,
        durationToMin: null,
        zoomLink: null,
        zoomCode: null,
        seriesId: null,
        seriesLabel: null,
        capacity: cap,
      });
    }
  }
  return out;
}

// what the setup screen says before it commits to anything
export function describeSetup({ from, to, startTime, endTime, lengthMin, capacity, weekdaysOnly = true }) {
  const days = datesBetween(from, to, { weekdaysOnly }).length;
  const per = slotsPerDay(minutesOfDay(startTime), minutesOfDay(endTime), lengthMin);
  const total = days * per;
  // No judgement rides along with these numbers. This carried a `tooMany`
  // flag that the setup screen turned into advice, and Mánu read that copy
  // exactly right: "AI wrote this and is talking to the person who wrote the
  // prompt." A hundred slots is this feature's normal shape - a long list is
  // the picker's layout problem, not the author's mistake.
  return {
    days,
    perDay: per,
    total,
    places: capacity > 0 ? total * capacity : null,
  };
}
