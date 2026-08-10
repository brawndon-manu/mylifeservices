"use server";

// no-login submit for a form shared via its public /f/<id> link. the person isn't
// signed in, so they type their name + email (the email becomes reply-to so the
// supervisor can write back and match them). rate-limited by ip since this is a
// public endpoint that sends mail. the filled PDF is built in the browser and
// handed here as base64 - nothing is stored.
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { cleanEmail, cleanDisplayName, checkRateLimit } from "@/lib/security";
import { formEmailRoute } from "@/lib/forms";
import { resolveRecipient } from "@/lib/form-recipients";
import { sendFilledForm, buildCc } from "@/lib/form-send";
import { storeFormSubmission } from "@/lib/form-store";

export async function submitPublicFormByEmail({
  formId,
  employeeName,
  employeeEmail,
  message,
  pdfBase64,
  pdfName,
  recipientId,
  announcementId,
}) {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { ok: underLimit } = await checkRateLimit(`formshare:${ip}`);
  if (!underLimit) return { ok: false, error: "rate" };

  const name = cleanDisplayName(employeeName, 80);
  const email = cleanEmail(employeeEmail);
  if (!name || !email) return { ok: false, error: "info" };

  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: { id: true, title: true, fillable: true },
  });
  if (!form || !form.fillable) return { ok: false, error: "norecipients" };

  // the announcement this signature is meant to acknowledge, re-derived rather
  // than trusted: real, still asking for an ack, and pointing at THIS form.
  // Same check the logged-in path makes.
  let validAnnouncementId = null;
  if (typeof announcementId === "string" && announcementId) {
    const a = await prisma.announcement.findUnique({
      where: { id: announcementId },
      select: { formId: true, requireAck: true, deletedAt: true },
    });
    if (a && !a.deletedAt && a.requireAck && a.formId === form.id) {
      validAnnouncementId = announcementId;
    }
  }

  const route = formEmailRoute(form.title);
  if (!route || !route.recipientTitle) return { ok: false, error: "norecipients" };

  const recipient = await resolveRecipient(route.recipientTitle, recipientId);
  if (!recipient) return { ok: false, error: "norecipient" };

  const result = await sendFilledForm({
    route,
    formTitle: form.title,
    recipientEmail: recipient.email,
    ccEmails: buildCc(route.cc, email, recipient.email),
    submitterName: name,
    submitterEmail: email,
    replyTo: email,
    message,
    pdfBase64,
    pdfName,
  });

  // best-effort: store a copy for the forms admin panel + retention. no login, so
  // it lands unassigned - reconciled later by email-match or a manual assign. the
  // typed name/email + ip are what the admin panel matches on. never let a storage
  // hiccup fail a submission that already emailed.
  if (result?.ok) {
    try {
      await storeFormSubmission({
        formId: form.id,
        pdfBase64,
        pdfName,
        submitterName: name,
        submitterEmail: email,
        attribution: "unassigned",
        // WITHOUT THIS the ack is never written - not now, and not later when
        // an admin assigns the submission, because assignFormSubmission reads
        // the announcement off the row it is assigning.
        announcementId: validAnnouncementId,
        ip,
      });
    } catch (e) {
      console.error("public form submission store failed (email already sent):", e);
    }
  }

  return result;
}
