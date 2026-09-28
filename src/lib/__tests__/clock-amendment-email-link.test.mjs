// THE EMAILED CLIENT LINK: its own code apart from the one on the staff
// member's screen, 7 days of life counted in California days, the same link
// on a second send with its days started over, and the page it opens telling
// someone who is not in the room what to do when it has run out.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { EMAIL_LINK_DAYS, emailLinkExpiry, untilLabel, codeExpired } from "../clock-amendment/client-code.js";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const iso = (d) => d.toISOString();

test("an emailed link works through the 7th California day after it was sent", () => {
  assert.equal(EMAIL_LINK_DAYS, 7);
  // 3:12 PM on Sunday 09/27 in California: works through Sunday 10/04
  const e = emailLinkExpiry(new Date("2026-09-27T22:12:00.000Z"));
  assert.equal(iso(e), "2026-10-05T06:59:59.999Z");
  assert.equal(untilLabel(e), "Sunday, October 4");
  // the California day decides, not the server's: 11:59 PM on 09/26 there is
  // already 09/27 in UTC
  assert.equal(iso(emailLinkExpiry(new Date("2026-09-27T06:59:59.999Z"))), "2026-10-04T06:59:59.999Z");
  assert.equal(iso(emailLinkExpiry(new Date("2026-09-27T07:00:00.000Z"))), "2026-10-05T06:59:59.999Z");
  // across a month and a year
  assert.equal(untilLabel(emailLinkExpiry(new Date("2026-12-28T20:00:00.000Z"))), "Monday, January 4");
  assert.equal(codeExpired(e, new Date("2026-10-05T06:59:59.000Z")), false);
  assert.equal(codeExpired(e, new Date("2026-10-05T07:00:00.000Z")), true);
  assert.equal(untilLabel(null), null);
});

test("a week with a clock change in it still ends on the 7th day, not the 8th", () => {
  // 11:30 PM PST on 03/13/27, the night before the clocks spring forward: 168
  // hours later is already 12:30 AM on 03/21, so the days are counted instead
  const spring = emailLinkExpiry(new Date("2027-03-14T07:30:00.000Z"));
  assert.equal(untilLabel(spring), "Saturday, March 20");
  assert.equal(iso(spring), "2027-03-21T06:59:59.999Z");
  // 11:30 PM PDT on 10/28/26, the clocks fall back on 11/01
  const fall = emailLinkExpiry(new Date("2026-10-29T06:30:00.000Z"));
  assert.equal(untilLabel(fall), "Wednesday, November 4");
  assert.equal(iso(fall), "2026-11-05T07:59:59.999Z");
});

test("the emailed link is its own code: a second send keeps it and starts its days over, the screen's code is never touched", () => {
  const actions = read("src/app/ca/[token]/actions.js");
  const send = actions.slice(actions.indexOf("export async function emailClientLink"), actions.indexOf("export async function clientSign("));
  // a live emailed code is reused with a fresh 7 days; one past its life is replaced
  assert.match(send, /let code = a\.clientEmailCode;\s*if \(code && !codeExpired\(a\.clientEmailCodeExpiresAt\)\) \{\s*await prisma\.clockAmendment\.update\(\{ where: \{ id: a\.id \}, data: \{ clientEmailCodeExpiresAt: expiresAt \} \}\);\s*\} else \{\s*code = await mintCode\(a\.id, "clientEmailCode", expiresAt\);/);
  assert.match(send, /const expiresAt = emailLinkExpiry\(\);/);
  // the code on the staff member's screen is not the emailed one any more
  assert.doesNotMatch(send, /clientCode\b(?!:)/);
  assert.doesNotMatch(send, /mintClientCode/);
  // the email says the day it works until
  assert.match(send, /link: `\$\{BASE\(\)\}\/s\/\$\{code\}`,\s*until,/);
  assert.match(send, /return \{ ok: true, sentTo: sent\.sentTo, redirected: !!sent\.redirected, unusedTimes: !!c, until \};/);
  // a draw is checked against both columns, since both open the same page
  assert.match(actions, /const taken = await prisma\.clockAmendment\.findFirst\(\{ where: \{ OR: \[\{ clientCode: code \}, \{ clientEmailCode: code \}\] \}, select: \{ id: true \} \}\);\s*if \(taken\) continue;/);
  assert.match(actions, /const mintClientCode = \(id\) => mintCode\(id, "clientCode", codeExpiry\(\)\);/);
  // the schema holds the second code, unique like the first
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /clientEmailCode          String\?   @unique\n  clientEmailCodeExpiresAt DateTime\?/);
  assert.match(read("prisma/migrations/20260927120000_clock_amendment_email_code/migration.sql"), /CREATE UNIQUE INDEX "ClockAmendment_clientEmailCode_key" ON "ClockAmendment"\("clientEmailCode"\);/);
});

test("the page opens by either code, lives by that code's own day, and says emailed only when the emailed code was used", () => {
  const signing = read("src/app/s/[code]/actions.js");
  assert.match(signing, /where: \{ OR: \[\{ clientCode: code \}, \{ clientEmailCode: code \}\] \},/);
  assert.match(signing, /const byEmail = a\.clientEmailCode === code;/);
  assert.match(signing, /if \(codeExpired\(byEmail \? a\.clientEmailCodeExpiresAt : a\.clientCodeExpiresAt\)\) return \{ ok: false, error: "expired" \};/);
  // a signature scanned in the room after an email went out is not "emailed"
  assert.match(signing, /clientSignedVia: byEmail \? "email" : "own",/);
  assert.doesNotMatch(signing, /clientLinkEmailedAt \?/);
  const page = read("src/app/s/[code]/page.js");
  assert.match(page, /where: \{ OR: \[\{ clientCode: code \}, \{ clientEmailCode: code \}\] \},/);
  assert.match(page, /if \(byEmail && codeExpired\(a\.clientEmailCodeExpiresAt\)\) \{\s*return <Note>This link has expired\. Ask \{staffName\} to email you a new one\.<\/Note>;/);
  assert.match(page, /if \(!byEmail && codeExpired\(a\.clientCodeExpiresAt\)\) \{\s*return <Note>This code has expired\. Ask \{staffName\} to show a new one on their screen\.<\/Note>;/);
});

test("the email gives the day the link works until, in the html and the text, never 'today only'", () => {
  const email = read("src/lib/clock-amendment/email.js");
  assert.doesNotMatch(email, /today only/);
  assert.match(email, /sign with your finger\. It works until \$\{esc\(until\)\}\./);
  assert.match(email, /`Please confirm the visit happened by signing at the link below\. It works until \$\{until\}\.`,/);
  assert.match(email, /export async function sendClientSignLink\(\{ intendedEmail, forceTo = null, staffName, clientName, date, link, until \}\)/);
  assert.match(email, /const html = buildClientSignEmailHtml\(\{ staffName, clientName, date, link, until, redirectedFrom \}\);/);
});

test("the staff screen offers the code or the email as two choices, and says where a link went and until when", () => {
  const ui = read("src/app/ca/[token]/ClientCode.js");
  assert.match(ui, /\{choice\("scan", "Scan the code", qrIcon\)\}\s*\{choice\("email", "Email the link", mailIcon\)\}/);
  // back on the page after a send, the email side is the one showing
  assert.match(ui, /const \[way, setWay\] = useState\(view\.clientLinkEmail \? "email" : "scan"\);/);
  // the person served first: the link can go to them, not only to someone for them
  assert.match(ui, /Email it to \{view\.clientName\}, or to a parent or representative, when they are not with you\. It opens the same form on their phone, and it works for 7 days\./);
  assert.match(ui, /<span>The link was emailed to \{sent\.to\}\.\{sent\.until \? ` It works until \$\{sent\.until\}\.` : ""\}<\/span>/);
  assert.match(ui, /The link emailed to \{sent\.to\} has expired\./);
  // the small line under the code keeps only the hand-off
  assert.doesNotMatch(ui, /Email the link to a parent or representative/);
  assert.match(ui, /Can&rsquo;t scan\?\{" "\}\s*<button type="button" onClick=\{onHandoff\}/);
  // the polling for the client half runs whichever side is showing
  assert.match(ui, /setInterval\(tick, 4000\)/);
  const page = read("src/app/ca/[token]/page.js");
  assert.match(page, /clientLinkUntil: a\.clientEmailCode \? untilLabel\(a\.clientEmailCodeExpiresAt\) : null,/);
  assert.match(page, /clientLinkExpired: a\.clientEmailCode \? codeExpired\(a\.clientEmailCodeExpiresAt\) : false,/);
});

test("the office sees where the link went and until when, and a rehearsal reset clears the emailed code too", () => {
  const office = read("src/app/portal/admin/clock-amendments/[id]/page.js");
  assert.match(office, /\) : a\.clientEmailCode && a\.clientLinkEmailedAt \? \(/);
  assert.match(office, /<>Not collected yet\. The link was emailed to \{a\.clientLinkEmail\} on \{when\(a\.clientLinkEmailedAt\)\}\. It works until \{day\(a\.clientEmailCodeExpiresAt\)\}\.<\/>/);
  assert.match(office, /<>Not collected yet\. The link emailed to \{a\.clientLinkEmail\} on \{when\(a\.clientLinkEmailedAt\)\} has expired\.<\/>/);
  const reset = read("src/app/portal/admin/clock-amendments/[id]/actions.js");
  assert.match(reset.slice(reset.indexOf("export async function resetRehearsal")), /clientEmailCode: null, clientEmailCodeExpiresAt: null,/);
});
