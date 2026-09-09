// A SIGNATURE ON A CLAIM, NOT ON A FIGURE.
//
// Mánu 2026-09-09: "i was thinking a pending one so they dont have to go back
// again and sign it if it was fully approved on the changes they implemented."
//
// The old flow refused a signature the moment somebody reported a problem, so a
// person who found a mistake waited with no document at all, and every approval
// then cost a second signature even when payroll had granted exactly what was
// asked. This is the flow that replaces it:
//
//   1. they review, report, enter leave
//   2. they sign the PENDING document - page 1 the timesheet as recorded with no
//      attestation on it, page 2 the reported changes, and the signature on
//      page 2 (his pick, "C", of three mocks)
//   3. payroll decides, the figures move, the office signs off once QuickSolve
//      matches (qspSignedOffAt, declared 2026-09-02 and never wired)
//   4. approved as reported -> the signature stands and they are told
//   5. denied, changed, or a day they never reported moved -> new document, new
//      signature, with the reason
//
// WHAT THE SIGNATURE IS ON decides everything else. They attest to their CLAIM,
// so the regular/overtime/double split is not theirs to agree with - it is the
// employer's arithmetic on the hours. That is why approving every reported item
// does not need a fresh signature even though the totals move: nothing they
// attested to changed. What DOES need one is a day they never mentioned moving,
// because the rebuild re-runs the rules across the whole sheet and can shift a
// day nobody claimed.
//
// Pure. No Prisma, no rendering - the states in, the decision out.
import { TIME_OFF_KIND } from "./time-off.js";

// the days a time-off answer asks for, the ones that could be granted
export const timeOffEntries = (row) =>
  (Array.isArray(row?.timeOff) ? row.timeOff : []).filter((e) => e?.date && Number(e.hours) > 0);

// the kinds an employee reports themselves. `q_`/`fix_` rows are question
// answers, which are a different conversation and never a claim. A time-off
// answer is a claim only when it says "yes" and names a day: a "no" agrees
// with the schedule and asks for nothing.
const isClaim = (c) => {
  const k = String(c?.kind || "");
  if (!k || k.startsWith("q_") || k.startsWith("fix_")) return false;
  if (k === TIME_OFF_KIND) return c.choice === "yes" && timeOffEntries(c).length > 0;
  return true;
};

// A TIME-OFF CLAIM IS DECIDED ON THE CALENDAR, NOT ON ITS ROW. The row is
// stored "noted" and stays that way; what the office does is add the day to
// the calendar (a PtoEntry), and that is the only record of a decision there
// is. So its status is read against the accepted days: every claimed day on
// the calendar with the same kind and hours is granted; a day that is there
// with a different kind or figure was changed; a day not there at all is
// still waiting. Matched on the date alone, because a claim for sick pay
// granted as PTO is a decision, not an absence of one.
export function timeOffStatus(row, acceptedTimeOff = []) {
  let changed = false;
  for (const e of timeOffEntries(row)) {
    const hit = (acceptedTimeOff || []).find((a) => a?.date === e.date);
    if (!hit) return "open";
    const kind = (x) => (x === "sick" ? "sick" : "pto");
    if (kind(hit.kind) !== kind(e.kind) || Math.abs(Number(hit.hours) - Number(e.hours)) > 0.005) changed = true;
  }
  return changed ? "changed" : "accepted";
}

// one claim's status as payroll's decision sees it, whichever row holds it
export const claimStatus = (c, acceptedTimeOff) =>
  c?.kind === TIME_OFF_KIND ? timeOffStatus(c, acceptedTimeOff) : c?.status;

export const claimsOf = (corrections) => (corrections || []).filter(isClaim);

// WHERE THIS SHEET IS in the flow above.
//
//   "clean"    nothing reported - the ordinary signed timesheet
//   "pending"  claims on record, awaiting payroll's decision
//   "decided"  every claim resolved, and the sheet is waiting to be rebuilt or
//              signed off
// `timeOff` is the calendar's accepted days for the sheet - the time-off
// claims are read against it, see timeOffStatus.
export function claimStage(sheet, { timeOff } = {}) {
  const claims = claimsOf(sheet?.corrections);
  if (!claims.length) return "clean";
  const accepted = timeOff ?? sheet?.timeOff ?? [];
  return claims.some((c) => claimStatus(c, accepted) === "open") ? "pending" : "decided";
}

// A CLAIM CAN ALWAYS BE SIGNED. This is the hold being lifted: the only thing
// that ever stopped a signature was an open report, and that is exactly the
// state this flow exists to give a document to.
export const canSignClaim = () => true;

// WAS EVERY CLAIM GRANTED AS ASKED? The question payroll's decision answers,
// and the only thing that decides whether they sign again.
export function grantedAsReported(corrections, { timeOff } = {}) {
  const claims = claimsOf(corrections);
  if (!claims.length) return true;
  const statuses = claims.map((c) => claimStatus(c, timeOff || []));
  if (statuses.some((st) => st === "open")) return false;
  return statuses.every((st) => st === "accepted");
}

// A DAY THEY NEVER REPORTED THAT MOVED ANYWAY.
//
// The rebuild re-runs the entitlement and overtime rules over every day, so an
// accepted claim on one date can shift another. A day they claimed is expected
// to move - that is the point - but a day they never mentioned changing under
// them is a figure they never saw, and that is worth a fresh signature.
//
// Compared on PAID HOURS, which is the figure a day is judged by; the
// regular/overtime split is derived from it and is not the employee's to agree.
export function daysMovedOutsideClaim(before, after, claimedDates, tolerance = 0.005) {
  const claimed = new Set(claimedDates || []);
  const was = new Map((before || []).map((d) => [d.date, d]));
  const moved = [];
  for (const d of after || []) {
    if (claimed.has(d.date)) continue;
    const prior = was.get(d.date);
    if (!prior) { moved.push({ date: d.date, was: null, now: d.paidHours ?? 0 }); continue; }
    if (Math.abs((d.paidHours || 0) - (prior.paidHours || 0)) > tolerance) {
      moved.push({ date: d.date, was: prior.paidHours ?? 0, now: d.paidHours ?? 0 });
    }
  }
  // a day that disappeared entirely, which an accepted day_extra does on a date
  // they DID claim - only unclaimed ones reach here
  for (const d of before || []) {
    if (claimed.has(d.date)) continue;
    if (!(after || []).some((x) => x.date === d.date)) {
      moved.push({ date: d.date, was: d.paidHours ?? 0, now: null });
    }
  }
  return moved;
}

// DOES THE SIGNATURE SURVIVE THE REBUILD? The rebuild clears it unconditionally
// today, with the note that a corrected sheet is a different document. That
// stays true when the document changed under them, and stops being true when
// payroll granted exactly what they signed for.
export function signatureSurvives({ corrections, before, after, timeOff }) {
  if (!grantedAsReported(corrections, { timeOff })) return { keep: false, why: "changed" };
  // the days they claimed: a correction's own date, or every day a time-off
  // answer names - those are expected to appear, and appearing is not moving
  const claimed = claimsOf(corrections).flatMap((c) =>
    c.kind === TIME_OFF_KIND ? timeOffEntries(c).map((e) => e.date) : [c.date],
  ).filter(Boolean);
  const moved = daysMovedOutsideClaim(before, after, claimed);
  if (moved.length) return { keep: false, why: "otherDaysMoved", moved };
  return { keep: true, why: "grantedAsReported" };
}
