// AN ANNOUNCEMENT DEADLINE, IN ONE PLACE.
//
// Mánu 2026-09-08: "the deadline doesnt mean it needs to go away. the deadline
// is a call to action for the peple who havet signed and us to be notified
// that they missed the deadlne to sign." So a deadline here is three things,
// none of which is an expiry: the date a signature or acknowledgment is due,
// a chase the night before to whoever still owes, and a bell to the elevated
// tier the moment it passes with people outstanding. The post itself never
// sinks while anyone still owes it - that rule lives on the pages.
//
// EVERY INSTANT IS CALIFORNIA'S. The old parse read "2026-09-09" as midnight
// UTC, which is 5:00 PM Pacific on the 8th - so every deadline went "Past
// due" a day early, at teatime. "Due 09/09" now means through 11:59 PM
// America/Los_Angeles on 09/09, and every date this module prints is
// formatted in that zone. Same family as the businessNow() fix (ae8b1f5).
//
// Pure on purpose: instants in, words and booleans out. The cron, the server
// actions and the pages all ask here, so the chase, the bell, the chips and
// the printed dates cannot disagree about what a deadline is.
import { zonedToInstant } from "./meeting-time.js";

export const DEADLINE_TZ = "America/Los_Angeles";

// "2026-09-09" (the DatePicker's posted value) -> the Date the deadline IS:
// end of that day, California. null when it cannot be read.
export function deadlineInstant(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || "").trim());
  if (!m) return null;
  const iso = zonedToInstant(m[0], "23:59", DEADLINE_TZ);
  return iso ? new Date(iso) : null;
}

// THE INVERSE: the Date a deadline IS -> "2026-09-09", the day it falls on in
// California, for a DatePicker's value. toISOString() cannot do this job - an
// end-of-day-LA deadline is 06:59 UTC the NEXT day, so a UTC read showed the
// edit form a date one day late, and saving that back moved the deadline a day
// AND re-armed the chase (a second real email to everyone still owing).
// Round-trips with deadlineInstant.
export function deadlineDateValue(expiresAt) {
  if (!expiresAt) return "";
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return "";
  // en-CA formats as YYYY-MM-DD, which is exactly what a date input takes.
  return d.toLocaleDateString("en-CA", { timeZone: DEADLINE_TZ });
}

// has this post's deadline passed?
export function deadlinePassed(expiresAt, now = new Date()) {
  return !!(expiresAt && now.getTime() >= new Date(expiresAt).getTime());
}

// THE CHASE WINDOW: 8:00 PM California the night before the deadline day,
// open until the deadline itself. Mirrors the meeting night-before reminder,
// so the two kinds of evening nudge land at the same hour.
export function chaseWindowOpen(expiresAt, now = new Date()) {
  if (!expiresAt) return false;
  const end = new Date(expiresAt).getTime();
  if (now.getTime() >= end) return false;
  // the deadline is 23:59 LA on its own day, so the night before 8 PM is
  // exactly one day and 3:59 earlier - derived from the instant rather than
  // re-parsing a date string, so DST days stay honest via the zone math.
  const dayStr = new Date(end).toLocaleDateString("en-CA", { timeZone: DEADLINE_TZ });
  const [y, mo, d] = dayStr.split("-").map(Number);
  const prev = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  prev.setUTCDate(prev.getUTCDate() - 1);
  const iso = zonedToInstant(prev.toISOString().slice(0, 10), "20:00", DEADLINE_TZ);
  if (!iso) return false;
  return now.getTime() >= new Date(iso).getTime();
}

// does this post take a SIGNATURE (an attached form) or an acknowledgment?
export const signMode = (post) => !!post?.formId;

// "Wednesday, September 9" - the chase email's date, California.
export function dueDateLong(expiresAt) {
  if (!expiresAt) return null;
  return new Date(expiresAt).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: DEADLINE_TZ,
  });
}

// "09/09/2026" - the bell's date, California.
export function dueDateShort(expiresAt) {
  if (!expiresAt) return null;
  return new Date(expiresAt).toLocaleDateString("en-US", {
    month: "2-digit", day: "2-digit", year: "numeric", timeZone: DEADLINE_TZ,
  });
}

// the chase email's words. One sentence; the See-original button carries the post.
export function chaseEmailCopy(post) {
  const due = dueDateLong(post.expiresAt);
  return {
    subject: `Reminder: ${post.title || "an announcement"}`,
    line: signMode(post)
      ? `Your signature is due by ${due}.`
      : `Your acknowledgment is due by ${due}.`,
  };
}

// THE ROSTER'S NUDGE EMAIL. Mánu 2026-09-08: this sender was the last one
// still speaking acknowledgments. On the live ILS attestation it mailed 38
// people "Acknowledge that I've read this / One click confirms it, no login
// needed" five and a half minutes after the chase had told them their
// SIGNATURE was due - and on a form post one click confirms nothing, so the
// people who stopped at the confirmation screen believed they were finished.
// The words follow the debt now. The sign-mode strings are the ones the
// publish email (announcement-email.js) and the /a/ack landing page already
// use, so all three doors read the same. Ack-only posts keep every old word.
export function ackNudgeCopy(post) {
  const title = post.title || "New announcement";
  return signMode(post)
    ? {
        subject: `Please sign: ${title}`,
        lead: "This announcement comes with a document to sign.",
        cta: "Review and sign",
        // the plain-text line reads as an instruction, the button as a label
        textCta: "Review and sign",
        note: "Opens the form in the portal. Signed in or not, you can sign it there.",
      }
    : {
        subject: `Please acknowledge: ${title}`,
        lead:
          "By clicking below, you acknowledge that you have read and understood the contents of this announcement.",
        cta: "Acknowledge that I've read this",
        textCta: "Acknowledge that you've read this",
        note: "One click confirms it, no login needed.",
      };
}

// the missed-deadline bell's words, exactly as approved.
export function missedBellCopy(post, outstanding) {
  const n = outstanding.length;
  const who = n === 1 ? "1 person has" : `${n} people have`;
  const verb = signMode(post) ? "signed" : "acknowledged";
  return {
    title: signMode(post) ? "Attestation deadline missed" : "Acknowledgment deadline missed",
    body: `${who} not ${verb} "${post.title || "an announcement"}". The deadline was ${dueDateShort(post.expiresAt)}.`,
  };
}

// the overdue chip a person who still owes sees, and the elevated tier's count.
export const overdueChipLabel = (post) =>
  signMode(post) ? "Signature overdue" : "Acknowledgment overdue";
export const missedChipLabel = (n) => `${n} missed the deadline`;
