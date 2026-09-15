// WHICH SCHEDULED BLOCK A DRAWN BLOCK IS LABELLED BY.
//
// Split out of DayCalendar.js so it can be tested: that file is "use client"
// and pulls React, so a test can only read it as text - and a rule this easy to
// get subtly wrong deserves better than a regex looking at its source. Same
// reason note-minute.js sits apart from service-notes.js.
//
// MEAL BLOCKS ARE SKIPPED. They live in the same list and are not a service, so
// a shift running across a rostered lunch would otherwise come back labelled
// "Meal Break", which is both wrong and the opposite of what it is.
//
// ON A TIE, THE TIGHTER BLOCK WINS, and that is not a preference - it is the
// only reading that can be right. A block sitting wholly INSIDE another
// overlaps the window by exactly as much as the block containing it, so
// comparing with `>` alone left the answer to array order. Espinoza's
// 11a-11:25a travel sits inside a 9a-12p booking for Wade, the booking came
// first, and the picture called a travel block "ILS Service" for Wade while the
// finding beside it correctly said a travel block. Reversing the list flipped
// the answer, which is how you know nothing real was deciding it.
//
// Nine blocks across the two live batches read that way, and the day program's
// four were worse: they printed another client's name on somebody's block.
export function blockFor(scheduled, shift) {
  let best = null;
  let bestOverlap = 0;
  let bestSpan = Infinity;
  for (const b of scheduled || []) {
    if (b.meal) continue;
    const overlap = Math.min(b.to, shift.to) - Math.max(b.from, shift.from);
    if (overlap <= 0) continue;
    const span = b.to - b.from;
    if (overlap > bestOverlap || (overlap === bestOverlap && span < bestSpan)) {
      bestOverlap = overlap;
      bestSpan = span;
      best = b;
    }
  }
  return best;
}
