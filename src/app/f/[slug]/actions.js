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

export async function submitPublicFormByEmail({
  formId,
  employeeName,
  employeeEmail,
  message,
  pdfBase64,
  pdfName,
  recipientId,
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

  const route = formEmailRoute(form.title);
  if (!route || !route.recipientTitle) return { ok: false, error: "norecipients" };

  const recipient = await resolveRecipient(route.recipientTitle, recipientId);
  if (!recipient) return { ok: false, error: "norecipient" };

  return sendFilledForm({
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
}
