// A SIGNATURE ON A CLAIM, NOT ON A FIGURE (Mánu 2026-09-09, mock C).
// These pin the rule that decides whether somebody signs twice.
import test from "node:test";
import assert from "node:assert/strict";

import {
  claimsOf, claimStage, canSignClaim, grantedAsReported,
  daysMovedOutsideClaim, signatureSurvives,
} from "../claim-signing.js";

const claim = (date, status, kind = "hours") => ({ date, status, kind });
const day = (date, paidHours) => ({ date, paidHours });

test("a claim is what the employee reported, never a question answer", () => {
  const rows = [
    claim("09/03/37", "open"),
    { kind: "q_duplicateDay", date: "09/11/37", status: "declined" },
    { kind: "fix_restNoTimes", date: "09/04/37", status: "accepted" },
    { kind: "time_off", date: null, status: "noted" },
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
});
