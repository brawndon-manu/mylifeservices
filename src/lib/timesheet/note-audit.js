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
    out.push({ kind: "no-note", billedMin });
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

  // the clock cannot corroborate a shift it never recorded, which matters most
  // where something else already objected
  if (shift && (shift.noIn || shift.noOut)) out.push({ kind: "never-clocked", billedMin });

  return out
    .map((f) => ({ ...f, ...AUDIT_REASONS[f.kind], text: AUDIT_REASONS[f.kind].describe(f) }))
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
