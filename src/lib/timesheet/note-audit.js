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
  // ten minutes, measured against the CLOCK. There used to be a matching
  // threshold against the note and it was measuring nothing - see below.
  billedOverClockMin: 10,
  minWordsPerHour: 15,
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
  // MEASURED AGAINST THE CLOCK, never against the clock export's schedule
  // columns. Those are not reliably the original booking: QSP keeps the original
  // END where a session was cut short (Uribe 08/18 - billed 1p-3:54p, clock
  // schedule 1p-5p) but moves the START to the clock-in where somebody began
  // late (Salinas 08/17 - clock schedule 8:10a-12p while the timesheet still
  // pays from 8a). The timesheet is what pays, so billed against clocked is the
  // whole comparison and `neverTrimmed` only colours the sentence.
  "billed-over-clocked": {
    label: "Billed above what was clocked",
    weight: 90,
    describe: (f) =>
      `The roster bills ${hrs(f.billedMin)} and the clock records ${hrs(f.clockedMin)}.`
      + (f.neverTrimmed
        ? " The booking still ends where it was originally scheduled, so it was not trimmed to the clock."
        : ""),
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

    // THERE IS NO RULE HERE COMPARING BILLED TO THE NOTE'S OWN TIMES, and there
    // must not be. The note does not carry an independent account of when the
    // visit happened: measured over the 494 shifts holding both a note and a
    // clock record, the note's time equals the BILLED time in 494 of 494, and
    // the clocked time in none of the 43 where the two differ. QSP fills it from
    // the booking.
    //
    // So billed-against-documented was comparing a number with a copy of itself.
    // It fired on 2 shifts in 1,786 and neither said anything the clock did not
    // say better. The note earns its place on the card as PROSE - what it
    // describes, how much of it there is - and never as a third clock.

    // NOTHING IS RAISED ABOUT WHEN THE NOTE WAS SIGNED. Mánu 2026-08-27 had
    // both signing rules removed: writing up early or late is a paperwork
    // habit, and what decides whether the hours were worked is the clock.
    // Between them they fired on 75 shifts and pushed the billing findings
    // further down every card they appeared on.
    //
    // The signing time is still READ and still shown under the note, because a
    // reviewer opening one may want it. It just does not surface a shift on its
    // own any more.

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
      // THE BOOKING IS UNTOUCHED AT BOTH ENDS, so nobody adjusted it to what
      // was worked. Comparing only the end missed a late clock-IN against an
      // unaltered booking - Cain 08/18 bills 4p-5:30p against a clock starting
      // 4:28p, and the end matching says nothing about that.
      neverTrimmed:
        shift.originalFrom != null && shift.originalTo != null
        && shift.schedFrom === shift.originalFrom && shift.schedTo === shift.originalTo,
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
//
// THE CLIENT GOES IN NORMALISED, and that is the whole of the fourth part.
//
// It used to go in as whatever the screen was printing, and the screen prints
// whichever document supplied the full name - the roster's "Sherwold, A" when
// nothing else reached the shift, the clock export's "Sherwold, Abigail" when a
// punch did. So the key changed with the FILES rather than with the shift, and
// three of Mánu's fifty decisions came unstuck from their shifts the moment a
// period was uploaded with a different set of exports: an approval keyed
// `sherwold, a` against a screen now keying `sherwold, abigail`, and two the
// other way round.
//
// `clientKey` is the same surname-and-initial reduction `sameClient` matches
// on, and it is identical for all three spellings - which is the property this
// key needed and did not have. A name it cannot reduce keeps its own tidied
// spelling rather than collapsing to nothing.
export function shiftKeyOf({ employeeKey, date, startMin, client }) {
  const named = String(client || "").trim();
  return [
    String(employeeKey || "").trim(),
    String(date || "").trim(),
    startMin == null ? "" : String(startMin),
    named ? clientKey(named) || named.toLowerCase() : "",
  ].join("|");
}

// ---------------------------------------------------------------- the client

// THE SAME CLIENT, WRITTEN TWO WAYS.
//
// The roster and the clock export abbreviate: "Mienik, G", "Sherwold, A",
// "Mc Carter Jr., W". The service note spells the name out: "Grant Mienik",
// `Abigail "Abbie" Sherwold`, "William Mc Carter Jr.". Compared as plain
// strings they never match, and a note that cannot find its own client's
// booking gets attached to another one - or, worse, its shift is reported as
// having no note at all while the note sits in the file.
//
// THE COMMA FORM IS THE AUTHORITY. It says exactly where the surname ends,
// which the written-out form never does: "William E Nelson", "Trixi Roa
// Garcia" and "Min Suh Choi" all carry a middle name, and "William Mc Carter
// Jr." is one surname of three words. Guessing "everything after the first
// word" got Sherwold, Nelson, Garcia, Choi and seven others wrong.
//
// So the abbreviated side supplies the surname and the initial, and the written
// side only has to END with that surname and START with that initial.
//
// Nicknames come off first, in brackets OR quotes - the export uses both:
// "Hankang (Oliver) Oh", `Abigail "Abbie" Sherwold`, "Jose ( Angel) Acuna".
const tidy = (s) =>
  String(s || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/["'\u2018\u2019\u201c\u201d][^"'\u2018\u2019\u201c\u201d]*["'\u2018\u2019\u201c\u201d]/g, " ")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function clientParts(name) {
  const raw = String(name || "");
  const comma = raw.lastIndexOf(",");
  if (comma >= 0) {
    const surname = tidy(raw.slice(0, comma));
    const initial = tidy(raw.slice(comma + 1)).charAt(0);
    return { abbreviated: true, surname, initial, words: tidy(raw).split(" ").filter(Boolean) };
  }
  const words = tidy(raw).split(" ").filter(Boolean);
  return { abbreviated: false, surname: words.slice(1).join(" "), initial: (words[0] || "").charAt(0), words };
}

// does the written-out name end with this surname and start with this initial?
function answersTo({ surname, initial }, words) {
  if (!surname || !initial || !words.length) return false;
  const parts = surname.split(" ").filter(Boolean);
  if (words.length < parts.length) return false;
  const tail = words.slice(words.length - parts.length).join(" ");
  return tail === surname && words[0].charAt(0) === initial;
}

export function clientKey(name) {
  const p = clientParts(name);
  return p.surname && p.initial ? `${p.surname}|${p.initial}` : "";
}

// THE NAME AS IT SHOULD READ ON SCREEN. Mánu 2026-08-27: "lets show full names
// of clients."
//
// Three spellings of one client reach these screens: the roster abbreviates
// ("Sherwold, A"), the clock export spells it out back to front ("Sherwold,
// Abigail \"Abbie\"") and the note spells it out front to back ("Octavio
// Nieto"). Showing whichever arrived first put all three shapes on one screen.
//
// Everything reads "Last, First" here, which is what the rest of the portal
// uses for a person. Turning the note's shape round needs to know where the
// surname starts, and only the abbreviated form knows - so it is handed in, the
// same authority `sameClient` leans on.
export function displayClient(full, abbreviated) {
  const raw = String(full || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/["'\u2018\u2019\u201c\u201d][^"'\u2018\u2019\u201c\u201d]*["'\u2018\u2019\u201c\u201d]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return abbreviated || null;

  const comma = raw.lastIndexOf(",");
  if (comma >= 0) {
    const last = raw.slice(0, comma).trim();
    const first = raw.slice(comma + 1).trim();
    return first ? `${last}, ${first}` : last;
  }

  const words = raw.split(" ");
  const A = clientParts(abbreviated);
  if (A.abbreviated && A.surname) {
    const n = A.surname.split(" ").length;
    if (words.length > n) {
      return `${words.slice(words.length - n).join(" ")}, ${words.slice(0, words.length - n).join(" ")}`;
    }
  }
  // nothing to lean on, so the last word is the surname
  return words.length > 1 ? `${words[words.length - 1]}, ${words.slice(0, -1).join(" ")}` : raw;
}

// null names never match each other: two bookings with no client on them are
// not thereby the same client
export function sameClient(a, b) {
  const A = clientParts(a);
  const B = clientParts(b);
  if (!A.words.length || !B.words.length) return false;
  if (A.abbreviated && B.abbreviated) {
    return !!A.surname && A.surname === B.surname && A.initial === B.initial;
  }
  if (A.abbreviated) return answersTo(A, B.words);
  if (B.abbreviated) return answersTo(B, A.words);
  // neither is abbreviated, so fall back to comparing them whole
  return A.words.join(" ") === B.words.join(" ");
}
