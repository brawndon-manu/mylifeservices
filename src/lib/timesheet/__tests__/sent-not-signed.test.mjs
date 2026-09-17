// A REBUILD UNDOES A SIGNATURE, NOT A SEND.
//
// `decideSignature` hands back { keep: false, why: "unsigned" } for a sheet
// nobody signed, the same shape as a signature a rebuild has just invalidated.
// Both writers used to read `keep` alone, so accepting a reported day on a sheet
// that was only ever SENT cleared its `sentAt` and put the person back in the
// unsent list for the document they were working on.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { clearsSignature, decideSignature } from "../claim-signing.js";

const actions = fs.readFileSync(
  path.join(process.cwd(), "src/app/portal/admin/timesheets/actions.js"),
  "utf8",
);
// comments name the fields too - strip them before asking what the CODE does
const code = actions
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

const day = (date, paidHours) => ({ date, paidHours });
const signedOn = new Date("2026-09-16T20:56:08.000Z");

test("a sheet nobody signed has no signature to undo", () => {
  // exactly what decideSignature returns for one, not a hand-written stand-in
  const unsigned = decideSignature({
    signedAt: null, signedClaim: null, corrections: [], days: [], next: [], timeOff: [],
  });
  assert.deepEqual(unsigned, { keep: false, why: "unsigned" });
  assert.equal(clearsSignature(null, unsigned), false);
  assert.equal(clearsSignature(undefined, unsigned), false);
});

test("a signature this rebuild invalidated IS undone", () => {
  const hours = { kind: "hours", date: "09/03/37", status: "declined" };
  const signed = { days: [day("09/01/37", 6.5), day("09/03/37", 4.5)] };
  const changed = decideSignature({
    signedAt: signedOn, signedClaim: signed, corrections: [hours],
    days: [], next: signed.days, timeOff: [],
  });
  assert.equal(changed.why, "changed");
  assert.equal(clearsSignature(signedOn, changed), true);
});

test("a signature that survives is left alone", () => {
  const hours = { kind: "hours", date: "09/03/37", status: "accepted", claimedHours: 6.5 };
  const signed = { days: [day("09/01/37", 6.5), day("09/03/37", 4.5)] };
  const granted = [day("09/01/37", 6.5), day("09/03/37", 6.5)];
  const kept = decideSignature({
    signedAt: signedOn, signedClaim: signed, corrections: [hours],
    days: [], next: granted, timeOff: [],
  });
  assert.deepEqual(kept, { keep: true, why: "grantedAsReported" });
  assert.equal(clearsSignature(signedOn, kept), false);
});

test("the unsigned case and the invalidated case are told apart by the signature, not by keep", () => {
  // THE WHOLE POINT: both read keep === false. Reading keep alone cannot
  // distinguish them, which is how a sent sheet lost its sentAt.
  const unsigned = { keep: false, why: "unsigned" };
  const invalidated = { keep: false, why: "changed" };
  assert.equal(unsigned.keep, invalidated.keep);
  assert.notEqual(clearsSignature(null, unsigned), clearsSignature(signedOn, invalidated));
});

test("a missing or malformed decision undoes nothing", () => {
  assert.equal(clearsSignature(signedOn, null), true);
  assert.equal(clearsSignature(signedOn, undefined), true);
  assert.equal(clearsSignature(null, null), false);
});

test("both writers ask clearsSignature, and neither reads keep on its own", () => {
  assert.match(code, /import \{[^}]*\bclearsSignature\b[^}]*\} from "@\/lib\/timesheet\/claim-signing"/);
  // the rebuild, and the last-decision settle
  const asks = code.match(/clearsSignature\(/g) || [];
  assert.equal(asks.length, 2, "both writers have to ask, or they can disagree");
  // the old shapes, each of which cleared a send on a sheet nobody signed
  assert.doesNotMatch(code, /signature\.keep \? \{\} :/);
  assert.doesNotMatch(code, /!signature\.keep \?/);
});

test("every send this file clears is one of the three, and two of them are guarded", () => {
  const all = code.match(/sentAt: null/g) || [];
  assert.equal(all.length, 3, "a fourth writer clearing a send needs its own reason here");

  // the two REBUILD writers: the sheet is recomputed from its own overrides and
  // the document they hold is the same one, so a send only dies with a signature
  const guarded = code.match(/clearsSignature\([\s\S]{0,900}?sentAt: null/g) || [];
  assert.equal(guarded.length, 2, "a rebuild clearing a send outside the guard is the bug returning");

  // the THIRD is the partial re-upload, and it is deliberately different: the
  // figures come from a fresh export, so the document really was replaced and
  // has to go out again even to somebody who never signed. `survives` only
  // holds signed sheets (`if (!hit.signedAt) continue`), so an unsigned one
  // falls through to the clear on purpose.
  assert.match(code, /survives\.get\(hit\.id\)\?\.keep \? \{\} : \{[\s\S]{0,400}?sentAt: null/);
  assert.match(code, /if \(!hit\.signedAt\) continue;/);
});
