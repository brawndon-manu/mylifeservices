// THE AUTO FLAGGER - Mánu 2026-09-04, ahead of the full-August audit upload:
// "i want the engine to auto flag above the clock, mentions of cancled,
// mentions of not in persoon service, any that have no service note, schedule
// note or the daily service note, no clock out, no geofence."
//
// Pure rules over the audit build's rows, so a test reads them without a
// database. The action wraps them; the button behind an are-you-sure is the
// only thing that writes, and only ever onto UNDECIDED shifts - a decision
// somebody made is never overwritten by a machine.
//
// The reason a rule writes starts "Auto:" so his own flags stay tellable
// from the engine's, and several rules hitting one shift make ONE flag with
// the phrases joined: "Auto: billed above the clock; no clock out."

// the QA annotations we stamp onto schedule notes are ours, not staff words -
// stripped before any language rule reads the text
const QA_NOISE = [
  /Rest break added (in )?per timesheets? (review|corrections)( submission)?\s*[-—]?\s*QA Admin/gi,
  /Added break time per timesheets? review( submission)?\s*[-—]?\s*QA Admin/gi,
];

// everything staff wrote about the shift, in one string: the note's summary
// column, its comment lines, and the schedule note
export function autoFlagText(row) {
  const c = row.note?.comments;
  const comments = Array.isArray(c) ? c.filter((x) => typeof x === "string").join(" ") : "";
  let t = `${row.note?.summary || ""} ${comments} ${row.scheduleNote?.text || ""}`;
  for (const rx of QA_NOISE) t = t.replace(rx, "");
  return t.trim();
}

// cancellation / no-show language. Tuned on the 08/16-08/31 read-through:
// "client cancelled the session" fires; "his Medical got cancelled because he
// didn't renew it" (a fact about benefits, not the session) does not.
const CANCELLED_RX =
  /session (was )?cancell?ed|client cancell?ed|cancell?ed (the )?(session|visit|shift)|call(ed)?\s*off|no[- ]?show|didn'?t show|did not show|client (was )?not (home|there)|client did not (attend|arrive|answer)|unable to (meet|locate)/i;

// contact that was not in person - the STRICT patterns only, on purpose:
// "staff assisted client with calling the insurance" is an in-person session
// doing calls together and must not fire. What fires is the supervisor
// "***" phone-note shape, "over the phone", and message-left-with-nobody-met.
const REMOTE_RX =
  /\*{2,}Supervisor|over the phone|by phone only|via (phone|text|zoom|facetime)(?!.*accompan)|was in contact with (the )?client('s parent)? via phone|phone contact only|left (a )?(message|voicemail)(?!.*(accompan|took|drove|went|met))/i;

export const AUTO_FLAG_RULES = [
  {
    key: "above-clock",
    label: "billed above the clock",
    phrase: "billed above the clock",
    test: (r) => r.billedMin != null && r.clockedMin != null && r.billedMin > r.clockedMin,
  },
  {
    key: "cancelled",
    label: "cancellation or no show language",
    phrase: "the note mentions a cancellation or no show",
    test: (r, t) => CANCELLED_RX.test(t),
  },
  {
    key: "remote",
    label: "contact that was not in person",
    phrase: "the note records contact that was not in person",
    test: (r, t) => REMOTE_RX.test(t),
  },
  {
    // THE DSN IS MANDATORY at clock out (Mánu 2026-09-05), so its absence is
    // a rule of its own - it fires off the same finding the screen shows,
    // xls-fallback shifts included
    key: "no-dsn",
    label: "no DSN",
    phrase: "no DSN",
    test: (r) => (r.reasons || []).some((x) => x.kind === "no-note"),
  },
  {
    key: "no-clock-out",
    label: "no clock out",
    phrase: "no clock out",
    // only where the export HOLDS the shift: absent-from-export is the known
    // admin-type pattern (B. Rotter's shifts) and is deliberately not a rule
    test: (r) => r.inClockExport === true && !!r.noOut,
  },
  {
    key: "no-clock-in",
    label: "no clock in",
    phrase: "no clock in",
    test: (r) => r.inClockExport === true && !!r.noIn,
  },
  {
    key: "gps-in",
    label: "GPS missing at clock in",
    phrase: "GPS missing at clock in",
    // "no" only - blank GPS on an unclocked punch says nothing (the
    // three-valued trap measured 2026-08-22: blanks are missed punches,
    // not missing location)
    test: (r) => r.gpsIn === "no",
  },
  {
    key: "gps-out",
    label: "GPS missing at clock out",
    phrase: "GPS missing at clock out",
    test: (r) => r.gpsOut === "no",
  },
  // the double bookings ride the rows' own findings, stamped by
  // audit-overlaps.js at build - Mánu 2026-09-05: "we need a flag for double
  // booking when it comes to client and staff"
  {
    key: "double-staff",
    label: "booked in two places at once",
    phrase: "booked in two places at once",
    test: (r) => (r.reasons || []).some((x) => x.kind === "double-booked-staff"),
  },
  {
    key: "double-client",
    label: "the client is double booked",
    phrase: "the client is double booked",
    test: (r) => (r.reasons || []).some((x) => x.kind === "double-booked-client"),
  },
];

// the rules' verdict on one row: null when nothing fires or the shift is
// already decided; otherwise the keys that fired and the one reason to write
export function autoFlagRow(row) {
  if (row.review?.decision) return null;
  const t = autoFlagText(row);
  const hit = AUTO_FLAG_RULES.filter((rule) => rule.test(row, t));
  if (!hit.length) return null;
  return {
    keys: hit.map((r) => r.key),
    reason: `Auto: ${hit.map((r) => r.phrase).join("; ")}.`,
  };
}

// every undecided row the rules would flag, with per-rule counts for the
// are-you-sure dialog
export function autoFlagPlan(rows) {
  const counts = Object.fromEntries(AUTO_FLAG_RULES.map((r) => [r.key, 0]));
  const flags = [];
  for (const row of rows) {
    const v = autoFlagRow(row);
    if (!v) continue;
    for (const k of v.keys) counts[k]++;
    flags.push({ row, reason: v.reason });
  }
  return { counts, flags };
}
