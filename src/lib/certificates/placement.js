// PIXELS IN, POINTS OUT, AND BACK AGAIN.
//
// The editor works in fractions of the picture it is showing, because that
// picture is however many pixels wide the column happens to be that day. The
// record only ever holds PDF points measured from the BOTTOM-LEFT, which is
// where pdf-lib draws from.
//
// Both directions live here because there are now two of them: making a batch
// converts a click into points, and editing one converts points back into a
// marker. Two copies of this maths would put a name in a different place
// depending on which screen you came from.

export function toPoints({ xPct, yPct, pdfW, pdfH }) {
  return { x: xPct * pdfW, y: (1 - yPct) * pdfH };
}

export function toSpot({ page = 0, x, y, pdfW, pdfH }) {
  return { page, xPct: x / pdfW, yPct: 1 - y / pdfH };
}
