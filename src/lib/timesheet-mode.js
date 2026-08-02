// the send-mode guard, kept dependency-free on purpose: this is the one switch
// standing between a test run and emailing 60+ people their own payroll
// document, so it stays trivially readable and independently testable.
//
// TEST MODE IS THE DEFAULT. live sending requires TIMESHEET_LIVE_SEND to equal
// the exact phrase below - unset, empty, "true", "1", "yes", wrong case or a
// stray space all keep it in test mode.

const LIVE_PHRASE = "yes-send-to-real-staff";
const FALLBACK_TEST_INBOX = "brawndonu@gmail.com";

export function isLiveSend(env = process.env) {
  return env.TIMESHEET_LIVE_SEND === LIVE_PHRASE;
}

export function testRecipients(env = process.env) {
  const raw = env.TIMESHEET_TEST_RECIPIENTS || FALLBACK_TEST_INBOX;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// what the UI shows, so the current mode is never implicit
export function sendModeSummary(env = process.env) {
  return isLiveSend(env)
    ? { live: true, label: "LIVE - emails go to staff", recipients: [] }
    : { live: false, label: "TEST - everything is redirected", recipients: testRecipients(env) };
}

// resolve the real TO for one timesheet. in test mode the intended address
// comes back alongside so it can be shown in the mail and stored on the row.
export function resolveRecipients(intendedEmail, env = process.env) {
  if (isLiveSend(env)) return { to: [intendedEmail], redirected: false, intendedEmail };
  return { to: testRecipients(env), redirected: true, intendedEmail };
}
