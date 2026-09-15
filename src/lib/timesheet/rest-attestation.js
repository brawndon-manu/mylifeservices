// REST BREAKS ARE ATTESTED NOW, NOT DOCUMENTED - BUT ONLY WHERE THE
// ATTESTATION ACTUALLY HAPPENED.
//
// The attestation rides with the Daily Service Note: signing one states the
// rest breaks were in fact taken, so staff no longer document their tens in
// QuickSolve. A covered day charges no rest premium, asks no rest question on
// the review page and draws no rest row on the checks screen. Recorded rests
// still DRAW wherever a day is drawn - the record is welcome, it is just no
// longer anybody's homework.
//
// A DATE IS NOT ENOUGH, and that was the first version of this file. Only ILS
// Service and Self Determination shifts are clocked, so only they produce a
// DSN, so a day of nothing but admin hours never carried an attestation at all
// and its tens still have to be documented. Measured on 09/01-09/15: of 193
// days that would owe a rest, 158 carry a signed DSN and 35 do not.
//
// ONE SIGNED DSN COVERS THE WHOLE DAY, including the admin hours around it.
// Somebody with seven hours of admin and one service hour attested once, for
// the day, and three service shifts with only one clocked out of is still one
// attestation and still covers all three.
//
// THE SIGNATURE IS THE EVIDENCE, which is why it has to be the Daily Service
// Notes PDF. That export prints who signed, on what date, at what time. The
// Employee Service Notes .xls - where Field Supervisors write instead - has no
// signature anywhere in it, so a note there documents the work but cannot
// attest the breaks.
//
// EFFECTIVE BY THE DAY'S OWN DATE, not by when a file was uploaded. An August
// re-upload months from now still charges August's rest premiums, because the
// attestation did not exist in August - and a stored batch and a fresh upload
// agree about the same day, because the analysis asks this file rather than
// remembering what the rules were when it ran.
//
// TO PUT THE OLD WORLD BACK, set REST_ATTESTATION_EFFECTIVE to null. Every rule
// behind the gate is untouched - the violation arithmetic, the premium, the
// five question kinds, the checks rows - so flipping this one value restores
// all of it for the days it stops covering.
//
// NO IMPORTS ON PURPOSE. Client components read this file, so it stays free of
// the pdf and xlsx readers the rest of this folder pulls in.
export const REST_ATTESTATION_EFFECTIVE = "09/01/26";

// "MM/DD/YY" -> a sortable number, the reading every date key here uses
const dk = (s) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(String(s || ""));
  return m ? Number(m[3]) * 10000 + Number(m[1]) * 100 + Number(m[2]) : null;
};

// IS THE ATTESTATION EVEN A THING ON THIS DATE? The date half of the rule on
// its own, for the callers that need to know whether a period is governed at
// all - which report a batch must carry, whether to look for evidence - rather
// than whether one particular day was attested.
//
// A date that cannot be read is NOT in effect: the old rules are the careful
// default, and they charge the company rather than the person.
export function attestationInEffect(date) {
  if (!REST_ATTESTATION_EFFECTIVE) return false;
  const d = dk(date);
  const eff = dk(REST_ATTESTATION_EFFECTIVE);
  return d != null && eff != null && d >= eff;
}

// WAS THIS DAY ATTESTED? The whole rule: the date is governed AND this person
// signed a DSN on it.
//
// `dsnSigned` is worked out where the notes and the accounts both are - see
// dsn-attestation.js - and injected into `analyzeDay` the way every other
// rebuilt input is. It is deliberately a plain boolean so this file can stay
// importable from the browser.
//
// MISSING EVIDENCE READS AS NOT ATTESTED, and callers must not lean on that to
// mean anything. A batch with no Daily Service Notes PDF has no evidence for
// anybody, which would silently charge a whole period; that case is refused at
// the batch rather than answered here.
export function restAttestedOn(date, dsnSigned) {
  return attestationInEffect(date) && dsnSigned === true;
}

// THE DAYS OF ONE SHEET THAT WERE ATTESTED, as a set of date keys.
//
// For the readers that hold a rest report ROW or a correction rather than a
// day: the evidence is a fact about the person's day, so the day is where it
// is stored, and a row is matched back to it by date. Built once per sheet
// rather than per row.
export function attestedDates(days) {
  const out = new Set();
  for (const d of days || []) if (d?.restAttested === true && d.date) out.add(d.date);
  return out;
}
