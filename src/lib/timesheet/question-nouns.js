// WHAT EACH QUESTION IS ABOUT, IN WORDS, IN ONE PLACE.
//
// Two screens needed this and only one had it. The audit note written when an
// answer is saved reads "Asked about the 07/31/26 <noun>", and the admin
// day-by-day prints a heading over the same answer - and that heading had no
// map at all, so it fell back to the internal kind and showed a reviewer
// `restOutsideScheduled` and `miscTime`.
//
// A MISSING ENTRY IS NOT A COSMETIC BUG. The note is built at answer time and
// STORED, so a gap does not render badly, it is written into the row and stays
// there after the map is fixed. `miscTime` was missing and one row on the July
// batch reads "Asked about the 07/31/26 undefined." for good.
//
// Dependency-free, and a lib rather than a const in the action: a page cannot
// import a plain value out of a "use server" file, which is why the second
// screen went without one.

export const QUESTION_NOUN = {
  repair: "rest entry we could not read",
  restIsMealLength: "thirty minute break filed as a rest",
  restNoTimes: "rest entry recorded with no times",
  restOutsideScheduled: "ten logged outside scheduled working hours",
  nothingDocumented: "day with no break recorded at all",
  // split per part 2026-08-10, so the audit note names which break was asked
  // about rather than "the day"
  nothingDocumentedMeal: "meal break with nothing recorded",
  nothingDocumentedRest: "rest periods with nothing recorded",
  shortMealRest: "ten minute meal block read as a rest period",
  mealLate: "meal period that started after the fifth hour",
  mealInShift: "meal break the roster booked inside a shift they clock in and out of",
  mealMovable: "meal break the roster booked inside unpunched time",
  restTooLongOffClock: "break too long to be a rest, on a day whose meal is accounted for",
  // ADDED 2026-08-16, and it is the one that was missing.
  miscTime: "time rostered as Misc, with nothing saying what it was",
};

// The noun, or the kind itself when there is none. Returning the kind rather
// than "undefined" keeps a future gap readable instead of writing the word
// undefined into somebody's audit trail.
export function questionNoun(kind) {
  return QUESTION_NOUN[kind] || String(kind || "");
}

// The same thing as a heading. The admin day-by-day puts this above what the
// employee said, where a sentence fragment starting mid-air reads oddly.
export function questionHeading(kind) {
  const n = questionNoun(kind);
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : "";
}

// THREE VOCABULARIES END UP IN THE SAME LIST on the admin day-by-day, and only
// one of them had words:
//
//   q_<kind>            a question we put to them
//   fix_reversed_<min>  they acknowledged a backwards rest entry. GENERATED, with
//                       the offset baked into the string, so no static map can
//                       ever cover it - 720 is the twelve-hour AM/PM flip
//   everything else     a problem they reported, which CORRECTION_KINDS covers
//
// Returns null for the third, so the caller keeps using its own map rather than
// this one growing a copy of it.
export function correctionHeading(kind) {
  const k = String(kind || "");
  if (k.startsWith("q_")) return questionHeading(k.slice(2));
  if (k.startsWith("fix_reversed_")) {
    const min = Number(k.slice("fix_reversed_".length));
    const by = Number.isFinite(min) && min % 60 === 0 ? `${min / 60} hours` : `${min} minutes`;
    return `Backwards rest entry, acknowledged (out by ${by})`;
  }
  return null;
}
