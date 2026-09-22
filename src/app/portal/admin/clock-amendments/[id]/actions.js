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
  // a date box gives yyyy-mm-dd; noon so the day survives any timezone
  const qspFixedAt = fixedDay && /^\d{4}-\d{2}-\d{2}$/.test(fixedDay) ? new Date(`${fixedDay}T12:00:00`) : null;
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
        access: "public",
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

  const sent = await sendAmendmentDocument({
    intendedEmails: [...officeRecipients(), a.staff?.email],
    forceTo: a.testOnly ? user.email : null,
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
    forceTo: a.testOnly ? user.email : null,
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
