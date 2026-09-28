// AN ADDENDUM FOR A SHIFT THE CLOCK NEVER RECORDED. the export has no row for
// the booking, so the addendum keeps the booking read as a clock row with
// neither punch: the rules ask both ends off it, the office raises it from
// the card like any other, and once approved it joins back to the booking and
// bills the signed window.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { bookingClockRow, noClockRow, raisable, asksStart, asksEnd, asksPlace, missingPunchText, qspFixNeeded, startingTimes } from "../clock-amendment/rules.js";
import { indexAmendments, amendmentFor, amendmentView, amendedShift } from "../timesheet/amended.js";
import { clientKey } from "../timesheet/note-audit.js";
import { buildWhoKey } from "../timesheet/people.js";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// the audit's row for a booked visit the export has no row for (made-up names)
const row = {
  shiftKey: "k1", employeeKey: "dana reyes", who: "Dana Reyes", whoLegal: "Dana Reyes",
  date: "09/15/26", client: "Morgan Hale", service: "ILS Service",
  schedFrom: 810, schedTo: 930, originalFrom: null, originalTo: null, startMin: 810,
  clockAvailable: true, inClockExport: false, noIn: false, noOut: false, gpsIn: null, gpsOut: null,
};

test("the booking reads as a clock row with neither punch, and says it was not the export's", () => {
  assert.equal(noClockRow(row), true);
  assert.equal(noClockRow({ ...row, clockAvailable: false }), false);
  assert.equal(noClockRow({ ...row, inClockExport: true }), false);
  const c = bookingClockRow(row);
  assert.deepEqual(
    { name: c.name, date: c.date, client: c.client, schedFrom: c.schedFrom, schedTo: c.schedTo, scheduledMin: c.scheduledMin, noIn: c.noIn, noOut: c.noOut, noClockRow: c.noClockRow },
    { name: "Dana Reyes", date: "09/15/26", client: "Morgan Hale", schedFrom: 810, schedTo: 930, scheduledMin: 120, noIn: true, noOut: true, noClockRow: true },
  );
  assert.equal(c.actualFrom, null);
  assert.equal(c.workedMin, null);
  // a booking over midnight
  assert.equal(bookingClockRow({ ...row, schedFrom: 1380, schedTo: 60 }).scheduledMin, 120);
  assert.equal(raisable(row), true);
});

test("the form asks both times and both places, starting from the note then the schedule, and the office fixes both punches", () => {
  const a = { clockRow: bookingClockRow(row), clockedIn: null, clockedOut: null, scheduledIn: "1:30 PM", scheduledOut: "3:30 PM" };
  assert.equal(asksStart(a), true);
  assert.equal(asksEnd(a), true);
  assert.deepEqual(asksPlace(a), { in: true, out: true });
  // the words any shift with neither punch already uses
  assert.equal(missingPunchText(a), "did not clock in or out");
  assert.deepEqual(qspFixNeeded(a), { in: true, out: true });
  assert.deepEqual({ in: startingTimes(a).in, out: startingTimes(a).out }, { in: "1:30 PM", out: "3:30 PM" });
  const noted = { ...a, dsnStart: "1:35 PM", dsnEnd: "3:25 PM" };
  assert.deepEqual({ in: startingTimes(noted).in, out: startingTimes(noted).out }, { in: "1:35 PM", out: "3:25 PM" });
});

test("approved, it joins back to its booking however the roster spells the client, and bills the signed window", () => {
  const whoKey = buildWhoKey([{ name: "Dana Reyes" }]);
  const approved = {
    id: "amd-nr", shiftDate: "09/15/26", clockRow: bookingClockRow(row), approvedAt: "2026-09-28T18:00:00.000Z",
    createdAt: "2026-09-27T18:00:00.000Z", filledAt: "2026-09-27T19:00:00.000Z", filledName: "Dana Reyes",
    reasonText: "The app would not open at the visit.", actualIn: "1:30 PM", actualOut: "3:30 PM",
  };
  const index = indexAmendments([approved], { whoKey, clientKey });
  // the audit's own shift: the person key, the roster's abbreviated client, the booked start
  const shift = { who: "dana reyes", date: "09/15/26", client: "Hale, M", clientFull: null, schedFrom: 810, originalFrom: null, noClockRow: true, workedMin: null, noIn: false, noOut: false };
  assert.equal(amendmentFor(shift, index, { clientKey })?.id, "amd-nr");
  // another booking that day with the same client, at another start, is not it
  const other = indexAmendments([approved, { ...approved, id: "amd-2", clockRow: bookingClockRow({ ...row, schedFrom: 1080, schedTo: 1140 }) }], { whoKey, clientKey });
  assert.equal(amendmentFor(shift, other, { clientKey })?.id, "amd-nr");
  const view = amendmentView(approved);
  assert.deepEqual({ from: view.from, to: view.to, min: view.min, timesChanged: view.timesChanged }, { from: 810, to: 930, min: 120, timesChanged: true });
  const read2 = amendedShift(shift, view);
  assert.equal(read2.noClockRow, false, "the addendum closes the missing-row finding");
  assert.equal(read2.billableMin, 120);
  assert.deepEqual({ noIn: read2.noIn, noOut: read2.noOut }, { noIn: false, noOut: false });
  // a booking with no client at all joins by person, day and start
  const bare = { ...row, client: "" };
  const bareIndex = indexAmendments([{ ...approved, clockRow: bookingClockRow(bare) }], { whoKey, clientKey });
  assert.equal(amendmentFor({ ...shift, client: "" }, bareIndex, { clientKey })?.id, "amd-nr");
});

test("the card's raise falls back to the copy's own booking when the export has no row, and the panel reads it the same way", () => {
  const actions = read("src/app/portal/admin/audit/actions.js");
  assert.match(actions, /import \{ buildAudit \} from "\.\/\[id\]\/build";/);
  assert.match(actions, /let shift = clockShiftFor\(clockShifts\(xls\), identity, \{ whoKey: who, clientKey \}\);\s*if \(shift && !hasIssue\(shift\)\) return \{ ok: false, error: "clean" \};/);
  assert.match(actions, /try \{ rows = \(await buildAudit\(batchId, \{ planned: false \}\)\)\?\.rows \|\| \[\]; \}/);
  // only a booking the audit itself shows as missing from the export
  assert.match(actions, /noClockRow\(x\)\s*&& x\.employeeKey === identity\.employeeKey\s*&& x\.date === identity\.date\s*&& clientKey\(x\.client \|\| ""\) === clientKey\(identity\.client \|\| ""\)/);
  assert.match(actions, /if \(!booking\) return \{ ok: false, error: "norow" \};\s*shift = bookingClockRow\(booking\);/);
  const panel = read("src/app/portal/admin/audit/[id]/RaiseAmendment.js");
  assert.match(panel, /const row = noClockRow\(r\) \? \{ \.\.\.r, \.\.\.bookingClockRow\(r\) \} : r;/);
  assert.match(panel, /clockRow: row,/);
});
