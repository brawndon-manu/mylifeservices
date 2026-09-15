// THE DSN REST-BREAK ATTESTATION.
//
// Days it covers charge no rest premium, ask no rest-only question, and put no
// rest anomaly row on the checks screen - staff no longer document their tens,
// the attestation riding with the DSN says they were taken.
//
// TWO HALVES, AND BOTH ARE PINNED HERE. The date half: nothing before the
// effective date is covered, so an August re-upload still charges August
// honestly. The evidence half: a day is only covered if that person actually
// signed a Daily Service Note on it, because only ILS Service and Self
// Determination shifts are clocked and only they produce one. A whole day of
// admin hours never carried an attestation and still documents its tens.
//
// The rule lives in rest-attestation.js, the join in dsn-attestation.js.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  attestationInEffect, restAttestedOn, attestedDates, REST_ATTESTATION_EFFECTIVE,
} from "../rest-attestation.js";
import { signedDsnDates, dsnSignedFor, attestationReach, isSignedDsn } from "../dsn-attestation.js";
import { analyzeDay, reentitle } from "../parse.js";
import { buildQuestions } from "../questions.js";
import { splitPremium, applyAssumptions, premiumsFromDays } from "../premium-split.js";
import { dayViolations } from "../violations.js";
import { recomputeSheet } from "../corrections.js";
import { applyOvertime } from "../parse.js";

const at = (h, m = 0) => ({ min: h * 60 + m });

test("the date half turns on at the effective date and not before", () => {
  assert.equal(REST_ATTESTATION_EFFECTIVE, "09/01/26");
  assert.equal(attestationInEffect("08/31/26"), false);
  assert.equal(attestationInEffect("09/01/26"), true);
  assert.equal(attestationInEffect("09/02/26"), true);
  assert.equal(attestationInEffect("12/31/27"), true);
  // an unreadable date is NOT covered - old rules are the careful default
  assert.equal(attestationInEffect(null), false);
  assert.equal(attestationInEffect(""), false);
  assert.equal(attestationInEffect("2026-09-02"), false);
});

test("the rule needs a governed date, a source, and a signature on the day", () => {
  const on = (date, signed) => restAttestedOn(date, { signed, sourceAvailable: true });
  assert.equal(on("09/02/26", true), true);
  // a governed date with no note is the whole point of the evidence half -
  // this is the admin-only day, and it documents its tens
  assert.equal(on("09/02/26", false), false);
  assert.equal(on("09/02/26", undefined), false);
  // and a note before the date rule changes nothing, because there was no
  // attestation question to answer in August
  assert.equal(on("08/31/26", true), false);
});

test("a batch that collected no signatures charges nobody", () => {
  // NO SOURCE IS NOT THE SAME AS NOBODY SIGNING. This is the Day Program: it
  // runs the same engine with no service notes export wired in, so nothing
  // there can attest - and 24 rest premiums across 11 people would have
  // appeared on its next upload if absence were read as a person's failure.
  const noSource = (signed) => restAttestedOn("09/02/26", { signed, sourceAvailable: false });
  assert.equal(noSource(false), true, "no source must not charge");
  assert.equal(noSource(undefined), true);
  assert.equal(restAttestedOn("09/02/26", {}), true, "a caller passing nothing must not charge");
  assert.equal(restAttestedOn("09/02/26"), true);
  // the date rule still comes first - August was never covered either way
  assert.equal(restAttestedOn("08/31/26", { signed: false, sourceAvailable: false }), false);
  // and the whole thing must be able to fail: WITH a source, the same
  // unsigned day is not attested
  assert.equal(restAttestedOn("09/02/26", { signed: false, sourceAvailable: true }), false);
});

test("the day program feeds the engine both attestation inputs", () => {
  // It runs the same analyzeDay as the agency, so a day program day that
  // arrives without these is judged with no evidence at all. The gate makes
  // that harmless rather than expensive, but harmless is not the goal - the
  // day program is under the same rule and should be answering it.
  const dp = fs.readFileSync("src/lib/day-program/analyze.js", "utf8");
  assert.match(dp, /dsnSigned: signedDsn\(d\.date\)/, "the per-day signature");
  assert.match(dp, /dsnSourceAvailable,/, "whether the batch collected any at all");
  assert.match(dp, /parseServiceNotesPdf\(notesBytes\)/, "and it reads the notes itself");
  // the upload has to offer somewhere to put them, or none of the above runs
  const slots = fs.readFileSync("src/lib/timesheet/upload-slots.js", "utf8");
  const dpBlock = slots.slice(slots.indexOf("DP_UPLOAD_SLOTS"));
  assert.match(dpBlock, /id: "notes"/, "the day program form takes the notes PDF");
});

// ---------------------------------------------------------------------------
// THE EVIDENCE: which notes attest, and the name join that decides who they
// belong to.

const dsn = (employee, date) => ({
  source: "dsn", employee, date, signedBy: employee,
  signedDate: date, signedAt: "4:02 PM",
});
// the Employee Service Notes .xls carries no signature at all - it sets all
// three fields to null outright. This is what a Field Supervisor files.
const xls = (employee, date) => ({
  source: "xls", employee, date, signedBy: null, signedDate: null, signedAt: null,
});
// the resolver, standing in for buildWhoKey: "Aranda, Jennifer" resolves to the
// same key as "Jennifer Aranda", which is the join that returns zero when wrong
const whoKey = (n) => {
  const t = String(n || "").trim();
  const m = /^([^,]+),\s*(.+)$/.exec(t);
  return (m ? `${m[2]} ${m[1]}` : t).toLowerCase().replace(/\s+/g, " ");
};

test("only a signed note off the PDF attests, and it attests the day WORKED", () => {
  const notes = [
    dsn("Jennifer Aranda", "09/02/26"),
    xls("Ilean Solorzano", "09/02/26"),
    // signed four days late: still attests the shift it describes
    { ...dsn("Derek Baldwin", "09/03/26"), signedDate: "09/07/26" },
    // came off the PDF but carries no signature, so there is nothing to lean on
    { ...dsn("Kristy Hatt", "09/04/26"), signedAt: null },
  ];
  const map = signedDsnDates(notes, whoKey);

  const aranda = dsnSignedFor(map, whoKey, "Aranda, Jennifer");
  assert.equal(aranda("09/02/26"), true, "the two name formats must join");
  assert.equal(aranda("09/03/26"), false, "a different day is not attested");

  assert.equal(dsnSignedFor(map, whoKey, "Solorzano, Ilean")("09/02/26"), false,
    "an .xls note documents the work and cannot attest the breaks");
  assert.equal(dsnSignedFor(map, whoKey, "Baldwin, Derek")("09/03/26"), true,
    "a late signature still attests the day worked");
  assert.equal(dsnSignedFor(map, whoKey, "Hatt, Kristy")("09/04/26"), false,
    "no signature, no attestation");
  assert.equal(dsnSignedFor(map, whoKey, "Nobody, At All")("09/02/26"), false);
});

test("the reach is reported, because a join resolving nobody looks like a period nobody attested", () => {
  const notes = [dsn("Jennifer Aranda", "09/02/26"), dsn("Derek Baldwin", "09/02/26")];
  const map = signedDsnDates(notes, whoKey);
  const good = attestationReach(map, whoKey, ["Aranda, Jennifer", "Baldwin, Derek", "Hatt, Kristy"]);
  assert.deepEqual(good, { matched: 2, of: 3, days: 2 });
  // THE FAILURE THIS EXISTS TO CATCH: join the two spellings raw and every
  // person resolves to nothing, which reads as nobody being attested rather
  // than as a bug. It cost a measurement pass here already.
  const raw = (n) => String(n || "").toLowerCase();
  const broken = attestationReach(signedDsnDates(notes, raw), raw, ["Aranda, Jennifer", "Baldwin, Derek"]);
  assert.equal(broken.matched, 0, "the naive join must be visibly zero, not quietly wrong");
});

test("attestedDates reads the days of one sheet and ignores the rest", () => {
  const set = attestedDates([
    { date: "09/01/26", restAttested: true },
    { date: "09/02/26", restAttested: false },
    { date: "09/03/26" },
    { restAttested: true },
  ]);
  assert.deepEqual([...set], ["09/01/26"]);
  assert.deepEqual([...attestedDates(null)], []);
});

// ---------------------------------------------------------------------------
// THE ENGINE.

test("analyzeDay: a signed day keeps its entitlement and drops the violation", () => {
  // 8:00a-4:30p, report says zero rests - the classic two-rests-owed day
  const punches = [at(8), at(16, 30)];
  const day = (date, dsnSigned) =>
    analyzeDay({
      date, punches, printed: null, restRecorded: 0,
      dsnSigned, dsnSourceAvailable: true,
    });

  const august = day("08/28/26", true);
  assert.equal(august.restViolation, true, "pre-attestation day still charges");
  assert.equal(august.restAttested, false);
  assert.equal(august.restRequired, 2);

  const signed = day("09/02/26", true);
  assert.equal(signed.restViolation, false, "an attested day charges nothing");
  assert.equal(signed.restAttested, true);
  // the entitlement is a fact about the hours and stays truthful
  assert.equal(signed.restRequired, 2);
  assert.equal(signed.restTaken, 0);

  // THE NEW HALF. A whole day of admin hours produced no DSN, so it is not
  // attested and its tens are still documented. Drop the evidence check and
  // this one goes green wrongly.
  const adminOnly = day("09/02/26", false);
  assert.equal(adminOnly.restAttested, false);
  assert.equal(adminOnly.restViolation, true, "an unsigned September day still charges");
  assert.equal(adminOnly.restRequired, 2);

  // THE DAY PROGRAM SHAPE. Same engine, no notes export, so no source flag -
  // and the identical day comes back covered rather than charged.
  const noSource = analyzeDay({
    date: "09/02/26", punches, printed: null, restRecorded: 0, dsnSigned: false,
  });
  assert.equal(noSource.restAttested, true);
  assert.equal(noSource.restViolation, false, "a batch with no notes charges nobody");
});

test("reentitle carries the same gate off the day's own flag", () => {
  const stored = { restUnknown: false, restTaken: 0, workGroups: null };
  const before = reentitle({ ...stored, date: "08/28/26", restAttested: false }, 8);
  assert.equal(before.restViolation, true);
  assert.equal(before.restRequired, 2);

  const after = reentitle({ ...stored, date: "09/02/26", restAttested: true }, 8);
  assert.equal(after.restViolation, false);
  assert.equal(after.restRequired, 2);
  assert.equal(after.restAttested, true);

  // a September day nobody signed for recomputes back into a violation
  const unsigned = reentitle({ ...stored, date: "09/02/26", restAttested: false }, 8);
  assert.equal(unsigned.restViolation, true);
});

test("every stored-flag consumer reads the day's attestation, not its date", () => {
  // A day analysed under the old rule carries restViolation and no attestation
  // flag. It reads as NOT attested, which is the old answer and is exactly what
  // its stored restViolation already said - so nothing moves until the sheet is
  // re-analysed against the notes.
  const stale = (date, restAttested) => ({
    date, paidHours: 8, restViolation: true, restTaken: 0, restRequired: 2,
    mealViolation: false, punches: [], ...(restAttested === undefined ? {} : { restAttested }),
  });
  const owed = stale("09/02/26", false);
  const covered = stale("09/02/26", true);

  assert.equal(splitPremium([owed]).rows.filter((r) => r.kind === "rest").length, 1);
  assert.equal(splitPremium([covered]).rows.filter((r) => r.kind === "rest").length, 0);

  assert.deepEqual(premiumsFromDays([owed]).restDays, ["09/02/26"]);
  assert.deepEqual(premiumsFromDays([covered]).restDays, []);
  assert.equal(premiumsFromDays([covered]).restHours, 0);

  assert.equal(dayViolations(owed).some((v) => v.kind === "rest-not-taken"), true);
  assert.equal(dayViolations(covered).some((v) => v.kind === "rest-not-taken"), false);

  // and the projection stamps no "assumed" note on a day that owes nothing
  const projected = applyAssumptions([covered], { confirmed: new Set(), answers: {}, pastDue: true });
  assert.equal(projected[0].premiumNote?.rest ?? null, null);

  // recomputeSheet's own premium sum is the money on every rebuild, and a day
  // reanalyzeDays cannot rebuild keeps its stored flag forever
  const full = (d) => ({ ...d, rawHours: 8, regularHours: 8, otHours: 0, doubleHours: 0, addedHours: 0 });
  const period = { from: "08/16/26", to: "09/15/26" };
  const owedSheet = recomputeSheet({ days: [full(owed)], payPeriod: period, overrides: null }, applyOvertime, null);
  assert.deepEqual(owedSheet.premiums.restDays, ["09/02/26"]);
  const coveredSheet = recomputeSheet({ days: [full(covered)], payPeriod: period, overrides: null }, applyOvertime, null);
  assert.deepEqual(coveredSheet.premiums.restDays, []);
});

// ---------------------------------------------------------------------------
// The question builders. One malformed-rest fixture, run signed and unsigned:
// the rest-only kinds exist on an unsigned day and vanish on a signed one,
// while the one ask that moves the MEAL premium keeps firing on both.
const NAME = "Uribe, Brandon";

const restOnlyData = (date, restAttested) => ({
  days: [{
    date,
    restAttested,
    paidHours: 8,
    punches: [at(8), at(16, 30)],
    restTaken: 0,
    restRequired: 2,
    restViolation: false,
    mealViolation: false,
    restsFromShortMeals: 1,
  }],
});

const restOnlyRows = (date) => [
  // one mis-picked field would explain it -> `repair`
  {
    name: NAME, date, out: "3:50 PM", in: "3:00 PM", counted: true, minutes: 50,
    repair: { field: "in", from: "3:00 PM", to: "4:00 PM", minutes: 10, why: "the IN hour was rolled back an hour" },
  },
  // neither end recorded -> `restNoTimes`
  { name: NAME, date, out: "", in: "", counted: true, minutes: null, repair: null },
  // an hour long, off the clock, meal accounted for -> `restTooLongOffClock`
  { name: NAME, date, out: "5:00 PM", in: "6:00 PM", counted: false, minutes: 60, repair: null },
  // a clean ten logged before clock-in -> `restOutsideScheduled`
  { name: NAME, date, out: "7:00 AM", in: "7:10 AM", counted: true, minutes: 10, repair: null },
];

const REST_ONLY_KINDS = [
  "repair", "restNoTimes", "restTooLongOffClock", "restOutsideScheduled", "shortMealRest",
];

const kindsFor = (date, restAttested) =>
  buildQuestions(restOnlyData(date, restAttested), {
    restRows: restOnlyRows(date), sourceName: NAME,
  }).map((q) => q.kind);

test("buildQuestions: the rest-only asks fire on a pre-attestation day", () => {
  const kinds = kindsFor("08/20/26", false);
  for (const k of REST_ONLY_KINDS) {
    assert.ok(kinds.includes(k), `${k} should be asked before the attestation (got ${kinds.join(", ")})`);
  }
});

test("buildQuestions: an attested day asks none of them", () => {
  const kinds = kindsFor("09/02/26", true);
  for (const k of REST_ONLY_KINDS) {
    assert.ok(!kinds.includes(k), `${k} must not be asked on an attested day (got ${kinds.join(", ")})`);
  }
});

test("buildQuestions: a September day nobody signed for is asked all of them again", () => {
  // the admin-only day. Under the date-only rule this went silent, and nobody
  // who had not clocked out of a service shift ever documented their tens.
  const kinds = kindsFor("09/02/26", false);
  for (const k of REST_ONLY_KINDS) {
    assert.ok(kinds.includes(k), `${k} should be asked on an unsigned September day (got ${kinds.join(", ")})`);
  }
});

test("buildQuestions: restIsMealLength still asks on an attested day - it moves the meal premium", () => {
  const mealData = (date) => ({
    days: [{
      date,
      restAttested: true,
      paidHours: 8,
      punches: [at(8), at(16, 30)],
      restTaken: 1,
      restRequired: 2,
      mealMissing: true,
      mealViolation: true,
    }],
  });
  const mealRows = (date) => [
    { name: NAME, date, out: "2:00 PM", in: "2:30 PM", counted: false, minutes: 30, repair: null },
  ];
  for (const date of ["08/20/26", "09/02/26"]) {
    const kinds = buildQuestions(mealData(date), {
      restRows: mealRows(date), sourceName: NAME,
    }).map((q) => q.kind);
    assert.ok(
      kinds.includes("restIsMealLength"),
      `restIsMealLength should survive on ${date} (got ${kinds.join(", ")})`,
    );
  }
});

test("a note carries its source from the moment it is read, not only once merged", () => {
  // THE BUG THIS PINS. `source` used to be set only by `mergeNotes`, so a batch
  // uploaded with the Daily Service Notes PDF and no Employee Service Notes
  // .xls produced notes with no source at all - and `signedDsnDates`, which
  // will only trust a signature that came off the DSN, threw every one of them
  // away. 270 signed notes, zero attested days, and nothing said so because a
  // batch with no usable signatures charges nobody by design.
  const src = fs.readFileSync("src/lib/timesheet/service-notes.js", "utf8");
  assert.match(src, /return notes\.map\(\(n\) => \(\{ \.\.\.n, source: "dsn" \}\)\);/,
    "parseServiceNotesPdf must tag its own output");
  // and the consumer has to actually accept that shape
  const notes = [{ source: "dsn", employee: "Devin Bass", date: "09/02/26", signedAt: "4:00 PM", signedDate: "09/02/26" }];
  const key = (n) => String(n || "").toLowerCase();
  assert.equal(signedDsnDates(notes, key).get("devin bass")?.size, 1);
});

test("a note stored before the tag existed still attests, and only the PDF can be one", () => {
  // 270 notes on the day program batch and 668 on older agency ones were
  // stored before `source` was set, and Recalculate rebuilds from the stored
  // notes rather than re-reading the document - so without this those batches
  // could only ever be fixed by a fresh upload, which is the exact case the
  // Recalculate button exists to avoid.
  //
  // IT IS SAFE BECAUSE THE .XLS READER CANNOT PRODUCE THIS SHAPE. It sets
  // `source: "xls"` and `signedAt: null` in the same object literal, with no
  // condition on either, so signed-and-untagged can only have come off the PDF.
  const signedUntagged = { employee: "Devin Bass", date: "09/02/26", signedAt: "4:00 PM", signedDate: "09/02/26" };
  assert.equal(isSignedDsn(signedUntagged), true);
  assert.equal(isSignedDsn({ ...signedUntagged, source: "dsn" }), true);
  // a field supervisor's note is tagged AND unsigned, and fails on both counts
  assert.equal(isSignedDsn({ ...signedUntagged, source: "xls", signedAt: null, signedDate: null }), false);
  // the guard that keeps this from becoming "anything attests": no signature,
  // no attestation, tagged or not
  assert.equal(isSignedDsn({ employee: "Devin Bass", date: "09/02/26" }), false);
  assert.equal(isSignedDsn({ ...signedUntagged, signedAt: null }), false);
  assert.equal(isSignedDsn(null), false);

  const key = (n) => String(n || "").toLowerCase();
  assert.equal(signedDsnDates([signedUntagged], key).get("devin bass")?.size, 1,
    "an untagged signed note must reach the map, or Recalculate cannot fix a stored batch");
});
