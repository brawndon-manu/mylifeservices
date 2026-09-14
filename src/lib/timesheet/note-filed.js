import { noteMinute } from "./note-minute.js";

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
// HOW FAR THE FILED STAMP SITS FROM THE CLOCK OUT, in minutes, negative when
// the note was filed BEFORE the person clocked out.
//
// Mánu 2026-09-14: "lets make the auto flag pick up dsn filed time if its over
// 10 minutes of the clock out time ... for example a shift 9am-12pm clocked
// 9am-12pm and dsn filed at 10am". A note filed two hours before the shift
// ended describes work that had not happened yet.
//
// MEASURED ON THE CURRENT PERIOD before it became a rule. Filing a few minutes
// early is ordinary - the median is 3 minutes before clock out, and p75 is 0 -
// so the ordinary case must not fire. The tail is the finding: 165 rows more
// than ten minutes early, and on 167 of the 168 outside ten minutes the note's
// OWN end time matches the clock out to within two minutes. The note says it
// worked until clock out and was written long before that.
//
// The day is carried because a note can be filed the next day: the stamp and
// the shift each bring their own mm/dd/yy.
const dayNumber = (mdy) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(String(mdy || "").trim());
  return m ? Date.UTC(2000 + Number(m[3]), Number(m[1]) - 1, Number(m[2])) / 86400000 : null;
};

export function filedGapMin(note, shiftDate, clockOutMin) {
  if (clockOutMin == null || !Number.isFinite(clockOutMin)) return null;
  const filed = noteMinute(note?.signedAt);
  if (filed == null) return null;
  const filedDay = dayNumber(note?.signedDate);
  const shiftDay = dayNumber(shiftDate);
  // an unreadable date on either side means the day offset is unknown, and
  // guessing zero would call a next-day filing a same-day one
  if (note?.signedDate && shiftDate && (filedDay == null || shiftDay == null)) return null;
  const days = filedDay == null || shiftDay == null ? 0 : filedDay - shiftDay;
  return days * 1440 + filed - clockOutMin;
}

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
