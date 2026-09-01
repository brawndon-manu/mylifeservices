// EVERY EXPORT'S REAL FILENAME LANDS IN ITS OWN SLOT. These are the names QSP
// actually writes (taken off a real upload attempt, 2026-09-01), plus the
// nesting traps: "Employee Detailed Daily Service Notes" contains "Service
// Notes", and "Employee Schedules" sits one letter from "Employee Schedule
// Notes" - the extension is what has to break those ties.
import { test } from "node:test";
import assert from "node:assert/strict";
import { slotForFilename } from "../upload-slots.js";

test("the eight real filenames each find their picker", () => {
  const real = [
    ["08_16_26-08_31_26 Simple Timesheet.pdf", "file"],
    ["Employee Schedules August 2026-12.pdf", "schedule"],
    ["08-16-2026-08-31-2026 Simple Payroll Processing Report.xls", "payroll"],
    ["08-16-2026-08-31-2026 Rest Periods Report.xls", "rests"],
    ["08-16-2026-08-31-2026 QSClock Time and Attendance Report.xls", "clock"],
    ["8-16-2026-8-31-2026 Employee Detailed Daily Service Notes.pdf", "notes"],
    ["08-16-2026-08-31-2026 Employee Service Notes.xls", "serviceNotes"],
    ["08-16-2026-08-31-2026 Employee Schedule Notes.xls", "scheduleNotes"],
  ];
  for (const [name, slot] of real) assert.equal(slotForFilename(name), slot, name);
});

test("a file that is none of the eight matches nothing", () => {
  assert.equal(slotForFilename("Uribe, Brandon - signed timesheet 08_16.pdf"), null);
  assert.equal(slotForFilename("holiday photos.zip"), null);
  assert.equal(slotForFilename(""), null);
  assert.equal(slotForFilename(null), null);
});

test("the right name with the wrong extension is not placed", () => {
  // a print-to-PDF of an .xls export is the wrong-file trap this catches
  assert.equal(slotForFilename("Rest Periods Report.pdf"), null);
  assert.equal(slotForFilename("Simple Timesheet.xls"), null);
});

// the day program's four, on its own slot list - and the shared names land on
// DP ids here, not the MLS ones
import { DP_UPLOAD_SLOTS } from "../upload-slots.js";

test("the day program's exports find their own pickers", () => {
  const real = [
    ["08_16_26-08_31_26 Simple Timesheet.pdf", "timesheet"],
    ["08-16-2026-08-31-2026 Rest Periods Report.xls", "rests"],
    ["Employee Schedules August 2026-12.pdf", "schedule"],
    ["08-16-2026-08-31-2026 Employee Mileage Tracking Report.xls", "mileage"],
  ];
  for (const [name, slot] of real) {
    assert.equal(slotForFilename(name, DP_UPLOAD_SLOTS), slot, name);
  }
  assert.equal(slotForFilename("08-16-2026-08-31-2026 Simple Payroll Processing Report.xls", DP_UPLOAD_SLOTS), null);
});
