// THE SCHEDULE LOCK: what counts as a change on a locked day, and what an
// approval does to the lock. Made-up people and clients throughout.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  personKey, firstLast, daysFrom, fileNameRange, scheduleNameMonth, comparedDays,
  bookingsOf, scheduleNotesOf, serviceNotesOf, clockOf, tripsOf,
  diffBookings, diffNotes, diffClock, diffTrips, punchesByDay, clockTags,
  applyApproved, changeKey, KIND_LABELS, KIND_TABS, tabOf,
} from "../schedule-lock.js";
import { readMileageSheet } from "../mileage-detail.js";
import { SCHEDULE_LOCK_SLOTS, slotForFilename, knownExport } from "../upload-slots.js";

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

// a roster the way readSchedulePages hands one back
const person = (employee, days) => ({
  employee, month: 8, year: 2026,
  days: Object.entries(days).map(([date, entries]) => ({
    date,
    entries: entries.map((text) => {
      const m = /\((\d+):(\d\d)\)/.exec(text);
      return { text, minutes: m ? Number(m[1]) * 60 + Number(m[2]) : 0, meal: /meal break/i.test(text) };
    }),
  })),
});
const DAYS = daysFrom("09/01/26", "09/15/26");
const who = (people) => new Set(people.map((p) => personKey(p.employee)));
const diff = (lock, now, days = DAYS) =>
  diffBookings(bookingsOf(lock, days), bookingsOf(now, days), { lockPeople: who(lock), nowPeople: who(now) });

test("QSP's file names say which days an export covers", () => {
  assert.deepEqual(fileNameRange("09-01-2026-09-24-2026 Employee Schedule Notes.xls"), { from: "09/01/26", to: "09/24/26" });
  assert.deepEqual(fileNameRange("9-16-2026-9-24-2026 Employee Detailed Daily Service Notes.pdf"), { from: "09/16/26", to: "09/24/26" });
  assert.deepEqual(fileNameRange("8-1-2026 - 8-15-2026 DSN Employee Outcome Tracking.xls"), { from: "08/01/26", to: "08/15/26" });
  assert.deepEqual(fileNameRange("09_16_26-09_24_26 Simple Timesheet.pdf"), { from: "09/16/26", to: "09/24/26" });
  assert.deepEqual(fileNameRange("09-01-2026-09-24-2026 QSClock Time and Attendance Report(2).xls"), { from: "09/01/26", to: "09/24/26" });
  assert.equal(fileNameRange("Employee Schedules September 2026-12.pdf"), null);
  assert.equal(scheduleNameMonth("Employee Schedules September 2026-12.pdf"), "2026-09");
  assert.equal(scheduleNameMonth("Employee Schedules December 2026.pdf"), "2026-12");
  assert.equal(scheduleNameMonth("09_16_26-09_24_26 Simple Timesheet.pdf"), null);
});

test("an export is compared only on the locked days both copies of it cover", () => {
  assert.equal(daysFrom("09/28/26", "10/02/26").join(","), "09/28/26,09/29/26,09/30/26,10/01/26,10/02/26");
  const lock = daysFrom("09/01/26", "09/24/26");
  assert.deepEqual(comparedDays(lock, { from: "09/01/26", to: "09/24/26" }, { from: "09/16/26", to: "09/30/26" }), daysFrom("09/16/26", "09/24/26"));
  assert.deepEqual(comparedDays(lock, null, { from: "09/01/26", to: "09/30/26" }), []);
});

test("every export's spelling of a person is one person", () => {
  assert.equal(personKey("Rivera, Jordan"), personKey("Jordan  Rivera"));
  assert.equal(personKey("Delgado Soto, Ana"), personKey("Ana Delgado Soto"));
  assert.equal(firstLast("Rivera, Jordan"), "Jordan Rivera");
  assert.equal(firstLast("Jordan Rivera"), "Jordan Rivera");
});

test("nothing moved is nothing to flag, whatever the spacing", () => {
  const lock = [person("Jordan Rivera", { "09/10/26": ["9a-12p Doe, J-ILS Service(3:00)"] })];
  const now = [person("Jordan Rivera", { "09/10/26": ["9a-12p  Doe, J-ILS Service (3:00)"] })];
  assert.deepEqual(diff(lock, now), []);
});

test("the booking put back from the clocked times to the booked ones is a times change, away from the clock", () => {
  const lock = [person("Jordan Rivera", { "09/10/26": ["9:30a-11:50a Doe, J-ILS Service(2:20)"] })];
  const now = [person("Jordan Rivera", { "09/10/26": ["9a-12p Doe, J-ILS Service(3:00)"] })];
  const [c] = diff(lock, now);
  assert.equal(c.kind, "times");
  assert.equal(c.before.minutes, 140);
  assert.equal(c.after.minutes, 180);
  const clock = clockOf([{ name: "Rivera, Jordan", date: "09/10/26", client: "Doe, Jane", service: "ILS Service", schedFrom: 540, schedTo: 720, actualFrom: 570, actualTo: 710 }], DAYS);
  const tags = clockTags(c, punchesByDay(clock));
  assert.equal(tags.matchesClock, false);
  assert.equal(tags.awayFromClock, true);
  assert.deepEqual(tags.hits, [{ at: 570, kind: "in" }, { at: 710, kind: "out" }], "the punches it left");
  // the other way, onto the punch, is the clock writing itself back
  const [back] = diff(now, lock);
  const onto = clockTags(back, punchesByDay(clock));
  assert.equal(onto.matchesClock, true);
  assert.equal(onto.awayFromClock, false);
});

test("the punches a change is said to match are the ones it landed on, not some other shift's", () => {
  // travel added exactly between two clocked shifts
  const lock = [person("Jordan Rivera", { "09/10/26": ["9:30a-1p Doe, J-ILS Service(3:30)", "1:30p-3p Roe, R-ILS Service(1:30)"] })];
  const now = [person("Jordan Rivera", { "09/10/26": ["9:30a-1p Doe, J-ILS Service(3:30)", "1p-1:30p -ILS Travel(0:30)", "1:30p-3p Roe, R-ILS Service(1:30)"] })];
  const [c] = diff(lock, now);
  assert.equal(c.kind, "added");
  const clock = clockOf([
    { name: "Rivera, Jordan", date: "09/10/26", client: "Doe, Jane", service: "ILS Service", schedFrom: 570, schedTo: 780, actualFrom: 570, actualTo: 780 },
    { name: "Rivera, Jordan", date: "09/10/26", client: "Roe, Rita", service: "ILS Service", schedFrom: 810, schedTo: 900, actualFrom: 810, actualTo: 900 },
  ], DAYS);
  const tags = clockTags(c, punchesByDay(clock));
  assert.equal(tags.matchesClock, true);
  assert.deepEqual(tags.hits, [{ at: 780, kind: "out" }, { at: 810, kind: "in" }]);
  // a missing punch is never matched
  const unpunched = clockOf([{ name: "Rivera, Jordan", date: "09/10/26", client: "Doe, Jane", service: "ILS Service", schedFrom: 570, schedTo: 780, actualFrom: 570, actualTo: 780, noOut: true }], DAYS);
  assert.equal(clockTags(c, punchesByDay(unpunched)).matchesClock, false);
});

test("a booking's client, service, day or employee changing is named for what changed", () => {
  const lock = [
    person("Jordan Rivera", { "09/03/26": ["1p-3p Doe, J-ILS Service(2:00)", "4p-5p Roe, R-ILS Service(1:00)"], "09/04/26": ["9a-11a Poe, P-ILS Service(2:00)"] }),
    person("Casey Morgan", { "09/05/26": ["2p-4p Loe, L-ILS Service(2:00)"] }),
    person("Sam Lee", { "09/08/26": ["9a-10a -ILS Admin(1:00)"] }),
  ];
  const now = [
    person("Jordan Rivera", { "09/03/26": ["1p-3p Moe, M-ILS Service(2:00)", "4p-5p Roe, R-ILS Misc(1:00)"], "09/06/26": ["9a-11a Poe, P-ILS Service(2:00)"] }),
    person("Casey Morgan", {}),
    person("Sam Lee", { "09/05/26": ["2p-3p Loe, L-ILS Service(1:00)"], "09/08/26": ["9a-10a -ILS Admin(1:00)"] }),
  ];
  const kinds = diff(lock, now).map((c) => c.kind).sort();
  assert.deepEqual(kinds, ["client", "moved", "reassigned", "service"]);
  const r = diff(lock, now).find((c) => c.kind === "reassigned");
  assert.equal(r.before.employee, "Casey Morgan");
  assert.equal(r.after.employee, "Sam Lee");
  // handed to somebody with no calendar in the lock, it reads as that new
  // calendar and the removal, both flagged
  const newcomer = [lock[0], person("Casey Morgan", {}), person("Pat Kim", { "09/05/26": ["2p-3p Loe, L-ILS Service(1:00)"] })];
  assert.deepEqual(diff(lock.slice(0, 2), newcomer).map((c) => c.kind).sort(), ["calendar-new", "removed"]);
});

test("added and removed bookings, and a whole calendar leaving, are flagged", () => {
  const lock = [
    person("Jordan Rivera", { "09/03/26": ["1p-3p Doe, J-ILS Service(2:00)"] }),
    person("Casey Morgan", { "09/05/26": ["2p-4p Loe, L-ILS Service(2:00)", "4p-4:30p -ILS Travel(0:30)"] }),
  ];
  const now = [
    person("Jordan Rivera", { "09/03/26": ["5p-6p -ILS Admin(1:00)"] }),
  ];
  const changes = diff(lock, now);
  const byKind = Object.fromEntries(changes.map((c) => [c.kind, c]));
  assert.ok(byKind.removed && byKind.added);
  assert.equal(byKind["calendar-missing"].before.items.length, 2, "one change for the whole calendar, not two");
  assert.equal(changes.length, 3);
  // a calendar that was never locked arrives as one change too
  const arrived = diff(now, [...now, person("Sam Lee", { "09/07/26": ["9a-10a -ILS Admin(1:00)"] })]);
  assert.deepEqual(arrived.map((c) => c.kind), ["calendar-new"]);
});

test("days outside the lock are never compared", () => {
  const lock = [person("Jordan Rivera", { "09/10/26": ["9a-12p Doe, J-ILS Service(3:00)"], "09/20/26": ["9a-12p Doe, J-ILS Service(3:00)"] })];
  const now = [person("Jordan Rivera", { "09/10/26": ["9a-12p Doe, J-ILS Service(3:00)"], "09/20/26": ["9a-10a Doe, J-ILS Service(1:00)"] })];
  assert.deepEqual(diff(lock, now), []);
});

test("an approved change becomes the lock; an unauthorized one stays a difference", () => {
  const lock = [person("Jordan Rivera", { "09/10/26": ["9:30a-11:50a Doe, J-ILS Service(2:20)"], "09/11/26": ["1p-2p Roe, R-ILS Service(1:00)"] })];
  const now = [person("Jordan Rivera", { "09/10/26": ["9a-12p Doe, J-ILS Service(3:00)"], "09/11/26": ["1p-3p Roe, R-ILS Service(2:00)"] })];
  const changes = diff(lock, now);
  assert.equal(changes.length, 2);
  const [approve, refuse] = changes.sort((a, b) => a.date.localeCompare(b.date));
  const ref = applyApproved(bookingsOf(lock, DAYS), [approve], "roster");
  const again = diffBookings(ref, bookingsOf(now, DAYS), { lockPeople: who(lock), nowPeople: who(now) });
  assert.equal(again.length, 1);
  assert.equal(changeKey(again[0]), changeKey(refuse), "the same difference finds the same row");
  // approving everything leaves nothing
  const all = applyApproved(bookingsOf(lock, DAYS), changes, "roster");
  assert.deepEqual(diffBookings(all, bookingsOf(now, DAYS), { lockPeople: who(lock), nowPeople: who(now) }), []);
  // and the key says what changed, from what, to what
  assert.notEqual(changeKey(approve), changeKey(refuse));
});

test("the notes exports: added, changed, removed, a person gone from the export, a DSN's mileage answer", () => {
  const sn = (employee, date, client, text) => ({ employee, date, client, service: "ILS Service", start: 540, end: 720, text });
  const lock = scheduleNotesOf([sn("Rivera, Jordan", "09/10/26", "Doe, Jane", "Client ended early"), sn("Rivera, Jordan", "09/11/26", "Doe, Jane", "Traffic"), sn("Morgan, Casey", "09/12/26", "Loe, Lee", "Forgot to clock in")], DAYS);
  const now = scheduleNotesOf([sn("Rivera, Jordan", "09/10/26", "Doe, Jane", "Client asked to stay the full time"), sn("Rivera, Jordan", "09/13/26", "Doe, Jane", "Arrived early")], DAYS);
  const changes = diffNotes("scheduleNotes", lock, now, { nowPeople: new Set(["jordan rivera"]) });
  assert.deepEqual(changes.map((c) => c.kind).sort(), ["missing", "note-added", "note-edited", "note-removed"]);
  const dsn = (miles, words) => ({ employee: "Jordan Rivera", date: "09/10/26", client: "Jane Doe", start: "9:00 AM", end: "12:00 PM", summary: words, comments: [], miles });
  const d = diffNotes("dsn", serviceNotesOf([dsn(false, "Went to the store")], DAYS, "dsn"), serviceNotesOf([dsn(true, "Went to the store")], DAYS, "dsn"));
  assert.deepEqual(d.map((c) => c.kind), ["dsn-claim"]);
  const e = diffNotes("serviceNotes", serviceNotesOf([dsn(null, "Budgeting")], DAYS, "xls"), serviceNotesOf([dsn(null, "Budgeting and cooking")], DAYS, "xls"));
  assert.deepEqual(e.map((c) => c.kind), ["service-note-edited"]);
  // the same words reprinted at the booking's new times are the same note
  const at = (start) => ({ ...dsn(false, "Went to the store"), start, end: "12:00 PM" });
  assert.deepEqual(diffNotes("dsn", serviceNotesOf([at("9:00 AM")], DAYS, "dsn"), serviceNotesOf([at("9:30 AM")], DAYS, "dsn")), []);
  assert.deepEqual(diffNotes("scheduleNotes", scheduleNotesOf([{ ...sn("Rivera, Jordan", "09/10/26", "Doe, Jane", "Traffic"), start: 540 }], DAYS), scheduleNotesOf([{ ...sn("Rivera, Jordan", "09/10/26", "Doe, Jane", "Traffic"), start: 600 }], DAYS)), []);
});

test("a DSN reads as its summary and the goals that were answered, a line each", () => {
  const n = { employee: "Jordan Rivera", date: "09/10/26", client: "Jane Doe", start: "9:00 AM", end: "12:00 PM", summary: "Went to the bank.", miles: false,
    sections: [{ goal: "Money Management", comment: "Opened an account." }, { goal: "Cooking", comment: null }, { goal: "Self Advocacy", comment: "Asked for help." }] };
  const [item] = serviceNotesOf([n], DAYS, "dsn");
  assert.equal(item.text, "Went to the bank.\nMoney Management: Opened an account.\nSelf Advocacy: Asked for help.");
  // the same words laid out differently are the same DSN
  const [flatItem] = serviceNotesOf([{ ...n, summary: "Went to  the bank." }], DAYS, "dsn");
  assert.equal(flatItem.id, item.id);
});

test("the clock: a moved punch is flagged, a row that follows the schedule is not", () => {
  const row = (actualTo, schedFrom = 540) => ({ name: "Rivera, Jordan", date: "09/10/26", client: "Doe, Jane", service: "ILS Service", schedFrom, schedTo: 720, actualFrom: 570, actualTo });
  assert.deepEqual(diffClock(clockOf([row(710)], DAYS), clockOf([row(710)], DAYS)), []);
  const moved = diffClock(clockOf([row(710)], DAYS), clockOf([row(720)], DAYS));
  assert.deepEqual(moved.map((c) => c.kind), ["clock-changed"]);
  assert.deepEqual(diffClock(clockOf([row(710)], DAYS), []), [], "a row leaving is the schedule's change, not the clock's");
});

test("miles: a trip re-measured or re-sourced, added or removed", () => {
  const t = (miles, source = "Auto", to = "Library") => ({ employee: "Rivera, Jordan", date: "09/10/26", client: "Doe, Jane", from: "Home", to, miles, source });
  assert.deepEqual(diffTrips(tripsOf([t(2.5)], DAYS), tripsOf([t(2.5)], DAYS)), []);
  assert.deepEqual(diffTrips(tripsOf([t(2.5)], DAYS), tripsOf([t(12.5, "Manual")], DAYS)).map((c) => c.kind), ["miles"]);
  assert.deepEqual(diffTrips(tripsOf([t(2.5)], DAYS), tripsOf([t(2.5), t(4, "Auto", "Park")], DAYS)).map((c) => c.kind), ["trip-added"]);
  assert.deepEqual(diffTrips(tripsOf([t(2.5), t(4, "Auto", "Park")], DAYS), tripsOf([t(2.5)], DAYS)).map((c) => c.kind), ["trip-removed"]);
});

test("the Mileage Detail Report reads per sheet: the person over the table, one trip a row", () => {
  const sheet = [
    [], ["My Life Services", "Mileage Detail Report"], ["9/16/2026 - 9/24/2026"], ["Rivera, Jordan"], [],
    ["Date", "Scheduled Client", "Starting Location", "Destination Locations", "Total Miles", "Source"],
    ["09/16/2026", "Doe, Jane", "1 Main St\nSomewhere, CA", "2 Oak Ave\nElsewhere, CA", 10.72, "Auto"],
    ["09/17/2026", "Doe, Jane", "2 Oak Ave", "1 Main St", "3.5", "Manual"],
    [], ["GRAND TOTAL MILES =", 14.22],
  ];
  const r = readMileageSheet(sheet);
  assert.equal(r.employee, "Rivera, Jordan");
  assert.deepEqual(r.range, { from: "09/16/26", to: "09/24/26" });
  assert.equal(r.trips.length, 2);
  assert.deepEqual(r.trips[0], { employee: "Rivera, Jordan", date: "09/16/26", client: "Doe, Jane", from: "1 Main St Somewhere, CA", to: "2 Oak Ave Elsewhere, CA", miles: 10.72, source: "Auto" });
  assert.equal(r.trips[1].miles, 3.5);
});

test("a whole folder dropped on the page lands in six slots and names the rest", () => {
  const slot = (n) => slotForFilename(n, SCHEDULE_LOCK_SLOTS);
  assert.equal(slot("Employee Schedules September 2026.pdf"), "schedule");
  assert.equal(slot("9-16-2026-9-24-2026 Employee Detailed Daily Service Notes.pdf"), "notes");
  assert.equal(slot("09-16-2026-09-24-2026 Employee Service Notes.xls"), "serviceNotes");
  assert.equal(slot("09-01-2026-09-24-2026 Employee Schedule Notes.xls"), "scheduleNotes");
  assert.equal(slot("09-16-2026-09-24-2026 Mileage Report.xls"), "mileage");
  assert.equal(slot("09-01-2026-09-24-2026 QSClock Time and Attendance Report.xls"), "clock");
  // known, not read here
  for (const n of ["09_16_26-09_24_26 Simple Timesheet.pdf", "09-16-2026-09-24-2026 Employee Mileage Tracking Reports.xls"]) {
    assert.equal(slot(n), null, n);
    assert.equal(knownExport(n), true, n);
  }
  assert.equal(knownExport("holiday photo.jpg"), false);
});

test("every kind has its words, on the card and in a tab", () => {
  const src = read("src/app/portal/admin/schedule-lock/[id]/LockChanges.js");
  for (const [kind, label] of Object.entries(KIND_LABELS)) {
    assert.ok(src.includes(`${/^[a-z]+$/.test(kind) ? kind : JSON.stringify(kind)}: ${JSON.stringify(label)}`), `the card names ${kind} "${label}"`);
  }
  for (const [key, label, kinds] of KIND_TABS) {
    assert.ok(src.includes(`[${JSON.stringify(key)}, ${JSON.stringify(label)}, ${JSON.stringify(kinds).replace(/,/g, ", ")}]`), `tab ${key}`);
    for (const k of kinds) assert.equal(tabOf({ kind: k, source: "roster" }), key);
  }
  assert.equal(tabOf({ kind: "missing", source: "dsn" }), "dsn");
});

test("the card says what the mock said", () => {
  const src = read("src/app/portal/admin/schedule-lock/[id]/LockChanges.js");
  for (const words of ["Not decided", "Unauthorized", "Approved", "Matches the clock", "Not on the schedule", "Approve those ${clockOpen}", "changes match the clock", "their new times are exactly the punch.", "Staff wrote: “", "Change</button>", "Search employee, client or service", "Also listed under"]) {
    assert.ok(src.includes(words), words);
  }
  const up = read("src/app/portal/admin/schedule-lock/new/LockUpload.js");
  for (const words of ["Days to check", "Upload and check", "Left out, not read here:", "Drag the exports onto this form together - each lands in its slot by its filename.", "The schedule is checked on these days. The notes, the miles and the clock are checked only on the days their own exports cover, which QSP puts in their file names."]) {
    assert.ok(up.includes(words), words);
  }
});

test("the dashboard row, the gate on every action, and nothing read from the audit's copies", () => {
  const admin = read("src/app/portal/admin/page.js");
  assert.match(admin, /show: isAdminUp\(role\),\s*href: "\/portal\/admin\/schedule-lock",\s*icon: "calendarCheck",\s*title: "Schedule lock",\s*body: "Every change to a locked schedule\.",/);
  assert.match(read("src/app/portal/admin/AdminTools.js"), /calendarCheck: CalendarCheck/);
  const actions = read("src/app/portal/admin/schedule-lock/actions.js");
  for (const fn of ["uploadScheduleLock", "decideLockChange", "approveClockMatches"]) {
    const body = actions.slice(actions.indexOf(`export async function ${fn}`));
    assert.match(body.slice(0, 400), /await requireLockAccess\(\)/, `${fn} is gated`);
  }
  assert.match(actions, /function requireLockAccess\(\) \{\s*const user = await getCurrentUser\(\);\s*if \(!isAdminUp\(user\?\.role\)\) redirect\("\/portal"\);/);
  const pages = ["page.js", "new/page.js", "[id]/page.js"].map((p) => read(`src/app/portal/admin/schedule-lock/${p}`));
  for (const p of pages) assert.match(p, /if \(!isAdminUp\(user\?\.role\)\) redirect\("\/portal"\)/);
  for (const f of ["actions.js", "compare.js"]) assert.doesNotMatch(read(`src/app/portal/admin/schedule-lock/${f}`), /timesheetBatch/, `${f} reads only its own uploads`);
});
