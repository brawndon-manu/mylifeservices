// STRUCTURAL GUARD, in the repo-guards tradition: the day program's mid-period
// upload must run on THE SAME futureDates/trimDays pair the MLS upload runs.
// partial.js says why in its header - the guard that refuses and the trim that
// keeps have to be one comparison, and a second private definition of "future"
// is how a day of real work silently vanishes out of somebody's pay.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

test("the day program trims mid-period uploads with the shared partial pair", () => {
  const analyze = read("src/lib/day-program/analyze.js");
  assert.match(
    analyze,
    /import \{ futureDates, trimDays \} from "\.\.\/timesheet\/partial\.js"/,
    "analyze.js must import the shared pair, not define its own",
  );
  assert.match(analyze, /futureDates\(sheets\)/);
  assert.match(analyze, /trimDays\(sheets/);
});

test("the day program upload records a partial batch the way the MLS one does", () => {
  const actions = read("src/app/portal/admin/day-program/actions.js");
  for (const field of ["partialPeriod", "partialFrom", "partialThrough"]) {
    assert.match(
      actions,
      new RegExp(`\\b${field}:`),
      `${field} must be written to the batch - nothing else says the record is cut short`,
    );
  }
  // the refusal has its own error, not a generic parse failure
  assert.match(actions, /err\("future"/);
});
