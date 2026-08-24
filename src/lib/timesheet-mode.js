// the send-mode guard, kept dependency-free on purpose: this is the one switch
// standing between a test run and emailing 60+ people their own payroll
// document, so it stays trivially readable and independently testable.
//
// TWO LOCKS, AND BOTH HAVE TO OPEN.
//
//   1. TIMESHEET_LIVE_SEND must equal the exact phrase below. Unset, empty,
//      "true", "1", "yes", wrong case or a stray space all keep it in test mode.
//   2. IT MUST BE THE REAL DEPLOYMENT. Added 2026-08-09 on Mánu's instruction:
//      "if we're testing in local development, the only emails that could be
//      sent are to my emails."
//
// Lock 2 exists because lock 1 had already been opened on this laptop, and on
// 2026-08-08 a real timesheet went to a real employee from a dev server during
// a meeting. It reached her inbox with her hours in it. The only thing that
// saved it was AUTH_URL being localhost, so the sign link was dead - which is
// luck, not a guard.
//
// THE TEST IS DELIBERATELY BACKWARDS: it does not try to spot a laptop, it
// requires positive proof of production and treats everything else as local.
// A new host, a container, a colleague's machine, a CI runner and a laptop all
// fail it without anyone having to think of them in advance. The cost of being
// wrong is one redirected batch and a visible banner saying so; the cost of the
// opposite is 60 people receiving payroll documents from somebody's laptop.

const LIVE_PHRASE = "yes-send-to-real-staff";
const FALLBACK_TEST_INBOX = "brawndonu@gmail.com";

// Is this the deployment staff actually use, or is it somebody's machine?
//
// VERCEL_ENV is set by Vercel itself and is "production" only on the real
// deployment ("preview" on branch builds, "development" under `vercel dev`).
// It cannot be set by accident locally, which is the property that matters.
//
// AUTH_URL is checked as well because a localhost sign link is unusable by the
// person receiving it. If the links cannot work, the mail should not go.
export function isProductionDeployment(env = process.env) {
  if (env.VERCEL_ENV !== "production") return false;
  const base = String(env.AUTH_URL || "");
  if (/localhost|127\.0\.0\.1|\[::1\]/i.test(base)) return false;
  return true;
}

// where mail goes when this is NOT the real deployment. Mánu's addresses, and
// nothing else can be substituted for them: the local list is its own setting,
// so pointing TIMESHEET_TEST_RECIPIENTS at a colleague for a production dry run
// cannot also redirect a laptop's mail to them.
export function localInboxes(env = process.env) {
  return splitList(env.TIMESHEET_LOCAL_INBOXES || FALLBACK_TEST_INBOX);
}

export function isLiveSend(env = process.env) {
  return env.TIMESHEET_LIVE_SEND === LIVE_PHRASE && isProductionDeployment(env);
}

// whether the LIVE PHRASE is set, regardless of where we are running. Only for
// labelling a stored batch - never for deciding whether mail may leave.
export function liveSendConfigured(env = process.env) {
  return env.TIMESHEET_LIVE_SEND === LIVE_PHRASE;
}

export function testRecipients(env = process.env) {
  // off the real deployment the local list wins outright. this is the floor.
  if (!isProductionDeployment(env)) return localInboxes(env);
  return splitList(env.TIMESHEET_TEST_RECIPIENTS || FALLBACK_TEST_INBOX);
}

function splitList(raw) {
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// what the UI shows, so the current mode is never implicit. `reason` says WHICH
// lock is shut, because "test mode" with the phrase set looks like a bug until
// you know the environment is holding it.
export function sendModeSummary(env = process.env) {
  if (isLiveSend(env)) {
    return { live: true, label: "LIVE - emails go to staff", recipients: [], reason: null };
  }
  const reason = liveSendConfigured(env)
    ? "local"      // the phrase is set, the environment is not production
    : "not-live";  // the phrase itself is missing
  return {
    live: false,
    label: reason === "local"
      ? "TEST - not the live site, so everything is redirected"
      : "TEST - everything is redirected",
    recipients: testRecipients(env),
    reason,
  };
}

// resolve the real TO for one timesheet. in test mode the intended address
// comes back alongside so it can be shown in the mail and stored on the row.
export function resolveRecipients(intendedEmail, env = process.env, { forceTo = null } = {}) {
  // A REHEARSAL BATCH OVERRIDES EVERY OTHER ANSWER, INCLUDING A LIVE ONE.
  //
  // `TimesheetBatch.testOnly` marks a period kept for testing: every rule holds
  // exactly as it does on a live batch - the Send all safeguard, the final and
  // superseded refusals, the signing gate, the whole question set - and the ONE
  // thing that differs is where a message may go.
  //
  // CHECKED FIRST, ON PURPOSE. The two locks below decide whether this is the
  // real deployment saying the real phrase; a rehearsal batch is not asking that
  // question. Put after them, a correctly configured production send would post
  // a test period's timesheets to sixty real people, which is the one outcome
  // this flag exists to make impossible.
  //
  // AND IT IS AN OVERRIDE, NOT A THIRD MODE. `redirected` stays true so every
  // subject keeps its `[TEST -> address]` prefix and every body keeps its
  // banner: a message from a rehearsal batch has to be identifiable as one in
  // the inbox it lands in, not just in the code that sent it.
  if (forceTo) {
    return { to: [forceTo], redirected: true, intendedEmail };
  }
  if (isLiveSend(env)) return { to: [intendedEmail], redirected: false, intendedEmail };
  return { to: testRecipients(env), redirected: true, intendedEmail };
}

// what a batch row forces its mail to, or null for an ordinary one. Reads the
// two columns together so a batch flagged for testing with nowhere to send
// cannot quietly fall through to the ordinary recipient - which is the exact
// accident the flag exists to prevent.
export function batchForceTo(batch) {
  if (!batch?.testOnly) return null;
  const to = String(batch.testEmail || "").trim();
  return to || null;
}

// EVERYTHING ELSE THAT LEAVES THIS APP BY EMAIL. Same file because this is the
// send-mode guard and it has to stay dependency-free to be testable; the name
// says timesheet only for historical reasons.
//
// Timesheets have had a lock since a real employee received her payroll
// document from a dev server. NOTHING ELSE DID - a form submitted from a laptop
// emailed the reviewer for real, and publishing an announcement from a laptop
// emailed every targeted employee with every link pointing at localhost.
//
// Only lock 2 applies to these. There is no phrase to set: on the real
// deployment both are people doing their job and must always go through.
// Everywhere else they are redirected, and the cc is dropped as well so a
// redirected copy cannot reach the sender's colleagues either.
function redirectOffProduction(intendedEmail, cc, env) {
  if (isProductionDeployment(env)) {
    return { to: [intendedEmail], cc, redirected: false, intendedEmail };
  }
  return { to: localInboxes(env), cc: [], redirected: true, intendedEmail };
}

export function resolveFormRecipients(intendedEmail, cc = [], env = process.env) {
  return redirectOffProduction(intendedEmail, cc, env);
}

// CLIENT ATTESTATIONS. One lock now, the same one the announcements and the
// forms have: a send from the real deployment is a person doing their job and
// goes through; a send from anywhere else is redirected to Mánu's inbox with
// the intended address riding along in the subject.
//
// This started with a second lock - its own live phrase, like the timesheets -
// and Mánu removed it on 2026-08-24 once the flow was verified end to end:
// "lets remove the testing for production for the emails." What the phrase was
// protecting is still protected where it matters: nothing can leave a laptop,
// and every send is a button somebody pressed on the review screen, never a
// side effect of uploading.
export function attestationLiveSend(env = process.env) {
  return isProductionDeployment(env);
}

export function resolveAttestationRecipients(intendedEmail, env = process.env) {
  if (isProductionDeployment(env)) {
    return { to: [intendedEmail], redirected: false, intendedEmail };
  }
  return { to: localInboxes(env), redirected: true, intendedEmail };
}

// what the review screen shows, so the current mode is never implicit
export function attestationSendMode(env = process.env) {
  if (attestationLiveSend(env)) {
    return { live: true, label: "LIVE - emails go to the people you pick", recipients: [], reason: null };
  }
  return {
    live: false,
    label: "TEST - not the live site, so everything is redirected",
    recipients: localInboxes(env),
    reason: "local",
  };
}

// one announcement email, addressed to one member of staff. Same rule: off the
// real deployment it comes to Mánu instead, and the intended address rides back
// so the subject can say whose copy it was.
export function resolveAnnouncementRecipients(intendedEmail, env = process.env) {
  return redirectOffProduction(intendedEmail, [], env);
}
