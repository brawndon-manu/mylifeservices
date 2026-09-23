// AN APPROVED CLOCK AMENDMENT IS THE CLOCK RECORD, AND THE BILLABLE ONE.
//
// the clock export says what the phone caught. an amendment is the signed
// account of what happened when the phone caught it wrong or not at all: the
// staff member confirms the times, the person served signs on the same phone,
// the office approves and corrects QSClock. once approved it outranks the
// export on the audit card, because the audit exists to show that the hours
// the client is billed for are supported, and this is the document that
// supports them.
//
// what it moves, in one place: the clocked window the findings read, and the
// billable figure every roll-up and report sums (see billable-of.js). what it
// never moves: the punch lines, which keep saying what the export holds,
// because a signature over a missing punch does not make it a punch.
//
// only the amendment's own rules and the minute reader are imported, so
// node --test reads this without the app.
import { confirmedOf, asksStart, asksEnd } from "../clock-amendment/rules.js";
import { noteMinute } from "./note-minute.js";

// the window the amendment stands for, per end. an end the form asked about
// is the time the person signed for; an end it did not ask about is the punch
// the clock holds. null at an end that has neither.
export function amendedWindow(a) {
  const row = a?.clockRow || {};
  const c = confirmedOf(a);
  const wasFrom = row.noIn ? null : row.actualFrom ?? null;
  const wasTo = row.noOut ? null : row.actualTo ?? null;
  const signedIn = asksStart(a) ? noteMinute(c.actualIn) : null;
  const signedOut = asksEnd(a) ? noteMinute(c.actualOut) : null;
  const from = signedIn ?? wasFrom;
  const to = signedOut ?? wasTo;
  // a punch confirmed at the same minute is the same record: only a different
  // minute, or a minute where the clock had none, changes it
  const inChanged = signedIn != null && signedIn !== wasFrom;
  const outChanged = signedOut != null && signedOut !== wasTo;
  const min = from != null && to != null ? (to < from ? to - from + 1440 : to - from) : null;
  return {
    from, to, min,
    wasFrom, wasTo, wasMin: row.workedMin ?? null,
    inChanged, outChanged, timesChanged: inChanged || outChanged,
  };
}

// the amendment as an audit row carries it: plain values, no dates, nothing
// a client component cannot hold
export function amendmentView(a, { by = null, byLegal = null } = {}) {
  if (!a) return null;
  const c = confirmedOf(a);
  const at = a.approvedAt instanceof Date ? a.approvedAt.toISOString() : a.approvedAt || null;
  return {
    id: a.id,
    at,
    by,
    byLegal,
    signedBy: a.filledName || null,
    ...amendedWindow(a),
    placeIn: c.placeIn || null,
    placeOut: c.placeOut || null,
    qspFixedIn: a.qspFixedIn || null,
    qspFixedTo: a.qspFixedTo || null,
    form: `/portal/admin/clock-amendments/${a.id}`,
  };
}

// WHICH SHIFT AN AMENDMENT BELONGS TO. keyed the way the audit keys a person
// and a day, with the client reduced the way the audit reduces one, all read
// off the clock row the amendment kept: the same export row the audit
// attaches to the booking, so the two spell everything the same way.
const clientPart = (name, clientKey) => {
  const c = String(name || "").trim();
  return clientKey(c) || c.toLowerCase();
};

export function amendmentKey(a, { whoKey, clientKey }) {
  const row = a?.clockRow || {};
  return `${whoKey(row.name || "")}|${a?.shiftDate || row.date || ""}|${clientPart(row.client, clientKey)}`;
}

export function indexAmendments(list, keys) {
  const m = new Map();
  for (const a of list || []) {
    const k = amendmentKey(a, keys);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(a);
  }
  // the latest approval first, so a shift amended twice reads the newer one
  const ms = (v) => { const n = Date.parse(v || ""); return Number.isFinite(n) ? n : 0; };
  for (const arr of m.values()) arr.sort((x, y) => ms(y.approvedAt) - ms(x.approvedAt));
  return m;
}

// the amendment standing on one of the audit's shifts, or null. `shift.who`
// is already the audit's person key; the client is the clock export's full
// spelling where a row attached, the roster's otherwise, and both reduce to
// the same key. among a day's bookings with one client, the one whose start
// the amendment's clock row was rostered for: QSP's original start first,
// the roster's second, the only candidate there is last.
export function amendmentFor(shift, index, { clientKey }) {
  const k = `${shift?.who || ""}|${shift?.date || ""}|${clientPart(shift?.clientFull || shift?.client, clientKey)}`;
  const list = index.get(k);
  if (!list?.length) return null;
  const startOf = (a) => a.clockRow?.schedFrom ?? null;
  return (
    list.find((a) => startOf(a) != null && shift.originalFrom === startOf(a))
    || list.find((a) => startOf(a) != null && shift.schedFrom === startOf(a))
    || (list.length === 1 ? list[0] : null)
  );
}

// the shift the findings read once an amendment stands: the signed window as
// the punches, an end the amendment supplied no longer missing, the row
// counted as clocked. the caller keeps the export's own shift for the punch
// lines. an amendment that moved no time hands the shift back untouched.
export function amendedShift(shift, view) {
  if (!view?.timesChanged) return shift;
  return {
    ...shift,
    actualFrom: view.from,
    actualTo: view.to,
    workedMin: view.min,
    noIn: view.from == null ? shift.noIn : false,
    noOut: view.to == null ? shift.noOut : false,
    noClockRow: false,
    amended: true,
  };
}
