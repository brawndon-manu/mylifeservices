// WHICH NUMBER THE HEADER OFFERS, AND WHERE.
//
// Giving an employee the office line on the page where they are being asked to
// check their hours is the failure this rule exists to prevent, and giving the
// timesheet line to the whole public site is the opposite one. Both are silent:
// the header looks right either way.
//
// THE REAL FUNCTION, NOT A COPY OF IT. `Header.js` is a client component
// `node --test` cannot import, so the rule lives in a dependency-free module
// the header and this both pull from - the same shape as `portal-nav.js`.
import test from "node:test";
import assert from "node:assert/strict";

import {
  contactForPath,
  isTimesheetPath,
  SITE_PHONE_DISPLAY,
  SITE_PHONE_HREF,
  TIMESHEET_PHONE_DISPLAY,
  TIMESHEET_PHONE_HREF,
  TIMESHEET_CONTACT_MESSAGE,
  CONTACT_HOLD_MS,
} from "../timesheet-contact.js";

// a real token path, the shape the emailed link actually has
const REVIEW = "/t/Y21kOHFwc2hy0000abcd";

test("the review page offers the timesheet number, not the office", () => {
  const c = contactForPath(REVIEW);
  assert.equal(c.display, TIMESHEET_PHONE_DISPLAY);
  assert.equal(c.href, TIMESHEET_PHONE_HREF);
  assert.notEqual(c.display, SITE_PHONE_DISPLAY);
});

test("the sentence rides along only on the review page", () => {
  assert.equal(contactForPath(REVIEW).message, TIMESHEET_CONTACT_MESSAGE);
  // null everywhere else, and the header renders nothing when it is null - so
  // no other page can grow a pill that expands
  for (const p of ["/", "/portal", "/contact", "/services/respite", "/portal/admin/timesheets"]) {
    assert.equal(contactForPath(p).message, null, `${p} should carry no message`);
  }
});

test("every other page keeps the office number", () => {
  for (const p of ["/", "/about", "/contact", "/careers/apply", "/portal", "/portal/settings"]) {
    const c = contactForPath(p);
    assert.equal(c.display, SITE_PHONE_DISPLAY, `${p} should keep the site number`);
    assert.equal(c.href, SITE_PHONE_HREF);
  }
});

// `/portal/admin/timesheets/...` is the ADMIN side of the same feature and is
// not the employee's page. It keeps the office number, because the people on it
// work here.
test("the admin timesheet screens are not the employee review page", () => {
  assert.equal(isTimesheetPath("/portal/admin/timesheets"), false);
  assert.equal(isTimesheetPath("/portal/admin/timesheets/abc/person/def"), false);
});

test("only /t and what is under it counts", () => {
  assert.equal(isTimesheetPath("/t"), true);
  assert.equal(isTimesheetPath(REVIEW), true);
  assert.equal(isTimesheetPath(`${REVIEW}/pdf`), true);
  // a path that merely STARTS with the letter t is not the review page, which
  // a naive startsWith("/t") would have said yes to
  assert.equal(isTimesheetPath("/this-week"), false);
  assert.equal(isTimesheetPath("/team"), false);
});

test("a missing path answers the office number rather than throwing", () => {
  assert.equal(isTimesheetPath(null), false);
  assert.equal(isTimesheetPath(undefined), false);
  assert.equal(contactForPath(null).display, SITE_PHONE_DISPLAY);
});

// THE LINK AND THE LABEL MUST BE THE SAME PHONE. A tel: href nobody reads is
// exactly where a typo survives - the button would show the right number and
// dial a different one.
test("each number dials what it prints", () => {
  const digits = (s) => s.replace(/\D/g, "");
  assert.equal(digits(SITE_PHONE_HREF), `1${digits(SITE_PHONE_DISPLAY)}`);
  assert.equal(digits(TIMESHEET_PHONE_HREF), `1${digits(TIMESHEET_PHONE_DISPLAY)}`);
});

test("the timesheet number is the one he gave", () => {
  assert.equal(TIMESHEET_PHONE_DISPLAY.replace(/\D/g, ""), "5624467588");
});

test("the message is long enough to need reading time", () => {
  // the hold exists because the sentence hangs over the page. If somebody ever
  // shortens it to two words this is the reminder that the timing was chosen
  // for this length.
  assert.ok(TIMESHEET_CONTACT_MESSAGE.split(/\s+/).length >= 6);
  assert.ok(CONTACT_HOLD_MS >= 3000, "less than this is not reading time");
});
