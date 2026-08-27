// The Employee Detailed Daily Service Notes export: one note per shift, written
// by the member of staff who worked it.
//
// Mánu 2026-08-26: "i need to go through the service notes and see whether or
// not the time that is billed adds up for what the service is on paper. since
// this is off of wording directly from staff I am struggling for how to go
// about this."
//
// THE ANSWER IS THAT THE PROSE IS RARELY THE PART THAT NEEDS READING. A note
// carries its own shift times, and measured on 08/16-08/22 those times are the
// CLOCK times: 330 of 373 notes match the clock export exactly and 25 more match
// the roster. So a note is a third witness to the same shift, next to what the
// roster billed and what the clock recorded, and the three can be reconciled
// without anyone reading a word.
//
// NOTHING HERE DECIDES ANYTHING ABOUT PAY. It reports what three documents say
// about one shift and where they disagree. A gap has innocent explanations - a
// client ending a session early is ordinary and can still be billable - so the
// rules below rank shifts for a person to read, and never conclude.
//
// relative, not "@/lib/..." - the other modules in this folder are imported by
// the test runner and by one-off scripts outside Next, where the alias is not
// resolvable
import { getPdfjs } from "../pdf-globals.js";

// "8/5/2026 10:00 AM - 12:00 PM"
const SHIFT_TIMES =
  /^(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)$/i;
// "Taylor Adams 8/5/2026 12:04 PM"
const SIGNATURE = /^(.+?)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2}\s*[AP]M)$/i;

export function noteMinute(v) {
  const m = /^(\d{1,2}):(\d{2})\s*([AP])M$/i.exec(String(v ?? "").trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "P") h += 12;
  return h * 60 + Number(m[2]);
}

// the notes print "8/5/2026"; every other export in this folder prints "08/05/26"
export function noteDate(v) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(v ?? "").trim());
  return m ? `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3].slice(2)}` : null;
}

// TAKES THE NORMALISED SPELLING, not the document's.
//
// It used to run its argument back through `noteDate`, whose pattern wants a
// four-digit year - so by the time the dates had been normalised to "08/05/26"
// it matched neither and returned null for both. `null - null` is 0 in
// JavaScript, so every signature read as same-day, and the one note in the
// 8/1-8/26 export signed the EVENING BEFORE its shift came out four hundred
// minutes late instead of a day early.
const dayNumber = (d) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(String(d ?? ""));
  if (!m) return null;
  return Date.UTC(2000 + Number(m[3]), Number(m[1]) - 1, Number(m[2])) / 86400000;
};

// ONE NOTE, from the lines of the pages it spans.
//
// Split out so a test can drive it: the export is a 4MB, 1,848-page PDF that is
// not in the repo, and a reader nothing can exercise without one is a reader
// nobody checks.
export function noteFromLines(lines) {
  // THE CLIENT IS THE LINE ABOVE THE SHIFT TIMES, not the third line of the
  // note. Those are usually the same line and once in 1,259 they are not:
  // Marilyn Urena's 08/04 note breaks between its own header and its client
  // name, so page 1645 ends after "Daily Service Note" and the client
  // ("Matthew Arslan") opens page 1646. Read positionally, the client came out
  // as the page footer - "Printed by: Brandon Uribe Printed on: ...".
  const at = lines.indexOf("Shift Dates/Times");
  const above = at > 0 ? lines[at - 1] : null;
  const note = {
    employee: lines[0] || null,
    client: (above && !/Printed (by|on):/i.test(above) ? above : lines[2]) || null,
    date: null, start: null, end: null,
    summary: "", categories: [], comments: [],
    miles: null, signedBy: null, signedDate: null, signedAt: null,
  };

  if (at >= 0) {
    const m = SHIFT_TIMES.exec(lines[at + 1] || "");
    if (m) { note.date = noteDate(m[1]); note.start = m[2]; note.end = m[3]; }
  }

  const summary = lines.indexOf("Summary");
  const services = lines.indexOf("Service Notes");
  const mileage = lines.indexOf("Auto Mileage");
  if (summary >= 0) {
    const stop = [services, mileage].filter((x) => x > summary).sort((a, b) => a - b)[0]
      ?? lines.length;
    note.summary = lines
      .slice(summary + 1, stop)
      // a checkbox, printed whether or not it is ticked
      .filter((l) => l !== "o Is High Priority")
      .join(" ");
  }

  if (services >= 0) {
    const stop = mileage > services ? mileage : lines.length;
    for (const line of lines.slice(services + 1, stop)) {
      if (line.startsWith("Comments:")) note.comments.push(line.slice(9).trim());
      // a comment wraps over as many lines as it needs; anything before the
      // first "Comments:" is the name of a goal the note was filed under
      else if (note.comments.length) note.comments[note.comments.length - 1] += ` ${line}`;
      else note.categories.push(line);
    }
  }

  const asked = lines.indexOf("Do you want to claim miles?");
  if (asked >= 0) note.miles = /^yes$/i.test(lines[asked + 1] || "") ? true : false;

  // THE HEADER WRAPS. Sometimes "Employee Name: Signature: Date:" is one line
  // and sometimes it is two, so the signature sits one or two lines below it.
  const header = lines.findIndex((l) => l.startsWith("Employee Name:"));
  if (header >= 0) {
    for (let k = header + 1; k < Math.min(header + 4, lines.length); k++) {
      // "Printed by: Brandon Uribe Printed on: 8/26/2026 3:11 PM" is the page
      // FOOTER and matches the same shape. Read as a signature it invents a
      // signing time of 3:11 PM on 26 August for every note that has none, and
      // then reports those notes as signed sixteen days late.
      if (/Printed (by|on):/i.test(lines[k])) continue;
      const m = SIGNATURE.exec(lines[k]);
      if (m) {
        note.signedBy = m[1].trim();
        note.signedDate = noteDate(m[2]);
        note.signedAt = m[3];
        break;
      }
    }
  }

  return withDerived(note);
}

function withDerived(note) {
  const from = noteMinute(note.start);
  const to = noteMinute(note.end);
  note.startMin = from;
  note.endMin = to;
  // the documented length of the service, which is the figure the billed hours
  // are checked against
  note.minutes = from == null || to == null ? null : (to < from ? to - from + 1440 : to - from);

  const signed = noteMinute(note.signedAt);
  const signedDay = dayNumber(note.signedDate);
  const shiftDay = dayNumber(note.date);
  // guarded explicitly: `null - null` is 0, which reads as "signed the same day"
  const days = signedDay == null || shiftDay == null ? null : signedDay - shiftDay;
  // minutes between the end of the shift and the signature. Negative means the
  // note was signed before the shift it describes had finished.
  note.signedAfterMin =
    signed == null || to == null || days == null ? null : days * 1440 + (signed - to);

  note.words = `${note.summary} ${note.comments.join(" ")}`
    .split(/\s+/).filter(Boolean).length;
  return note;
}

// A note opens on the page whose SECOND line reads "Daily Service Note", under
// the name of the member of staff who wrote it. Everything up to the next such
// page belongs to it - a note runs to one page or four depending on how much
// was written.
export function readNotePages(pages) {
  const starts = [];
  pages.forEach((lines, i) => { if (lines[1] === "Daily Service Note") starts.push(i); });

  const notes = [];
  for (let n = 0; n < starts.length; n++) {
    const from = starts[n];
    const to = n + 1 < starts.length ? starts[n + 1] : pages.length;
    const note = noteFromLines(pages.slice(from, to).flat());
    note.page = from + 1;
    // a note with no shift times cannot be lined up against anything, and
    // silently keeping it would put a row on the audit screen that no rule can
    // ever judge
    if (note.date && note.employee) notes.push(note);
  }
  return notes;
}

// text items -> one string per printed line, left to right, top to bottom.
// The same shape `schedule.js` builds, for the same reason: these documents are
// laid out in columns and reading the items in emission order interleaves them.
// THE SAME STRIP THE TIMESHEET READER DOES, at the same point: as the text
// comes off the page.
//
// A NUL in this export is not hypothetical - the 8/1-8/26 notes carry one, and
// storing them without this comes back as `22P05, unsupported Unicode escape
// sequence` with nothing in the message naming the note or the character. That
// is the failure that took four timesheet uploads down on 2026-08-15.
//
// Written with escapes on purpose: a literal NUL anywhere in a file makes
// ripgrep call the whole file binary and skip it in every search across src.
const stripControl = (s) => String(s ?? "").replace(/[\u0000-\u001f\u007f-\u009f]/g, "");

export function linesOf(items) {
  const rows = new Map();
  for (const raw of items) {
    const it = { ...raw, str: stripControl(raw.str) };
    if (!it.str?.trim()) continue;
    const y = Math.round(it.transform[5]);
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push({ x: it.transform[4], s: it.str });
  }
  return [...rows.keys()]
    .sort((a, b) => b - a)
    .map((y) => rows.get(y).sort((a, b) => a.x - b.x).map((i) => i.s).join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export async function parseServiceNotesPdf(bytes) {
  const pdfjs = await getPdfjs();
  // TWO SEPARATE TRAPS, both about the bytes.
  //
  // pdfjs DETACHES what it is given, so the caller's copy has to be its own -
  // the same trap `parseSchedulePdf` documents next door.
  //
  // And it refuses a Node Buffer BY NAME, while `instanceof Uint8Array` says
  // yes to one because Buffer extends it. `.slice()` on a Buffer returns
  // another Buffer, so the obvious guard passes the thing straight through.
  // `Uint8Array.from` is what actually produces a plain one.
  const doc = await pdfjs.getDocument({ data: Uint8Array.from(bytes) }).promise;

  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(linesOf(content.items));
  }
  const notes = readNotePages(pages);
  if (!notes.length) throw new Error("no daily service notes found in that PDF");
  return notes;
}
