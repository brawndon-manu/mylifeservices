// THE DEADLINE IS A CALL TO ACTION, NOT AN EXPIRY (Mánu 2026-09-08).
// These pins hold the three things a deadline now is: an end-of-day
// California instant, a night-before chase window, and the missed-deadline
// words - plus the owed-set split that lets an exempt person get the email
// without owing the signature.
import test from "node:test";
import assert from "node:assert/strict";

import {
  deadlineInstant,
  deadlineDateValue,
  deadlinePassed,
  chaseWindowOpen,
  chaseEmailCopy,
  ackNudgeCopy,
  missedBellCopy,
  overdueChipLabel,
  missedChipLabel,
  dueDateLong,
} from "../announcement-deadline.js";
import { ackOwedWhere, inAckAudience, isExemptOnPost } from "../announcements.js";
import { ACK_EXEMPT_TITLE } from "../positions.js";

test("a deadline is the end of its own day, California - never teatime the day before", () => {
  // the ILS bug: "2026-09-09" parsed as midnight UTC = 5:00 PM PDT on the 8th.
  const d = deadlineInstant("2026-09-09");
  assert.equal(d.toISOString(), "2026-09-10T06:59:00.000Z"); // 23:59 PDT
  // winter dates sit an hour later in UTC (PST)
  assert.equal(deadlineInstant("2026-12-09").toISOString(), "2026-12-10T07:59:00.000Z");
  assert.equal(deadlineInstant(""), null);
  assert.equal(deadlineInstant("09/09/2026"), null);
  assert.equal(deadlineInstant(null), null);
});

test("the edit form reads a deadline back as its California day, not its UTC one", () => {
  // THE SECOND HALF OF THE SAME BUG. The ILS attestation's deadline is
  // 09/09 11:59 PM LA, stored as 2026-09-10T06:59Z. The edit form read that
  // with toISOString() and showed 09/10 - a day late - so saving the form
  // untouched pushed the deadline to 09/10 AND cleared the one-shot chase
  // stamp, re-arming a second real email to everyone still owing.
  const ils = deadlineInstant("2026-09-09");
  assert.equal(ils.toISOString().split("T")[0], "2026-09-10"); // the wrong read
  assert.equal(deadlineDateValue(ils), "2026-09-09"); // the day it actually is
  // round-trips both ways, across the DST boundary
  for (const day of ["2026-09-09", "2026-12-09", "2027-03-14", "2027-11-07"]) {
    assert.equal(deadlineDateValue(deadlineInstant(day)), day);
    assert.equal(
      deadlineInstant(deadlineDateValue(deadlineInstant(day))).getTime(),
      deadlineInstant(day).getTime(),
    );
  }
  // a post with no deadline leaves the field empty rather than dated
  assert.equal(deadlineDateValue(null), "");
  assert.equal(deadlineDateValue(undefined), "");
  assert.equal(deadlineDateValue("not a date"), "");
  // a stored string works the same as a Date (Prisma hands back Dates, JSON strings)
  assert.equal(deadlineDateValue("2026-09-10T06:59:00.000Z"), "2026-09-09");
});

test("a deadline instant is never midnight UTC, which is what marks a legacy row", () => {
  // Before this module existed a deadline was stored as new Date("YYYY-MM-DD"),
  // i.e. MIDNIGHT UTC, which is 5 PM California the day BEFORE the day the
  // author typed. Those rows were normalized to end-of-day California by
  // scratch/legacy-deadline-normalize.mjs, and that script identifies them by
  // exactly this: an end-of-day-LA instant is 06:59 or 07:59 UTC, so midnight
  // UTC cannot be one. If the deadline hour ever moves, that marker stops
  // working and this pin is where it gets caught.
  for (const month of ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]) {
    for (const day of ["01", "15", "28"]) {
      for (const year of ["2026", "2027"]) {
        const iso = deadlineInstant(`${year}-${month}-${day}`).toISOString();
        assert.ok(!iso.endsWith("T00:00:00.000Z"), `${year}-${month}-${day} landed on midnight UTC`);
        assert.match(iso, /T0[67]:59:00\.000Z$/); // PDT or PST, nothing else
      }
    }
  }
});

test("the chase window opens 8 PM California the night before and closes at the deadline", () => {
  const expiresAt = deadlineInstant("2026-09-09");
  // 8:00 PM PDT on 09/08 is 03:00 UTC on 09/09
  assert.equal(chaseWindowOpen(expiresAt, new Date("2026-09-09T02:55:00Z")), false);
  assert.equal(chaseWindowOpen(expiresAt, new Date("2026-09-09T03:05:00Z")), true);
  // still open the day of, right up to the deadline
  assert.equal(chaseWindowOpen(expiresAt, new Date("2026-09-10T06:00:00Z")), true);
  // and closed once it has passed - the bell's territory, not the chase's
  assert.equal(chaseWindowOpen(expiresAt, new Date("2026-09-10T07:00:00Z")), false);
  assert.equal(deadlinePassed(expiresAt, new Date("2026-09-10T06:58:00Z")), false);
  assert.equal(deadlinePassed(expiresAt, new Date("2026-09-10T06:59:00Z")), true);
});

test("the chase and the bell say the approved words", () => {
  const signPost = {
    title: "ILS documentation training materials and attestation",
    formId: "f1",
    expiresAt: deadlineInstant("2026-09-09"),
  };
  assert.equal(dueDateLong(signPost.expiresAt), "Wednesday, September 9");
  assert.deepEqual(chaseEmailCopy(signPost), {
    subject: "Reminder: ILS documentation training materials and attestation",
    line: "Your signature is due by Wednesday, September 9.",
  });
  assert.deepEqual(missedBellCopy(signPost, new Array(5).fill({})), {
    title: "Attestation deadline missed",
    body: '5 people have not signed "ILS documentation training materials and attestation". The deadline was 09/09/2026.',
  });

  const ackPost = { title: "New policy", formId: null, expiresAt: deadlineInstant("2026-09-09") };
  assert.equal(chaseEmailCopy(ackPost).line, "Your acknowledgment is due by Wednesday, September 9.");
  assert.deepEqual(missedBellCopy(ackPost, [{}]), {
    title: "Acknowledgment deadline missed",
    body: '1 person has not acknowledged "New policy". The deadline was 09/09/2026.',
  });

  assert.equal(overdueChipLabel(signPost), "Signature overdue");
  assert.equal(overdueChipLabel(ackPost), "Acknowledgment overdue");
  assert.equal(missedChipLabel(4), "4 missed the deadline");
});

test("the roster nudge asks a form post for a signature, never a one-click finish", () => {
  // THE LIVE INCIDENT: this sender mailed 38 people "Acknowledge that I've
  // read this / One click confirms it, no login needed" on a form post, five
  // minutes after the chase told them their signature was due.
  const signPost = {
    title: "ILS documentation training materials and attestation",
    formId: "f1",
  };
  assert.deepEqual(ackNudgeCopy(signPost), {
    subject: "Please sign: ILS documentation training materials and attestation",
    lead: "This announcement comes with a document to sign.",
    cta: "Review and sign",
    textCta: "Review and sign",
    note: "Opens the form in the portal. Signed in or not, you can sign it there.",
  });
  // nothing in a form post's nudge may promise that one click finishes it
  const words = Object.values(ackNudgeCopy(signPost)).join(" ");
  assert.ok(!/one click/i.test(words));
  assert.ok(!/acknowledg/i.test(words));

  // an ack-only post keeps every word it had
  const ackPost = { title: "Required admin time", formId: null };
  assert.deepEqual(ackNudgeCopy(ackPost), {
    subject: "Please acknowledge: Required admin time",
    lead:
      "By clicking below, you acknowledge that you have read and understood the contents of this announcement.",
    cta: "Acknowledge that I've read this",
    textCta: "Acknowledge that you've read this",
    note: "One click confirms it, no login needed.",
  });
  // and an untitled post still addresses something
  assert.equal(ackNudgeCopy({ formId: "f1" }).subject, "Please sign: New announcement");
  assert.equal(ackNudgeCopy({}).subject, "Please acknowledge: New announcement");
});

test("an exempt person stays in the audience and leaves the owed set", () => {
  const post = {
    ackEveryone: true,
    ackTitles: [],
    ackUserIds: [],
    ackExemptUserIds: ["april1"],
  };
  // the owed where wraps the audience with a notIn for the exemptions
  const where = ackOwedWhere(post);
  assert.ok(Array.isArray(where.AND), "exemptions wrap the audience in an AND");
  assert.deepEqual(where.AND[1], { id: { notIn: ["april1"] } });
  // no exemptions = exactly the audience where, untouched
  const bare = ackOwedWhere({ ...post, ackExemptUserIds: [] });
  assert.equal(bare.AND, undefined);

  const april = { id: "april1", title: "Program Manager", role: "MANAGER" };
  assert.equal(inAckAudience(post, april), true, "she is still in the audience");
  assert.equal(isExemptOnPost(post, "april1"), true, "and owes nothing on this post");
  assert.equal(isExemptOnPost(post, "someone"), false);
});

test("audience membership matches whole title segments, like the roster", () => {
  const post = { ackEveryone: false, ackTitles: ["Program Manager"], ackUserIds: [] };
  assert.equal(
    inAckAudience(post, { id: "u1", title: "Program Manager / Day Program" }),
    true,
  );
  assert.equal(
    inAckAudience(post, { id: "u2", title: "Assistant Program Manager" }),
    false,
    "a loose substring match would wrongly owe this person the signature",
  );
  // Everyone-audience excludes the ack-exempt Owner/Director title
  const everyone = { ackEveryone: true, ackTitles: [], ackUserIds: [] };
  assert.equal(inAckAudience(everyone, { id: "u3", title: ACK_EXEMPT_TITLE }), false);
  assert.equal(inAckAudience(everyone, { id: "u4", title: "Job Coach" }), true);
});
