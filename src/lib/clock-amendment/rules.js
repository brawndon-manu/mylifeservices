// WHAT A CLOCK AMENDMENT IS, AND WHAT IT MAY SAY.
//
// A staff member could not clock in or out. The hours are still billable, and
// the regional center's rule is that records must SUPPORT the billing - so this
// is the source document for an hour the clock export cannot evidence on its
// own.
//
// RAISED BY HAND, NOT DETECTED. Somebody tells the office they could not clock
// out; the office reads that day's clock export and service notes and raises
// one for the shift they name. Nothing here reads an export looking for work.
//
// AND THE REASON IS THE POINT. It is the one thing no export holds and no
// signature substitutes for. It is their own account of what happened, in
// their words and nothing else: the office takes it down on the call, the
// person who was there confirms or corrects it, and their signature makes it
// theirs. Both versions are kept, so a correction is visible rather than lost.
//
// no imports beyond two other import-free modules: the token page is a client
// component and the test runner loads this file directly
import { noteMinute } from "../timesheet/note-minute.js";
import { FILED_GAP_MIN } from "../timesheet/auto-flag.js";

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
//   "none"     neither punch. The signatures carry the whole visit.
//
// Read off the record rather than stored: a stored answer would be a second
// copy of what the two time fields already say.
export function evidenceLevel(amendment) {
  return amendment?.clockedIn ? "partial" : "none";
}

export const needsSupervisor = (amendment) => evidenceLevel(amendment) === "none";

// WHAT IS WRONG WITH THE CLOCK RECORD, read off the shift.
//
// A punch can be missing at either end, or the clock-in can be LATE: both
// punches present, the first of them minutes after the scheduled start.
// Lateness is measured, never read off the export's own "Late Clock In"
// column - on 09/21 that column was set on a shift clocked to the minute.
//
// Every clock-in after the scheduled minute is listed, because QSP calls every
// one of them late, a person who was there on time and could not clock in for
// some reason wants the record right even by a minute, and the office raises
// a form only for the ones it fills in.
// The floor exists so it can be raised if a day's list ever gets too long;
// it started at five and came down to one the first time a real two-minute
// clock-in was the case somebody wanted to amend.
export const LATE_MIN = 1;

// THE TWO ENDS OF A SHIFT, EACH ON ITS OWN. A location mark only exists on a
// punch that happened, so the clock-in is one of: fine, late, without a
// location, late and without a location, or missing; the clock-out is fine,
// without a location, or missing. Everything the form asks and everything the
// office corrects is decided per end from these five facts, never from one
// "main" problem, so a late clock-in beside a missing clock-out asks for both.
export function clockEnds(shift) {
  const inMissing = !!shift?.noIn;
  const outMissing = !!shift?.noOut;
  const late = !inMissing && shift?.startDelta != null && shift.startDelta >= LATE_MIN;
  const inNoGps = !inMissing && shift?.gpsIn === "no";
  const outNoGps = !outMissing && shift?.gpsOut === "no";
  return { inMissing, outMissing, late, inNoGps, outNoGps };
}

// the same five facts read off a stored record: the clock row it kept, or the
// two punch columns when a row somehow has none
export function endsOf(a) {
  if (!a) return clockEnds(null);
  if (a.clockRow) return clockEnds(a.clockRow);
  return clockEnds({ noIn: !a.clockedIn, noOut: !a.clockedOut, startDelta: null, gpsIn: null, gpsOut: null });
}

// whether a shift needs a form at all
export const hasIssue = (shift) => Object.values(clockEnds(shift)).some(Boolean);

// ONE WORD FOR THE QUEUE'S TALLY, by weight: a punch that never went in
// outranks a late one, which outranks a missing location. Everything else
// reads the ends directly.
export function punchIssue(shift) {
  const e = clockEnds(shift);
  if (e.inMissing && e.outMissing) return "none";
  if (e.inMissing) return "noIn";
  if (e.outMissing) return "noOut";
  if (e.late) return "lateIn";
  if (e.inNoGps || e.outNoGps) return "noGps";
  return null;
}

export const issueOf = (a) => (a ? punchIssue(a.clockRow || { noIn: !a.clockedIn, noOut: !a.clockedOut }) : null);

// which ends of a shift went in without a location
export function noGpsEnds(shift) {
  const e = clockEnds(shift);
  return { in: e.inNoGps, out: e.outNoGps };
}

// WHICH TIMES THE FORM ASKS FOR: the start when it is missing, late, or has no
// location; the end when it is missing or has no location. A punch that only
// lacked a location is shown as clocked for them to confirm, so the
// attestation can state the times the person is signing for.
export function asksStart(a) { const e = endsOf(a); return e.inMissing || e.late || e.inNoGps; }
export function asksEnd(a) { const e = endsOf(a); return e.outMissing || e.outNoGps; }

// WHICH ENDS THE FORM ASKS A PLACE FOR: any punch the clock holds no location
// for, whether it went in without one or never went in. the time can be
// confirmed off a note or a schedule; where somebody was can only come from
// them, and it is what a signature over a missing location is worth.
export function asksPlace(a) {
  const e = endsOf(a);
  return { in: e.inMissing || e.inNoGps, out: e.outMissing || e.outNoGps };
}

// WHICH PUNCHES THE OFFICE CORRECTS IN THE CLOCK SYSTEM once it approves: a
// punch that is missing or late. a punch that only lacked a location stands.
export function qspFixNeeded(a) {
  const e = endsOf(a);
  return { in: e.inMissing || e.late, out: e.outMissing };
}

// what the time boxes start at, per end. a missing or late punch starts from
// the note, then the schedule, never the clock; a punch that only lacked a
// location is a real punch, and the clock is what they are asked to confirm
export function startingTimes(a) {
  const e = endsOf(a);
  const s = suggestedTimes(a);
  const inAsClocked = e.inNoGps && !e.late && !e.inMissing;
  const outAsClocked = e.outNoGps && !e.outMissing;
  return {
    in: inAsClocked ? a?.clockedIn || null : s.in,
    out: outAsClocked ? a?.clockedOut || null : s.out,
    from: inAsClocked && outAsClocked ? "clock" : s.from,
    inAsClocked,
    outAsClocked,
  };
}

// the clock export prints people "Last, First"; a form and an email say
// "First Last". a booking with several people on it keeps each one in order.
export function firstLast(name) {
  const s = String(name || "").trim();
  if (!s) return "";
  return s
    .split(";")
    .map((part) => {
      const p = part.trim();
      const i = p.indexOf(",");
      if (i < 0) return p;
      const last = p.slice(0, i).trim();
      const first = p.slice(i + 1).trim();
      return [first, last].filter(Boolean).join(" ");
    })
    .join("; ");
}

// THE HEADLINE THE FORM OPENS WITH, in plain words, saying everything that is
// wrong with the record and nothing that is not: one phrase per end, joined.
export function missingPunchText(a) {
  const e = endsOf(a);
  if (e.inMissing && e.outMissing) return "did not clock in or out";
  if (e.inNoGps && e.outNoGps && !e.late) return "clocked in and out without a location";
  const parts = [];
  if (e.inMissing) parts.push("did not clock in");
  else if (e.late) parts.push(`clocked in late${e.inNoGps ? " and without a location" : ""}`);
  else if (e.inNoGps) parts.push("clocked in without a location");
  if (e.outMissing) parts.push("did not clock out");
  else if (e.outNoGps) parts.push("clocked out without a location");
  return parts.join(" and ") || "did not clock out";
}

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

// the client half on its own: signed, honestly absent, or still to collect
export function clientStage(a) {
  if (a?.clientSignedAt) return "signed";
  if (a?.clientUnavailableReason) return "unavailable";
  return "waiting";
}

// what the queue prints on a row, finer than the stage where it matters
export function stageLine(a) {
  const stage = amendmentStage(a);
  if (stage === "filled" && clientStage(a) === "waiting") return "Signed, waiting on the person served";
  return STAGE_LABELS[stage];
}

// approval waits for the staff signature and for the client half to be either
// signed or explained. it never waits for a signature that is legitimately
// never coming.
export function canApprove(a) {
  if (!a || a.approvedAt) return false;
  if (!a.filledAt) return false;
  return clientStage(a) !== "waiting";
}

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

// ---------------------------------------------------------- intake vs confirmed

export const CLAIM_FIELDS = [
  { field: "reasonText", label: "what happened" },
  { field: "actualIn", label: "the start time" },
  { field: "actualOut", label: "the end time" },
  { field: "placeIn", label: "where they were at clock-in" },
  { field: "placeOut", label: "where they were at clock-out" },
];

const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

// what the office took down on the call
export function intakeOf(a) {
  return {
    reasonText: a?.intakeReasonText || null,
    actualIn: a?.intakeActualIn || null,
    actualOut: a?.intakeActualOut || null,
    placeIn: a?.intakePlaceIn || null,
    placeOut: a?.intakePlaceOut || null,
  };
}

// what the person who was there put their name to. before they have, it is
// the intake, so a screen can always print one answer.
export function confirmedOf(a) {
  if (!a?.filledAt) return intakeOf(a);
  return {
    reasonText: a.reasonText || null,
    actualIn: a.actualIn || null,
    actualOut: a.actualOut || null,
    placeIn: a.placeIn || null,
    placeOut: a.placeOut || null,
  };
}

// every field they changed before signing, with both versions. empty until
// they have signed, because an unsigned difference is a draft, not a correction
export function correctionsOf(a) {
  if (!a?.filledAt) return [];
  const was = intakeOf(a);
  const now = confirmedOf(a);
  const out = [];
  for (const { field, label } of CLAIM_FIELDS) {
    if (norm(was[field]) === norm(now[field])) continue;
    out.push({ field, label, was: was[field], now: now[field] });
  }
  return out;
}

// ------------------------------------------------------------------ the checks

// minutes from the note being filed to the end time claimed. positive means
// the claim runs past the filing; null when either side is missing
export function claimGap(a) {
  const out = noteMinute(confirmedOf(a).actualOut);
  const filed = noteMinute(a?.note?.signedAt);
  if (out == null || filed == null) return null;
  return out - filed;
}

// minutes the claimed end runs past the scheduled end, same shape
export function scheduleGap(a) {
  const out = noteMinute(confirmedOf(a).actualOut);
  const sched = noteMinute(a?.scheduledOut);
  if (out == null || sched == null) return null;
  return out - sched;
}

// minutes the claimed start runs AHEAD of the scheduled start: a late clock-in
// amended to before the booking began is claiming time the roster never held
export function startGap(a) {
  const start = noteMinute(confirmedOf(a).actualIn);
  const sched = noteMinute(a?.scheduledIn);
  if (start == null || sched == null) return null;
  return sched - start;
}

// WHAT THE APPROVER IS TOLD BEFORE PRESSING APPROVE. Every one of these RANKS
// and none concludes: a visit can legitimately run past the schedule, and a
// note can legitimately be filed before the last ten minutes. The threshold is
// the Audit engine's own, so the two screens cannot disagree about what "away
// from the note" means.
export function approvalFlags(a) {
  const flags = [];
  if (!a) return flags;
  const gap = claimGap(a);
  if (gap != null && gap > FILED_GAP_MIN) {
    flags.push({ kind: "pastNote", text: `The end time is ${gap} minutes after the note was filed at ${a.note.signedAt}.` });
  }
  const sg = scheduleGap(a);
  if (sg != null && sg > FILED_GAP_MIN) {
    flags.push({ kind: "beyondSchedule", text: `The end time is ${sg} minutes after the scheduled end of ${a.scheduledOut}.` });
  }
  const st = startGap(a);
  if (st != null && st > FILED_GAP_MIN) {
    flags.push({ kind: "beforeSchedule", text: `The start time is ${st} minutes before the scheduled start of ${a.scheduledIn}.` });
  }
  const e = endsOf(a);
  if (e.late && a.clockRow?.startDelta != null) {
    flags.push({ kind: "lateIn", text: `The clock-in was ${a.clockRow.startDelta} minutes after the scheduled start; the punch itself stands, only the start time is being amended.` });
  }
  if (e.inNoGps || e.outNoGps) {
    const where = e.inNoGps && e.outNoGps ? "at either punch" : e.inNoGps ? "at the clock-in" : "at the clock-out";
    flags.push({ kind: "noGps", text: `No location was captured ${where}; that punch's time stands and the signatures carry where the visit happened.` });
  }
  const corrections = correctionsOf(a);
  if (corrections.length) {
    flags.push({
      kind: "corrected",
      text: `They changed what the office took down: ${corrections.map((c) => `${c.label} was "${c.was || "-"}", now "${c.now || "-"}"`).join("; ")}.`,
    });
  }
  if (evidenceLevel(a) === "none") {
    flags.push({ kind: "noPunch", text: "Neither punch was recorded, so the signatures carry the whole visit." });
  }
  if (!a.note && !hasServiceNote(a)) {
    flags.push({ kind: "noNote", text: "No service note was found for this person, client and day." });
  }
  if (a.filledAt && clientStage(a) === "waiting") {
    flags.push({ kind: "noClient", text: "The person served has not signed yet." });
  }
  if (clientStage(a) === "unavailable") {
    flags.push({ kind: "clientUnavailable", text: `Nobody was available to sign: ${a.clientUnavailableReason}` });
  }
  return flags;
}

// the number printed on the document. the day it was raised and the tail of
// the record id, which is unique enough for a printed reference and never
// changes once the row exists
export function formNumber(a) {
  const d = a?.createdAt ? new Date(a.createdAt) : null;
  const day = d && !Number.isNaN(d.getTime())
    ? `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
    : "000000";
  const tail = String(a?.id || "").slice(-4).toUpperCase() || "0000";
  return `CA-${day}-${tail}`;
}
