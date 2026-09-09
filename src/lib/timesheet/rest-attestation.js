// REST BREAKS ARE ATTESTED NOW, NOT DOCUMENTED.
//
// Mánu 2026-09-08: an attestation rides with the DSN stating the rest breaks
// were in fact taken, so staff no longer document their tens in QuickSolve.
// The engine stops treating an undocumented rest as anything: no rest premium,
// no rest question on the review page, no rest row on the checks screen.
// Recorded rests still DRAW wherever a day is drawn - the record is welcome,
// it is just no longer anybody's homework.
//
// EFFECTIVE BY THE DAY'S OWN DATE, not by when a file was uploaded. An August
// re-upload months from now still charges August's rest premiums, because the
// attestation did not exist in August - and a stored batch and a fresh upload
// agree about the same day, because every reader asks this file rather than
// remembering what the rules were when it was analysed.
//
// TO PUT THE OLD WORLD BACK, set REST_ATTESTATION_EFFECTIVE to null. Every
// rule behind the gate is untouched - the violation arithmetic, the premium,
// the five question kinds, the checks rows - so flipping this one value
// restores all of it for the days it stops covering.
export const REST_ATTESTATION_EFFECTIVE = "09/01/26";

// "MM/DD/YY" -> a sortable number, the reading every date key here uses
const dk = (s) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(String(s || ""));
  return m ? Number(m[3]) * 10000 + Number(m[1]) * 100 + Number(m[2]) : null;
};

// Is this day covered by the rest-break attestation?
//
// A date that cannot be read is NOT covered: the old rules are the careful
// default, and they charge the company rather than the person.
export function restAttested(date) {
  if (!REST_ATTESTATION_EFFECTIVE) return false;
  const d = dk(date);
  const eff = dk(REST_ATTESTATION_EFFECTIVE);
  return d != null && eff != null && d >= eff;
}
