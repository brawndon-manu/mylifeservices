// WHAT A FLAG IS ABOUT - Mánu 2026-09-12: "i want the options to include
// 'Changed billing time' and thats for when i changed the appropriate billing
// time on my findings as well as flagged DSN. flagged above would hold all of
// those combined."
//
// One pile, and every flag can say which of these it is. Several at once is
// normal: changing the billable figure BECAUSE the DSN is thin is one flag
// about two things.
//
// THE BILLING KIND IS DERIVED, NOT CHOSEN. `billableMin` already records that
// a figure was corrected, so reading it back means the 59 flags that changed
// one before this existed carry the label with no backfill, and nobody has to
// remember to tick a box for something they already typed.

export const BILLING_KIND = "billing";

// the ones a person picks. Order is the order they are offered in.
export const CHOSEN_KINDS = ["note", "schedule", "shift"];

// every kind that can appear on a flag, chosen or derived
export const ALL_KINDS = [...CHOSEN_KINDS, BILLING_KIND];

// The note slot holds either a DSN or one of the .xls service notes, so its
// label reads off the row rather than being fixed. 575 DSN against 12 service
// notes on the September copy, and calling a service note a DSN on screen
// would be wrong on all twelve.
export function labelOfKind(kind, noteSource = null) {
  if (kind === "note") return noteSource === "dsn" ? "DSN" : noteSource ? "Service note" : "Note";
  if (kind === "schedule") return "Schedule note";
  if (kind === "shift") return "The shift";
  if (kind === BILLING_KIND) return "Changed billing time";
  return kind;
}

// What a review is about: what was chosen, plus billing if a figure was
// corrected. Order follows ALL_KINDS so two flags never list the same set
// differently. Unknown stored values are dropped rather than shown - a kind
// nothing can label is a kind nobody can filter by.
export function kindsOf(review) {
  if (!review) return [];
  const chosen = Array.isArray(review.kinds) ? review.kinds : [];
  const out = ALL_KINDS.filter((k) => k !== BILLING_KIND && chosen.includes(k));
  if (review.billableMin != null) out.push(BILLING_KIND);
  return out;
}

export function hasKind(review, kind) {
  return kindsOf(review).includes(kind);
}

// Which kinds a shift can even be flagged about. A shift with no schedule note
// cannot be flagged about one, and offering the option would produce a filter
// that never matches anything.
export function offerableKinds(row) {
  return CHOSEN_KINDS.filter((k) => (k === "note" ? !!row?.note : k === "schedule" ? !!row?.scheduleNote : true));
}

// Counts for the filter row under the Flagged tab, over whatever is showing.
// Counted per SHIFT: a flag about both notes is one shift to go and look at,
// and the sub-counts deliberately sum to more than the pile when flags carry
// more than one kind.
export function countKinds(rows) {
  const counts = {};
  for (const k of ALL_KINDS) counts[k] = 0;
  for (const r of rows) {
    for (const k of kindsOf(r.review)) counts[k] += 1;
  }
  return counts;
}
