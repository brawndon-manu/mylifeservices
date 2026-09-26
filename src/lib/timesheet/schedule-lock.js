// THE SCHEDULE LOCK - what changed on days already worked, between the upload
// that locked them and every upload after it.
//
// WHY IT EXISTS. Staff get the last days of each month to build next month's
// schedule, and QSP can only open that by unlocking the schedules - which opens
// the past too. A shift booked 9a-12p that was clocked 9:30a-11:50a is written
// down at the clocked times; with the schedule unlocked, the booking can be put
// back to 9a-12p and paid in full. So the first upload of a month locks the
// days picked with it, and every later upload is compared against that lock
// plus whatever has been approved since. Anything that moved on a locked day is
// a change for a person to approve or mark unauthorized.
//
// ONLY LOCKED DAYS ARE COMPARED. Days after the lock are still being worked:
// punches rewrite their bookings, notes and DSNs and miles arrive for them, and
// none of that is a change to anything that was locked.
//
// EACH EXPORT IS COMPARED ONLY ON DAYS BOTH COPIES OF IT COVER. The schedule is
// a whole month; the notes, the clock and the miles are pulled for a range and
// QSP writes that range into the file name. A notes export pulled for fewer
// days would otherwise read as every note outside it having been deleted.
//
// Pure, and relative imports only: the test runner has no alias.
import { createHash } from "node:crypto";
import { blockTimes, clientOf, serviceOf } from "./schedule.js";
import { noteMinute } from "./note-minute.js";
import { dayNum, daysFrom, fileNameRange, scheduleNameMonth, spanOf, comparedDays } from "./schedule-lock-names.js";

// ---------------------------------------------------------------- names

const squash = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
// lines kept apart for reading, each tidied
const lines = (list) => (list || []).map(squash).filter(Boolean).join("\n");

// every export spells a person its own way: the roster and the notes print
// "Taylor Adams", the clock, the schedule notes and the mileage report print
// "Adams, Taylor". One key for all of them.
export function personKey(name) {
  const s = squash(name);
  if (s.includes(",")) {
    const [last, ...rest] = s.split(",");
    return squash(`${rest.join(" ")} ${last}`).toLowerCase();
  }
  return s.toLowerCase();
}

// "Adams, Taylor" -> "Taylor Adams", for printing
export function firstLast(name) {
  const s = squash(name);
  if (!s.includes(",")) return s || null;
  const [last, ...rest] = s.split(",");
  return squash(`${rest.join(" ")} ${last}`) || null;
}

// a client as the roster prints one ("King, A") and as the other exports do
// ("King, Adam") match on the surname and the first initial
function clientKey(c) {
  const s = squash(c).replace(/\s*\(.*?\)|\s*".*?"/g, "");
  if (!s) return "";
  const [last, first] = s.split(",").map((x) => (x || "").trim().toLowerCase());
  return `${last}|${(first || "")[0] || ""}`;
}

// ---------------------------------------------------------------- days

// in their own module so the browser can read a file name the same way
export { dayNum, daysFrom, fileNameRange, scheduleNameMonth, spanOf, comparedDays };

// ---------------------------------------------------------------- items
//
// every export becomes a flat list of items, each with `id` - its identity,
// the same string for the same thing in two uploads - and `who`, the person
// key. The id is what a change's before and after point at, and what an
// approval replaces in the lock.

export function bookingsOf(people, days) {
  const keep = days ? new Set(days) : null;
  const out = [];
  for (const p of people || []) {
    const employee = squash(p.employee);
    for (const d of p.days || []) {
      if (keep && !keep.has(d.date)) continue;
      for (const e of d.entries || []) {
        const text = squash(e.text);
        const t = blockTimes(text);
        out.push({
          id: `b|${personKey(employee)}|${d.date}|${text.replace(/\s+/g, "").toLowerCase()}`,
          who: personKey(employee),
          employee,
          date: d.date,
          text,
          start: t?.start ?? null,
          end: t?.end ?? null,
          minutes: e.minutes || 0,
          client: clientOf(text),
          service: serviceOf(text),
          meal: !!e.meal,
        });
      }
    }
  }
  return out;
}

export function scheduleNotesOf(notes, days) {
  const keep = days ? new Set(days) : null;
  return (notes || [])
    .filter((n) => !keep || keep.has(n.date))
    .map((n) => {
      const text = lines(Array.isArray(n.reasons) && n.reasons.length ? n.reasons : [n.text]);
      return {
        id: `sn|${personKey(n.employee)}|${n.date}|${squash(n.client).toLowerCase()}|${squash(n.service).toLowerCase()}|${squash(text)}`,
        who: personKey(n.employee),
        employee: firstLast(n.employee),
        date: n.date,
        client: squash(n.client) || null,
        service: squash(n.service) || null,
        start: n.start ?? null,
        end: n.end ?? null,
        text,
      };
    });
}

// what a service note says: the summary, then each goal that was answered
// with what was written under it (the DSN's rich reading), or the goals and
// comments as the .xls prints them. A goal left unanswered says nothing.
export function noteBody(n) {
  if (Array.isArray(n.sections) && n.sections.length) {
    return lines([n.summary, ...n.sections.filter((s) => s.comment).map((s) => `${squash(s.goal)}: ${squash(s.comment)}`)]);
  }
  return lines([n.summary, ...(n.categories || []).map((c) => `${squash(c)}:`), ...(n.comments || [])]);
}

// the DSN (source "dsn") and the Employee Service Notes .xls (source "xls")
// read the same way; they stay two exports and are never merged here.
//
// A NOTE IS ITS WORDS, NOT ITS TIMES. Every notes export prints the shift's
// times beside the note, and those follow the booking: a shift moved from 11a
// to 11:30a reprints its untouched DSN at 11:30a. The booking's move is a
// change of its own, so the times stay out of a note's identity.
export function serviceNotesOf(notes, days, source) {
  const keep = days ? new Set(days) : null;
  return (notes || [])
    .filter((n) => !keep || keep.has(n.date))
    .map((n) => {
      const text = noteBody(n);
      const claim = source === "dsn" ? (n.miles == null ? null : !!n.miles) : null;
      return {
        id: `${source}|${personKey(n.employee)}|${n.date}|${squash(n.client).toLowerCase()}|${squash(text)}|${claim ?? ""}`,
        who: personKey(n.employee),
        employee: firstLast(n.employee),
        date: n.date,
        client: squash(n.client) || null,
        service: squash(n.service) || null,
        start: noteMinute(n.start),
        end: noteMinute(n.end),
        text,
        claim,
        signed: n.signedDate ? `${n.signedDate} ${n.signedAt || ""}`.trim() : null,
      };
    });
}

// one clock row per scheduled shift; its identity is the punch, because the
// row's booked times follow the schedule and a schedule change is already a
// change of its own
export function clockOf(rows, days) {
  const keep = days ? new Set(days) : null;
  return (rows || [])
    .filter((r) => !keep || keep.has(r.date))
    .map((r) => ({
      id: `c|${personKey(r.name)}|${r.date}|${squash(r.client).toLowerCase()}|${squash(r.service).toLowerCase()}|${r.schedFrom ?? ""}|${r.actualFrom ?? ""}|${r.actualTo ?? ""}|${r.noIn ? 1 : 0}${r.noOut ? 1 : 0}`,
      who: personKey(r.name),
      employee: firstLast(r.name),
      date: r.date,
      client: squash(r.client) || null,
      service: squash(r.service) || null,
      schedFrom: r.schedFrom ?? null,
      schedTo: r.schedTo ?? null,
      actualFrom: r.actualFrom ?? null,
      actualTo: r.actualTo ?? null,
      noIn: !!r.noIn,
      noOut: !!r.noOut,
    }));
}

export function tripsOf(trips, days) {
  const keep = days ? new Set(days) : null;
  return (trips || [])
    .filter((t) => !keep || keep.has(t.date))
    .map((t) => ({
      id: `m|${personKey(t.employee)}|${t.date}|${squash(t.client).toLowerCase()}|${squash(t.from).toLowerCase()}|${squash(t.to).toLowerCase()}|${Number(t.miles) || 0}|${squash(t.source).toLowerCase()}`,
      who: personKey(t.employee),
      employee: firstLast(t.employee),
      date: t.date,
      client: squash(t.client) || null,
      from: squash(t.from) || null,
      to: squash(t.to) || null,
      miles: Math.round((Number(t.miles) || 0) * 100) / 100,
      source: squash(t.source) || null,
    }));
}

// ---------------------------------------------------------------- pairing

// takes out every item whose identity is in both lists, once per copy
function exactOut(a, b) {
  const pool = new Map();
  for (const x of b) {
    if (!pool.has(x.id)) pool.set(x.id, []);
    pool.get(x.id).push(x);
  }
  const left = [];
  for (const x of a) {
    const same = pool.get(x.id);
    if (same?.length) same.pop();
    else left.push(x);
  }
  return { left, right: [...pool.values()].flat() };
}

const overlap = (a, b) => Math.max(0, Math.min(a.end ?? 0, b.end ?? 0) - Math.max(a.start ?? 0, b.start ?? 0));

// pairs what left with what arrived, most specific rule first; each rule takes
// the candidate that overlaps most, then the one that starts closest
function pairUp(removed, added, rules) {
  const pairs = [];
  let rs = [...removed];
  let as = [...added];
  for (const [kind, fits] of rules) {
    const keep = [];
    for (const r of rs) {
      let best = -1;
      let bestScore = -Infinity;
      for (let j = 0; j < as.length; j++) {
        if (!fits(r, as[j])) continue;
        const score = overlap(r, as[j]) * 10 - Math.abs((r.start ?? 0) - (as[j].start ?? 0));
        if (score > bestScore) { bestScore = score; best = j; }
      }
      if (best >= 0) pairs.push({ kind, before: r, after: as.splice(best, 1)[0] });
      else keep.push(r);
    }
    rs = keep;
  }
  return { pairs, removed: rs, added: as };
}

const byWho = (items) => {
  const m = new Map();
  for (const x of items) {
    if (!m.has(x.who)) m.set(x.who, []);
    m.get(x.who).push(x);
  }
  return m;
};

// A PERSON WHO LEFT THE EXPORT ALTOGETHER is one change, not one per item: an
// account made inactive drops out of every QSP export at once, and forty
// "removed" cards would bury the one fact that explains them. `nowPeople` is
// everybody the newer export holds at all, on any day.
function missingPeople(ref, nowPeople, source) {
  const out = [];
  const keep = [];
  for (const [who, items] of byWho(ref)) {
    if (nowPeople.has(who)) { keep.push(...items); continue; }
    items.sort((a, b) => dayNum(a.date) - dayNum(b.date));
    out.push({
      source,
      kind: source === "roster" ? "calendar-missing" : "missing",
      employee: items[0].employee,
      who,
      date: items[0].date,
      lastDate: items[items.length - 1].date,
      before: { items },
      after: null,
    });
  }
  return { changes: out, keep };
}

// ---------------------------------------------------------------- diffs

// the schedule. `lockPeople` / `nowPeople` are everybody each roster holds,
// on any day, so a calendar that left or arrived reads as one change
export function diffBookings(ref, now, { lockPeople = null, nowPeople = null } = {}) {
  const changes = [];
  let refItems = ref;
  let nowItems = now;
  if (nowPeople) {
    const m = missingPeople(ref, nowPeople, "roster");
    changes.push(...m.changes);
    refItems = m.keep;
  }
  if (lockPeople) {
    const arrived = [];
    const keep = [];
    for (const [who, items] of byWho(now)) {
      if (lockPeople.has(who)) keep.push(...items);
      else {
        items.sort((a, b) => dayNum(a.date) - dayNum(b.date));
        arrived.push({ source: "roster", kind: "calendar-new", employee: items[0].employee, who, date: items[0].date, lastDate: items[items.length - 1].date, before: null, after: { items } });
      }
    }
    changes.push(...arrived);
    nowItems = keep;
  }
  const { left, right } = exactOut(refItems, nowItems);
  const sameDay = (r, a) => r.who === a.who && r.date === a.date && r.meal === a.meal;
  const { pairs, removed, added } = pairUp(left, right, [
    ["times", (r, a) => sameDay(r, a) && r.client === a.client && r.service === a.service],
    ["client", (r, a) => sameDay(r, a) && r.start === a.start && r.end === a.end && r.service === a.service],
    ["service", (r, a) => sameDay(r, a) && r.start === a.start && r.end === a.end],
    ["moved", (r, a) => !r.meal && !a.meal && r.who === a.who && r.date !== a.date && !!r.client && r.client === a.client && r.service === a.service],
    ["reassigned", (r, a) => !r.meal && !a.meal && r.who !== a.who && r.date === a.date && !!r.client && r.client === a.client && r.service === a.service],
  ]);
  for (const p of pairs) changes.push({ source: "roster", kind: p.kind, employee: p.after.employee, who: p.after.who, date: p.after.date, before: p.before, after: p.after });
  for (const r of removed) changes.push({ source: "roster", kind: "removed", employee: r.employee, who: r.who, date: r.date, before: r, after: null });
  for (const a of added) changes.push({ source: "roster", kind: "added", employee: a.employee, who: a.who, date: a.date, before: null, after: a });
  return changes;
}

// the three notes exports: the schedule notes (source "scheduleNotes"), the
// DSN ("dsn") and the service notes .xls ("serviceNotes"). Paired within one
// person's day with one client; the same words are the same note.
export function diffNotes(source, ref, now, { nowPeople = null } = {}) {
  const changes = [];
  let refItems = ref;
  if (nowPeople) {
    const m = missingPeople(ref, nowPeople, source);
    changes.push(...m.changes);
    refItems = m.keep;
  }
  const { left, right } = exactOut(refItems, now);
  const group = (x) => `${x.who}|${x.date}|${clientKey(x.client)}`;
  const { pairs, removed, added } = pairUp(left, right, [
    ["edited", (r, a) => group(r) === group(a)],
  ]);
  const word = source === "scheduleNotes" ? "note" : source === "dsn" ? "dsn" : "service-note";
  for (const p of pairs) {
    // a DSN whose words did not move but whose mileage answer did
    const kind = source === "dsn" && p.before.text === p.after.text && p.before.claim !== p.after.claim ? "dsn-claim" : `${word}-edited`;
    changes.push({ source, kind, employee: p.after.employee, who: p.after.who, date: p.after.date, before: p.before, after: p.after });
  }
  for (const r of removed) changes.push({ source, kind: `${word}-removed`, employee: r.employee, who: r.who, date: r.date, before: r, after: null });
  for (const a of added) changes.push({ source, kind: `${word}-added`, employee: a.employee, who: a.who, date: a.date, before: null, after: a });
  return changes;
}

// the clock: only a punch that moved on a row both exports hold. A row that
// left or arrived is a booking that left or arrived, and the schedule's own
// comparison already says so.
export function diffClock(ref, now) {
  const { left, right } = exactOut(ref, now);
  const group = (x) => `${x.who}|${x.date}|${clientKey(x.client)}|${String(x.service || "").toLowerCase()}`;
  const near = (r, a) => {
    const d = Math.abs((r.schedFrom ?? 0) - (a.schedFrom ?? 0));
    return d;
  };
  const { pairs } = pairUp(
    left.map((x) => ({ ...x, start: x.schedFrom, end: x.schedTo })),
    right.map((x) => ({ ...x, start: x.schedFrom, end: x.schedTo })),
    [["clock-changed", (r, a) => group(r) === group(a) && near(r, a) < 24 * 60]],
  );
  return pairs
    .filter((p) => p.before.actualFrom !== p.after.actualFrom || p.before.actualTo !== p.after.actualTo || p.before.noIn !== p.after.noIn || p.before.noOut !== p.after.noOut)
    .map((p) => ({ source: "clock", kind: "clock-changed", employee: p.after.employee, who: p.after.who, date: p.after.date, before: p.before, after: p.after }));
}

// the miles, one trip at a time
export function diffTrips(ref, now, { nowPeople = null } = {}) {
  const changes = [];
  let refItems = ref;
  if (nowPeople) {
    const m = missingPeople(ref, nowPeople, "miles");
    changes.push(...m.changes);
    refItems = m.keep;
  }
  const { left, right } = exactOut(refItems, now);
  const sameTrip = (r, a) => r.who === a.who && r.date === a.date && clientKey(r.client) === clientKey(a.client);
  const { pairs, removed, added } = pairUp(
    left.map((x, i) => ({ ...x, start: i, end: i })),
    right.map((x, i) => ({ ...x, start: i, end: i })),
    [
      ["miles", (r, a) => sameTrip(r, a) && r.from === a.from && r.to === a.to],
      ["miles", (r, a) => sameTrip(r, a) && (r.from === a.from || r.to === a.to)],
    ],
  );
  const clean = (x) => { const { start, end, ...rest } = x; return rest; };
  for (const p of pairs) changes.push({ source: "miles", kind: "miles", employee: p.after.employee, who: p.after.who, date: p.after.date, before: clean(p.before), after: clean(p.after) });
  for (const r of removed) changes.push({ source: "miles", kind: "trip-removed", employee: r.employee, who: r.who, date: r.date, before: clean(r), after: null });
  for (const a of added) changes.push({ source: "miles", kind: "trip-added", employee: a.employee, who: a.who, date: a.date, before: null, after: clean(a) });
  return changes;
}

// ---------------------------------------------------------------- the clock tags

// the punches of each person's day, from the clock export: every clock-in and
// clock-out as an event, so a card can name the ones a change landed on
export function punchesByDay(clockItems) {
  const m = new Map();
  for (const r of clockItems || []) {
    const k = `${r.who}|${r.date}`;
    if (!m.has(k)) m.set(k, []);
    if (r.actualFrom != null && !r.noIn) m.get(k).push({ at: r.actualFrom, kind: "in" });
    if (r.actualTo != null && !r.noOut) m.get(k).push({ at: r.actualTo, kind: "out" });
  }
  return m;
}

// the punch events at these minutes, in time order, once each
function eventsAt(events, times) {
  const out = [];
  for (const t of [...new Set(times)].sort((x, y) => x - y)) {
    const e = events.find((x) => x.at === t);
    if (e) out.push(e);
  }
  return out;
}

// "Matches the clock": every edge the change moved lands on a punch.
// "Away from the clock": the edges it moved WERE punches and are not any more -
// the clocked time put back to the booking, which is what the lock exists for.
// Both hand back `hits`, the punches the change landed on or left, so the card
// names those and not some other shift's.
export function clockTags(change, punches) {
  const out = { matchesClock: false, awayFromClock: false, hits: [] };
  if (change.source !== "roster" || !punches) return out;
  const { before: b, after: a } = change;
  const at = a || b;
  const events = punches.get(`${at.who}|${at.date}`) || [];
  const has = (t) => events.some((e) => e.at === t);
  if (change.kind === "times" && b && a) {
    const movedTo = [b.start !== a.start ? a.start : null, b.end !== a.end ? a.end : null].filter((x) => x != null);
    const movedFrom = [b.start !== a.start ? b.start : null, b.end !== a.end ? b.end : null].filter((x) => x != null);
    out.matchesClock = movedTo.length > 0 && movedTo.every(has);
    out.awayFromClock = !out.matchesClock && movedFrom.length > 0 && movedFrom.every(has);
    if (out.matchesClock) out.hits = eventsAt(events, [a.start, a.end].filter(has));
    else if (out.awayFromClock) out.hits = eventsAt(events, [b.start, b.end].filter(has));
  } else if (change.kind === "added" && a && !a.meal) {
    out.matchesClock = a.start != null && a.end != null && has(a.start) && has(a.end);
    if (out.matchesClock) out.hits = eventsAt(events, [a.start, a.end]);
  }
  return out;
}

// ---------------------------------------------------------------- keys

// the same difference on a later upload finds the same row: what changed,
// from what, to what. Hashed because a DSN's words run to pages.
export function changeKey(c) {
  const side = (x) => (x == null ? "-" : Array.isArray(x.items) ? x.items.map((i) => i.id).sort().join("~") : x.id);
  return createHash("sha1").update(`${c.source}|${c.kind}|${side(c.before)}|${side(c.after)}`).digest("hex");
}

// ---------------------------------------------------------------- approvals

// THE LOCK AS IT STANDS: what was locked, with every approved change laid
// over it in the order they were approved. An approved change's `before` comes
// out and its `after` goes in, so the next upload is compared against what you
// accepted - and a change marked unauthorized stays a difference until the
// schedule goes back.
export function applyApproved(items, changes, source) {
  let out = [...items];
  for (const c of changes || []) {
    if (c.source !== source) continue;
    const drop = c.before == null ? [] : Array.isArray(c.before.items) ? c.before.items : [c.before];
    const add = c.after == null ? [] : Array.isArray(c.after.items) ? c.after.items : [c.after];
    for (const d of drop) {
      const i = out.findIndex((x) => x.id === d.id);
      if (i >= 0) out.splice(i, 1);
    }
    out.push(...add.map((x) => ({ ...x, approvedAt: c.decidedAt || null })));
  }
  return out;
}

// ---------------------------------------------------------------- words

// what each change is called on its card, and the kind tabs it falls under
export const KIND_LABELS = {
  times: "Times changed",
  added: "Added",
  removed: "Removed",
  moved: "Moved to another day",
  reassigned: "Given to another employee",
  client: "Client changed",
  service: "Service changed",
  "calendar-missing": "Calendar missing",
  "calendar-new": "New calendar",
  "note-added": "Schedule note added",
  "note-edited": "Schedule note changed",
  "note-removed": "Schedule note removed",
  "service-note-added": "Service note added",
  "service-note-edited": "Service note changed",
  "service-note-removed": "Service note removed",
  "dsn-added": "DSN added",
  "dsn-edited": "DSN changed",
  "dsn-removed": "DSN removed",
  "dsn-claim": "DSN mileage answer changed",
  "clock-changed": "Clock punch changed",
  miles: "Miles changed",
  "trip-added": "Trip added",
  "trip-removed": "Trip removed",
  missing: "Missing from this upload",
};

export const KIND_TABS = [
  ["times", "Times", ["times"]],
  ["added", "Added", ["added"]],
  ["removed", "Removed", ["removed"]],
  ["moved", "Moved", ["moved"]],
  ["reassigned", "Reassigned", ["reassigned"]],
  ["client", "Client", ["client"]],
  ["service", "Service", ["service"]],
  ["calendars", "Calendars", ["calendar-missing", "calendar-new"]],
  ["scheduleNotes", "Schedule notes", ["note-added", "note-edited", "note-removed"]],
  ["serviceNotes", "Service notes", ["service-note-added", "service-note-edited", "service-note-removed"]],
  ["dsn", "DSN", ["dsn-added", "dsn-edited", "dsn-removed", "dsn-claim"]],
  ["clock", "Clock", ["clock-changed"]],
  ["miles", "Miles", ["miles", "trip-added", "trip-removed"]],
];

// which tab a change counts under; a person missing from a notes export goes
// with that export's tab
export function tabOf(c) {
  if (c.kind === "missing") return c.source;
  const hit = KIND_TABS.find(([, , kinds]) => kinds.includes(c.kind));
  return hit ? hit[0] : "other";
}
