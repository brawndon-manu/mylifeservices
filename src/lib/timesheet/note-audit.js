// WHY A SHIFT IS WORTH READING, and never whether it is wrong.
//
// Every rule here RANKS. None of them concludes. A shift that ends early, a note
// written thinly, a session the client called off - all of these have ordinary
// explanations, and several of them are still properly billable. What the rules
// buy is a reading order: 1,259 notes in one month, of which about forty carry
// anything a person needs to look at.
//
// The unit is the SHIFT, holding what three documents say about it: the roster
// (what was billed), the clock (what was worked) and the note (what was
// documented, in the words of the person who worked it).

import { paidAboveClock } from "./clock.js";
import { isCappedService } from "./compliance.js";

// WHICH SERVICES ARE SUPPOSED TO CARRY A NOTE.
//
// A daily service note documents time spent WITH A CLIENT. Travel, admin, misc
// and training are worked time and get billed, and nobody writes a service note
// against them - the roster for 08/01-08/26 has 319 ILS Admin blocks and 29 of
// them have a note.
//
// Asking for one anyway is not a harmless extra: it fired on 1,644 shifts, and
// a list where two thirds of the rows are asking travel time to explain itself
// is a list nobody reads to the bottom.
//
// The same two names the cap already uses - ILS Service and Self Determination -
// because that is this codebase's existing definition of a client booking. If
// the office expects notes on Training or Housing Search too, this is the line
// that says so.
const NOTE_EXPECTED = (service) => isCappedService(service);

// ---------------------------------------------------------------- keywords

// THE OBJECT OF THE VERB IS THE WHOLE RULE.
//
// Measured on 1,259 notes: a plain search for "cancel" returns 17, of which
// around three are the session falling through. The rest are the service being
// DELIVERED - staff helping a client cancel a phone contract, cancel a gym
// membership, or a client's CT scan being cancelled by the hospital. Flagging a
// member of staff because they helped somebody cancel a gym membership is worse
// than not having the rule.
//
// Anchored to what was cancelled, the same corpus returns four, and all four are
// the session: "client requested to cancel session", "client canceled services
// for today", "client cancelled shift", "Client canceled last min".
const SESSION_CALLED_OFF =
  /\b(cancel\w*|call\w*\s+off)\s+(the\s+|this\s+|their\s+|his\s+|her\s+)?(session|shift|service|services|visit|meeting with staff)\b/i;

// "client cancelled", where what follows is not a thing out in the world that a
// client might legitimately be helped to cancel
const CLIENT_CALLED_OFF =
  /\b(client|consumer)\s+(request\w*\s+to\s+|decided\s+to\s+)?(cancel\w*|no[- ]show\w*)\b(?!\s+(the\s+|their\s+|his\s+|her\s+)?(appointment|phone|gym|membership|subscription|card|order|insurance|policy|plan))/i;

export function sessionCalledOff(note) {
  const text = noteText(note);
  return SESSION_CALLED_OFF.test(text) || CLIENT_CALLED_OFF.test(text);
}

export const noteText = (note) =>
  `${note?.summary || ""} ${(note?.comments || []).join(" ")}`.replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------- thresholds

// Every number a rule turns on, in one place, because each of them is a policy
// choice rather than a fact and Mánu should be able to see and move them.
//
// `minWordsPerHour`: the median note runs 84 words. 13 notes come in under ten
// words and one of those bills 1.92 hours on a single word. Rated per hour
// rather than per note, because forty words is a full account of twenty minutes
// and no account at all of four hours.
//
// `paidOverMin`: ten minutes, the same figure the attendance screen uses.
export const AUDIT_RULES = {
  paidOverMin: 10,
  // the same ten minutes, against the clock rather than against the note
  billedOverClockMin: 10,
  minWordsPerHour: 15,
  signedEarlyMin: 60,
  signedLateDays: 1,
};

// ---------------------------------------------------------------- the reasons

// Each reason says what was measured and what it does NOT establish. These
// sentences are the whole user interface of the rule, so they live beside it.
export const AUDIT_REASONS = {
  "no-note": {
    label: "No service note",
    weight: 100,
    describe: () => "The shift was billed and no service note was filed against it.",
  },
  "session-called-off": {
    label: "The note says the session was called off",
    weight: 80,
    describe: () => "The note says the client cancelled or called off the session.",
  },
  // THE ONE THE AUDIT EXISTS FOR.
  //
  // Mánu 2026-08-26, having opened his own shift in QSP: "i clocked in at 1pm
  // and clocked out at 3:54pm. that is the billable hours i did for that client.
  // my schedule had it at 1pm-5pm but since I clocked out early my time got
  // changed which is good. some people or admin (cant do it anymore) change
  // their time back to the original time (clocking out early and adjusting their
  // time so they dont lose hours/money) and thats what we are looking for."
  //
  // Clocking out early is not the problem - a client ends a session early all
  // the time, and QSP trims the booking to match, which is what SHOULD happen.
  // The problem is a booking that still bills the original length after the
  // clock says the visit was shorter.
  //
  // The clock export keeps the ORIGINAL booking in its own schedule columns
  // while the roster carries the trimmed one, so the two together say which
  // happened. Mánu's own 08/18: roster 1p-3:54p, clock schedule 1p-5p, clocked
  // out 3:54p - trimmed correctly, and it raises nothing.
  "billed-over-clocked": {
    label: "Billed above what was clocked",
    weight: 90,
    describe: (f) =>
      `The roster bills ${hrs(f.billedMin)} and the clock records ${hrs(f.clockedMin)}.`
      + (f.neverTrimmed
        ? " The booking still ends where it was originally scheduled, so it was not trimmed to the clock."
        : ""),
  },
  "paid-over-documented": {
    label: "Billed above what the note documents",
    weight: 60,
    describe: (f) =>
      `The roster bills ${hrs(f.billedMin)} and the note documents ${hrs(f.documentedMin)}.`,
  },
  "signed-before-shift": {
    label: "Signed before the shift ended",
    weight: 50,
    describe: (f) =>
      f.beforeStart
        ? "The note was signed before the shift began."
        : `The note was signed ${Math.abs(f.signedAfterMin)} minutes before the shift ended.`,
  },
  "signed-late": {
    label: "Signed days after the shift",
    weight: 20,
    describe: (f) => `The note was signed ${(f.signedAfterMin / 1440).toFixed(1)} days after the shift.`,
  },
  "thin-note": {
    label: "Short for the time billed",
    weight: 30,
    describe: (f) =>
      `${f.words} ${f.words === 1 ? "word" : "words"} against ${hrs(f.billedMin)} billed.`,
  },
  "never-clocked": {
    label: "Not clocked",
    weight: 40,
    describe: () => "The shift was billed with no clock-in or no clock-out to check it against.",
  },
};

const hrs = (m) => (m == null ? "no time" : `${(m / 60).toFixed(2)} hours`);

// ---------------------------------------------------------------- the reading

// `shift` is a row from the clock export (or a rostered shift with no clock
// data), `note` is the note filed against it, or null.
//
// Returns the reasons this shift is worth reading, heaviest first, with a score
// only used for ordering the queue. A shift with no reasons is not "approved" -
// it is a shift nothing objected to, which is a different thing and is why the
// decision is recorded by a person rather than inferred here.
export function auditReasons(shift, note, rules = AUDIT_RULES) {
  const out = [];
  const billedMin = shift?.scheduledMin ?? null;

  if (!note) {
    // silence on a shift that was never going to have one, rather than a finding
    if (NOTE_EXPECTED(shift?.service)) out.push({ kind: "no-note", billedMin });
  } else {
    if (sessionCalledOff(note)) out.push({ kind: "session-called-off", billedMin });

    const documentedMin = note.minutes ?? null;
    if (billedMin != null && documentedMin != null && billedMin - documentedMin >= rules.paidOverMin) {
      out.push({ kind: "paid-over-documented", billedMin, documentedMin });
    }

    if (note.signedAfterMin != null) {
      // BEFORE THE SHIFT BEGAN is a different statement from before it ended.
      // Writing up at the end of the activity and clocking out a few minutes
      // later is ordinary and accounts for most of these; a note signed the
      // evening before the shift is not that.
      const beforeStart =
        note.startMin != null && note.endMin != null
        && note.signedAfterMin < -(note.endMin - note.startMin);
      if (beforeStart || note.signedAfterMin <= -rules.signedEarlyMin) {
        out.push({ kind: "signed-before-shift", signedAfterMin: note.signedAfterMin, beforeStart });
      } else if (note.signedAfterMin > rules.signedLateDays * 1440) {
        out.push({ kind: "signed-late", signedAfterMin: note.signedAfterMin });
      }
    }

    if (billedMin > 0 && note.words / (billedMin / 60) < rules.minWordsPerHour) {
      out.push({ kind: "thin-note", words: note.words, billedMin });
    }
  }

  // BILLED ABOVE WHAT WAS CLOCKED, which is the thing this screen was built to
  // find. Only where the shift was clocked at BOTH ends - a missing punch has
  // its own finding and cannot also be evidence of over-billing.
  const clockedMin = shift?.workedMin ?? null;
  if (
    billedMin != null && clockedMin != null
    && billedMin - clockedMin >= rules.billedOverClockMin
  ) {
    out.push({
      kind: "billed-over-clocked",
      billedMin,
      clockedMin,
      // the booking still ends where the clock export says it was originally
      // scheduled, so nobody trimmed it to what was worked
      neverTrimmed: shift.originalTo != null && shift.schedTo === shift.originalTo,
    });
  }

  // the clock cannot corroborate a shift it never recorded, which matters most
  // where something else already objected
  if (shift && (shift.noIn || shift.noOut)) out.push({ kind: "never-clocked", billedMin });

  // THE SENTENCE, NOT THE FUNCTION THAT WROTE IT. Spreading the whole entry
  // carries `describe` along, and a function cannot cross into a client
  // component - React refuses the render rather than dropping it.
  return out
    .map((f) => {
      const kind = AUDIT_REASONS[f.kind];
      return { ...f, label: kind.label, weight: kind.weight, text: kind.describe(f) };
    })
    .sort((a, b) => b.weight - a.weight);
}

// what the three records say about one shift, for the card
export function auditRow(shift, note) {
  const reasons = auditReasons(shift, note);
  return {
    billedMin: shift?.scheduledMin ?? null,
    clockedMin: shift?.workedMin ?? null,
    documentedMin: note?.minutes ?? null,
    paidAboveClockMin: paidAboveClock(shift),
    reasons,
    // ordering only. Not a probability, not a severity, and never shown as one.
    score: reasons.reduce((n, r) => n + r.weight, 0),
  };
}

// ---------------------------------------------------------------- the key

// WHAT A DECISION IS ATTACHED TO, and the reason it is not a row id.
//
// This project re-uploads pay periods constantly - four batches for 08/16-08/31
// alone - and every re-upload writes new Timesheet rows. A review keyed to one
// of those rows is thrown away the next time somebody corrects a period, which
// is exactly when the reviewing has already been done.
//
// So a decision is keyed to the SHIFT ITSELF: who worked it, the day, the
// minute the roster starts it, and the client it was booked for. Those four come
// off the documents rather than out of our database, so they survive a
// re-upload, a re-parse and a rebuild.
//
// The person is the normalised QSP spelling rather than a portal account,
// because a shift can belong to somebody with no account matched yet - and the
// spelling comes from the same export every time. `scheduleKey` is what
// normalises it; this takes the result rather than doing it again, so there is
// one definition of "the same person" in the codebase.
export function shiftKeyOf({ employeeKey, date, startMin, client }) {
  return [
    String(employeeKey || "").trim(),
    String(date || "").trim(),
    startMin == null ? "" : String(startMin),
    String(client || "").trim().toLowerCase(),
  ].join("|");
}

// ---------------------------------------------------------------- the client

// THE SAME CLIENT, WRITTEN TWO WAYS.
//
// The roster abbreviates: "Mienik, G", "Mc Carter Jr., W", "Oh, H". The service
// note spells the name out: "Grant Mienik", "William Mc Carter Jr.", "Hankang
// (Oliver) Oh". Compared as plain strings they never match, and a note that
// cannot find its own client's booking gets attached to whatever else that
// person worked that day - which is how a note about Anthony Grant ended up
// reported against Saneeha Amin's shift.
//
// So the comparable part is the surname and the first initial, which is all the
// roster ever gives. Held to that, 226 rostered spellings line up with 218
// written ones.
//
// A parenthetical goes first ("Hankang (Oliver) Oh"), then the form decides how
// to read it: a comma means "Last, First" and no comma means "First Last",
// where the surname is everything after the first word - "Mc Carter Jr." is one
// surname with two spaces and a full stop in it.
export function clientKey(name) {
  const clean = String(name || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "";
  const tidy = (s) => s.toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();

  const comma = clean.lastIndexOf(",");
  let last, first;
  if (comma >= 0) {
    last = clean.slice(0, comma);
    first = clean.slice(comma + 1);
  } else {
    const parts = clean.split(" ");
    first = parts[0];
    last = parts.slice(1).join(" ") || parts[0];
  }
  const initial = tidy(first).charAt(0);
  return `${tidy(last)}|${initial}`;
}

// null names never match each other: two bookings with no client on them are
// not thereby the same client
export const sameClient = (a, b) => {
  const x = clientKey(a);
  return !!x && x === clientKey(b);
};
