// HOW MANY PEOPLE A SESSION CAN HOLD.
//
// Mánu 2026-08-22, on HR's ask for a week of 30-minute office visits to sign the
// updated handbook: "we need to cap the time slots at 10 max" - ten people per
// slot.
//
// A Company Meeting's sessions never had a capacity, and for the meetings they
// were built for that was right: an all-hands on Zoom does not run out of room,
// and a cap that nobody needs is a cap that eventually refuses somebody for no
// reason. An in-person visit is the opposite. The office holds what it holds,
// and without a cap fifteen people take Monday 9:00 and nobody takes Thursday.
//
// CAPACITY IS PER OPTION, NOT PER MEETING. The whole point is that each slot
// fills independently - "Tuesday 10:00 is full, Tuesday 10:30 is not" is the
// sentence somebody needs to read while they are choosing.
//
// NULL IS NOT ZERO, and it is the default. An option with no capacity holds
// everybody, which is what every meeting written before this existed meant and
// still means. Zero would mean a slot nobody can take.

// what one option can hold: a positive whole number, or null for no limit.
// Anything else - 0, -3, "ten", NaN - is not a limit anybody meant, and is read
// as no limit rather than as a slot that refuses everyone.
export function capacityOf(option) {
  const n = option?.capacity;
  return Number.isInteger(n) && n > 0 ? n : null;
}

// how many places are left, or null when the option holds everybody. Never
// negative: an option whose cap was lowered under people who already picked it
// reads as full rather than as minus two.
export function remainingFor(option, taken = 0) {
  const cap = capacityOf(option);
  if (cap == null) return null;
  return Math.max(0, cap - Math.max(0, taken));
}

// A slot is full when it has a cap and nothing left. Asked on the server before
// every write and on the client only to grey the button: a disabled control is
// a suggestion, and two people can always press the last seat at once.
export function isFull(option, taken = 0) {
  return remainingFor(option, taken) === 0;
}

// AND SOMEBODY ALREADY IN IT IS NEVER TURNED AWAY FROM IT. Re-confirming a pick,
// or a page that re-submits the same choice, must not fail because the slot
// filled up - they are IN that count. Only a NEW pick can be refused.
export function canTake(option, taken = 0, alreadyIn = false) {
  return alreadyIn || !isFull(option, taken);
}

// what the picker says under a slot. Deliberately plain, and it says the cap out
// loud rather than only the remainder: "3 left" alone gives no sense of whether
// that is nearly empty or nearly gone.
export function slotLabel(option, taken = 0) {
  const cap = capacityOf(option);
  if (cap == null) return null;
  const left = remainingFor(option, taken);
  if (left === 0) return "Full";
  return `${Math.min(taken, cap)} of ${cap} taken`;
}

// taken-counts keyed by option id, from the rows the roster already reads. One
// pass over the choices rather than a count query per slot: a week of half-hour
// visits is a hundred options, and a hundred round trips to render one page is
// how a picker becomes a spinner.
export function takenByOption(choices) {
  const out = new Map();
  for (const c of choices || []) {
    if (!c?.optionId) continue;
    out.set(c.optionId, (out.get(c.optionId) || 0) + 1);
  }
  return out;
}
