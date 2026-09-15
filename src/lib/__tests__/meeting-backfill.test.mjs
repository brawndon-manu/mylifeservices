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

test("the record editor never writes a field the form did not post", () => {
  // THIS ONE ACTUALLY HAPPENED. A meeting with several dates renders a topics
  // box per SERIES and no meeting-level box at all, so formData.get returned
  // null, asTopics turned that into [], and saving an unrelated change - four
  // uploaded PDFs - wrote [] over the meeting's own list. Every session without
  // topics of its own falls back to that list, so they would have printed
  // nothing. It survived only because the per-series boxes had been pre-filled
  // with the fallback and wrote it back.
  // scoped to the UPDATE, because creating a record legitimately writes the
  // field - the whole point there is that the form carries it
  const whole = read("src/app/portal/admin/meeting-attendance/past-meeting-actions.js");
  const src = whole.slice(whole.indexOf("export async function updateMeetingRecord"));

  assert.match(src, /const rawTopics = formData\.get\("meetingTopics"\);/,
    "the raw value has to be kept, because null and empty mean different things");
  assert.match(src, /\.\.\.\(rawTopics === null \? \{\} : \{ meetingTopics: asTopics\(rawTopics\) \}\)/,
    "a field the form did not post must not be written at all");
  assert.ok(
    !/meetingTopics: topics,/.test(src),
    "writing it unconditionally is the bug this pins",
  );

  // and the same rule already holds one level down, for a session
  assert.match(src, /const raw = formData\.get\(`topics:\$\{k\}`\);/,
    "a session reads its own key");
  assert.match(src, /if \(raw !== null\) \{/,
    "a session the form did not post is left exactly as it was");

  // DOCUMENTS NEEDED A DIFFERENT TEST FOR THE SAME RULE, and that is the part
  // worth pinning. A textarea that is not on the page posts nothing, so absence
  // means "not posted". A file input posts even when empty, so absence proves
  // nothing - and a series whose block was never drawn would have had its
  // documents wiped by exactly the bug above wearing a different hat. So the
  // form names each series it drew a block for, and the action believes that
  // rather than the presence of a field.
  assert.match(src, /formData\.getAll\("docsFor"\)/,
    "the form has to say which series it drew a documents block for");
  const guard = src.indexOf("if (drewDocsFor.has(k))");
  const write = src.indexOf("attachments: docsBySeries.get(k)");
  assert.ok(guard > 0, "the guard has to exist");
  assert.ok(write > guard, "and the write has to sit behind it, not before it");
});

// ---------------------------------------------------------------------------
// DOCUMENTS BELONG TO A SERIES.
//
// The September zoom trainings carry three ILS service note files that belong
// to week one and to neither week after it, and one list on the meeting cannot
// say that. Same shape as topics: a series names its own, and one that names
// none falls back to the meeting's - which is what lets the five meetings that
// already carry documents keep printing exactly what they printed before.
test("a series reads its own documents, and falls back to the meeting's", async () => {
  const { attachmentsForSession, hasSessionAttachments } = await import("../announcements.js");
  const week1 = { id: "a", seriesId: "w1", attachments: [{ name: "ILS Quick Reference", url: "https://blob.example/u1.pdf" }] };
  const week2 = { id: "b", seriesId: "w2" };
  const meeting = {
    attachments: [{ name: "SIR Policy", url: "https://blob.example/u0.pdf" }],
    meetingOptions: [week1, week2],
  };
  assert.deepEqual(attachmentsForSession(meeting, week1).map((a) => a.name), ["ILS Quick Reference"]);
  assert.deepEqual(attachmentsForSession(meeting, week2).map((a) => a.name), ["SIR Policy"],
    "a series with none of its own prints the meeting's");
  assert.equal(hasSessionAttachments(meeting), true);
  assert.equal(hasSessionAttachments({ meetingOptions: [week2] }), false);
  // an empty list is not the same as none: it still falls back rather than
  // printing nothing, because removing the last document means this series
  // carries none of its own
  assert.deepEqual(
    attachmentsForSession(meeting, { id: "c", attachments: [] }).map((a) => a.name),
    ["SIR Policy"],
  );
});

test("the report loads every series' documents once, not once per series", async () => {
  const { loadMeetingMaterials } = await import("../meeting-materials.js");
  // two series naming the SAME file, plus one of their own each
  const shared = { name: "Shared deck", url: "https://blob.example/same.pdf" };
  const post = {
    attachments: [{ name: "Meeting-wide", url: "https://blob.example/m.pdf" }],
    meetingOptions: [
      { id: "a", seriesId: "w1", attachments: [shared, { name: "Week one only", url: "https://blob.example/w1.pdf" }] },
      { id: "b", seriesId: "w2", attachments: [shared] },
    ],
  };
  const loaded = await loadMeetingMaterials(post, { withBytes: false });
  assert.deepEqual(loaded.map((x) => x.name),
    ["Meeting-wide", "Shared deck", "Week one only"],
    "the union, deduped by url, meeting first");
  assert.ok(loaded.every((x) => x.url), "each carries its url so a section can find its own");

  // AND THE BOUNDARY HOLDS ON A SERIES TOO. cleanAttachment is what refuses a
  // url pointing off-site, and a series' documents render exactly where the
  // meeting's do - so a bare or off-site one is dropped rather than printed.
  const { attachmentsForSession } = await import("../announcements.js");
  assert.deepEqual(
    attachmentsForSession({ attachments: [] }, { attachments: [
      { name: "Off site", url: "https://evil.example/x.pdf" },
      { name: "Protocol relative", url: "//evil.example/x.pdf" },
      { name: "Bare", url: "nope" },
    ] }).map((a) => a.name),
    ["Off site"],
    "https is allowed, protocol-relative and bare are not - same rule as the meeting's",
  );
});
