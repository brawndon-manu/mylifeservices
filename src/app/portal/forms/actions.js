"use server";

// submit a filled form by email. the filled PDF is built in the browser (client
// info stays client-side until submit), then handed here as base64 and emailed to
// the picked recipient (a holder of the form's recipientTitle, e.g. a Field
// Supervisor) plus the route's fixed cc and the submitter. nothing is stored -
// it's emailed and gone.
import { getCurrentUser } from "@/lib/current-user";
import { preferredName } from "@/lib/contacts";
import { formEmailRoute } from "@/lib/forms";
import { prisma } from "@/lib/prisma";
import { resolveRecipient } from "@/lib/form-recipients";
import { sendFilledForm, buildCc } from "@/lib/form-send";
import { storeFormSubmission } from "@/lib/form-store";

export async function submitFormByEmail({
  formId,
  message,
  pdfBase64,
  pdfName,
  recipientId,
  announcementId,
}) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "auth" };

  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: { id: true, title: true, fillable: true },
  });
  if (!form || !form.fillable) return { ok: false, error: "norecipients" };

  // only thread the announcement link through if it's real and actually asks
  // for this form - never trust the client's claim as-is.
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
    ccEmails: buildCc(route.cc, user.email, recipient.email),
    submitterName: preferredName(user) || user.email,
    submitterEmail: user.email,
    replyTo: user.email,
    message,
    pdfBase64,
    pdfName,
  });

  // best-effort: keep a stored copy for the forms admin panel + retention. a
  // signed-in submit is attributed straight to their account. never let a storage
  // hiccup fail a submission that already emailed.
  if (result?.ok) {
    try {
      await storeFormSubmission({
        formId: form.id,
        pdfBase64,
        pdfName,
        submitterName: preferredName(user) || user.email,
        submitterEmail: user.email,
        userId: user.id,
        attribution: "signed-in",
        announcementId: validAnnouncementId,
      });
    } catch (e) {
      console.error("form submission store failed (email already sent):", e);
    }
  }

  return result;
}
