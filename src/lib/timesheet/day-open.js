// IS THERE ANYTHING LEFT TO DO ON THIS DAY, and would there be if one more
// question were answered.
//
// Two readings of one rule, which is exactly why they live in one function. The
// screen asks the first to decide whether a day may be finished with, and the
// question card asks the second BEFORE it writes, so a confirm that closes the
// last thing open can carry somebody to the next day instead of leaving a Next
// at the far side of the calendar (Mánu 2026-09-16: "all questions should get a
// different option from next cause it doesnt make much sense scrolling down
// hitting next each time").
//
// THE SECOND CANNOT BE READ OFF THE PAGE AFTER THE WRITE. `answers` only carries
// the new one once the refresh lands, seconds later, and a jump that arrives
// late is worse than no jump at all. So `alsoAnswered` treats one id as though
// it were already on record.
//
// Three things can hold a day open and all three are the same rule everywhere:
//
//   groups    the plain cards anchored to this day. Each writes on its own
//             confirm, so "answered" here means on record.
//   batched   the rows staged in the browser until one Save. Any at all holds
//             the day, because none of them is written yet.
//   rests     a rest entry worth a second look that nobody has acknowledged.
//             Only on a day the attestation does not already cover.

export function dayStillOpen({
  groups = [],
  batched = [],
  rests = [],
  attested = false,
  answers = null,
  acked = null,
  // the one question to count as answered even though it is not yet
  alsoAnswered = null,
} = {}) {
  if (groups.some((g) => g?.[0]?.id !== alsoAnswered && !answers?.[g?.[0]?.id])) return true;
  if (batched.length > 0) return true;
  if (!attested && rests.some((b) => b?.attention && !acked?.has?.(b?.key))) return true;
  return false;
}

// would answering `id` be the thing that finishes this day
export const dayFinishesOn = (input, id) =>
  !dayStillOpen({ ...input, alsoAnswered: id });

// WHICH ONE QUESTION WOULD FINISH THIS DAY, or null when no single answer does.
//
// A MAP, NOT A FUNCTION, because the page that knows this is a server component
// and the card that needs it is a client one: a function cannot cross that line,
// and a date-to-id map is the whole of what the card was going to ask anyway.
//
// Null when two things are still open (neither one finishes it), when nothing is
// open (there is no question left to be the one), and when a batched row or an
// unacknowledged rest is holding the day regardless.
export function finisherFor(input = {}) {
  const open = (input.groups || []).filter((g) => !input.answers?.[g?.[0]?.id]);
  if (open.length !== 1) return null;
  const id = open[0]?.[0]?.id;
  if (!id) return null;
  return dayFinishesOn(input, id) ? id : null;
}
