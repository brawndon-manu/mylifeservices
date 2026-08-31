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

// how many names to keep in the ticker. enough that it reads as moving, few
// enough that the payload stays small on a poll every second.
export const RECENT_MAX = 4;

export function pushRecent(recent, entry) {
  return [entry, ...(recent || [])].slice(0, RECENT_MAX);
}
