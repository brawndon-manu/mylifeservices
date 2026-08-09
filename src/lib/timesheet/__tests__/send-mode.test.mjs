// The two locks on sending. This is the only code in the app that can email
// 60+ people their own payroll document.
//
// Lock 2 (must be the real deployment) was added 2026-08-09 after a real
// timesheet reached a real employee from a dev server on 08/08. Lock 1 was
// open on that laptop and nothing else was watching. The mail landed in her
// inbox with her hours in it; the sign link happened to point at localhost, so
// she could not act on it. That was luck.
//
// Every test pairs the case with its opposite, so a lock that stopped locking
// fails rather than quietly passing.
//
// NOTE this file lives under timesheet/__tests__ because that is the only glob
// `npm test` runs. The module under test is src/lib/timesheet-mode.js.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isLiveSend,
  liveSendConfigured,
  isProductionDeployment,
  testRecipients,
  resolveRecipients,
  sendModeSummary,
} from "../../timesheet-mode.js";

const PHRASE = "yes-send-to-real-staff";
const PROD = {
  TIMESHEET_LIVE_SEND: PHRASE,
  VERCEL_ENV: "production",
  AUTH_URL: "https://www.mylifeservicesinc.com",
};
// Mánu's machine on 2026-08-08: the phrase set, everything else local.
const LAPTOP = { TIMESHEET_LIVE_SEND: PHRASE, AUTH_URL: "http://localhost:3000" };

test("the real deployment with the phrase set sends to staff", () => {
  assert.equal(isProductionDeployment(PROD), true);
  assert.equal(isLiveSend(PROD), true);
  const r = resolveRecipients("april@example.com", PROD);
  assert.deepEqual(r.to, ["april@example.com"]);
  assert.equal(r.redirected, false);
});

test("the same phrase on a laptop cannot reach staff", () => {
  // the 08/08 case, exactly
  assert.equal(liveSendConfigured(LAPTOP), true, "the phrase IS set");
  assert.equal(isProductionDeployment(LAPTOP), false);
  assert.equal(isLiveSend(LAPTOP), false, "and it still cannot send");
  const r = resolveRecipients("april@example.com", LAPTOP);
  assert.deepEqual(r.to, ["brawndonu@gmail.com"]);
  assert.equal(r.redirected, true);
  assert.equal(r.intendedEmail, "april@example.com", "who it was meant for is kept");
});

test("production is proved, never assumed: anything short of it is local", () => {
  // each of these is PROD with one thing changed, and every one must lock
  const cases = {
    "no VERCEL_ENV at all": { ...PROD, VERCEL_ENV: undefined },
    "a preview deployment": { ...PROD, VERCEL_ENV: "preview" },
    "vercel dev": { ...PROD, VERCEL_ENV: "development" },
    "NODE_ENV alone is not enough": { ...PROD, VERCEL_ENV: undefined, NODE_ENV: "production" },
    "localhost AUTH_URL": { ...PROD, AUTH_URL: "http://localhost:3000" },
    "loopback AUTH_URL": { ...PROD, AUTH_URL: "http://127.0.0.1:3000" },
    "ipv6 loopback": { ...PROD, AUTH_URL: "http://[::1]:3000" },
  };
  for (const [name, env] of Object.entries(cases)) {
    assert.equal(isLiveSend(env), false, `${name} must not send to staff`);
    assert.deepEqual(resolveRecipients("april@example.com", env).to, ["brawndonu@gmail.com"], name);
  }
  // and the control: with none of those changes it DOES send, so the loop above
  // is not passing because everything is locked
  assert.equal(isLiveSend(PROD), true);
});

test("an absent AUTH_URL on the real deployment is allowed, and why", () => {
  // this one is deliberately NOT locked. Both send paths read
  // `process.env.AUTH_URL || "https://www.mylifeservicesinc.com"`, so with the
  // variable missing the links are still correct and pointed at the real site.
  // Locking here would take production down for a setting that changes nothing.
  const env = { ...PROD, AUTH_URL: undefined };
  assert.equal(isProductionDeployment(env), true);
  assert.equal(isLiveSend(env), true);

  // the opposite still holds: an AUTH_URL that IS present and local locks it,
  // so this is not a hole you can drive a laptop through.
  assert.equal(isLiveSend({ ...env, AUTH_URL: "http://localhost:3000" }), false);
});

test("off the deployment, the local inbox list wins outright", () => {
  // TIMESHEET_TEST_RECIPIENTS is for production dry runs. Pointing it at a
  // colleague must not also redirect a laptop's mail to them.
  const env = { ...LAPTOP, TIMESHEET_TEST_RECIPIENTS: "someone.else@example.com" };
  assert.deepEqual(testRecipients(env), ["brawndonu@gmail.com"]);

  // his own list is the one that works locally
  const two = { ...LAPTOP, TIMESHEET_LOCAL_INBOXES: "brandon@a.com, brandon@b.com" };
  assert.deepEqual(testRecipients(two), ["brandon@a.com", "brandon@b.com"]);

  // THE OPPOSITE: on the real deployment in test mode, the dry-run list is what
  // applies, or the setting would be dead everywhere.
  const dryRun = { ...PROD, TIMESHEET_LIVE_SEND: "", TIMESHEET_TEST_RECIPIENTS: "someone.else@example.com" };
  assert.deepEqual(testRecipients(dryRun), ["someone.else@example.com"]);
});

test("a missing or near-miss phrase still locks it, on production too", () => {
  for (const v of [undefined, "", "true", "1", "yes", "YES-SEND-TO-REAL-STAFF", ` ${PHRASE} `]) {
    const env = { ...PROD, TIMESHEET_LIVE_SEND: v };
    assert.equal(isLiveSend(env), false, `"${v}" must not open lock 1`);
  }
  assert.equal(isLiveSend({ ...PROD, TIMESHEET_LIVE_SEND: PHRASE }), true);
});

test("the banner says WHICH lock is shut", () => {
  // the phrase set but held by the environment is the confusing state: it looks
  // like a broken setting, and somebody goes hunting for a switch to flip.
  const held = sendModeSummary(LAPTOP);
  assert.equal(held.live, false);
  assert.equal(held.reason, "local");
  assert.match(held.label, /not the live site/i);
  assert.deepEqual(held.recipients, ["brawndonu@gmail.com"]);

  // phrase simply not set
  const off = sendModeSummary({ ...PROD, TIMESHEET_LIVE_SEND: "" });
  assert.equal(off.reason, "not-live");

  const live = sendModeSummary(PROD);
  assert.equal(live.live, true);
  assert.equal(live.reason, null);
  assert.deepEqual(live.recipients, []);
});

test("the batch badge reads the phrase, not the environment", () => {
  // a big upload has to run from localhost - Vercel caps the request body at
  // 4.5MB - so if the stored badge followed the environment every real batch
  // would be labelled "test" purely because of where it was uploaded.
  assert.equal(liveSendConfigured(LAPTOP), true);
  assert.equal(isLiveSend(LAPTOP), false);
  assert.equal(liveSendConfigured({ ...LAPTOP, TIMESHEET_LIVE_SEND: "" }), false);
});
