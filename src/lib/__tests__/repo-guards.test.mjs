// STRUCTURAL GUARDS. Not unit tests - these read source files and assert things
// about how the code is wired, because the bugs that have actually hurt this repo
// were wiring, not arithmetic. Every one of them below is a real incident:
//
//   1. an email built with attachments and handed to resend.batch.send, which
//      accepts it, reports success, and silently drops every file. Cost a week of
//      announcements going out with no documents, then happened AGAIN in the
//      attestation sender two functions away from the fix.
//   2. the announcement edit page selects meeting fields one by one. A column
//      added to the schema but not to that list comes back undefined, renders as
//      unset, and is then SAVED as unset - so opening an edit and pressing save
//      wipes it. Cost the attestation form, subject and body on a live meeting.
//   3. a sender posting straight to r.email with no off-production guard, so it
//      mails real staff from a laptop with every link pointing at localhost.
//      Cost a real employee receiving her payroll document from a dev server.
//
// Written as tests because remembering is not a control. Each one fails loudly
// the next time somebody reintroduces the pattern, including me.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const ANNOUNCE_ACTIONS = "src/app/portal/announcements/actions.js";

// split a module into { name, body } per top-level function, exported or not.
function functionsIn(src) {
  const lines = src.split("\n");
  const starts = [];
  lines.forEach((l, i) => {
    const m = l.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
    if (m) starts.push({ name: m[1], line: i });
  });
  return starts.map((s, i) => ({
    name: s.name,
    body: lines.slice(s.line, i + 1 < starts.length ? starts[i + 1].line : lines.length).join("\n"),
  }));
}

test("a sender that builds attachments never hands them to resend.batch.send", () => {
  const offenders = [];
  for (const fn of functionsIn(read(ANNOUNCE_ACTIONS))) {
    // Does this function put real attachments on a MESSAGE? `attachments: true`
    // and `attachments: null` are Prisma selects and writes on the announcement
    // row, not files on an email, and there are a dozen of those in here.
    //
    // Read the VALUE rather than using a lookahead: `\s*` is happy to match zero
    // width, so `(?!true)` ends up testing the space and passes everything.
    const values = [...fn.body.matchAll(/\battachments:\s*([^\s,}]+)/g)].map((m) => m[1]);
    const carriesFiles = values.some((v) => !/^(true|false|null|undefined)\b/.test(v));
    if (!carriesFiles) continue;
    // then it MUST have a one-at-a-time path. Resend's batch endpoint does not
    // support attachments and does not complain - it just drops them.
    if (!/resend\.emails\.send\(/.test(fn.body)) {
      offenders.push(fn.name);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these build attachments but have no resend.emails.send path, so the files are dropped: ${offenders.join(", ")}`,
  );
});

test("every announcement email sender routes through the off-production guard", () => {
  const unguarded = [];
  for (const fn of functionsIn(read(ANNOUNCE_ACTIONS))) {
    if (!/resend\.(batch|emails)\.send\(/.test(fn.body)) continue;
    if (!/resolveAnnouncementRecipients\(/.test(fn.body)) unguarded.push(fn.name);
  }
  assert.deepEqual(
    unguarded,
    [],
    `these send mail straight to the real address off production: ${unguarded.join(", ")}`,
  );
});

test("the announcement edit page selects every editable meeting field", () => {
  const schema = read("prisma/schema.prisma");
  const model = schema.match(/model Announcement \{([\s\S]*?)\n\}/);
  assert.ok(model, "could not find the Announcement model");

  // scalar meeting* columns the author edits through the form
  const fields = [...model[1].matchAll(/^\s{2}(meeting[A-Za-z]*)\s+(\w+)/gm)]
    .filter(([, , type]) => !/^(Announcement|Form|User)/.test(type))
    .map(([, name]) => name);

  // stamps the SERVER owns. The form never posts these, so the edit page has no
  // reason to load them and loading them would not protect anything.
  const serverOwned = new Set([
    "meetingConcludedAt",
    "meetingAttestationSentAt",
    "meetingResponseNoticeSentAt",
    "meetingAuthorNudgeSentAt",
    "meetingReminders",
    // toggled from the announcement page by its own action, never posted by the
    // edit form - so an edit cannot clear it and the form has no reason to load it
    "meetingSlotAlerts",
  ]);
  const editable = fields.filter((f) => !serverOwned.has(f));
  assert.ok(editable.length > 5, "expected several editable meeting fields, got " + editable.length);

  const editPage = read("src/app/portal/announcements/[id]/edit/page.js");
  const missing = editable.filter((f) => !new RegExp(`\\b${f}:\\s*true`).test(editPage));
  assert.deepEqual(
    missing,
    [],
    `the edit page does not load these, so opening an edit and saving CLEARS them: ${missing.join(", ")}`,
  );
});
