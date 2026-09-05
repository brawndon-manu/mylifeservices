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

// THE DAY PROGRAM'S FOUR, same idea, its own picker ids. Its Simple
// Timesheet and Rest Periods exports share QSP's names with the MLS ones -
// only which form they are dropped on decides which batch they feed.
export const DP_UPLOAD_SLOTS = [
  { id: "timesheet", match: /simple timesheet/i, ext: /\.pdf$/i },
  { id: "rests", match: /rest periods report/i, ext: /\.xls$/i },
  { id: "schedule", match: /employee schedules/i, ext: /\.pdf$/i },
  { id: "mileage", match: /mileage tracking/i, ext: /\.xls$/i },
];

// -> slot id, or null for a file that is not one of the form's exports
export function slotForFilename(name, slots = UPLOAD_SLOTS) {
  const n = String(name || "");
  for (const s of slots) {
    if (s.match.test(n) && s.ext.test(n)) return s.id;
  }
  return null;
}

// A DROP LANDS EVERY EXPORT AT ONCE, on whichever upload form called this.
// Each file is matched to its picker by QSP's own filename and set on the
// input the way a click would have; the names that matched nothing come back
// so the form can say so - a silently ignored file reads as an upload that
// lost it. Browser-only by nature; the matcher above stays pure for tests.
export function placeDroppedFiles(root, files, slots = UPLOAD_SLOTS) {
  const unplaced = [];
  for (const file of files) {
    const slot = slotForFilename(file.name, slots);
    let input = slot ? root?.querySelector(`#${slot}`) : null;
    // two files matching one slot: the overflow goes to the slot's "2" twin
    // where the form has one - the audit lane's second Simple Timesheet
    if (input && input.files?.length > 0) {
      const twin = root?.querySelector(`#${slot}2`);
      if (twin && twin.files?.length === 0) input = twin;
    }
    if (!input) {
      unplaced.push(file.name);
      continue;
    }
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    // the same event a picker click fires, so the row's own onChange runs
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  return unplaced;
}
