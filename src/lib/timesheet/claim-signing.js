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

// the kinds an employee reports themselves. `q_`/`fix_` rows are question
// answers, which are a different conversation and never a claim.
const isClaim = (c) => {
  const k = String(c?.kind || "");
  return !!k && !k.startsWith("q_") && !k.startsWith("fix_");
};

export const claimsOf = (corrections) => (corrections || []).filter(isClaim);

// WHERE THIS SHEET IS in the flow above.
//
//   "clean"    nothing reported - the ordinary signed timesheet
//   "pending"  claims on record, awaiting payroll's decision
//   "decided"  every claim resolved, and the sheet is waiting to be rebuilt or
//              signed off
export function claimStage(sheet) {
  const claims = claimsOf(sheet?.corrections);
  if (!claims.length) return "clean";
  return claims.some((c) => c.status === "open") ? "pending" : "decided";
}

// A CLAIM CAN ALWAYS BE SIGNED. This is the hold being lifted: the only thing
// that ever stopped a signature was an open report, and that is exactly the
// state this flow exists to give a document to.
export const canSignClaim = () => true;

// WAS EVERY CLAIM GRANTED AS ASKED? The question payroll's decision answers,
// and the only thing that decides whether they sign again.
export function grantedAsReported(corrections) {
  const claims = claimsOf(corrections);
  if (!claims.length) return true;
  if (claims.some((c) => c.status === "open")) return false;
  return claims.every((c) => c.status === "accepted");
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
export function signatureSurvives({ corrections, before, after }) {
  if (!grantedAsReported(corrections)) return { keep: false, why: "changed" };
  const claimed = claimsOf(corrections).map((c) => c.date).filter(Boolean);
  const moved = daysMovedOutsideClaim(before, after, claimed);
  if (moved.length) return { keep: false, why: "otherDaysMoved", moved };
  return { keep: true, why: "grantedAsReported" };
}
