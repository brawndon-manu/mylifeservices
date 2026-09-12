// The stages a timesheet upload moves through, and the shape of the ticker.
//
// Deliberately its own module with ZERO imports. The screen that shows progress
// is a client component and the store that records it talks to redis - putting
// these two together pulled the redis client into the browser bundle, where
// `Redis.fromEnv()` runs at import time and throws. Anything both sides need
// lives here; anything that touches redis lives in `timesheet-progress.js`.

export const STAGES = [
  { key: "reading", label: "Reading the timesheet PDF" },
  { key: "checking", label: "Checking the dates and looking for duplicates" },
  { key: "schedule", label: "Reading the schedule PDF" },
  { key: "clock", label: "Reading the clock report" },
  { key: "notes", label: "Reading the service notes" },
  { key: "rests", label: "Reading the rest periods report" },
  { key: "generating", label: "Working out hours and generating each sheet" },
  { key: "saving", label: "Saving the batch" },
  { key: "done", label: "Done" },
];

// THE AUDIT COPY'S UPLOAD, same panel, its own steps and no payroll clothes -
// Mánu 2026-09-07: "this is tied to the timesheets still. it needs to be
// unique on its own." The audit lane never carries a payroll or rests export,
// and it grows a stage of its own: the diff against the previous copy, which
// runs after the save. Listing "comparing" here also fixes the center label,
// which used to fall back to "Reading the export" during that stage.
export const AUDIT_STAGES = [
  { key: "reading", label: "Reading the timesheet export" },
  { key: "checking", label: "Checking the dates" },
  { key: "schedule", label: "Reading the schedule PDF" },
  { key: "clock", label: "Reading the clock report" },
  { key: "notes", label: "Reading the service notes" },
  { key: "generating", label: "Lining up each person's shifts" },
  { key: "saving", label: "Saving the copy" },
  { key: "comparing", label: "Comparing with the previous copy" },
  { key: "done", label: "Done" },
];

// THE DAY PROGRAM'S UPLOAD, same panel, its own steps. Its analyze reads all
// of its exports in one pass, so there is one reading stage where the MLS list
// has four, and its sources are stored after the sheets are built rather than
// as each file is parsed.
export const DP_STAGES = [
  { key: "reading", label: "Reading the exports" },
  { key: "generating", label: "Working out hours and generating each sheet" },
  { key: "storing", label: "Storing the source files" },
  { key: "saving", label: "Saving the batch" },
  { key: "done", label: "Done" },
];

// A MONTH OF CLIENT SCHEDULES, its own steps. One PDF in, one drawn form per
// client out, and the drawing is nearly all of the wait: 240 clients is 240
// renders and 240 stores. Mánu 2026-09-12, watching it sit on "Building the
// forms...": "its stuck here". It was not - it had another minute to go and no
// way to say so.
export const CLIENT_SCHEDULE_STAGES = [
  { key: "reading", label: "Reading the schedules PDF" },
  { key: "storing", label: "Storing the export" },
  { key: "generating", label: "Drawing a form for each client" },
  { key: "saving", label: "Saving the month" },
  { key: "done", label: "Done" },
];

// how many names to keep in the ticker. enough that it reads as moving, few
// enough that the payload stays small on a poll every second.
export const RECENT_MAX = 4;

export function pushRecent(recent, entry) {
  return [entry, ...(recent || [])].slice(0, RECENT_MAX);
}
