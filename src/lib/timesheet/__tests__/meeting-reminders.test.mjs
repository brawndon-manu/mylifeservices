// A DRAFT MEETING NEVER EMAILS ANYBODY.
//
// READ THIS IF THIS TEST JUST FAILED. The meeting cron reads every announcement
// tagged "Company Meeting" and sends four different kinds of mail off it:
// session reminders, the author's Zoom-link nudge, the response-due notice and
// the attestation. Until 2026-09-09 its query asked only that the announcement
// had not been deleted, so an UNPUBLISHED copy sent all of that exactly like a
// live one.
//
// What that cost, on 2026-09-09: three records titled "September zoom trainings"
// existed, created seven seconds apart on 2026-08-21 by what looks like a submit
// that fired three times. Two were never published. All three carried the same
// Thursday session with the night-before reminder switched on, so one cron run
// walked all three and sent one email each at 8:00pm. The two drafts had nobody
// signed up, so their only recipients were the handful of people the job always
// reminds - who got three copies of the same reminder, two of them missing the
// Zoom link because only the published record's session had one.
//
// The filter belongs on the QUERY rather than on each sender, because none of
// the four jobs should touch a draft: nobody has been invited to it.
//
// Source-read rather than executed: this is a route handler that sends real mail
// on a schedule, and the failure being guarded against is a condition going
// missing, which no happy-path run can catch.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const SRC = fs.readFileSync(
  new URL("../../../app/api/cron/meeting-jobs/route.js", import.meta.url),
  "utf8",
);

// the one query the whole file works from
const QUERY = SRC.slice(
  SRC.indexOf("const meetings = await prisma.announcement.findMany"),
  SRC.indexOf("select:", SRC.indexOf("const meetings = await prisma.announcement.findMany")),
);

test("the meeting cron only ever looks at published announcements", () => {
  assert.ok(QUERY.length > 40, "the meetings query was not found in the cron route");
  assert.match(
    QUERY, /publishedAt:\s*\{\s*not:\s*null\s*\}/,
    "the meetings query must require publishedAt. Without it every draft copy of a "
    + "meeting sends its own reminders, its own author nudge and its own attestation, "
    + "to real people, on the same schedule as the real thing.",
  );
});

test("and it still ignores deleted ones", () => {
  assert.match(
    QUERY, /deletedAt:\s*null/,
    "the meetings query must still exclude deleted announcements. Soft-deleting a "
    + "meeting is how a duplicate is stopped without destroying it, and it only works "
    + "while this condition is here.",
  );
});

test("the always-reminded list is still a small named list", () => {
  // It is the reason a draft with zero sign-ups still emailed six people, so it
  // is worth knowing if it ever grows into something broad.
  const list = SRC.slice(SRC.indexOf("const ALWAYS_REMINDED"), SRC.indexOf("]", SRC.indexOf("const ALWAYS_REMINDED")));
  assert.ok(list.length > 0, "ALWAYS_REMINDED was not found");
  const names = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(
    names.length > 0 && names.length <= 12,
    `ALWAYS_REMINDED holds ${names.length} people. These are reminded for every session `
    + "whether or not they signed up, so a long list here means a lot of mail nobody asked "
    + "for. If it needs to be broad, it should be a role or a group rather than names.",
  );
});
