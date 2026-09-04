// PAST SESSIONS TAKE NO NEW PICKS + MANAGEMENT RIDES EVERY REMINDER - Mánu
// 2026-09-04. The rule lives once in meeting-slots; these pin it and every
// wall that uses it, plus the standing reminder roster.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { sessionStarted } from "../meeting-slots.js";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

test("a session is started once its instant passes, and only then", () => {
  const now = Date.parse("2026-09-04T12:00:00Z");
  assert.equal(sessionStarted({ at: "2026-09-04T11:59:00Z" }, now), true);
  assert.equal(sessionStarted({ at: "2026-09-04T12:00:00Z" }, now), true);
  assert.equal(sessionStarted({ at: "2026-09-04T12:01:00Z" }, now), false);
  // no date set is not "the past"
  assert.equal(sessionStarted({ at: null }, now), false);
  assert.equal(sessionStarted(null, now), false);
});

test("every pick path refuses or greys the past", () => {
  const actions = read("src/app/portal/announcements/actions.js");
  assert.match(actions, /sessionStarted\(chosen\)/, "chooseMeetingOption refuses a new past pick");
  assert.match(actions, /wanted\.filter\(\(id\) => sessionStarted\(optById\.get\(id\)\)\)/, "setMeetingChoices bounces the submission");
  const resp = read("src/lib/meeting-response.js");
  assert.match(resp, /if \(sessionStarted\(opt\)\) return \{ status: "locked" \}/, "one-click email pick");
  assert.match(resp, /!sessionStarted\(opts\.find\(\(o\) => o\.id === pick\[sid\]\)\)/, "series email pick");
  assert.match(resp, /wantedFlat\.filter\(\(id\) => !sessionStarted/, "flat email picks");
  for (const [f, what] of [
    ["src/app/portal/announcements/_components/MeetingResponse.js", "the portal picker"],
    ["src/app/a/rsvp/[token]/page.js", "the email picker"],
  ]) {
    assert.match(read(f), /sessionStarted\(o/, `${what} greys the past`);
  }
  assert.match(read("src/app/a/rsvp/[token]/RsvpForm.js"), /Already happened/, "the grey row says why");
});

test("upper management rides every session reminder", () => {
  const cron = read("src/app/api/cron/meeting-jobs/route.js");
  for (const n of ["Brandon Uribe", "Gabriel Miranda", "Britny Arevalo", "April Martinez", "David Zermeno", "Kristy Hatt"]) {
    assert.ok(cron.includes(`"${n}"`), `${n} on the standing roster`);
  }
  // merged and deduped, and the empty-pickers early return is gone - the
  // roster gets the reminder even when nobody picked the session
  assert.match(cron, /\[\.\.\.picked, \.\.\.always\]/);
  assert.doesNotMatch(cron, /if \(!ids\.length\) return \[\];/);
});
