"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { hasBlobStorage, putBlob, delBlob } from "@/lib/blob";
import { canApprove, approvalFlags, formNumber, missingPunchText, firstLast, confirmedOf, qspFixNeeded } from "@/lib/clock-amendment/rules";
import { tidyTime, anchorOf, isTime } from "@/lib/clock-amendment/typed-time";
import { loadAmendment, withNames, shownName, buildAmendmentDocument } from "@/lib/clock-amendment/document";
import { officeRecipients } from "@/lib/clock-amendment/recipients";
import { sendAmendmentDocument, sendAmendmentForm } from "@/lib/clock-amendment/email";
import { signAmendmentToken } from "@/lib/clock-amendment/token";
import { companyInstant } from "@/lib/forms/email-thread";

async function requireDesk() {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) return null;
  return user;
}

const str = (v, max = 300) => String(v ?? "").trim().slice(0, max) || null;
const QUEUE = "/portal/admin/clock-amendments";

// APPROVAL: the office's name on the document, the document built and kept,
// and the copy mailed out. A flagged claim needs a word from the approver
// saying why it was accepted, so a claim that outran the note never goes
// through in silence.
export async function approveAmendment(id, formData) {
  const user = await requireDesk();
  if (!user) return { ok: false, error: "auth" };
  const a = await loadAmendment(str(id, 40));
  if (!a) return { ok: false, error: "notfound" };
  if (!canApprove(a)) return { ok: false, error: a.approvedAt ? "approved" : "notready" };

  const approvalNote = str(formData.get("approvalNote"), 1000);
  if (approvalFlags(a).length && !approvalNote) return { ok: false, error: "note" };
  // the corrections the case calls for, read the way the boxes read them,
  // against the times they signed for. a punch the case is not about is
  // never recorded as corrected, whatever the form posted.
  const need = qspFixNeeded(a);
  const confirmed = confirmedOf(a);
  const typedIn = need.in ? str(formData.get("qspFixedIn"), 12) : null;
  const typedTo = need.out ? str(formData.get("qspFixedTo"), 12) : null;
  const qspFixedIn = typedIn ? tidyTime(typedIn, anchorOf(confirmed.actualIn) ?? anchorOf(a.scheduledIn)) : null;
  const qspFixedTo = typedTo ? tidyTime(typedTo, anchorOf(confirmed.actualOut) ?? anchorOf(a.scheduledOut)) : null;
  if ((qspFixedIn && !isTime(qspFixedIn)) || (qspFixedTo && !isTime(qspFixedTo))) return { ok: false, error: "qsptime" };
  const fixedDay = need.in || need.out ? str(formData.get("qspFixedAt"), 10) : null;
  // a date box gives yyyy-mm-dd. stored as noon in COMPANY time, not the
  // server's: on the real deployment the server's noon is 5 AM in California,
  // and the first approved document printed exactly that.
  const dayMatch = fixedDay ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(fixedDay) : null;
  const qspFixedAt = dayMatch
    ? companyInstant({ year: Number(dayMatch[1]), month: Number(dayMatch[2]) - 1, day: Number(dayMatch[3]), hour: 12, minute: 0 })
    : null;
  const qspFixedBy = qspFixedIn || qspFixedTo || qspFixedAt ? shownName(user) : null;
  const now = new Date();

  const view = withNames(a, { approvedAt: now, approvedByName: shownName(user), approvalNote, qspFixedIn, qspFixedTo, qspFixedAt, qspFixedBy });
  let doc;
  try {
    doc = await buildAmendmentDocument(view);
  } catch (e) {
    console.error("clock amendment: document not built:", e);
    return { ok: false, error: "document" };
  }

  let pdfUrl = null;
  if (hasBlobStorage()) {
    try {
      const blob = await putBlob(`clock-amendments/${a.id}/${randomBytes(6).toString("hex")}-${formNumber(a)}.pdf`, doc.bytes, {
        contentType: "application/pdf",
      });
      pdfUrl = blob.url;
    } catch (e) {
      console.error("clock amendment: document not stored:", e);
    }
  }

  await prisma.clockAmendment.update({
    where: { id: a.id },
    data: { approvedAt: now, approvedById: user.id, approvalNote, qspFixedIn, qspFixedTo, qspFixedAt, qspFixedBy, pdfUrl, pdfHash: doc.hash },
  });

  // a demo mails like the real thing but never the office list: the staff
  // member and the approver get the document. a rehearsal goes to the
  // approver alone.
  const sent = await sendAmendmentDocument({
    intendedEmails: a.demo ? [a.staff?.email, user.email] : [...officeRecipients(), a.staff?.email],
    forceTo: a.testOnly && !a.demo ? user.email : null,
    formNumber: formNumber(a),
    staffName: view.staffName,
    clientName: firstLast(a.clientName),
    date: a.shiftDate,
    approvedBy: shownName(user),
    pdfBytes: doc.bytes,
    filename: `${formNumber(a)} ${view.staffName} ${a.shiftDate.replace(/\//g, "-")}.pdf`,
  });
  if (sent.ok) await prisma.clockAmendment.update({ where: { id: a.id }, data: { mailedAt: new Date() } });

  revalidatePath(QUEUE);
  revalidatePath(`${QUEUE}/${a.id}`);
  return { ok: true, pdfUrl, sent: sent.ok, sentTo: sent.ok ? sent.sentTo : null, redirected: !!sent.redirected, error: sent.ok ? null : sent.error };
}

// A REMINDER to whoever was asked and has not signed. Same email, different
// subject, and counted, so the queue can say how many times somebody has been
// chased.
export async function chaseAmendment(id) {
  const user = await requireDesk();
  if (!user) return { ok: false, error: "auth" };
  const a = await loadAmendment(str(id, 40));
  if (!a) return { ok: false, error: "notfound" };
  if (a.approvedAt) return { ok: false, error: "approved" };
  if (a.filledAt) return { ok: false, error: "signed" };
  if (!a.recipient?.email) return { ok: false, error: "who" };

  const base = process.env.AUTH_URL || "https://www.mylifeservicesinc.com";
  const sent = await sendAmendmentForm({
    intendedEmail: a.recipient.email,
    // a rehearsal reminds the desk itself; a demo reminds the person picked
    forceTo: a.testOnly && !a.demo ? user.email : null,
    // a row whose first email never went is getting the form, not a reminder
    isResend: !!a.sentAt,
    recipientName: shownName(a.recipient),
    staffName: shownName(a.staff),
    clientName: firstLast(a.clientName),
    service: a.service,
    date: a.shiftDate,
    scheduled: a.scheduledIn && a.scheduledOut ? `${a.scheduledIn} to ${a.scheduledOut}` : null,
    missing: `The clock shows they ${missingPunchText(a)}.`,
    officeNote: null,
    formUrl: `${base}/ca/${signAmendmentToken(a.id)}`,
  });
  if (!sent.ok) return { ok: false, error: sent.error };
  await prisma.clockAmendment.update({
    where: { id: a.id },
    data: { chasedAt: new Date(), chaseCount: { increment: 1 }, sentAt: a.sentAt || new Date(), sentToEmail: sent.sentTo, intendedEmail: a.recipient.email },
  });
  revalidatePath(QUEUE);
  revalidatePath(`${QUEUE}/${a.id}`);
  return { ok: true, sentTo: sent.sentTo, redirected: !!sent.redirected };
}

// A REHEARSAL CAN BE DELETED, and only a rehearsal: a real amendment is a
// record, and a mistaken one is superseded rather than removed.
export async function deleteRehearsal(id) {
  const user = await requireDesk();
  if (!user) return { ok: false, error: "auth" };
  const a = await loadAmendment(str(id, 40));
  if (!a) return { ok: false, error: "notfound" };
  if (!a.testOnly) return { ok: false, error: "real" };
  const urls = [a.dsnPdfUrl, a.staffSignatureUrl, a.clientSignatureUrl, a.pdfUrl].filter((u) => /^https?:\/\//.test(String(u || "")));
  await prisma.clockAmendment.delete({ where: { id: a.id } });
  if (urls.length) {
    try { await delBlob(urls); } catch (e) { console.error("clock amendment: rehearsal files not removed:", e); }
  }
  revalidatePath(QUEUE);
  return { ok: true };
}

// A REHEARSAL CAN BE AIMED AT ANYONE, AND RUN AGAIN. a rehearsal exists to
// show the flow: the form goes to whoever is being shown it, for real rather
// than redirected to the raiser, and a reset puts the row back to the moment
// it was raised so the next person can run it. only ever a rehearsal: a real
// amendment's recipient was the office's choice when it was raised, and its
// record is never cleared.
export async function sendRehearsalTo(id, payload) {
  const user = await requireDesk();
  if (!user) return { ok: false, error: "auth" };
  const a = await loadAmendment(str(id, 40));
  if (!a) return { ok: false, error: "notfound" };
  if (!a.testOnly) return { ok: false, error: "real" };
  if (a.approvedAt) return { ok: false, error: "approved" };

  // a roster person signs as themselves; a typed address only gets the link
  const recipientId = str(payload?.recipientId, 40);
  const typed = str(payload?.email, 200);
  let recipient = null;
  if (recipientId) {
    recipient = await prisma.user.findFirst({
      where: { id: recipientId, deactivatedAt: null },
      select: { id: true, name: true, email: true, preferredFirstName: true, preferredLastName: true },
    });
    if (!recipient?.email) return { ok: false, error: "who" };
  } else if (!typed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typed)) {
    return { ok: false, error: "email" };
  }
  const intendedEmail = recipient ? recipient.email : typed;
  const recipientName = recipient ? shownName(recipient) : shownName(a.recipient);

  const base = process.env.AUTH_URL || "https://www.mylifeservicesinc.com";
  const sent = await sendAmendmentForm({
    intendedEmail,
    // the point of a demo is that it reaches the person being shown it
    forceTo: null,
    isResend: false,
    recipientName,
    staffName: shownName(a.staff),
    clientName: firstLast(a.clientName),
    service: a.service,
    date: a.shiftDate,
    scheduled: a.scheduledIn && a.scheduledOut ? `${a.scheduledIn} to ${a.scheduledOut}` : null,
    missing: `The clock shows they ${missingPunchText(a)}.`,
    officeNote: null,
    formUrl: `${base}/ca/${signAmendmentToken(a.id)}`,
  });
  if (!sent.ok) return { ok: false, error: sent.error };
  await prisma.clockAmendment.update({
    where: { id: a.id },
    data: {
      ...(recipient ? { recipientId: recipient.id } : {}),
      sentAt: new Date(), sentToEmail: sent.sentTo, intendedEmail,
    },
  });
  revalidatePath(QUEUE);
  revalidatePath(`${QUEUE}/${a.id}`);
  return { ok: true, sentTo: sent.sentTo, redirected: !!sent.redirected, to: recipientName };
}

// back to the moment it was raised: both signatures, the code, the client
// half, the approval and the document gone; what the office took down, the
// note and its pages kept
export async function resetRehearsal(id) {
  const user = await requireDesk();
  if (!user) return { ok: false, error: "auth" };
  const a = await loadAmendment(str(id, 40));
  if (!a) return { ok: false, error: "notfound" };
  if (!a.testOnly) return { ok: false, error: "real" };
  const urls = [a.staffSignatureUrl, a.clientSignatureUrl, a.pdfUrl].filter((u) => /^https?:\/\//.test(String(u || "")));
  await prisma.clockAmendment.update({
    where: { id: a.id },
    data: {
      reasonText: null, reasonCode: null, actualIn: null, actualOut: null, placeIn: null, placeOut: null,
      filledName: null, filledAt: null, filledIp: null, filledUa: null, filledDevice: null, staffSignatureUrl: null,
      clientSigner: null, clientSignerKind: null, clientSignedAt: null, clientSignedIp: null, clientSignedUa: null,
      clientSignedDevice: null, clientSignedVia: null, clientSignatureUrl: null, clientUnavailableReason: null,
      clientCode: null, clientCodeExpiresAt: null, clientLinkEmail: null, clientLinkEmailedAt: null,
      approvedAt: null, approvedById: null, approvalNote: null, qspFixedAt: null, qspFixedIn: null, qspFixedTo: null, qspFixedBy: null,
      pdfUrl: null, pdfHash: null, mailedAt: null, chasedAt: null, chaseCount: 0,
    },
  });
  if (urls.length) {
    try { await delBlob(urls); } catch (e) { console.error("clock amendment: rehearsal files not removed on reset:", e); }
  }
  revalidatePath(QUEUE);
  revalidatePath(`${QUEUE}/${a.id}`);
  return { ok: true };
}
