// SESSIONS CONCLUDE ONE AT A TIME - Mánu 2026-09-04, plus the two result
// mails: presence confirmed, absence arguable by reply. Structural pins.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const ACT = read("src/app/portal/announcements/actions.js");

test("the whole-meeting conclude refuses a meeting with sessions", () => {
  assert.match(ACT, /if \(hasOptions\) \{\n\s*redirect\(`\/portal\/admin\/meeting-attendance\/\$\{postId\}\?error=perSession`\);/);
});

test("a session concludes only itself, once", () => {
  assert.match(ACT, /export async function concludeSession/);
  // the absent-marking is scoped to the one option
  assert.match(ACT, /where: \{ announcementId: postId, optionId, attended: null \}/);
  // recorded as a reminder row and refused the second time
  assert.match(ACT, /kind: "concluded"/);
  assert.match(ACT, /error=alreadyConcluded/);
  // the meeting stamps concluded when every real session has
  assert.match(ACT, /done >= realIds\.length/);
});

test("the attestation is not re-asked of people who already signed", () => {
  assert.match(ACT, /formSubmission\.findMany\(\{\n\s*where: \{ announcementId: postId, formId: form\.id, userId: \{ in: presentIds \} \}/);
  assert.match(ACT, /presentIds\.filter\(\(id\) => !signed\.has\(id\)\)/);
});

test("the result mails say what they are and absence can be argued by reply", () => {
  assert.match(ACT, /Attendance confirmed: /);
  assert.match(ACT, /was recorded\. Thank you for attending\./);
  assert.match(ACT, /Marked absent: /);
  assert.match(ACT, /If you think this is a mistake, reply to this email and we will take a look\./);
  assert.match(ACT, /\.\.\.\(replyTo \? \{ replyTo \} : \{\}\)/);
  // every recipient rides the same off-deployment lock as the rest
  const body = ACT.slice(ACT.indexOf("function sendSessionResultEmails"));
  assert.match(body, /resolveAnnouncementRecipients\(r\.email\)/);
});

test("the attendance page carries the per-session conclude", () => {
  const bd = read("src/app/portal/admin/meeting-attendance/_components/MeetingBreakdown.js");
  assert.match(bd, /SessionConclude/);
  const cs = read("src/app/portal/admin/meeting-attendance/_components/ConcludeSession.js");
  assert.match(cs, /Conclude this session/);
  assert.match(cs, /their replies go to\s*\n?\s*the meeting author/);
});

test("roster rules 2026-09-04: first-name order, kept series picks, add always shown", () => {
  const ACT2 = read("src/app/portal/announcements/actions.js");
  // an admin add clears only the series can't-marker - other sessions stay,
  // so upper management can be marked present on every session they sat in
  assert.match(ACT2, /optionId: `cant:\$\{target\.seriesId\}`,\n\s*\},\n\s*\}\);\n\s*\} else if \(!post\.meetingMultiPick\)/);
  const page = read("src/app/portal/announcements/[id]/page.js");
  assert.match(page, /const byFirst = \(a, b\) => preferredName\(a\)\.localeCompare\(preferredName\(b\)\)/);
  assert.match(page, /repeat\(var\(--roster-cols,2\),minmax\(0,1fr\)\)/, "the grid obeys the column toggle");
  const roster = read("src/app/portal/admin/meeting-attendance/roster.js");
  assert.match(roster, /\.sort\(byFirst\)/);
  const admin = read("src/app/portal/announcements/_components/RosterAdmin.js");
  assert.doesNotMatch(admin.slice(admin.indexOf("Add someone to this session") - 3000, admin.indexOf("Add someone to this session")), /if \(!show\) return null/);
});
