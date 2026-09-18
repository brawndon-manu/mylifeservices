// THE RULES A CLOCK AMENDMENT KEEPS.
//
// Mánu 2026-09-18: a staff member could not clock in or out, the hours are
// still billable, and the record has to support the billing.
//
// RAISED BY HAND. "if someone needs their time amended, they reach out to me. I
// generate the forms." Nothing detects these - the office raises one when it is
// asked to - so the rules below are about what a form must say, not about
// finding work to do.
//
// AND THE REASON IS THE POINT: "the reason needs to be asked, that's part of
// the reason we are building this." It is required, coded plus written, and
// asked of whoever was there.
import test from "node:test";
import assert from "node:assert/strict";
import {
  REASON_CODES, reasonLabel, isReasonCode, reasonNeedsText,
  SIGNER_KINDS, signerLabel, isSignerKind, signerIsPresent,
  evidenceLevel, needsSupervisor, amendmentStage, STAGE_LABELS,
  hasServiceNote, suggestedTimes,
} from "../clock-amendment/rules.js";

test("a reason is a code AND a sentence, and other cannot stand alone", () => {
  // the code is what turns a pile of these into a tally - the only thing that
  // can say whether it is training or phone coverage at particular homes
  assert.ok(REASON_CODES.length >= 5);
  assert.equal(REASON_CODES.at(-1).code, "other", "other sits last");
  assert.equal(reasonNeedsText("other"), true);
  assert.equal(reasonNeedsText("nosignal"), false);
  assert.equal(isReasonCode("nosignal"), true);
  assert.equal(isReasonCode("made up"), false);
  assert.equal(reasonLabel("battery"), "Phone battery died");
  assert.equal(reasonLabel("nope"), null);
});

test("the client half says who signed and in what capacity", () => {
  assert.equal(isSignerKind("conservator"), true);
  assert.equal(signerLabel("client"), "The person served");
  // an unexplained blank is worth less than an honest one
  assert.equal(isSignerKind("unavailable"), true);
  assert.equal(signerIsPresent("unavailable"), false);
  assert.equal(signerIsPresent("parent"), true);
  assert.equal(signerIsPresent(null), false);
});

test("how much the clock already proves decides how hard the form asks", () => {
  // a punch went in, so only the departure is in question
  assert.equal(evidenceLevel({ clockedIn: "9:00 AM" }), "partial");
  assert.equal(needsSupervisor({ clockedIn: "9:00 AM" }), false);
  // neither punch, so the signatures carry the whole visit
  assert.equal(evidenceLevel({ clockedIn: null }), "none");
  assert.equal(needsSupervisor({ clockedIn: null }), true);
  assert.equal(evidenceLevel(null), "none", "nothing known is the careful default");
});

test("the stage is one rule, and filled does not wait on the client", () => {
  assert.equal(amendmentStage(null), "draft");
  assert.equal(amendmentStage({}), "draft");
  assert.equal(amendmentStage({ sentAt: new Date() }), "sent");
  assert.equal(amendmentStage({ sentAt: new Date(), filledAt: new Date() }), "filled");
  assert.equal(amendmentStage({ sentAt: new Date(), filledAt: new Date(), approvedAt: new Date() }), "approved");
  // a visit where nobody was home still reaches the queue - otherwise it sits
  // for ever waiting on a signature that is legitimately never coming
  assert.equal(
    amendmentStage({ sentAt: new Date(), filledAt: new Date(), clientSignedAt: null }),
    "filled",
  );
  for (const k of ["draft", "sent", "filled", "approved"]) assert.ok(STAGE_LABELS[k]);
});

test("their own service note is what the form offers back, before the schedule", () => {
  // staff write these for their own reasons, with times on them, before anybody
  // knows the clock has failed. Confirming a record beats reconstructing one.
  const withNote = { dsnStart: "9:30 AM", dsnEnd: "1:00 PM", scheduledIn: "9:30 AM", scheduledOut: "1:00 PM", clockedIn: "9:30 AM" };
  assert.equal(hasServiceNote(withNote), true);
  assert.deepEqual(suggestedTimes(withNote), { in: "9:30 AM", out: "1:00 PM", from: "note" });

  // no note: the schedule, said to be the schedule
  const schedOnly = { scheduledIn: "8:00 AM", scheduledOut: "4:00 PM" };
  assert.equal(hasServiceNote(schedOnly), false);
  assert.deepEqual(suggestedTimes(schedOnly), { in: "8:00 AM", out: "4:00 PM", from: "schedule" });

  // and nothing is nothing - never the clock, which is the thing that is wrong
  assert.deepEqual(suggestedTimes({ clockedIn: "9:00 AM" }), { in: null, out: null, from: null });
  assert.deepEqual(suggestedTimes(null), { in: null, out: null, from: null });

  // half a note is not a note
  assert.equal(hasServiceNote({ dsnStart: "9:30 AM" }), false);
});
