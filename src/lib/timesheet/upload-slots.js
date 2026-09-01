// WHICH PICKER A DROPPED EXPORT BELONGS TO, decided from its own filename.
// QSP names its exports consistently - "08-16-2026-08-31-2026 Rest Periods
// Report.xls" - so all eight can be dropped on the form at once and land in
// their slots. One place holds the rules; the form and the tests read it.
//
// ORDER MATTERS where names nest: "Employee Detailed Daily Service Notes"
// contains "Service Notes", so the more specific rule sits first, and the
// extension has to agree too - the two service-notes reports differ by
// exactly that.
export const UPLOAD_SLOTS = [
  { id: "file", match: /simple timesheet/i, ext: /\.pdf$/i },
  { id: "schedule", match: /employee schedules/i, ext: /\.pdf$/i },
  { id: "payroll", match: /simple payroll processing/i, ext: /\.xls$/i },
  { id: "rests", match: /rest periods report/i, ext: /\.xls$/i },
  { id: "clock", match: /qsclock|time and attendance/i, ext: /\.xls$/i },
  { id: "notes", match: /detailed daily service notes/i, ext: /\.pdf$/i },
  { id: "serviceNotes", match: /employee service notes/i, ext: /\.xls$/i },
  { id: "scheduleNotes", match: /employee schedule notes/i, ext: /\.xls$/i },
];

// -> slot id, or null for a file that is not one of the eight
export function slotForFilename(name) {
  const n = String(name || "");
  for (const s of UPLOAD_SLOTS) {
    if (s.match.test(n) && s.ext.test(n)) return s.id;
  }
  return null;
}
