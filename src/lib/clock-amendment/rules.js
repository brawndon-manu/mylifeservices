// WHAT A CLOCK AMENDMENT IS, AND WHAT IT MAY SAY.
//
// A staff member could not clock in or out. The hours are still billable, and
// RCOC's rule is that records must SUPPORT the billing - so this is the source
// document for an hour the clock export cannot evidence on its own.
//
// RAISED BY HAND, NOT DETECTED. Mánu 2026-09-18: "if someone needs their time
// amended, they reach out to me. I generate the forms." Nothing here reads the
// clock export looking for work; the office raises one when somebody asks. A
// fortnight of exports was measured while this was being designed, and those
// figures are quoted below only where they settle a design question - they are
// not a queue this fills itself from.
//
// AND THE REASON IS THE POINT. Mánu, the same day: "the reason needs to be
// asked, that's part of the reason we are building this." It is the one thing
// no export holds and no signature substitutes for, so it is required, it is
// asked of the person who was actually there, and "something else" cannot be
// filed without saying what else.

// WHY THE CLOCK RECORD IS WRONG. The whole point of the exercise.
//
// A FIXED LIST AND A SENTENCE, not a sentence alone. The list is what turns a
// pile of forms into a tally - whether this is a training problem or a
// phone-coverage problem at particular homes is a question only a coded answer
// can settle. The sentence is the half an auditor actually reads. Neither one
// is enough on its own.
//
// `other` always last and always demanding the sentence - a list that cannot
// express the real reason gets the nearest wrong one picked instead.
export const REASON_CODES = [
  { code: "nosignal", label: "No signal at the location" },
  { code: "battery", label: "Phone battery died" },
  { code: "app", label: "The app would not load" },
  { code: "forgot", label: "Forgot to clock out" },
  { code: "emergency", label: "Left in an emergency" },
  { code: "other", label: "Something else" },
];

export const reasonLabel = (code) =>
  REASON_CODES.find((r) => r.code === code)?.label || null;

export const isReasonCode = (code) => REASON_CODES.some((r) => r.code === code);

// `other` is the only one that cannot stand on its own
export const reasonNeedsText = (code) => code === "other";

// WHO PUT THEIR NAME TO THE CLIENT HALF.
//
// The person served signs where they can. Where they cannot, the form says who
// did and in what capacity rather than carrying an unexplained signature - a
// name with no stated authority is worth less than an honest blank.
//
// `unavailable` is deliberately one of the options. A missing signature with a
// reason beside it is a record; a missing signature with nothing beside it
// reads as one somebody forgot to collect.
export const SIGNER_KINDS = [
  { kind: "client", label: "The person served" },
  { kind: "parent", label: "Parent" },
  { kind: "conservator", label: "Conservator" },
  { kind: "representative", label: "Authorized representative" },
  { kind: "unavailable", label: "Nobody was available to sign" },
];

export const signerLabel = (kind) =>
  SIGNER_KINDS.find((s) => s.kind === kind)?.label || null;

export const isSignerKind = (kind) => SIGNER_KINDS.some((s) => s.kind === kind);

export const signerIsPresent = (kind) => !!kind && kind !== "unavailable";

// HOW MUCH THE CLOCK ALREADY EVIDENCES, which decides how hard the form asks.
//
//   "partial"  a punch went in, so arrival is on record and only the departure
//              is in question.
//   "none"     neither punch. The signatures carry the whole visit, so the
//              supervisor line stops being optional.
//
// Both happen often enough to be worth drawing differently: a fortnight of
// exports read as an even split between them.
//
// Read off the record rather than stored: a stored answer would be a second
// copy of what the two time fields already say.
export function evidenceLevel(amendment) {
  return amendment?.clockedIn ? "partial" : "none";
}

export const needsSupervisor = (amendment) => evidenceLevel(amendment) === "none";

// WHERE ONE IS IN ITS LIFE. One rule, so the inbox, the chase list and the
// approvals queue cannot disagree about what a row is.
//
// `filled` deliberately means the person asked has signed it - NOT that the
// client has. The client half can be legitimately absent (see `unavailable`),
// and a sheet that never reached "filled" because nobody was home would sit in
// the queue for ever.
export function amendmentStage(a) {
  if (!a) return "draft";
  if (a.approvedAt) return "approved";
  if (a.filledAt) return "filled";
  if (a.sentAt) return "sent";
  return "draft";
}

export const STAGE_LABELS = {
  draft: "Not sent",
  sent: "Waiting on them",
  filled: "Ready to approve",
  approved: "Approved",
};

// WHAT THE FORM CAN ASK SOMEBODY TO CONFIRM RATHER THAN REMEMBER.
//
// Staff write a Detailed Daily Service Note for a visit, with a start and an
// end time, for reasons that have nothing to do with the clock - so a shift the
// clock missed often has one anyway, written before anybody knew there was a
// problem. Where one exists the form prints it and asks "is that right",
// because a confirmed record beats a reconstructed one, and because nobody
// recalls a clock time to the minute whatever they end up signing.
export const hasServiceNote = (a) => !!(a?.dsnStart && a?.dsnEnd);

// what the times field starts at: their own note where there is one, then the
// schedule, then nothing. Never the clock - the clock is what is wrong.
export function suggestedTimes(a) {
  if (!a) return { in: null, out: null, from: null };
  if (hasServiceNote(a)) return { in: a.dsnStart, out: a.dsnEnd, from: "note" };
  if (a.scheduledIn || a.scheduledOut) {
    return { in: a.scheduledIn || null, out: a.scheduledOut || null, from: "schedule" };
  }
  return { in: null, out: null, from: null };
}
