// WHERE A SUBMITTED FORM IS ALLOWED TO GO.
//
// Mánu 2026-08-10, asked to run the signing flow end to end: "with me being the
// only person its sent to." He could not have that. A form submitted from the
// laptop emailed the real reviewer - the training acknowledgment routes to
// whoever holds HR Administrator, which is Britny - because form sends had no
// equivalent of the timesheet lock.
//
// These assertions are written so they FAIL if the guard is removed: each one
// names the address that must NOT be on the line.
import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveFormRecipients, resolveAnnouncementRecipients } from "../../timesheet-mode.js";

const PROD = { VERCEL_ENV: "production", AUTH_URL: "https://www.mylifeservicesinc.com" };
const REVIEWER = "britny.mylifeservices@gmail.com";
const COLLEAGUE = "someone.else@example.com";

test("on the real deployment a submission reaches the reviewer, cc intact", () => {
  const r = resolveFormRecipients(REVIEWER, [COLLEAGUE], PROD);
  assert.deepEqual(r.to, [REVIEWER]);
  assert.deepEqual(r.cc, [COLLEAGUE]);
  assert.equal(r.redirected, false);
});

test("off the real deployment it is redirected and the reviewer is NOT on it", () => {
  for (const env of [
    {}, // a bare laptop
    { VERCEL_ENV: "preview", AUTH_URL: "https://branch.vercel.app" },
    { VERCEL_ENV: "development", AUTH_URL: "http://localhost:3000" },
    // the case that matters most: production flag set, but the links are local
    { VERCEL_ENV: "production", AUTH_URL: "http://localhost:3000" },
  ]) {
    const r = resolveFormRecipients(REVIEWER, [COLLEAGUE], env);
    assert.equal(r.redirected, true, `should redirect for ${JSON.stringify(env)}`);
    assert.ok(!r.to.includes(REVIEWER), "the reviewer must not be on the TO line");
    assert.ok(!r.cc.includes(COLLEAGUE), "a redirected copy must not cc anyone");
    assert.deepEqual(r.to, ["brawndonu@gmail.com"]);
    // the intended address still comes back, so the mail can say where it would
    // have gone
    assert.equal(r.intendedEmail, REVIEWER);
  }
});

test("the local inbox list is its own setting and cannot be aimed at staff", () => {
  // TIMESHEET_TEST_RECIPIENTS is the PRODUCTION dry-run list. Pointing it at a
  // colleague must not also redirect a laptop's mail to them.
  const r = resolveFormRecipients(REVIEWER, [], {
    TIMESHEET_TEST_RECIPIENTS: COLLEAGUE,
  });
  assert.deepEqual(r.to, ["brawndonu@gmail.com"]);
  assert.ok(!r.to.includes(COLLEAGUE));
});

// AND THE SAME FOR ANNOUNCEMENTS.
//
// Publishing from a laptop emailed every targeted employee for real, with every
// link pointing at localhost. That is how a post Mánu called "testing final"
// reached Britny on 2026-08-10.
test("an announcement on the real deployment reaches the employee", () => {
  const r = resolveAnnouncementRecipients("staff.member@example.com", PROD);
  assert.deepEqual(r.to, ["staff.member@example.com"]);
  assert.equal(r.redirected, false);
});

test("off the real deployment no employee is on the line", () => {
  for (const env of [
    {},
    { VERCEL_ENV: "preview", AUTH_URL: "https://branch.vercel.app" },
    // the one that actually happened: publishing from the laptop
    { VERCEL_ENV: "production", AUTH_URL: "http://localhost:3000" },
  ]) {
    const r = resolveAnnouncementRecipients("staff.member@example.com", env);
    assert.equal(r.redirected, true, `should redirect for ${JSON.stringify(env)}`);
    assert.ok(!r.to.includes("staff.member@example.com"), "staff must not be on the TO line");
    assert.deepEqual(r.to, ["brawndonu@gmail.com"]);
    assert.equal(r.intendedEmail, "staff.member@example.com");
  }
});
