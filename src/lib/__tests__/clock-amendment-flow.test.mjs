// THE FLOW A CLOCK AMENDMENT TAKES, FROM THE OFFICE'S CALL TO THE APPROVED
// DOCUMENT.
//
// The office takes the call and types what it was told. The person who was
// there confirms or corrects it and signs. The person served signs on the same
// phone, or is honestly recorded as unavailable. The office approves, with the
// claim checked against the note, and the document goes out.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-only-secret";

import {
  intakeOf, confirmedOf, correctionsOf, claimGap, scheduleGap, startGap, approvalFlags,
  formNumber, canApprove, clientStage, stageLine, missingPunchText, firstLast,
  punchIssue, issueOf, asksStart, asksEnd, startingTimes, LATE_MIN,
} from "../clock-amendment/rules.js";
import { signAmendmentToken, verifyAmendmentToken } from "../clock-amendment/token.js";
import { amendmentFormSubject, amendmentDocumentSubject } from "../clock-amendment/subjects.js";
import { officeRecipients } from "../clock-amendment/recipients.js";
import { resolveAmendmentRecipients, amendmentLiveSend } from "../timesheet-mode.js";
import { notePageSpan, shiftFacts } from "../clock-amendment/files.js";
import { tidyTime, anchorOf, isTime } from "../clock-amendment/typed-time.js";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// the 09/02 example: clocked in 4:30, never out; note 4:30-6:30 filed 6:11
const base = {
  id: "cmfx0000000000000000abcd",
  createdAt: "2026-09-18T20:15:00.000Z",
  scheduledIn: "4:30 PM", scheduledOut: "6:30 PM",
  clockedIn: "4:30 PM", clockedOut: null,
  dsnStart: "4:30 PM", dsnEnd: "6:30 PM",
  note: { start: "4:30 PM", end: "6:30 PM", signedAt: "6:11 PM" },
  intakeReasonText: "drove off after filing the note",
  intakeActualIn: null, intakeActualOut: "6:30 PM",
};

test("before they sign, the confirmed answer IS the intake, so a screen always has one", () => {
  assert.deepEqual(confirmedOf(base), intakeOf(base));
  assert.deepEqual(correctionsOf(base), []);
});

test("a correction is only a correction once it is signed, and both versions are kept", () => {
  const signed = { ...base, filledAt: new Date(), reasonText: "phone died halfway through", actualIn: null, actualOut: "6:15 PM" };
  const c = correctionsOf(signed);
  assert.equal(c.length, 2);
  assert.deepEqual(c[0], { field: "reasonText", label: "what happened", was: "drove off after filing the note", now: "phone died halfway through" });
  assert.deepEqual(c[1], { field: "actualOut", label: "the end time", was: "6:30 PM", now: "6:15 PM" });
  // whitespace is not a correction
  const same = { ...base, filledAt: new Date(), reasonText: "  drove off after filing   the note ", actualOut: "6:30 PM" };
  assert.deepEqual(correctionsOf(same), []);
});

test("a time typed in a hurry is read against the shift, not the workday rule", () => {
  const end = anchorOf("6:30 PM");
  const start = anchorOf("4:30 PM");
  // "7" on a shift ending 6:30 PM is 7 in the evening, whatever the timesheet
  // rule would make of a bare 7
  assert.equal(tidyTime("7", end), "7:00 PM");
  assert.equal(tidyTime("615", end), "6:15 PM");
  assert.equal(tidyTime("6:15", end), "6:15 PM");
  assert.equal(tidyTime("4", start), "4:00 PM");
  // said out loud, kept as said
  assert.equal(tidyTime("7a", end), "7:00 AM");
  assert.equal(tidyTime("4:30 PM", start), "4:30 PM");
  assert.equal(tidyTime("18:15", end), "6:15 PM");
  // a morning shift reads a bare 9 as morning
  assert.equal(tidyTime("9", anchorOf("9:00 AM")), "9:00 AM");
  // no schedule to lean on: the timesheet's workday rule
  assert.equal(tidyTime("7"), "7:00 AM");
  assert.equal(tidyTime("3"), "3:00 PM");
  // unreadable stays as typed so the server can refuse it by name
  assert.equal(tidyTime("abc", end), "abc");
  assert.equal(tidyTime("", end), "");
  assert.equal(isTime("7:00 PM"), true);
  assert.equal(isTime("abc"), false);
});

test("the claim is measured against the note's filing time and the schedule", () => {
  // 6:30 claimed, note filed 6:11 - nineteen minutes, which is over the ten
  // the audit engine already uses, so the approver is told
  assert.equal(claimGap(base), 19);
  assert.equal(scheduleGap(base), 0);
  const flags = approvalFlags(base);
  assert.ok(flags.some((f) => f.kind === "pastNote" && /19 minutes after the note was filed at 6:11 PM/.test(f.text)));
  assert.ok(!flags.some((f) => f.kind === "beyondSchedule"));
  // a claim that ends when the note was filed raises nothing
  assert.equal(claimGap({ ...base, intakeActualOut: "6:11 PM" }), 0);
  assert.ok(!approvalFlags({ ...base, intakeActualOut: "6:11 PM" }).some((f) => f.kind === "pastNote"));
  // past the schedule by more than ten minutes is its own flag
  assert.ok(approvalFlags({ ...base, intakeActualOut: "7:00 PM" }).some((f) => f.kind === "beyondSchedule"));
  // nothing to measure is not a finding
  assert.equal(claimGap({ ...base, note: null }), null);
});

test("the approver is told when the signatures carry the whole visit, and when there is no note", () => {
  const none = { ...base, clockedIn: null, note: null, dsnStart: null, dsnEnd: null };
  const kinds = approvalFlags(none).map((f) => f.kind);
  assert.ok(kinds.includes("noPunch"));
  assert.ok(kinds.includes("noNote"));
  assert.ok(!approvalFlags(base).map((f) => f.kind).includes("noPunch"));
});

test("approval waits for the staff signature and for the client half to be signed or explained", () => {
  assert.equal(canApprove(base), false, "unsigned");
  const signed = { ...base, filledAt: new Date() };
  assert.equal(canApprove(signed), false, "signed, client still to collect");
  assert.equal(clientStage(signed), "waiting");
  assert.equal(stageLine(signed), "Signed, waiting on the person served");
  assert.ok(approvalFlags(signed).some((f) => f.kind === "noClient"));
  assert.equal(canApprove({ ...signed, clientSignedAt: new Date() }), true);
  assert.equal(canApprove({ ...signed, clientUnavailableReason: "client was asleep" }), true);
  assert.ok(approvalFlags({ ...signed, clientUnavailableReason: "client was asleep" }).some((f) => f.kind === "clientUnavailable"));
  assert.equal(canApprove({ ...signed, clientSignedAt: new Date(), approvedAt: new Date() }), false, "already approved");
  assert.equal(stageLine({ ...signed, clientSignedAt: new Date() }), "Ready to approve");
});

test("the headline says which punch is missing, or that the clock-in was late", () => {
  assert.equal(missingPunchText(base), "did not clock out");
  assert.equal(missingPunchText({ clockedIn: null, clockedOut: "6:30 PM" }), "did not clock in");
  assert.equal(missingPunchText({ clockedIn: null, clockedOut: null }), "did not clock in or out");
  const late = { clockedIn: "9:38 AM", clockedOut: "12:00 PM", clockRow: { noIn: false, noOut: false, startDelta: 38 } };
  assert.equal(missingPunchText(late), "clocked in late");
});

test("what is wrong with a shift is measured, never read off the export's own late column", () => {
  // the 09/21 export set "Late Clock In" on a shift clocked to the minute
  assert.equal(punchIssue({ noIn: false, noOut: false, startDelta: 0, says: { lateIn: true } }), null);
  // and a clock-in early is not late
  assert.equal(punchIssue({ noIn: false, noOut: false, startDelta: -3 }), null);
  // the same export's 9:02 against a 9:00 booking is the case that set the floor at one
  assert.equal(LATE_MIN, 1);
  assert.equal(punchIssue({ noIn: false, noOut: false, startDelta: 2 }), "lateIn");
  assert.equal(punchIssue({ noIn: false, noOut: false, startDelta: LATE_MIN }), "lateIn");
  assert.equal(punchIssue({ noIn: false, noOut: false, startDelta: 38 }), "lateIn");
  // a missing punch outranks lateness, and neither punch is its own case
  assert.equal(punchIssue({ noIn: false, noOut: true, startDelta: 38 }), "noOut");
  assert.equal(punchIssue({ noIn: true, noOut: false, startDelta: null }), "noIn");
  assert.equal(punchIssue({ noIn: true, noOut: true }), "none");
  assert.equal(punchIssue(null), null);
  // both punches in, on time, but the phone did not say where from
  assert.equal(punchIssue({ noIn: false, noOut: false, startDelta: 0, gpsIn: "no", gpsOut: "yes" }), "noGps");
  assert.equal(punchIssue({ noIn: false, noOut: false, startDelta: 0, gpsIn: "yes", gpsOut: "no" }), "noGps");
  // a late clock-in outranks a missing location, and a missing punch outranks both
  assert.equal(punchIssue({ noIn: false, noOut: false, startDelta: 12, gpsIn: "no", gpsOut: "no" }), "lateIn");
  assert.equal(punchIssue({ noIn: false, noOut: true, gpsIn: "no" }), "noOut");
  const noPlace = { clockedIn: "9:00 AM", clockedOut: "12:00 PM", clockRow: { noIn: false, noOut: false, startDelta: 0, gpsIn: "no", gpsOut: "no" } };
  assert.equal(missingPunchText(noPlace), "clocked in and out without a location");
  assert.equal(missingPunchText({ ...noPlace, clockRow: { ...noPlace.clockRow, gpsOut: "yes" } }), "clocked in without a location");
  // the times stand, so the form asks for both as clocked and the attestation states them
  assert.equal(asksStart(noPlace), true);
  assert.equal(asksEnd(noPlace), true);
  assert.deepEqual(startingTimes(noPlace), { in: "9:00 AM", out: "12:00 PM", from: "clock" });
  assert.ok(approvalFlags({ ...base, ...noPlace, intakeActualIn: "9:00 AM", intakeActualOut: "12:00 PM" }).some((f) => f.kind === "noGps" && /at either punch/.test(f.text)));
});

test("the form asks for the start when it is missing or late, and the end only when it is missing", () => {
  const late = { clockedIn: "9:38 AM", clockedOut: "12:00 PM", clockRow: { noIn: false, noOut: false, startDelta: 38 } };
  assert.equal(issueOf(late), "lateIn");
  assert.equal(asksStart(late), true);
  assert.equal(asksEnd(late), false);
  assert.equal(asksStart(base), false);
  assert.equal(asksEnd(base), true);
  const neither = { clockedIn: null, clockedOut: null, clockRow: { noIn: true, noOut: true } };
  assert.equal(asksStart(neither), true);
  assert.equal(asksEnd(neither), true);
  // a stored row with no clock row falls back to its two punch columns
  assert.equal(issueOf({ clockedIn: "9:00 AM", clockedOut: null }), "noOut");
});

test("a late clock-in amended to before the booking is flagged, and the lateness itself is said", () => {
  const late = {
    ...base, clockedIn: "9:38 AM", clockedOut: "12:00 PM", scheduledIn: "9:00 AM", scheduledOut: "12:00 PM",
    clockRow: { noIn: false, noOut: false, startDelta: 38 }, note: { start: "9:38 AM", end: "12:00 PM", signedAt: "11:57 AM" },
    intakeActualIn: "9:00 AM", intakeActualOut: null,
  };
  assert.equal(startGap(late), 0);
  const kinds = approvalFlags(late).map((f) => f.kind);
  assert.ok(kinds.includes("lateIn"));
  assert.ok(!kinds.includes("beforeSchedule"));
  // claiming to have started well before the booking began is a finding
  const early = { ...late, intakeActualIn: "8:30 AM" };
  assert.equal(startGap(early), 30);
  assert.ok(approvalFlags(early).some((f) => f.kind === "beforeSchedule" && /30 minutes before the scheduled start of 9:00 AM/.test(f.text)));
});

test("the clock's Last, First reads First Last everywhere a person sees it", () => {
  assert.equal(firstLast("Tsao, Frances"), "Frances Tsao");
  assert.equal(firstLast("Robinson, Lauran"), "Lauran Robinson");
  // a booking with two people on it keeps both, in order
  assert.equal(firstLast("McDonald,Kelly; Fry,Cassidy"), "Kelly McDonald; Cassidy Fry");
  // a name already the right way round, or no name at all, is left alone
  assert.equal(firstLast("Frances Tsao"), "Frances Tsao");
  assert.equal(firstLast(null), "");
});

test("the form number is the day raised and the tail of the id, and never changes", () => {
  const n = formNumber(base);
  assert.match(n, /^CA-2609\d\d-ABCD$/);
  assert.equal(formNumber(base), n);
  assert.equal(formNumber({}), "CA-000000-0000");
});

test("the link token opens exactly one amendment and nothing else", () => {
  const t = signAmendmentToken("cmfx0000000000000000abcd");
  assert.equal(verifyAmendmentToken(t), "cmfx0000000000000000abcd");
  assert.equal(verifyAmendmentToken(t.slice(0, -3) + "xyz"), null, "tampered signature");
  assert.equal(verifyAmendmentToken("not-a-token"), null);
  assert.equal(verifyAmendmentToken(null), null);
  // a timesheet token must never open an amendment: different prefix, different signature
  assert.notEqual(t.split(".")[1], signAmendmentToken("cmfx0000000000000000abce").split(".")[1]);
});

test("the two subjects differ, and a redirected send says so in the subject", () => {
  const first = amendmentFormSubject({ staffName: "Lauran Robinson", date: "09/02/26" });
  const again = amendmentFormSubject({ staffName: "Lauran Robinson", date: "09/02/26", isResend: true });
  assert.notEqual(first, again);
  assert.match(again, /^Reminder:/);
  assert.match(amendmentFormSubject({ staffName: "L", date: "d", redirectedFrom: "x@y.z" }), /^\[TEST -> x@y\.z\] /);
  assert.match(amendmentDocumentSubject({ formNumber: "CA-260918-ABCD", staffName: "Lauran Robinson", date: "09/02/26" }), /CA-260918-ABCD/);
});

test("nothing leaves a laptop: off production every send is redirected, and a rehearsal forces one address", () => {
  const laptop = { VERCEL_ENV: undefined, AUTH_URL: "http://localhost:3000" };
  assert.equal(amendmentLiveSend(laptop), false);
  const r = resolveAmendmentRecipients("staff@example.com", laptop);
  assert.equal(r.redirected, true);
  assert.ok(!r.to.includes("staff@example.com"));
  // the phrase alone does not open it
  const phraseOnly = { ...laptop, CLOCK_AMENDMENT_LIVE_SEND: "yes-send-to-real-staff" };
  assert.equal(amendmentLiveSend(phraseOnly), false);
  // production plus the phrase does
  const live = { VERCEL_ENV: "production", AUTH_URL: "https://www.mylifeservicesinc.com", CLOCK_AMENDMENT_LIVE_SEND: "yes-send-to-real-staff" };
  assert.equal(amendmentLiveSend(live), true);
  assert.deepEqual(resolveAmendmentRecipients("staff@example.com", live).to, ["staff@example.com"]);
  // and a rehearsal row overrides even a live send
  const forced = resolveAmendmentRecipients("staff@example.com", live, { forceTo: "office@example.com" });
  assert.deepEqual(forced.to, ["office@example.com"]);
  assert.equal(forced.redirected, true);
  // the timesheet phrase does not open amendments
  assert.equal(amendmentLiveSend({ ...live, CLOCK_AMENDMENT_LIVE_SEND: undefined, TIMESHEET_LIVE_SEND: "yes-send-to-real-staff" }), false);
});

test("the office list is the payroll line unless the setting names one", () => {
  const fallback = officeRecipients({});
  assert.ok(fallback.length >= 3);
  assert.ok(fallback.every((e) => e.includes("@")));
  assert.deepEqual(officeRecipients({ CLOCK_AMENDMENT_TO: "a@x.com, b@x.com;c@x.com" }), ["a@x.com", "b@x.com", "c@x.com"]);
  assert.deepEqual(officeRecipients({ CLOCK_AMENDMENT_TO: "   " }), fallback, "blank falls back");
});

test("a note's pages run to the page before the next note, or the end of the file", () => {
  const notes = [{ page: 1 }, { page: 3 }, { page: 6 }];
  assert.deepEqual(notePageSpan(notes, notes[0], 8), { from: 1, to: 2 });
  assert.deepEqual(notePageSpan(notes, notes[1], 8), { from: 3, to: 5 });
  assert.deepEqual(notePageSpan(notes, notes[2], 8), { from: 6, to: 8 });
});

test("a clock row prints as the times everyone else writes, and a missing punch is null not a time", () => {
  const f = shiftFacts({ name: "Robinson, Lauran", client: "Tsao, Frances", service: "Self Determination Program", date: "09/02/26", schedFrom: 990, schedTo: 1110, actualFrom: 990, actualTo: null, noIn: false, noOut: true, gpsIn: "yes", gpsOut: null, reason: null });
  assert.equal(f.scheduledIn, "4:30 PM");
  assert.equal(f.scheduledOut, "6:30 PM");
  assert.equal(f.clockedIn, "4:30 PM");
  assert.equal(f.clockedOut, null);
  assert.equal(f.gpsIn, "yes");
});

test("the amendment link stays reachable through a maintenance window, like the timesheet link", () => {
  const proxy = read("src/proxy.js");
  assert.match(proxy, /pathname\.startsWith\("\/ca\/"\)/);
});

test("the form gets the bare header and no brochure footer, like the timesheet link", () => {
  // a document somebody signs on a phone, not a page of the marketing site
  const chrome = read("src/components/PublicChrome.js");
  assert.match(chrome, /isTimesheetPath\(pathname\) \|\| isAmendmentPath\(pathname\)/);
  const header = read("src/components/Header.js");
  assert.match(header, /const minimal = isTimesheetPath\(pathname\) \|\| isAmendmentPath\(pathname\);/);
});
