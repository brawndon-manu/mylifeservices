"use server";

// Signing a form from an announcement's emailed link, WITHOUT needing a login.
//
// Mánu 2026-08-10: "review and sign its own page - if they are signed in then
// good, it stores their email and name, and if they are not..." The token in the
// link already proves who they are, so there is nothing for them to type and
// nothing to guess: the submission is attributed to that account outright.
//
// The public /f/<slug> path stays as it is, for genuinely anonymous shares. It
// asks for a name and a work email and reconciles by matching the address, which
// is tagged `email-match` precisely because a typed address is not proof of
// identity. Here we have proof, so we use it.
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAckToken } from "@/lib/ack-token";
import { checkRateLimit } from "@/lib/security";
import { preferredName } from "@/lib/contacts";
import { formEmailRoute } from "@/lib/forms";
import { resolveRecipient, resolveDefaultRecipient, routeCcList } from "@/lib/form-recipients";
import { sendFilledForm, buildCc } from "@/lib/form-send";
import { storeFormSubmission } from "@/lib/form-store";

// `token` is bound by the page (submitSignedByToken.bind(null, token)) - an
// inline closure in a server component is not a server action and cannot be
// handed to a client component.
export async function submitSignedByToken(token, { pdfBase64, pdfName, message, recipientId }) {
  const parsed = verifyAckToken(token);
  if (!parsed) return { ok: false, error: "auth" };

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  // signed link or not, this endpoint sends mail without a session
  const { ok: underLimit } = await checkRateLimit(`acksign:${ip}`);
  if (!underLimit) return { ok: false, error: "rate" };

  const [post, user] = await Promise.all([
    prisma.announcement.findUnique({
      where: { id: parsed.announcementId },
      select: {
        id: true, requireAck: true, deletedAt: true, formId: true,
        form: { select: { id: true, title: true, fillable: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: parsed.userId },
      select: {
        id: true, email: true, name: true,
        preferredFirstName: true, preferredLastName: true, deactivatedAt: true,
      },
    }),
  ]);
  if (!post || post.deletedAt || !post.requireAck || !post.form?.fillable) {
    return { ok: false, error: "auth" };
  }
  if (!user || user.deactivatedAt) return { ok: false, error: "auth" };
  if (typeof pdfBase64 !== "string" || pdfBase64.length < 100) return { ok: false, error: "nofile" };

  const route = formEmailRoute(post.form.title);
  if (!route?.recipientTitle) return { ok: false, error: "norecipients" };
  // NOBODY PICKS A RECIPIENT HERE. Sign mode has no dropdown - the signed
  // document goes back to whoever holds the route's title - so `recipientId`
  // arrives undefined every time and this used to refuse the submission
  // outright. It still honours an explicit id if one is ever sent, so the
  // client cannot widen who it reaches, only re-state it.
  const recipient =
    (await resolveRecipient(route.recipientTitle, recipientId)) ||
    (await resolveDefaultRecipient(route.recipientTitle));
  if (!recipient) return { ok: false, error: "norecipient" };

  const name = preferredName(user) || user.name || "Staff";
  const result = await sendFilledForm({
    route,
    formTitle: post.form.title,
    recipientEmail: recipient.email,
    ccEmails: buildCc(await routeCcList(route), user.email, recipient.email),
    submitterName: name,
    submitterEmail: user.email,
    replyTo: user.email,
    message,
    pdfBase64,
    pdfName,
  });

  // STORED EVEN IF THE MAIL FAILS. Everywhere else keeps the copy only when the
  // email went, which quietly discards a good signature on a Resend hiccup. A
  // signature is the thing being collected here; losing it because a mail server
  // was briefly unhappy is the wrong trade.
  let stored = null;
  try {
    stored = await storeFormSubmission({
      formId: post.form.id,
      pdfBase64,
      pdfName,
      submitterName: name,
      submitterEmail: user.email,
      // the token IS the proof of who this is - no typing, no email matching
      userId: user.id,
      attribution: "signed-in",
      announcementId: post.id,
      ip,
    });
  } catch (e) {
    console.error("signed form store failed:", e);
  }

  if (!result?.ok && !stored) return { ok: false, error: result?.error || "send" };
  return { ok: true, emailed: !!result?.ok, stored: !!stored };
}
