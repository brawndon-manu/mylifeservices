// MEETINGS BROUGHT IN AFTER THEY HAPPENED. The ones that ran on paper or in a
// Google Doc before the portal held meetings, entered so their attendance has
// somewhere to live - attendance only ever exists against an announcement.
//
// Two of these pins are about email. A backfilled meeting is published, because
// the attendance report only reads published meetings, and being published is
// what would otherwise hand it to the meeting-jobs cron. Three of that cron's
// four jobs are bounded and would fall through on a past date on their own; the
// response-due second notice is NOT bounded, so a past deadline with no notice
// stamp emails the whole audience on the next pass. Two separate things stop
// that - the cron skips backfills, and the parser refuses to store a deadline
// on one - and both are held here.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { canSeeAnnouncement, recordNoteOf, ackAudienceWhere } from "../announcements.js";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

const staff = { id: "u1", role: "STAFF", title: "Independent Living Instructor" };
const manager = { id: "u2", role: "MANAGER", title: "Program Manager" };

const backfilled = {
  authorId: "u1",
  tag: "Company Meeting",
  meetingBackfilled: true,
  ackEveryone: true,
};

test("a backfilled meeting is invisible to staff, even on an Everyone audience", () => {
  // the same post without the flag IS visible - an Everyone meeting is public
  assert.equal(canSeeAnnouncement({ ...backfilled, meetingBackfilled: false }, staff), true);
  assert.equal(canSeeAnnouncement(backfilled, staff), false);
});

test("being named its author does not get you in", () => {
  // it is a record somebody typed up, not something the author wrote to be read
  assert.equal(canSeeAnnouncement(backfilled, { ...staff, id: "u1" }), false);
});

test("the oversight tier still sees it, since that is who it is for", () => {
  assert.equal(canSeeAnnouncement(backfilled, manager), true);
});

test("the record note says where the attendance was kept", () => {
  assert.equal(recordNoteOf({ meetingBackfilled: true, meetingRecordSource: "Google Doc" }),
    "Recorded from Google Doc");
  assert.equal(recordNoteOf({ meetingBackfilled: true }), "Recorded afterwards");
  // an ordinary meeting says nothing, because there is nothing to say
  assert.equal(recordNoteOf({ meetingBackfilled: false, meetingRecordSource: "x" }), null);
  assert.equal(recordNoteOf(null), null);
});

test("the feed query excludes backfilled meetings", () => {
  const feed = read("src/app/portal/announcements/page.js");
  assert.match(
    feed,
    // [^;] not [^}], because the clause itself contains `{ not: null }`
    /const where = \{[^;]*meetingBackfilled: false/,
    "the announcements feed must filter backfilled meetings out in the query",
  );
});

test("the meeting-jobs cron never walks a backfilled meeting", () => {
  // THE ONE THAT SENDS MAIL IF IT REGRESSES. Without this the response-due
  // notice fires on a deadline that passed months ago, to everybody who never
  // responded - which on a meeting nobody was invited to is all of them.
  const cron = read("src/app/api/cron/meeting-jobs/route.js");
  const where = cron.match(/const meetings = await prisma\.announcement\.findMany\(\{\s*where: \{([\s\S]*?)\n {4}\},/);
  assert.ok(where, "could not find the cron's meeting query");
  assert.match(where[1], /meetingBackfilled: false/);
});

test("the response-due notice is still the unbounded job it was", () => {
  // the pin above only matters while this is true. If the notice ever grows an
  // upper bound, this fails and the comment explaining all of it can go.
  const cron = read("src/app/api/cron/meeting-jobs/route.js");
  assert.match(
    cron,
    /if \(m\.meetingResponseDueAt && !m\.meetingResponseNoticeSentAt && now >= new Date\(m\.meetingResponseDueAt\)\)/,
  );
});

test("an empty ackUserIds means EVERYONE, which is why a record refuses to save with nobody on it", () => {
  // THE REASON createPastMeeting REFUSES AN EMPTY ROSTER. Saving a record with
  // nobody marked would not produce an empty roster - ackAudienceWhere falls
  // through to the everyone branch when both lists are empty, so the meeting
  // would claim all active staff as its audience. On a meeting that ran on
  // paper nobody knows who was invited, and inventing 98 invitees is the one
  // thing this feature exists not to do.
  const empty = ackAudienceWhere({ ackEveryone: false, ackTitles: [], ackUserIds: [] });
  assert.ok(empty.NOT, "an empty audience falls through to everyone-but-exempt");
  assert.equal(empty.OR, undefined);

  // with people on it, it targets exactly them
  const named = ackAudienceWhere({ ackEveryone: false, ackTitles: [], ackUserIds: ["a", "b"] });
  assert.ok(Array.isArray(named.OR), "a named audience targets its ids");
  assert.deepEqual(named.OR, [{ id: { in: ["a", "b"] } }]);
  assert.equal(named.NOT, undefined);
});

test("a recorded series puts its marks on the choice rows, a single date on the response", () => {
  // THE COUPLING THAT FAILS SILENTLY. buildRoster counts a multi-session
  // meeting's attendance off `choice.attended` and a single-session one's off
  // `response.attended`. Write it in the other place and the record saves
  // cleanly, the roster renders, and every count reads zero.
  //
  // Proved end to end against the real database, inside a transaction that was
  // rolled back: 2 series of 2 and 1 sessions, 4 present and 1 absent, every
  // mark on its own session, 0 rows left behind. Re-run it with
  // docs/week12/scratch/series-roundtrip.mjs. This pin is the cheap guard on
  // the same thing.
  const src = read("src/app/portal/admin/meeting-attendance/past-meeting-actions.js");

  const resp = src.match(/announcementMeetingResponse\.createMany\(\{[\s\S]*?\}\);/);
  assert.ok(resp, "the action must write response rows");
  assert.match(resp[0], /attended: single \?/, "the response only carries the mark on a single-date record");

  const choice = src.match(/if \(!single\) \{[\s\S]*?announcementMeetingChoice\.createMany\(\{[\s\S]*?\}\);/);
  assert.ok(choice, "a series record must write choice rows, and only when it is not single");
  assert.match(choice[0], /attended: m\.status/, "the choice row is where a session's mark lives");

  // and a lone date is never stored as a one-session series
  assert.match(src, /meetingAt: single \? new Date\(options\[0\]\.at\) : null/);
  assert.match(src, /meetingOptions: single \? null : options/);
});

test("session ids are minted on the server, never taken off the form", () => {
  // the client's ids only key the attendance map it posts; one reaching a
  // stored option would put a typed value inside the record itself
  const src = read("src/app/portal/admin/meeting-attendance/past-meeting-actions.js");
  const build = src.match(/function buildOptions\([\s\S]*?\n\}/);
  assert.ok(build);
  assert.match(build[0], /id: randomUUID\(\)/);
  assert.match(build[0], /seriesId = label \? randomUUID\(\) : null/,
    "an unnamed group stays seriesId null, or a plain two-date meeting renders as a nameless series");
});
