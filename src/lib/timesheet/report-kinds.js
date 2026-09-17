// WHAT "REPORT A PROBLEM" OFFERS ON A DAY.
//
// Dependency-free on purpose, so the rule can be tested directly and the card
// cannot quietly hold a different one.
//
// THREE OPTIONS LEFT THIS MENU ON 2026-09-17, at Mánu's word: "that is so
// redundant. they would be asked above if that was the case."
//
//   I did take my lunch, it just isn't punched      (meal_taken)
//   I took my lunch on time, the punch is wrong     (meal_ontime)
//   I did take my rest breaks, they just aren't punched  (rest_taken)
//
// They were not near-duplicates of a question card. They carried the IDENTICAL
// gate as the one that already asks:
//
//   rest_taken   restViolation && restAttested !== true   = nothingDocumentedRest
//   meal_taken   mealViolation && !mealLate               = nothingDocumentedMeal
//   meal_ontime  mealLate                                 = mealLate
//
// So each could only ever appear on a day where the card asking the same thing
// was already on screen. Measured before removing: 34 reports had ever been
// filed in the life of the product and 2 of them were these three kinds, both
// on one night, both by one person - and those two produced a day whose record
// held the same ten twice, because she answered the card AND the report.
// `q_nothingDocumentedRest` alone has 423 rows.
//
// WHAT STAYS, AND WHY IT IS NOT THE SAME THING. `meal_missed` and `rest_missed`
// fire when the punches look FINE - a lunch is recorded, the tens are recorded.
// No question is asked on a clean day, so these are the only way somebody can
// say "the record looks right and it isn't". Opposite case, no card behind it.
//
// Removing them from the MENU does not remove them from CORRECTION_KINDS: the
// two rows already filed still render with their labels on the desk and in
// history. This decides what a person is offered, not what the record can hold.
export function kindsForDay(day) {
  if (!day) return ["other"];
  const out = ["hours"];
  // the punches show a lunch and they worked through it
  if (day.mealCount > 0) out.push("meal_missed");
  // the punches show their tens and they did not get them. By the day's own
  // flag, like every other gate in this policy, so an attested day offers
  // nothing and an August re-upload behaves as it did.
  if (day.restAttested !== true && day.restCount > 0) out.push("rest_missed");
  out.push("day_extra", "other");
  return out;
}

// the kinds a question card already asks about, kept here so the reason the
// menu is short is written down next to the menu itself rather than only in a
// commit message
export const ASKED_BY_A_QUESTION_CARD = ["meal_taken", "meal_ontime", "rest_taken"];
