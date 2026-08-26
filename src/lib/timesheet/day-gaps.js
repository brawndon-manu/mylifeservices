// THE HOLES IN A DAY, and what the schedule says each one is.
//
// Lifted out of `DayCalendar` on 2026-08-26 so it can be run by a test rather
// than grepped for as source. It is pure arithmetic over the punch pairs and
// the rostered meals, it imports nothing, and the component is the only thing
// that draws what it returns.

// A PUNCH GAP IS NOT A REST PERIOD, and this drew it as one.
//
// Mánu 2026-08-11, looking at his own 07/16: "Why is it showing rest one PM and
// rest three fifteen? I've already said this before. If there's nothing on the
// schedule for a time slot in between shifts, those are unworked hours.
// Therefore, we cannot assume that the rest is right there."
//
// He is right and the engine already agreed with him - 07/16 carries
// `restRecorded: 0` and `restTaken: 0`, and not one rest row in the report is
// under his name that day. `parse.js` files any 10-15 minute gap between punch
// pairs as `kind: "rest"` for its own arithmetic, and drawing that in the
// document's yellow put "you took two rests" directly beside a question asking
// whether he took any.
//
// AND A GAP IS NOT A MEAL EITHER - not even a gap the engine calls
// "rostered-meal". That flag means the gap OVERLAPS a rostered lunch, not that
// it IS one, and reading it as identity got 07/31 wrong: the roster books
// 12:20p-12:50p and the punches are out from 12p to 1p, so the calendar drew
// "Meal 12p-1p" - an hour long, starting twenty minutes early. Mánu 2026-08-12:
// "meal time wrong for seven thirty one."
//
// So the SCHEDULE decides where a meal is and how long it runs, and the gap is
// cut around it. 07/31 becomes: not scheduled 12p-12:20p, meal 12:20p-12:50p,
// not scheduled 12:50p-1p. Where a rostered meal fills a gap exactly - his 07/27
// - the gap is entirely meal and no "not scheduled" is drawn at all, which is
// the other half of the same fix: that stretch IS scheduled.
export function gapsOf(day, shifts, scheduled = []) {
  const meals = (scheduled || [])
    .filter((b) => b.meal && b.to > b.from)
    .sort((a, b) => a.from - b.from);
  // TWO BOOKINGS BILLED OVER EACH OTHER ARE NOT A HOLE BETWEEN THEM.
  //
  // Mánu 2026-08-26 on Devine 08/20: "can you explain to me why it says not
  // scheduled for 10a-11:30a for this overlapping schedule."
  //
  // Her pairs come off QSP as 8a-11:30a, 9a-10a, 11:30a-12p, 12:30p-3:52p - the
  // training sits INSIDE the client booking, which is the hour the day is
  // flagged for. Walked in order, this compared the training's end (10a) with
  // the travel's start (11:30a) and drew ninety minutes of "Not scheduled" over
  // a stretch the first pair covers and she was paid for.
  //
  // So the gaps come off the UNION of the pairs, not off the list in the order
  // it was printed. The pairs themselves are untouched: the overlap still draws
  // as two lanes, because two things really were booked at once - it is only
  // the space BETWEEN work that this is about. Three person-days across every
  // upload drew a phantom band: Devine 07/23 and 08/20, Robinson 08/07.
  const merged = [];
  for (const s of [...shifts].sort((a, b) => a.from - b.from || a.to - b.to)) {
    const last = merged[merged.length - 1];
    if (last && s.from <= last.to) last.to = Math.max(last.to, s.to);
    else merged.push({ from: s.from, to: s.to });
  }

  const out = [];
  for (let i = 1; i < merged.length; i++) {
    const from = merged[i - 1].to;
    const to = merged[i].from;
    if (to <= from) continue;
    // walk the gap, handing each stretch to the rostered meal that covers it
    let at = from;
    for (const m of meals) {
      const lo = Math.max(m.from, from);
      const hi = Math.min(m.to, to);
      if (hi <= lo) continue;
      if (lo > at) out.push({ from: at, to: lo, meal: false });
      out.push({ from: lo, to: hi, meal: true });
      at = hi;
    }
    if (at < to) out.push({ from: at, to, meal: false });
  }
  return out;
}
