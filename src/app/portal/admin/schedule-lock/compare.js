// reads one Schedule lock upload's stored exports, and lays a later upload
// against its lock. Server only: the parsers pull pdfjs. The comparing itself
// is src/lib/timesheet/schedule-lock.js, pure and tested; this is the reading
// and the wiring around it.
import { readBlob } from "@/lib/blob";
import { parseSchedulePdf } from "@/lib/timesheet/schedule";
import { parseScheduleNotesXls } from "@/lib/timesheet/schedule-notes";
import { parseServiceNotesPdf } from "@/lib/timesheet/service-notes";
import { parseServiceNotesXls } from "@/lib/timesheet/service-notes-xls";
import { clockShifts } from "@/lib/timesheet/clock";
import { parseMileageDetail } from "@/lib/timesheet/mileage-detail";
import {
  personKey, daysFrom, fileNameRange, spanOf, comparedDays, dayNum,
  bookingsOf, scheduleNotesOf, serviceNotesOf, clockOf, tripsOf,
  diffBookings, diffNotes, diffClock, diffTrips, punchesByDay, clockTags,
  applyApproved, changeKey,
} from "@/lib/timesheet/schedule-lock";

// the slots the page takes, in the order the form shows them, and what a
// refusal calls each one
export const LOCK_SLOTS = ["schedule", "notes", "serviceNotes", "scheduleNotes", "clock", "mileage"];
export const SLOT_NAMES = {
  schedule: "Employee Schedules export",
  notes: "DSN",
  serviceNotes: "Employee Service Notes export",
  scheduleNotes: "Employee Schedule Notes export",
  clock: "QSClock Time and Attendance export",
  mileage: "Mileage Detail Report",
};

// a file that is stored but will not parse, named so the page can say which
export class UnreadableExport extends Error {
  constructor(slot, cause) {
    super(`${SLOT_NAMES[slot] || slot} could not be read: ${cause?.message || cause}`);
    this.slot = slot;
  }
}

async function bytesOf(file) {
  const r = await readBlob(file.url);
  if (!r) throw new Error("the stored copy could not be fetched");
  return r.bytes;
}

const two = (n) => String(n).padStart(2, "0");

// the month most calendars in a roster are for; the export is one month, and
// this only has to agree with itself
function rosterMonth(people) {
  const count = new Map();
  for (const p of people || []) {
    if (p.month == null || p.year == null) continue;
    const k = `${p.year}-${two(p.month + 1)}`;
    count.set(k, (count.get(k) || 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

export function monthDays(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${two(m)}/01/${String(y).slice(2)}`, to: `${two(m)}/${two(last)}/${String(y).slice(2)}` };
}

// EVERY EXPORT OF ONE UPLOAD, parsed, with the days each covers: the schedule
// is the whole month it prints; the rest cover what their file names say, or
// failing that the first and last day they hold.
export async function readUpload(files) {
  const out = { covers: {} };
  const read = async (slot, fn) => {
    try {
      return await fn(await bytesOf(files[slot]));
    } catch (e) {
      throw new UnreadableExport(slot, e);
    }
  };
  out.people = await read("schedule", (b) => parseSchedulePdf(b));
  out.monthKey = rosterMonth(out.people);
  if (!out.monthKey) throw new UnreadableExport("schedule", new Error("no month on its calendars"));
  out.covers.roster = monthDays(out.monthKey);
  if (files.scheduleNotes) {
    out.scheduleNotes = await read("scheduleNotes", (b) => parseScheduleNotesXls(Buffer.from(b)));
    out.covers.scheduleNotes = fileNameRange(files.scheduleNotes.name) || spanOf(out.scheduleNotes);
  }
  if (files.notes) {
    out.dsn = await read("notes", (b) => parseServiceNotesPdf(b));
    out.covers.dsn = fileNameRange(files.notes.name) || spanOf(out.dsn);
  }
  if (files.serviceNotes) {
    out.serviceNotes = await read("serviceNotes", (b) => parseServiceNotesXls(Buffer.from(b)));
    out.covers.serviceNotes = fileNameRange(files.serviceNotes.name) || spanOf(out.serviceNotes);
  }
  if (files.clock) {
    out.clock = await read("clock", (b) => clockShifts(Buffer.from(b)));
    out.covers.clock = fileNameRange(files.clock.name) || spanOf(out.clock);
  }
  if (files.mileage) {
    const m = await read("mileage", (b) => parseMileageDetail(Buffer.from(b)));
    out.trips = m.trips;
    out.covers.miles = fileNameRange(files.mileage.name) || m.range || spanOf(m.trips);
  }
  return out;
}

// what the lock holds on its days, for the list and the lock's own page
export function lockSummary(read, days) {
  const set = new Set(days);
  const bookings = bookingsOf(read.people, days).filter((b) => !b.meal);
  const on = (items, cover) => {
    if (!items) return null;
    const d = cover ? comparedDays(days, cover, cover) : days;
    const keep = new Set(d);
    return { count: items.filter((x) => keep.has(x.date)).length, cover: cover || null, days: d.length };
  };
  return {
    calendars: new Set(bookings.map((b) => b.who)).size,
    bookings: bookings.length,
    hours: Math.round(bookings.reduce((n, b) => n + b.minutes, 0) / 60 * 100) / 100,
    days: set.size,
    scheduleNotes: on(read.scheduleNotes, read.covers.scheduleNotes),
    dsn: on(read.dsn, read.covers.dsn),
    serviceNotes: on(read.serviceNotes, read.covers.serviceNotes),
    clock: on(read.clock, read.covers.clock),
    miles: on(read.trips, read.covers.miles),
  };
}

// A CLIENT'S FULL NAME, off whichever export spells it out. The roster prints
// "King, A"; the clock and the schedule notes print "King, Adam", the notes
// "Adam King". Only a surname and initial that belong to one name are filled
// in - two clients sharing them keep the roster's short form.
function clientNames(reads) {
  const names = new Map();
  const learn = (raw) => {
    const s = String(raw || "").replace(/\s*\(.*?\)|\s*".*?"/g, "").replace(/\s+/g, " ").trim();
    if (!s || s.includes(";")) return;
    let first;
    let last;
    if (s.includes(",")) [last, first] = s.split(",").map((x) => x.trim());
    else { const parts = s.split(" "); first = parts[0]; last = parts.slice(1).join(" "); }
    if (!first || !last || first.length < 2) return;
    const k = `${last.toLowerCase()}|${first[0].toLowerCase()}`;
    if (!names.has(k)) names.set(k, new Set());
    names.get(k).add(`${first} ${last}`);
  };
  for (const r of reads) {
    for (const x of r.clock || []) learn(x.client);
    for (const x of r.scheduleNotes || []) learn(x.client);
    for (const x of r.dsn || []) learn(x.client);
    for (const x of r.serviceNotes || []) learn(x.client);
  }
  return (short) => {
    const [last, init] = String(short || "").split(",").map((x) => (x || "").trim());
    const set = names.get(`${(last || "").toLowerCase()}|${(init || "")[0]?.toLowerCase() || ""}`);
    return set && set.size === 1 ? [...set][0] : null;
  };
}

// what else the upload says about a booking that moved: the punches clocked
// against it, and the note staff typed on it
function evidenceFor(c, clockItems, noteItems) {
  const b = c.after || c.before;
  if (!b || b.items) return null;
  const surname = (x) => String(x || "").split(",")[0].trim().toLowerCase();
  const near = (x) => x.who === b.who && x.date === b.date && (!b.client || surname(x.client) === surname(b.client));
  const punches = clockItems
    .filter((x) => near(x) && (x.actualFrom != null || x.actualTo != null || x.noIn || x.noOut))
    .filter((x) => x.schedFrom == null || b.start == null || Math.abs(x.schedFrom - b.start) < 6 * 60)
    .map((x) => ({ from: x.actualFrom, to: x.actualTo, noIn: x.noIn, noOut: x.noOut }));
  const notes = noteItems.filter((x) => near(x) && (x.start == null || b.start == null || (x.start < (b.end ?? 1440) && (x.end ?? x.start) > (b.start ?? 0))));
  if (!punches.length && !notes.length) return null;
  return { punches: punches.slice(0, 3), note: notes[0]?.text || null };
}

// A LATER UPLOAD, LAID AGAINST THE LOCK. `approved` are the lock's approved
// changes that still stand, in the order they were approved; each one's
// `after` replaces its `before` before anything is compared.
export function compareToLock({ lockRead, nowRead, days, approved = [] }) {
  const changes = [];
  const compared = {};

  // the schedule, on every locked day
  compared.roster = { from: days[0], to: days[days.length - 1] };
  const ref = applyApproved(bookingsOf(lockRead.people, days), approved, "roster");
  const now = bookingsOf(nowRead.people, days);
  const lockPeople = new Set([...lockRead.people.map((p) => personKey(p.employee)), ...ref.map((x) => x.who)]);
  const nowPeople = new Set(nowRead.people.map((p) => personKey(p.employee)));
  const roster = diffBookings(ref, now, { lockPeople, nowPeople });
  // the punches this upload holds for the locked days, else the lock's own
  const clockRows = nowRead.clock || lockRead.clock || null;
  const clockItems = clockRows ? clockOf(clockRows, days) : [];
  const punches = clockRows ? punchesByDay(clockItems) : null;
  const noteItems = nowRead.scheduleNotes ? scheduleNotesOf(nowRead.scheduleNotes, days) : [];
  const fullName = clientNames([lockRead, nowRead]);
  for (const c of roster) {
    const tags = clockTags(c, punches);
    c.matchesClock = tags.matchesClock;
    c.awayFromClock = tags.awayFromClock;
    const ev = evidenceFor(c, clockItems, noteItems) || {};
    if (tags.hits.length) ev.hits = tags.hits;
    c.evidence = Object.keys(ev).length ? ev : null;
    // the roster prints a client as "King, A"; the name the other exports
    // spell out rides along for the card, never into the identity
    for (const b of [c.before, c.after, ...(c.before?.items || []), ...(c.after?.items || [])]) {
      if (b && b.client && !b.items) b.clientName = fullName(b.client);
    }
  }
  changes.push(...roster);

  // everything else, only on the locked days both copies cover
  const onBoth = (name, lockItems, nowItems) => {
    if (!lockItems || !nowItems) { compared[name] = null; return null; }
    const d = comparedDays(days, lockRead.covers[name], nowRead.covers[name]);
    compared[name] = d.length ? { from: d[0], to: d[d.length - 1] } : null;
    return d.length ? d : null;
  };
  const peopleOf = (items) => new Set((items || []).map((x) => personKey(x.employee ?? x.name)));

  let d = onBoth("scheduleNotes", lockRead.scheduleNotes, nowRead.scheduleNotes);
  if (d) changes.push(...diffNotes("scheduleNotes", applyApproved(scheduleNotesOf(lockRead.scheduleNotes, d), approved, "scheduleNotes"), scheduleNotesOf(nowRead.scheduleNotes, d), { nowPeople: peopleOf(nowRead.scheduleNotes) }));
  d = onBoth("dsn", lockRead.dsn, nowRead.dsn);
  if (d) changes.push(...diffNotes("dsn", applyApproved(serviceNotesOf(lockRead.dsn, d, "dsn"), approved, "dsn"), serviceNotesOf(nowRead.dsn, d, "dsn"), { nowPeople: peopleOf(nowRead.dsn) }));
  d = onBoth("serviceNotes", lockRead.serviceNotes, nowRead.serviceNotes);
  if (d) changes.push(...diffNotes("serviceNotes", applyApproved(serviceNotesOf(lockRead.serviceNotes, d, "xls"), approved, "serviceNotes"), serviceNotesOf(nowRead.serviceNotes, d, "xls"), { nowPeople: peopleOf(nowRead.serviceNotes) }));
  d = onBoth("clock", lockRead.clock, nowRead.clock);
  if (d) changes.push(...diffClock(applyApproved(clockOf(lockRead.clock, d), approved, "clock"), clockOf(nowRead.clock, d)));
  d = onBoth("miles", lockRead.trips, nowRead.trips);
  if (d) changes.push(...diffTrips(applyApproved(tripsOf(lockRead.trips, d), approved, "miles"), tripsOf(nowRead.trips, d), { nowPeople: peopleOf(nowRead.trips) }));

  for (const c of changes) c.key = changeKey(c);
  // the same difference twice in one upload is one change
  const seen = new Set();
  const unique = changes.filter((c) => (seen.has(c.key) ? false : seen.add(c.key)));
  unique.sort((a, b) => String(a.employee).localeCompare(String(b.employee)) || dayNum(a.date) - dayNum(b.date));
  return { changes: unique, compared };
}

export { daysFrom };
