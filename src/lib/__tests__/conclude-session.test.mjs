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
