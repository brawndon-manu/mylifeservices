// A SIGNATURE ON A CLAIM, NOT ON A FIGURE (Mánu 2026-09-09, mock C).
// These pin the rule that decides whether somebody signs twice.
import test from "node:test";
import assert from "node:assert/strict";

import {
  claimsOf, claimStage, canSignClaim, grantedAsReported,
  daysMovedOutsideClaim, signatureSurvives, timeOffStatus,
  signedClaimSnapshot, decideSignature, CLAIM_SELECT, allClaimsDecided,
} from "../claim-signing.js";

const claim = (date, status, kind = "hours") => ({ date, status, kind });
const day = (date, paidHours) => ({ date, paidHours });

test("a claim is what the employee reported, never a question answer", () => {
  const rows = [
    claim("09/03/37", "open"),
    { kind: "q_duplicateDay", date: "09/11/37", status: "declined" },
    { kind: "fix_restNoTimes", date: "09/04/37", status: "accepted" },
    { kind: "time_off", date: null, status: "noted", choice: "yes", timeOff: [{ date: "09/09/37", kind: "pto", hours: 8 }] },
    // a "no" agrees with the schedule and asks for nothing; a "yes" naming no
    // day asks for nothing either
    { kind: "time_off", date: null, status: "noted", choice: "no", timeOff: null },
    { kind: "time_off", date: null, status: "noted", choice: "yes", timeOff: [] },
  ];
  assert.deepEqual(claimsOf(rows).map((c) => c.kind), ["hours", "time_off"]);
  assert.deepEqual(claimsOf([]), []);
  assert.deepEqual(claimsOf(null), []);
});

test("the stage follows the claims, not the signature", () => {
  assert.equal(claimStage({ corrections: [] }), "clean");
  assert.equal(claimStage({ corrections: [{ kind: "q_mealLate", status: "open" }] }), "clean");
  assert.equal(claimStage({ corrections: [claim("09/03/37", "open")] }), "pending");
  assert.equal(claimStage({ corrections: [claim("09/03/37", "accepted")] }), "decided");
  assert.equal(claimStage({ corrections: [claim("09/03/37", "declined")] }), "decided");
  // one still open holds the whole sheet pending
  assert.equal(claimStage({ corrections: [claim("09/03/37", "accepted"), claim("09/09/37", "open")] }), "pending");
});

test("THE HOLD IS LIFTED: a reported sheet is signable", () => {
  // the whole point of the change - the old flow refused a signature here
  assert.equal(canSignClaim(), true);
});

test("granted as reported means every claim accepted, none open", () => {
  assert.equal(grantedAsReported([]), true, "nothing reported is trivially granted");
  assert.equal(grantedAsReported([claim("09/03/37", "accepted")]), true);
  assert.equal(grantedAsReported([claim("09/03/37", "accepted"), claim("09/09/37", "accepted")]), true);
  assert.equal(grantedAsReported([claim("09/03/37", "declined")]), false);
  assert.equal(grantedAsReported([claim("09/03/37", "accepted"), claim("09/09/37", "declined")]), false);
  assert.equal(grantedAsReported([claim("09/03/37", "open")]), false, "undecided is not granted");
  // a question answer beside a granted claim does not spoil it
  assert.equal(
    grantedAsReported([claim("09/03/37", "accepted"), { kind: "q_mealLate", date: "09/04/37", status: "declined" }]),
    true,
  );
});

test("a day they claimed is expected to move; one they never mentioned is not", () => {
  const before = [day("09/03/37", 4.5), day("09/04/37", 6.5), day("09/11/37", 13)];
  // the claimed day moved, and nothing else did
  const after = [day("09/03/37", 6.5), day("09/04/37", 6.5), day("09/11/37", 13)];
  assert.deepEqual(daysMovedOutsideClaim(before, after, ["09/03/37"]), []);
  // now an unclaimed day moves too
  const drifted = [day("09/03/37", 6.5), day("09/04/37", 7), day("09/11/37", 13)];
  assert.deepEqual(daysMovedOutsideClaim(drifted && before, drifted, ["09/03/37"]), [
    { date: "09/04/37", was: 6.5, now: 7 },
  ]);
  // a day appearing from nowhere, and a day vanishing, both count
  assert.deepEqual(
    daysMovedOutsideClaim(before, [...after, day("09/07/37", 6.5)], ["09/03/37"]),
    [{ date: "09/07/37", was: null, now: 6.5 }],
  );
  assert.deepEqual(
    daysMovedOutsideClaim(before, after.filter((d) => d.date !== "09/11/37"), ["09/03/37"]),
    [{ date: "09/11/37", was: 13, now: null }],
  );
  // a rounding wobble is not a move
  assert.deepEqual(daysMovedOutsideClaim(before, [day("09/03/37", 4.5), day("09/04/37", 6.502), day("09/11/37", 13)], []), []);
});

test("the signature survives only a clean grant", () => {
  const before = [day("09/03/37", 4.5), day("09/04/37", 6.5)];
  const after = [day("09/03/37", 6.5), day("09/04/37", 6.5)];
  const corrections = [claim("09/03/37", "accepted")];
  assert.deepEqual(signatureSurvives({ corrections, before, after }), {
    keep: true, why: "grantedAsReported",
  });
  // denied -> they sign the new document
  assert.deepEqual(
    signatureSurvives({ corrections: [claim("09/03/37", "declined")], before, after }),
    { keep: false, why: "changed" },
  );
  // granted, but an unclaimed day moved under them
  const drifted = [day("09/03/37", 6.5), day("09/04/37", 8)];
  const out = signatureSurvives({ corrections, before, after: drifted });
  assert.equal(out.keep, false);
  assert.equal(out.why, "otherDaysMoved");
  assert.deepEqual(out.moved, [{ date: "09/04/37", was: 6.5, now: 8 }]);
  // and a sheet nobody reported on keeps its signature, which is today's behaviour
  assert.equal(signatureSurvives({ corrections: [], before, after: before }).keep, true);

  // AN OPEN CLAIM IS NOT A DENIED ONE. Payroll accepted the 3rd today and the
  // PTO on the 9th is still waiting on the calendar: the signature stands for
  // now, and the calendar decides it later.
  const pto = { kind: "time_off", status: "noted", choice: "yes", timeOff: [{ date: "09/09/37", kind: "pto", hours: 8 }] };
  assert.deepEqual(
    signatureSurvives({ corrections: [claim("09/03/37", "accepted"), pto], before, after, timeOff: [] }),
    { keep: true, why: "pending" },
  );
  // ... unless a day they never mentioned moved meanwhile
  assert.equal(signatureSurvives({ corrections: [claim("09/03/37", "accepted"), pto], before, after: drifted, timeOff: [] }).why, "otherDaysMoved");
  // ... or the answer is already no
  assert.equal(signatureSurvives({ corrections: [claim("09/03/37", "declined"), pto], before, after, timeOff: [] }).why, "changed");
  // the calendar settles it
  assert.deepEqual(
    signatureSurvives({ corrections: [claim("09/03/37", "accepted"), pto], before, after, timeOff: [{ date: "09/09/37", kind: "pto", hours: 8 }] }),
    { keep: true, why: "grantedAsReported" },
  );
  assert.equal(allClaimsDecided([claim("09/03/37", "accepted"), pto], []), false);
  assert.equal(allClaimsDecided([claim("09/03/37", "accepted"), pto], [{ date: "09/09/37", kind: "pto", hours: 8 }]), true);
  assert.equal(allClaimsDecided([claim("09/03/37", "open")], []), false);
  assert.equal(allClaimsDecided([], []), true);
});


// A TIME-OFF CLAIM IS DECIDED ON THE CALENDAR. Its row is stored "noted" and
// never changes; the office's only act is adding the day as a PtoEntry. Read
// as "open" the row blocked nothing and as "noted" it was never granted, so a
// PTO-only claim could never have kept its signature.
test("a time-off claim is decided by the calendar, not by its row", () => {
  const pto = { kind: "time_off", status: "noted", choice: "yes", timeOff: [{ date: "09/09/37", kind: "pto", hours: 8 }] };
  assert.equal(timeOffStatus(pto, []), "open", "nothing on the calendar yet");
  assert.equal(timeOffStatus(pto, [{ date: "09/09/37", kind: "pto", hours: 8 }]), "accepted");
  assert.equal(timeOffStatus(pto, [{ date: "09/09/37", kind: "pto", hours: 6 }]), "changed", "a different figure was granted");
  assert.equal(timeOffStatus(pto, [{ date: "09/09/37", kind: "sick", hours: 8 }]), "changed", "sick pay is not PTO");
  // two days, one still waiting: the claim is open
  const two = { ...pto, timeOff: [...pto.timeOff, { date: "09/10/37", kind: "pto", hours: 8 }] };
  assert.equal(timeOffStatus(two, [{ date: "09/09/37", kind: "pto", hours: 8 }]), "open");

  assert.equal(claimStage({ corrections: [pto] }), "pending");
  assert.equal(claimStage({ corrections: [pto] }, { timeOff: [{ date: "09/09/37", kind: "pto", hours: 8 }] }), "decided");
  assert.equal(grantedAsReported([pto]), false, "not on the calendar is not granted");
  assert.equal(grantedAsReported([pto], { timeOff: [{ date: "09/09/37", kind: "pto", hours: 8 }] }), true);
  assert.equal(grantedAsReported([pto], { timeOff: [{ date: "09/09/37", kind: "pto", hours: 6 }] }), false);

  // the granted day appearing on the sheet is the claim being granted, not a
  // day moving under them
  const before = [{ date: "09/01/37", paidHours: 6.5 }];
  const after = [{ date: "09/01/37", paidHours: 6.5 }, { date: "09/09/37", paidHours: 8 }];
  assert.deepEqual(
    signatureSurvives({ corrections: [pto], before, after, timeOff: [{ date: "09/09/37", kind: "pto", hours: 8 }] }),
    { keep: true, why: "grantedAsReported" },
  );
});

// WHAT THEY SIGNED, FROZEN. The snapshot is what page 2 said: the claims still
// waiting, the day figures as they stood, the totals. Null on a clean sheet.
test("the signed claim snapshot freezes the open claims and the figures as signed", () => {
  const days = [day("09/01/37", 6.5), day("09/03/37", 4.5)];
  const totals = { regularHours: 64.5, otHours: 4, doubleHours: 1 };
  const hours = { id: "c1", date: "09/03/37", kind: "hours", status: "open", claimedHours: 6.5,
    statedSlots: [{ from: 510, to: 900 }], note: "left at three" };
  const pto = { id: "c2", kind: "time_off", status: "noted", choice: "yes", timeOff: [{ date: "09/09/37", kind: "pto", hours: 8 }] };
  const snap = signedClaimSnapshot({ corrections: [hours, pto, { kind: "q_duplicateDay", status: "open" }], days, totals, timeOff: [] });
  assert.deepEqual(snap.claims.map((c) => c.id), ["c1", "c2"]);
  assert.equal(snap.claims[0].note, "left at three");
  assert.deepEqual(snap.days, [{ date: "09/01/37", paidHours: 6.5 }, { date: "09/03/37", paidHours: 4.5 }]);
  assert.deepEqual(snap.totals, { regular: 64.5, overtime: 4, doubleTime: 1 });
  // decided rows and calendar days are not part of what is being asked
  assert.equal(signedClaimSnapshot({ corrections: [{ ...hours, status: "accepted" }], days, totals, timeOff: [] }), null);
  assert.equal(signedClaimSnapshot({ corrections: [pto], days, totals, timeOff: [{ date: "09/09/37", kind: "pto", hours: 8 }] }), null);
  assert.equal(signedClaimSnapshot({ corrections: [], days, totals, timeOff: [] }), null);
  // every field the rule reads is in the select every caller shares
  for (const k of ["id", "date", "kind", "status", "choice", "claimedHours", "statedSlots", "timeOff", "resolutionNote"]) {
    assert.equal(CLAIM_SELECT[k], true, k);
  }
});

// THE DECISION AT REBUILD TIME reads "before" off the snapshot - what they
// actually signed - and only falls back to the stored days without one.
test("decideSignature compares the rebuild against what was signed", () => {
  const hours = { id: "c1", date: "09/03/37", kind: "hours", status: "accepted", claimedHours: 6.5 };
  const signed = { days: [day("09/01/37", 6.5), day("09/03/37", 4.5)] };
  const granted = [day("09/01/37", 6.5), day("09/03/37", 6.5)];
  assert.deepEqual(
    decideSignature({ signedAt: new Date(), signedClaim: signed, corrections: [hours], days: [], next: granted, timeOff: [] }),
    { keep: true, why: "grantedAsReported" },
  );
  // the stored days had already moved on (a later rebuild); the snapshot is
  // still the baseline, so the 1st moving under them is caught
  const drift = [day("09/01/37", 7), day("09/03/37", 6.5)];
  const r = decideSignature({ signedAt: new Date(), signedClaim: signed, corrections: [hours], days: [], next: drift, timeOff: [] });
  assert.equal(r.keep, false);
  assert.equal(r.why, "otherDaysMoved");
  assert.deepEqual(r.moved, [{ date: "09/01/37", was: 6.5, now: 7 }]);
  // no snapshot: the stored days stand in
  assert.equal(decideSignature({ signedAt: new Date(), signedClaim: null, corrections: [hours], days: signed.days, next: granted, timeOff: [] }).keep, true);
  // declined: not granted, whatever the figures did
  assert.equal(decideSignature({ signedAt: new Date(), signedClaim: signed, corrections: [{ ...hours, status: "declined" }], days: [], next: signed.days, timeOff: [] }).why, "changed");
  // never signed: nothing to keep
  assert.deepEqual(decideSignature({ signedAt: null, signedClaim: signed, corrections: [hours], days: [], next: granted, timeOff: [] }), { keep: false, why: "unsigned" });
});
