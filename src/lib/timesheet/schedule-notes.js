// The QSP "Employee Schedule Notes" .xls export - the reason staff typed when
// a shift did not run the way it was booked.
//
// WE ALREADY HAD THESE. Every Simple Timesheet ends with a "Comments Details:"
// block and `comments.js` has read it since the first upload. This report is
// the same notes: 290 rows against 299 from the block on 08/16-08/27, the same
// 49 people, and the person-and-day keys differ by two on one side and six on
// the other.
//
// WHAT IT ADDS IS THE CLIENT. The block prints a day and a time and nothing
// else, so a note could only ever be offered to a whole day's bookings. 31% of
// person-days carry more than one note, 151 of the 290 notes share their day
// with another, and a day carries 3.6 shifts on average - so "staff wrote:
// client ended early" was printing against the wrong shift about as often as
// the right one. This report names the client on 256 of the 290, which is
// enough to hand each reason to the booking it is actually about.
//
// It also arrives as a table rather than as printed lines that wrap mid
// sentence, which is why there is no stitching here and a good deal of it in
// `comments.js`.
//
// THE TIMES ARE THE CLOCK'S, NOT THE BOOKING'S. Adams 08/16 reads
// 2:45p-5:34p against a shift rostered 2:45p-6p. So these are matched to a
// booking by overlap, never by an exact start, exactly as the clock rows are.

import { readXlsTable } from "../xls.js";

// QSP writes almost every one of them "Reason given: ...", which is the same
// three words at the front of every note on the screen. Taken off here rather
// than in the component, the same way `comments.js` does it, so one reader
// cannot show them while another hides them.
//
// Not every note carries it: 231 of 290 are "Reason given", 138 lines have no
// label at all, and the Rest Periods report has been seen writing "Cancel
// Reason". Only the label QSP puts on a schedule note comes off.
const PREFIX = /^Reason\s+given:\s*/i;

// "8/16/2026" -> "08/16/26", the spelling every other export in this folder uses
export function noteDay(v) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(v ?? "").trim());
  return m ? `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3].slice(2)}` : null;
}

// "2:45 PM" -> 885
export function noteClock(v) {
  const m = /^(\d{1,2}):(\d{2})\s*([AP])M$/i.exec(String(v ?? "").trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "P") h += 12;
  return h * 60 + Number(m[2]);
}

// 885 -> "2:45p", which is how the roster prints a time and how the cards
// already print these notes. The hour alone where the minutes are zero, again
// following the roster: "8a-10a", not "8:00a-10:00a".
export function clockLabel(min) {
  if (min == null) return null;
  const h24 = Math.floor(min / 60) % 24;
  const mm = min % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}${mm ? `:${String(mm).padStart(2, "0")}` : ""}${h24 < 12 ? "a" : "p"}`;
}

// A shift can carry more than one reason and QSP prints them into the one cell,
// one per line: "Reason given: Forgot to clock in." then "Reason given: Client
// was done at the library". 33 of the 290 do. They stay one note, because they
// are one shift's account of itself, and the lines are kept apart so a reader
// can see there were two of them.
export function splitReasons(text) {
  return String(text ?? "")
    .split(/\r?\n+/)
    .map((line) => line.replace(PREFIX, "").trim())
    .filter(Boolean);
}

// -> [{ employee, client, date, from, to, start, end, service, text, reasons }]
// in the order QSP printed them.
export function readScheduleNoteRows(rows) {
  const out = [];
  for (const row of rows || []) {
    const date = noteDay(row["Start Date"]);
    const reasons = splitReasons(row["Schedule Notes"]);
    // a row with no reason on it is not a schedule note; the report prints one
    // only where somebody typed something
    if (!date || !reasons.length) continue;

    const start = noteClock(row["Shift Start Time"] ?? row["Start Time"]);
    const end = noteClock(row["Shift End Time"] ?? row["End Time"]);
    out.push({
      employee: String(row.Employee ?? row["Employee Name"] ?? "").trim() || null,
      // 34 of 290 name no client. Kept, because a note about an admin block is
      // still the reason that block ran the way it did.
      client: String(row.Client ?? row["Client Name"] ?? "").trim() || null,
      date,
      start,
      end,
      from: clockLabel(start),
      to: clockLabel(end),
      service: String(row["Service Type"] ?? "").trim() || null,
      reasons,
      text: reasons.join(" "),
    });
  }
  return out;
}

export function parseScheduleNotesXls(bytes) {
  const { rows } = readXlsTable(bytes);
  const notes = readScheduleNoteRows(rows);
  if (!notes.length) throw new Error("no schedule notes found in that .xls");
  return notes;
}
