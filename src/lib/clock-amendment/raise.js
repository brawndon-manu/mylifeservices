// RAISING ONE CLOCK AMENDMENT, THE SAME WHICHEVER SCREEN ASKED.
//
// two screens raise these: the amendments page, off the day's two files the
// office drops on it, and an audit card, off the two files the copy already
// stores. the record written, the pages cut out of the notes and the email
// sent have to be identical, so the writing lives here once and both screens
// hand it a candidate (the clock row, its note and pages, the account) and
// what the office typed.
//
// what the office typed is stored as the INTAKE. the person asked confirms or
// corrects it on the form and their signature makes it theirs - see rules.js.
//
// SERVER ONLY: prisma, blob storage and mail.
import { prisma } from "@/lib/prisma";
import { hasBlobStorage, putBlob } from "@/lib/blob";
import { preferredName } from "@/lib/contacts";
import { cutPages } from "./files.js";
import { missingPunchText, firstLast, asksStart, asksEnd, asksPlace } from "./rules.js";
import { tidyTime, anchorOf, isTime } from "./typed-time.js";
import { signAmendmentToken } from "./token.js";
import { sendAmendmentForm } from "./email.js";

export const ROSTER_SELECT = { id: true, name: true, email: true, role: true, preferredFirstName: true, preferredLastName: true };

export const shown = (u) => preferredName(u) || u?.name || u?.email || "";

export const str = (v, max = 300) => String(v ?? "").trim().slice(0, max) || null;

// candidate: { key, shift, facts, note, pages, account } as files.js builds
// one. pick: { reasonText, actualIn, actualOut, placeIn, placeOut,
// recipientId, officeNote }. pdf: the notes file the pages are cut from.
// -> { key, who, ok, id, sent, sentTo, redirected, error }
export async function raiseOne({ user, candidate: c, pick: p, testOnly = false, pdf = null, clockName = null, notesName = null }) {
  const base = process.env.AUTH_URL || "https://www.mylifeservicesinc.com";
  const who = c.account ? shown(c.account) : c.facts.staffName;

  // the finished copy is mailed to the staff member, so they need an account
  if (!c.account) return { key: c.key, who, ok: false, error: "noaccount" };

  // what they told the office happened, in their words - the whole point
  const intakeReasonText = str(p?.reasonText, 2000);
  if (!intakeReasonText) return { key: c.key, who, ok: false, error: "reason" };
  // the times, read the way the boxes read them, against the schedule
  const f = c.facts;
  const intakeActualIn = str(p?.actualIn, 12) ? tidyTime(str(p.actualIn, 12), anchorOf(f.scheduledIn)) : null;
  const intakeActualOut = str(p?.actualOut, 12) ? tidyTime(str(p.actualOut, 12), anchorOf(f.scheduledOut)) : null;
  // the side in question has to be said; a form that asks somebody to sign
  // for a blank is a form that asks them to make a time up on the spot
  const asRecord = { clockRow: c.shift };
  if (asksEnd(asRecord) && !intakeActualOut) return { key: c.key, who, ok: false, error: "times" };
  if (asksStart(asRecord) && !intakeActualIn) return { key: c.key, who, ok: false, error: "times" };
  if ((intakeActualIn && !isTime(intakeActualIn)) || (intakeActualOut && !isTime(intakeActualOut))) return { key: c.key, who, ok: false, error: "times" };
  // where they said they were at a punch the clock holds no location for.
  // optional at intake - the office may not have asked - and required of
  // them on the form, which is where it counts
  const place = asksPlace(asRecord);
  const intakePlaceIn = place.in ? str(p?.placeIn, 300) : null;
  const intakePlaceOut = place.out ? str(p?.placeOut, 300) : null;

  const recipientId = str(p?.recipientId, 40) || c.account.id;
  const recipient = await prisma.user.findUnique({ where: { id: recipientId }, select: ROSTER_SELECT });
  if (!recipient?.email) return { key: c.key, who, ok: false, error: "who" };

  const n = c.note;
  const row = await prisma.clockAmendment.create({
    data: {
      staffId: c.account.id,
      recipientId: recipient.id,
      clientName: firstLast(f.client) || "(no client on the booking)",
      service: f.service || "",
      shiftDate: f.date,
      scheduledIn: f.scheduledIn, scheduledOut: f.scheduledOut,
      clockedIn: f.clockedIn, clockedOut: f.clockedOut,
      // the note as it read when the form was raised - copied, not joined
      dsnStart: n?.start || null, dsnEnd: n?.end || null, dsnSummary: n?.summary || null,
      clockRow: c.shift, note: n || undefined,
      clockName, notesName,
      intakeReasonText, intakeActualIn, intakeActualOut, intakePlaceIn, intakePlaceOut,
      testOnly,
      createdById: user.id,
    },
    select: { id: true },
  });

  // the note's own pages, cut out of the upload for the document's appendix
  if (pdf && c.pages && hasBlobStorage()) {
    try {
      const pages = await cutPages(pdf, c.pages.from, c.pages.to);
      const blob = await putBlob(`clock-amendments/${row.id}/dsn.pdf`, Buffer.from(pages), {
        contentType: "application/pdf",
      });
      await prisma.clockAmendment.update({ where: { id: row.id }, data: { dsnPdfUrl: blob.url } });
    } catch (e) {
      console.error("clock amendment: dsn pages not stored:", e);
    }
  }

  const url = `${base}/ca/${signAmendmentToken(row.id)}`;
  const sent = await sendAmendmentForm({
    intendedEmail: recipient.email,
    // a rehearsal goes to the person raising it and nowhere else
    forceTo: testOnly ? user.email : null,
    recipientName: shown(recipient),
    staffName: who,
    clientName: firstLast(f.client) || "the person served",
    service: f.service || "",
    date: f.date,
    scheduled: f.scheduledIn && f.scheduledOut ? `${f.scheduledIn} to ${f.scheduledOut}` : null,
    missing: `The clock shows they ${missingPunchText({ clockRow: c.shift })}.`,
    officeNote: str(p?.officeNote, 1000),
    formUrl: url,
  });
  if (sent.ok) {
    await prisma.clockAmendment.update({
      where: { id: row.id },
      data: { sentAt: new Date(), sentToEmail: sent.sentTo, intendedEmail: recipient.email },
    });
  }
  return { key: c.key, who, ok: true, id: row.id, sent: sent.ok, sentTo: sent.ok ? sent.sentTo : null, redirected: !!sent.redirected, error: sent.ok ? null : sent.error };
}
