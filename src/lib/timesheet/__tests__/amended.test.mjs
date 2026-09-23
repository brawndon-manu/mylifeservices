// AN APPROVED CLOCK AMENDMENT ON THE AUDIT: the window it stands for, the
// shift it belongs to, and the shift the findings read once it stands. the
// fixtures are the shapes the live rows hold - a late clock-in amended to an
// earlier start, a missing clock-out supplied, a location attested with the
// punches standing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { amendedWindow, amendmentView, amendmentKey, indexAmendments, amendmentFor, amendedShift, pendingView, clockShiftFor } from "../amended.js";
import { clientKey } from "../note-audit.js";

const whoKey = (n) => String(n || "").trim().toLowerCase();
const keys = { whoKey, clientKey };

// the clock row as the amendment kept it: the export's own reading
const clockRow = (over = {}) => ({
  name: "Espinoza, Brandon", key: "espinoza, brandon", date: "09/22/26", client: "Prescott, Mason",
  service: "ILS Service", schedFrom: 840, schedTo: 990, actualFrom: 880, actualTo: 963, workedMin: 83,
  noIn: false, noOut: false, gpsIn: "yes", gpsOut: "yes", startDelta: 40,
  ...over,
});

// a late clock-in, amended to a start before the booking, signed and approved
const lateIn = {
  id: "amd1", shiftDate: "09/22/26", clientName: "Mason Prescott",
  clockRow: clockRow(),
  clockedIn: "2:40 PM", clockedOut: "4:03 PM",
  intakeActualIn: "1:45 PM", intakeActualOut: null,
  filledAt: "2026-09-22T23:08:55.127Z", filledName: "Brandon Espinoza",
  actualIn: "1:45 PM", actualOut: null,
  approvedAt: "2026-09-22T23:23:20.309Z", qspFixedIn: "1:45 PM", qspFixedTo: null,
};

test("a late clock-in amended earlier: the start moves, the clock-out stands, the window is the signed one", () => {
  const w = amendedWindow(lateIn);
  assert.equal(w.from, 13 * 60 + 45);
  assert.equal(w.to, 963);
  assert.equal(w.min, 963 - 825);
  assert.equal(w.inChanged, true);
  assert.equal(w.outChanged, false);
  assert.equal(w.timesChanged, true);
  assert.equal(w.wasFrom, 880);
  assert.equal(w.wasMin, 83);
});

test("a missing clock-out supplied by the signature fills the end and only the end", () => {
  const a = {
    ...lateIn,
    clockRow: clockRow({ actualFrom: 990, actualTo: null, noOut: true, startDelta: 0, workedMin: null }),
    clockedIn: "4:30 PM", clockedOut: null,
    intakeActualIn: null, intakeActualOut: "6:30 PM", actualIn: null, actualOut: "6:30 PM",
  };
  const w = amendedWindow(a);
  assert.deepEqual([w.from, w.to, w.min, w.inChanged, w.outChanged], [990, 1110, 120, false, true]);
});

test("a location attested with the punches standing moves no time", () => {
  const a = {
    ...lateIn,
    clockRow: clockRow({ actualFrom: 840, startDelta: 0, gpsOut: "no", workedMin: 123 }),
    clockedIn: "2:00 PM",
    intakeActualIn: null, intakeActualOut: "4:03 PM", actualIn: null, actualOut: "4:03 PM",
    intakePlaceOut: "the client's home", placeOut: "the client's home",
  };
  const w = amendedWindow(a);
  assert.equal(w.timesChanged, false);
  assert.equal(w.min, 123);
  const v = amendmentView(a, { by: "Mánu Uribe", byLegal: "Brandon Uribe" });
  assert.equal(v.placeOut, "the client's home");
  assert.equal(v.by, "Mánu Uribe");
  assert.equal(v.form, "/portal/admin/clock-amendments/amd1");
});

test("before the signature the intake stands in, and a signed correction replaces it", () => {
  const unsigned = { ...lateIn, filledAt: null, actualIn: null };
  assert.equal(amendedWindow(unsigned).from, 13 * 60 + 45);
  const corrected = { ...lateIn, actualIn: "1:50 PM" };
  assert.equal(amendedWindow(corrected).from, 13 * 60 + 50);
});

test("an amendment finds its shift by person, day, client and the booking's start", () => {
  const index = indexAmendments([lateIn], keys);
  assert.equal(amendmentKey(lateIn, keys), "espinoza, brandon|09/22/26|prescott|m");
  // the audit's shift: the roster's abbreviation on client, the clock's full
  // spelling on clientFull, QSP's original start on originalFrom
  const shift = { who: "espinoza, brandon", date: "09/22/26", client: "Prescott, M", clientFull: "Prescott, Mason", schedFrom: 840, originalFrom: 840 };
  assert.equal(amendmentFor(shift, index, { clientKey })?.id, "amd1");
  // a booking edited since the export keeps its original start
  assert.equal(amendmentFor({ ...shift, schedFrom: 850 }, index, { clientKey })?.id, "amd1");
  // no clock row attached at all: the roster's start still finds it
  assert.equal(amendmentFor({ ...shift, clientFull: null, originalFrom: null }, index, { clientKey })?.id, "amd1");
  // another client, another day, another person: nothing
  assert.equal(amendmentFor({ ...shift, clientFull: "Tsao, Frances", client: "Tsao, F" }, index, { clientKey }), null);
  assert.equal(amendmentFor({ ...shift, date: "09/21/26" }, index, { clientKey }), null);
  assert.equal(amendmentFor({ ...shift, who: "robinson, lauran" }, index, { clientKey }), null);
});

test("two bookings with one client on one day: the one the amendment was rostered for, and never a guess", () => {
  const index = indexAmendments([lateIn], keys);
  const other = { who: "espinoza, brandon", date: "09/22/26", client: "Prescott, M", clientFull: "Prescott, Mason", schedFrom: 600, originalFrom: 600 };
  // one candidate and a different start: still the lone candidate
  assert.equal(amendmentFor(other, index, { clientKey })?.id, "amd1");
  // two amendments on the day, neither at this start: nothing rather than either
  const second = { ...lateIn, id: "amd2", clockRow: clockRow({ schedFrom: 1020 }), approvedAt: "2026-09-23T00:00:00.000Z" };
  const two = indexAmendments([lateIn, second], keys);
  assert.equal(amendmentFor(other, two, { clientKey }), null);
  assert.equal(amendmentFor({ ...other, originalFrom: 1020 }, two, { clientKey })?.id, "amd2");
  // amended twice at one start: the newer approval leads
  const again = { ...lateIn, id: "amd3", approvedAt: "2026-09-24T00:00:00.000Z" };
  assert.equal(indexAmendments([lateIn, again], keys).get(amendmentKey(lateIn, keys))[0].id, "amd3");
});

test("the shift the findings read: signed punches at both ends, counted as clocked, and untouched when no time moved", () => {
  const shift = { actualFrom: 880, actualTo: 963, workedMin: 83, noIn: false, noOut: false, noClockRow: false };
  const view = amendmentView(lateIn);
  const read = amendedShift(shift, view);
  assert.deepEqual([read.actualFrom, read.actualTo, read.workedMin, read.amended], [825, 963, 138, true]);
  // the export's shift is not written to
  assert.equal(shift.actualFrom, 880);
  const missingOut = { actualFrom: 990, actualTo: null, workedMin: null, noIn: false, noOut: true, noClockRow: true };
  const supplied = amendedShift(missingOut, amendmentView({
    ...lateIn,
    clockRow: clockRow({ actualFrom: 990, actualTo: null, noOut: true, startDelta: 0, workedMin: null }),
    intakeActualIn: null, intakeActualOut: "6:30 PM", actualIn: null, actualOut: "6:30 PM",
  }));
  assert.deepEqual([supplied.noOut, supplied.noClockRow, supplied.workedMin], [false, false, 120]);
  const placeOnly = amendmentView({ ...lateIn, clockRow: clockRow({ actualFrom: 840, startDelta: 0, gpsOut: "no" }), actualIn: null, intakeActualIn: null });
  assert.equal(amendedShift(shift, placeOnly), shift);
  assert.equal(amendedShift(shift, null), shift);
});

// ---- raising from the card, and an amendment that is out ----

test("a shift's own row is found in an export by person, day, client and start, never by guessing between two", () => {
  const rows = [
    clockRow(),
    clockRow({ schedFrom: 600, schedTo: 660, actualFrom: 600, actualTo: 660, startDelta: 0 }),
    clockRow({ client: "Tsao, Frances" }),
    clockRow({ date: "09/21/26" }),
  ];
  const base = { employeeKey: "espinoza, brandon", date: "09/22/26", client: "Prescott, M" };
  assert.equal(clockShiftFor(rows, { ...base, startMin: 840, originalFrom: 840 }, keys)?.schedFrom, 840);
  // the roster's start when the export's original is not on the card
  assert.equal(clockShiftFor(rows, { ...base, startMin: 600, originalFrom: null }, keys)?.schedFrom, 600);
  // two bookings with the client and a start matching neither: nothing
  assert.equal(clockShiftFor(rows, { ...base, startMin: 700, originalFrom: null }, keys), null);
  // one booking with the client: the only row there is
  assert.equal(clockShiftFor(rows, { ...base, client: "Tsao, F", startMin: 700, originalFrom: null }, keys)?.client, "Tsao, Frances");
  assert.equal(clockShiftFor(rows, { ...base, date: "09/20/26", startMin: 840 }, keys), null);
  assert.equal(clockShiftFor([], { ...base, startMin: 840 }, keys), null);
});

test("an amendment out and not yet approved reads its stage in the queue's words and moves no figure", () => {
  const sent = { ...lateIn, approvedAt: null, filledAt: null, actualIn: null, sentAt: "2026-09-22T20:00:00.000Z" };
  const v = pendingView(sent, { to: "Brandon Espinoza" });
  assert.deepEqual([v.stage, v.line, v.to, v.form], ["sent", "Waiting on them", "Brandon Espinoza", "/portal/admin/clock-amendments/amd1"]);
  assert.equal(v.sentAt, "2026-09-22T20:00:00.000Z");
  const signed = pendingView({ ...sent, filledAt: "2026-09-22T21:00:00.000Z" });
  assert.equal(signed.line, "Signed, waiting on the person served");
  const ready = pendingView({ ...sent, filledAt: "2026-09-22T21:00:00.000Z", clientSignedAt: "2026-09-22T21:05:00.000Z" });
  assert.equal(ready.line, "Ready to approve");
  assert.equal(pendingView({ ...sent, sentAt: null }).line, "Not sent");
  assert.equal(pendingView(null), null);
  // the pending index is the same join, newest raised first
  const older = { ...sent, id: "old", createdAt: "2026-09-20T00:00:00.000Z" };
  const newer = { ...sent, id: "new", createdAt: "2026-09-22T00:00:00.000Z" };
  const index = indexAmendments([older, newer], keys);
  const shift = { who: "espinoza, brandon", date: "09/22/26", client: "Prescott, M", clientFull: "Prescott, Mason", schedFrom: 840, originalFrom: 840 };
  assert.equal(amendmentFor(shift, index, { clientKey })?.id, "new");
});
