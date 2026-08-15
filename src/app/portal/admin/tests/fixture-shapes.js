// THE SHAPES THE REAL DATA DOES NOT CURRENTLY HOLD.
//
// `fixture-sheet.js` is seeded from real rows, which is what makes it honest.
// These are not: they are written by hand, and they are here because the four
// ways a moved break can meet the axis are not all present in either batch.
//
// Measured across 08/01-08/15 and 07/16-07/31, 33 rows have been moved by the
// engine and they land like this:
//
//    9  starts outside the day        a chip above the column        <- seeded
//    4  starts inside, runs off it    drawn, then cut at the edge
//   19  no drawable span at all       a chip, because a backwards row
//                                     reads out 3p in 2p and ends before
//                                     it begins
//    1  fits inside the day           drawn in its own lane
//
// Only the first is in the fixture's own July rows, so without these the Tests
// card could show one of the four states it exists to show. Each row below is
// the minimum that provokes its shape through the REAL `restRowTimes` and the
// REAL `drawnRest` - none of them hand-writes a question or a block.
//
// They hang off 07/16/26, the fixture's repair day, which works 8a to 2:30p.
// `repair` keeps a card per out-time, so these are four cards and not one.
const DAY = "07/16/26";

const base = {
  date: DAY,
  name: "Uribe, Mánu",
  client: "Adler, Ray",
  kind: null,
  note: null,
  repair: null,
  counted: true,
  minutes: 10,
  reversed: false,
  shift: "8:00 AM to 11:05 AM",
  shiftFrom: "8:00 AM",
  shiftTo: "11:05 AM",
  derivation: "0.17 hr x 60 = 10 min",
  offOwnShift: false,
  serviceType: "ILS Service",
  printedHours: 0.17,
  scheduleNotes: null,
  fit: null,
};

export const SHAPE_ROWS = [
  // SHAPE 3 - only the IN time slipped, so the record reads a 730 minute break
  // that starts in a perfectly ordinary place. Drawn from its true start and cut
  // at the bottom of the axis. Dinley 08/07 is the real one of these.
  {
    ...base,
    out: "11:00 AM",
    in: "11:10 PM",
    minutes: 730,
    derivation: "12.17 hr x 60 = 730 min",
    repair: {
      field: "in", to: "11:10 AM", minutes: 10,
      why: "the IN time was picked as PM", fits: true,
    },
    shift: "8:00 AM to 11:05 AM",
  },
  // SHAPE 1 - the recorded span sits inside the day, so both are simply drawn.
  // A single mis-picked minute rather than a mis-picked half of the clock.
  {
    ...base,
    out: "9:00 AM",
    in: "9:40 AM",
    minutes: 40,
    derivation: "0.67 hr x 60 = 40 min",
    repair: {
      field: "out", to: "9:30 AM", minutes: 10,
      why: "the OUT hour was rolled back half an hour", fits: true,
    },
  },
  // SHAPE 4 - a backwards row. The engine swaps the ends silently and nobody is
  // ever asked: there is no question kind for `reversed` on its own, it only
  // surfaces when the row also carries a repair. 17 of the 33 moved rows are
  // this, which makes it the commonest thing on this page nobody has ever seen.
  {
    ...base,
    out: "2:10 PM",
    in: "2:00 PM",
    reversed: true,
    shift: "11:15 AM to 2:30 PM",
    shiftFrom: "11:15 AM",
    shiftTo: "2:30 PM",
  },
];
