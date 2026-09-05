// The QSP "Employee Service Notes" .xls export - the OTHER place a service note
// gets written, and where Field Supervisors write theirs.
//
// WHY THIS EXISTS. The audit read service notes from the Employee Detailed
// Daily Service Notes PDF alone, and that is only one of the two. Mánu
// 2026-08-27: "field supervisors dont do daily service notes. they input their
// notes in the service notes and schdule notes." Which report a person uses
// follows their job, and it shows: on 08/16-08/27 the PDF holds 668 notes
// across 48 staff with Solorzano, Rotter, Velasco, Rodriguez, Romero-Alba and
// Stephanie Garcia in none of them, while 25 Independent Living Instructors are
// in the PDF and not here.
//
// So this is not the complete report and that one the broken one. Neither
// covers everybody because neither was ever meant to.
//
// Against the 862 billable service shifts of that period:
//
//   the PDF alone        660 documented (76.6%)   202 with no note
//   this alone           192 documented (22.3%)   670 with no note
//   the two together     793 documented (92.0%)    69 with no note
//
// So neither report is the answer and both together nearly are. Read this
// ALONGSIDE the PDF, never instead of it.
//
// The two are merged rather than preferred one over the other, and a shift that
// finds a note in both keeps one of them - see `mergeNotes`.
//
// SHAPE OF THE DOCUMENT. One worksheet per member of staff per client, 276 of
// them for a fortnight. Each opens with a title block and then lists the
// shifts, each shift's note on the row beneath it:
//
//   [ , , "My Life Services Service Notes"       ]
//   [ , "Staff Name: Aaron Jones", , "Client Name: James Caviar" ]
//   [ , "Date: 8/16/2026 - 8/27/2026", , "UCI Number: 6861783"   ]
//   [ , "Date", "Start Time - End Time", , "   Total Time   "    ]
//   [ , "08/17/2026", "8:00 AM-10:00 AM (ILS Service)", , 2      ]
//   [ , , "Time management:\nSupervisor assisted client with ..." ]
//
// The staff member and the client come off the TITLE BLOCK rather than off each
// row, which is why this cannot be read as a flat table the way the Rest
// Periods or Schedule Notes reports can.

import { readXlsSheets } from "../xls.js";
import { noteMinute, noteDate, withDerived } from "./service-notes.js";

// "8:00 AM-10:00 AM (ILS Service)"
const SHIFT_TIMES =
  /^(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)\s*(?:\(([^)]*)\))?$/i;
const DATE_CELL = /^\d{1,2}\/\d{1,2}\/\d{4}$/;

// "Staff Name: Aaron Jones" -> "Aaron Jones". Read out of the whole block
// rather than a fixed cell: the title rows shift down by one on some sheets.
function labelled(rows, label) {
  for (const row of rows) {
    for (const cell of row) {
      if (typeof cell !== "string") continue;
      const at = cell.indexOf(label);
      if (at === 0) return cell.slice(label.length).trim() || null;
    }
  }
  return null;
}

// THE NOTE BODY, split the way the PDF reader splits its own.
//
// A goal name is printed as its own line ending in a colon and the account of
// the work follows it. Most notes have no goal line at all - 58 of 1,653 lines
// on 08/16-08/27 - so the common case is plain prose in paragraphs, and a body
// with nothing that looks like a goal is entirely prose rather than entirely
// category.
export function splitNoteBody(text) {
  const categories = [];
  const comments = [];
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/:$/.test(line)) categories.push(line.replace(/:$/, ""));
    else comments.push(line);
  }
  return { categories, comments };
}

// ONE WORKSHEET -> its notes. Split out so a test can drive it: the export is a
// 21MB, 276-sheet workbook that is not in the repo, and a reader nothing can
// exercise without one is a reader nobody checks.
export function readServiceNoteSheet(rows, { sheet = null } = {}) {
  const employee = labelled(rows, "Staff Name:");
  if (!employee) return [];
  // a client-less sheet is a real thing here - it is where the ILS Admin,
  // Travel and Misc notes are filed - and it is kept, because dropping it would
  // silently decide that only client work is documented.
  const client = labelled(rows, "Client Name:");

  const notes = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const date = row.find((c) => typeof c === "string" && DATE_CELL.test(c.trim()));
    if (!date) continue;
    const times = row
      .map((c) => (typeof c === "string" ? SHIFT_TIMES.exec(c.trim()) : null))
      .find(Boolean);
    if (!times) continue;

    // the account of the work is the row beneath the shift. Every one of the
    // 621 entries on 08/16-08/27 has one; an entry that does not is kept with
    // no prose rather than dropped, so it reads as a note of no words instead
    // of vanishing into "no service note".
    const body = (rows[i + 1] || []).find((c) => typeof c === "string" && c.trim()) || "";
    const { categories, comments } = splitNoteBody(body);

    notes.push(withDerived({
      employee,
      client,
      date: noteDate(date),
      start: times[1].toUpperCase().replace(/\s+/g, " "),
      end: times[2].toUpperCase().replace(/\s+/g, " "),
      service: times[3] || null,
      summary: "",
      categories,
      comments,
      miles: null,
      // THIS EXPORT CARRIES NO SIGNATURE. The PDF prints who signed the note
      // and when; this prints the note. Left null rather than guessed - nothing
      // raises a finding on signing any more, and the card simply shows no
      // signing line for a note that came from here.
      signedBy: null,
      signedDate: null,
      signedAt: null,
      // where it came from, for a reader looking at a note that disagrees with
      // the other export
      source: "xls",
      sheet,
    }));
  }
  return notes;
}

export function parseServiceNotesXls(bytes) {
  const sheets = readXlsSheets(bytes);
  const notes = [];
  sheets.forEach((rows, i) => {
    for (const note of readServiceNoteSheet(rows, { sheet: i + 1 })) {
      // a note with no date cannot be lined up against anything, the same guard
      // the PDF reader applies
      if (note.date && note.employee) notes.push(note);
    }
  });
  if (!notes.length) throw new Error("no service notes found in that .xls");
  return notes;
}

// ---------------------------------------------------------------- merging

// The two reports OVERLAP as well as complement each other: 46 of the staff on
// 08/01-08/26 appear in both, and where they do the same shift can carry a note
// in each. One shift gets one note, and the PDF's wins, because it is the one
// that records who signed it and when.
//
// Identity is the person, the day, the minute the note opens AND THE CLIENT -
// not the text, which is written twice by two reports out of one field and can
// differ in its whitespace alone.
//
// THE CLIENT IS PART OF THE KEY because the first three are not unique. On
// 08/16-08/27 the two reports share 64 note keys and five of them are not the
// same note: Marilyn Urena's 08/26 7:45am is an ILS Service visit in the PDF
// and a separate ILS Misc write-up here, and Esmeralda Flores filed one
// account of one shopping trip against two different clients. Keying without
// the client threw away one of each pair.
//
// Whitespace is collapsed because it is the only thing separating the PDF's
// "Susan Elder. Morton" from this export's "Susan Elder.  Morton".
export function mergeNotes(fromPdf = [], fromXls = []) {
  const who = (v) => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const keyOf = (n) =>
    `${who(n.employee)}|${n.date}|${noteMinute(n.start)}|${who(n.client)}`;
  const seen = new Set(fromPdf.map(keyOf));
  // each note remembers which report it came from - Mánu 2026-09-05: "i cant
  // differentiate the 2" - so the audit can say DSN where the DSN spoke
  const out = fromPdf.map((n) => ({ ...n, source: "dsn" }));
  for (const note of fromXls) {
    const key = keyOf(note);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...note, source: "xls" });
  }
  return out;
}
