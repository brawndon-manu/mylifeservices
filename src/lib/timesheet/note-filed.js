// WHEN A NOTE WAS FILED, WORDED ONCE.
//
// NOT "SIGNED", AND THAT WAS MEASURED. The DSN's sign-off row is headed
// "Employee Name: | Signature: | Date:", and across all 1,025 pages of the
// 09/01-09/11 export the SIGNATURE COLUMN IS EMPTY ON ALL 661 of them, while
// Employee Name and Date are filled on all 661. So the export records who the
// note belongs to and when it was completed, and captures no signature at all.
//
// That is also why the stored `signedBy` is worthless as an answer to "did
// somebody else sign this": it is the Employee Name field, byte-identical to
// the note's own heading on all 3,418 notes across every batch, 54 names for
// 54 staff. The fields keep the parser's names because that is what the row is
// headed; the screen says what the export actually holds.
//
// Two surfaces print it: the face of the audit card under "DSN 132 words", and
// the foot of the fold-out. They must agree, and both must say nothing where
// there is nothing to say - the supervisor .xls sets all three fields to null
// on purpose, and the foot used to print a bare "Filed" on every one of them,
// 368 of the 1,029 notes on the current period.
//
// THE DAY IS DROPPED WHERE IT IS THE SHIFT'S OWN. 658 of 661 notes were filed
// on the day of the shift they describe, so printing it every time is noise on
// 99.5% of cards and the whole story on the other three. The caller passes the
// shift's day to have it left off, and passes nothing to keep it.
// Returns the halves rather than one string, because the card colours the day
// and not the time - Mánu 2026-09-14: "if they are filed on a different day of
// the shift then can you put the date next to the time in red". `otherDay` is
// what earns the colour, and it is never the only thing carrying the meaning:
// the day is PRESENT only when it differs, so a reader who cannot see the red
// still sees a date that is not usually there.
export function filedParts(note, shiftDate = null) {
  const date = note?.signedDate || null;
  const time = note?.signedAt || null;
  if (!date && !time) return null;
  const otherDay = Boolean(date && shiftDate && date !== shiftDate);
  // with no shift day to compare against - the fold-out - the day is kept and
  // is never the odd one out, because there is nothing to be odd against
  const shown = shiftDate ? (otherDay ? date : null) : date;
  if (!shown && !time) return null;
  return { date: shown, time, otherDay };
}

export function filedLine(note, shiftDate = null) {
  const parts = filedParts(note, shiftDate);
  return parts ? [parts.date, parts.time].filter(Boolean).join(" ") || null : null;
}
