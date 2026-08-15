// A BATCH THAT MAY ONLY EVER EMAIL ONE ADDRESS.
//
// The July period is kept as a strict rehearsal: every rule holds exactly as it
// does on a live batch, and the ONE thing that differs is where a message may
// go. This is the guard that makes that true.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { resolveRecipients, batchForceTo } from "../../timesheet-mode.js";

const LIVE = {
  TIMESHEET_LIVE_SEND: "yes-send-to-real-staff",
  VERCEL_ENV: "production",
  AUTH_URL: "https://www.mylifeservicesinc.com",
};

test("a rehearsal batch beats a fully live environment", () => {
  // THE ASSERTION THE WHOLE FLAG EXISTS FOR. Both ordinary locks are open here -
  // the exact phrase, the real deployment - so without the override this would
  // post a test period's timesheets to sixty real people.
  const live = resolveRecipients("real.employee@example.com", LIVE);
  assert.deepEqual(live.to, ["real.employee@example.com"], "the locks really are open");

  const forced = resolveRecipients("real.employee@example.com", LIVE, {
    forceTo: "brawndonu@gmail.com",
  });
  assert.deepEqual(forced.to, ["brawndonu@gmail.com"]);
});

test("it stays visibly a test send, so the inbox can tell", () => {
  // `redirected` drives the [TEST -> address] subject prefix and the banner in
  // the body. A rehearsal message that looked like an ordinary one would be
  // indistinguishable in the inbox it lands in.
  const r = resolveRecipients("real.employee@example.com", LIVE, { forceTo: "brawndonu@gmail.com" });
  assert.equal(r.redirected, true);
  assert.equal(r.intendedEmail, "real.employee@example.com", "and it still says who it was for");
});

test("an ordinary batch is not touched", () => {
  // the flag must change nothing anywhere else, or it is not an override, it is
  // a third send mode
  assert.equal(batchForceTo({ testOnly: false, testEmail: "x@y.com" }), null);
  assert.equal(batchForceTo({}), null);
  assert.equal(batchForceTo(null), null);
  assert.deepEqual(resolveRecipients("a@b.com", LIVE, { forceTo: null }).to, ["a@b.com"]);
});

test("flagged with nowhere to send forces nothing, rather than sending anyway", () => {
  // reading the two columns together. A batch marked for testing with a blank
  // address would otherwise fall through to the ordinary recipient - the exact
  // accident the flag exists to prevent - so it comes back null and the caller
  // is left with the ordinary locks, which are the safe default.
  assert.equal(batchForceTo({ testOnly: true, testEmail: null }), null);
  assert.equal(batchForceTo({ testOnly: true, testEmail: "   " }), null);
  assert.equal(batchForceTo({ testOnly: true, testEmail: "brawndonu@gmail.com" }), "brawndonu@gmail.com");
});

// THE COLUMNS HAVE TO BE SELECTED OR THE FLAG READS FALSE.
//
// A column left out of a Prisma select arrives undefined, which is
// indistinguishable from "not a test batch" - and here that means a rehearsal
// batch emailing real people. Same failure as `restsUrl` and `status`, with a
// send on the end of it.
test("both send paths select the columns they gate on", () => {
  const src = fs.readFileSync("src/app/portal/admin/timesheets/actions.js", "utf8");
  const selects = src.split("batch: {").concat(src.split("timesheetBatch.findUnique"));
  const forced = [...src.matchAll(/batchForceTo\(([^)]*)\)/g)].map((m) => m[1]);
  assert.ok(forced.length >= 2, "both senders have to consult the flag");
  // every place that reads it must have the columns in scope
  const count = (src.match(/testOnly: true/g) || []).length;
  assert.ok(count >= forced.length, `${forced.length} readers but only ${count} selects`);
});

// PREVIEW REFUSES ON A REAL BATCH AND NOT ON A REHEARSAL ONE.
//
// The refusal exists so a stray click while looking at somebody else's page
// cannot land on a real person's record. On a `testOnly` batch that reason does
// not apply - every rule holds as it does live and only the destination of its
// mail differs - and refusing there made the one batch kept for rehearsing the
// only one that could not be rehearsed.
test("the review page only refuses where there is a real record to protect", () => {
  const page = fs.readFileSync("src/app/t/[token]/page.js", "utf8");
  // narrowed to the two facts together, not to `preview` alone
  assert.match(page, /const refuses = preview && !rehearsal/);
  assert.match(page, /const rehearsal = !!ts\.batch\?\.testOnly/);
  // and every action goes through the one helper, so a new control cannot be
  // added that quietly writes on a preview of a real person's page
  assert.doesNotMatch(page, /preview \? refuse :/, "no call site may decide this for itself");
  assert.match(page, /submitAction=\{act\(submitSignedTimesheet\)\}/);
});

test("the flag the refusal turns on is actually selected", () => {
  // undefined reads as an ordinary batch, which would refuse on the rehearsal
  // one - the same select trap, pointed the other way
  const page = fs.readFileSync("src/app/t/[token]/page.js", "utf8");
  const sel = page.slice(page.indexOf("batch: {"), page.indexOf("batch: {") + 400);
  assert.match(sel, /testOnly: true/);
});
