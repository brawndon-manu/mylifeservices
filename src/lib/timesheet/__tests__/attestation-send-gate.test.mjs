// THE TWO LOCKS ON SENDING A CLIENT ATTESTATION, added 2026-09-12 when Mánu
// asked "if i press send all, who does it go to?"
//
// The answer was worse than the question. Attestations checked only whether
// this was production - no phrase, no confirmation - so on the real site one
// press put mail in real inboxes. Measured on the September month: the default
// destination is 6 emails, but ticking "Assigned staff" is 217 emails to 50
// staff members, on one click.
//
// ITS OWN PHRASE, NOT THE TIMESHEET ONE. TIMESHEET_LIVE_SEND is already set on
// the laptop this was written on, so sharing it would have unlocked
// attestations on the real site the moment it shipped.
//
// Every test pairs the case with its opposite, the way send-mode.test.mjs
// does, so a lock that stopped locking fails rather than quietly passing.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  attestationLiveSend,
  attestationLiveSendConfigured,
  attestationSendMode,
  resolveAttestationRecipients,
} from "../../timesheet-mode.js";

const PHRASE = "yes-send-to-real-staff";
const PROD = { VERCEL_ENV: "production", AUTH_URL: "https://mylifeservicesinc.com" };
const LIVE = { ...PROD, ATTESTATIONS_LIVE_SEND: PHRASE };
const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

test("both locks open, and neither one alone", () => {
  assert.equal(attestationLiveSend(LIVE), true, "phrase on the real deployment");
  // lock 1: the phrase
  assert.equal(attestationLiveSend(PROD), false, "production is not enough on its own");
  // lock 2: the deployment
  assert.equal(attestationLiveSend({ ATTESTATIONS_LIVE_SEND: PHRASE }), false, "the phrase is not enough on a laptop");
  assert.equal(attestationLiveSend({}), false);
});

test("the timesheet phrase does not open attestations", () => {
  // the one that matters: payroll sending being unlocked must not silently
  // unlock a different send to a different set of people
  assert.equal(attestationLiveSend({ ...PROD, TIMESHEET_LIVE_SEND: PHRASE }), false);
  assert.equal(attestationLiveSendConfigured({ TIMESHEET_LIVE_SEND: PHRASE }), false);
  // and its own phrase does open it, so the test above is not passing by accident
  assert.equal(attestationLiveSendConfigured({ ATTESTATIONS_LIVE_SEND: PHRASE }), true);
});

test("the phrase is exact", () => {
  for (const bad of ["", "true", "1", "yes", "YES-SEND-TO-REAL-STAFF", ` ${PHRASE}`, `${PHRASE} `]) {
    assert.equal(attestationLiveSend({ ...PROD, ATTESTATIONS_LIVE_SEND: bad }), false, `"${bad}" must not open it`);
  }
  assert.equal(attestationLiveSend({ ...PROD, ATTESTATIONS_LIVE_SEND: PHRASE }), true);
});

test("a localhost sign link keeps it shut, however production it claims to be", () => {
  // a link the recipient cannot use is a reason not to send at all
  assert.equal(attestationLiveSend({ ...LIVE, AUTH_URL: "http://localhost:3000" }), false);
  assert.equal(attestationLiveSend(LIVE), true);
});

test("anything short of live redirects to Mánu, and live does not", () => {
  const shut = resolveAttestationRecipients("supervisor@example.com", PROD);
  assert.equal(shut.redirected, true);
  assert.deepEqual(shut.to, ["brawndonu@gmail.com"]);
  assert.equal(shut.intendedEmail, "supervisor@example.com", "the intended address rides along for the subject line");
  assert.ok(!shut.to.includes("supervisor@example.com"), "the real person is not on it");

  const open = resolveAttestationRecipients("supervisor@example.com", LIVE);
  assert.deepEqual(open.to, ["supervisor@example.com"]);
  assert.equal(open.redirected, false);
});

test("the screen says which lock is shut", () => {
  assert.equal(attestationSendMode(LIVE).live, true);
  assert.equal(attestationSendMode(PROD).reason, "not-live", "the phrase is missing");
  assert.equal(attestationSendMode({ ATTESTATIONS_LIVE_SEND: PHRASE }).reason, "local", "the phrase is set, this is not the site");
  // a shut mode always names where the mail will go instead
  assert.deepEqual(attestationSendMode(PROD).recipients, ["brawndonu@gmail.com"]);
});

test("Send all asks before it sends, and says how many", () => {
  const panel = read("src/app/portal/admin/client-attestations/_components/SendPanel.js");
  assert.match(panel, /const \[confirming, setConfirming\] = useState\(false\)/);
  // the press that opens the panel is not the press that sends
  assert.match(panel, /onClick=\{\(\) => setConfirming\(true\)\}/, "Send opens the confirmation");
  assert.match(panel, /Send \$\{total\} emails/, "the confirmation names the count");
  assert.match(panel, /This cannot be taken back\./);
  // the count is what resolves, not how many clients are on the month
  assert.match(panel, /counts\.resolves\?\.\[onlyUnsent \? "unsent" : "unsigned"\]/);
  // changing what would be sent takes the confirmation back down, so a
  // confirmed number can never belong to a different selection
  const resets = panel.match(/setConfirming\(false\)/g) || [];
  assert.ok(resets.length >= 4, `every input resets the confirmation, found ${resets.length}`);
});

test("the confirmation says where the mail is really going", () => {
  const panel = read("src/app/portal/admin/client-attestations/_components/SendPanel.js");
  assert.match(panel, /mode\.live/, "it reads the live mode");
  assert.match(panel, /These go to the real addresses\./);
  assert.match(panel, /come to \$\{mode\.recipients\.join\(", "\)\} instead/);
  // and the page hands it in
  const page = read("src/app/portal/admin/client-attestations/[id]/page.js");
  assert.match(page, /mode=\{mode\}/);
});
