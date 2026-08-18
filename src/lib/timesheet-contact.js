// WHICH NUMBER THE HEADER OFFERS, AND WHERE.
//
// The site number reaches the office. The timesheet number is a phone somebody
// actually watches while a pay period is being signed off, and it is the only
// number an employee should be given on the page where they are being asked to
// check their hours - "reply to the email" is not an answer at 9pm on a Sunday.
//
// DEPENDENCY-FREE ON PURPOSE, same as `portal-nav.js` and `break-answers.js`:
// the header is a client component `node --test` cannot import, so the rule
// lives here where the test can call the very same function the header does.
//
// Nothing in this file may import React, Next, or Prisma.

// The office line, on every page that is not a timesheet review.
export const SITE_PHONE_DISPLAY = "(562) 686-2548";
export const SITE_PHONE_HREF = "tel:+15626862548";

// The timesheet line. Mánu's, and deliberately NOT the site number - see above.
export const TIMESHEET_PHONE_DISPLAY = "(562) 446-7588";
export const TIMESHEET_PHONE_HREF = "tel:+15624467588";

// His wording, kept as he gave it. It says TEXT first because that is what
// somebody with a question about one row will actually do.
export const TIMESHEET_CONTACT_MESSAGE =
  "Text or call this number if you have any issue";

// The employee timesheet review page, which is the only place the timesheet
// number belongs - `/t/<token>` and anything under it (the PDF and version
// routes render no header, but a path rule that depends on that would break
// the day one does).
export function isTimesheetPath(pathname) {
  const p = String(pathname || "");
  return p === "/t" || p.startsWith("/t/");
}

// -> what the header's phone button says, links to, and offers alongside it.
// `message` is null everywhere but the review page, and the header renders
// nothing when it is null, so no other page grew a pill that can expand.
export function contactForPath(pathname) {
  if (isTimesheetPath(pathname)) {
    return {
      display: TIMESHEET_PHONE_DISPLAY,
      href: TIMESHEET_PHONE_HREF,
      message: TIMESHEET_CONTACT_MESSAGE,
    };
  }
  return {
    display: SITE_PHONE_DISPLAY,
    href: SITE_PHONE_HREF,
    message: null,
  };
}

// HOW LONG THE MESSAGE STAYS BEFORE IT GETS OUT OF THE WAY. Ten seconds, his
// number: the page is scrolled the moment it loads, so the sentence has to
// survive somebody arriving, orienting, and coming back up to the top. Only
// the hanging variant uses this - see the note in the header on why the
// inline one never collapses.
export const CONTACT_HOLD_MS = 10000;
