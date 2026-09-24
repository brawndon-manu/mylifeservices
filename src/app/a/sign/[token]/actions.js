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
import { announcementLinkOpen } from "@/lib/link-life";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAckToken } from "@/lib/ack-token";
import { checkRateLimit } from "@/lib/security";
import { preferredName } from "@/lib/contacts";
import { formEmailRoute } from "@/lib/forms";
import { signFormIds } from "@/lib/announcement-sign";
import { resolveRecipient, resolveDefaultRecipient, routeCcList } from "@/lib/form-recipients";
import { sendFilledForm, buildCc } from "@/lib/form-send";
import { deliverClientRecordForm } from "@/lib/form-deliver";
import { storeFormSubmission } from "@/lib/form-store";

// `token` is bound by the page (submitSignedByToken.bind(null, token)) - an
// inline closure in a server component is not a server action and cannot be
// handed to a client component.
export async function submitSignedByToken(token, { pdfBase64, pdfName, message, recipientId, formId }) {
  const parsed = verifyAckToken(token);
  if (!parsed) return { ok: false, error: "auth" };
  if (!(await announcementLinkOpen(parsed.announcementId, parsed.userId))) return { ok: false, error: "expired" };

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  // signed link or not, this endpoint sends mail without a session
  const { ok: underLimit } = await checkRateLimit(`acksign:${ip}`);
  if (!underLimit) return { ok: false, error: "rate" };

  const [post, user] = await Promise.all([
    prisma.announcement.findUnique({
      where: { id: parsed.announcementId },
      select: {
        id: true, requireAck: true, deletedAt: true, formId: true, extraFormIds: true,
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

  // WHICH OF THE POST'S FORMS THIS IS. A post can ask for several now
  // (announcement-sign.js); the page names the one it built, and it has to be
  // one the post actually asks for. No name - an older page still open
  // somewhere - means the first, exactly as before.
  const ids = signFormIds(post);
  const targetId = typeof formId === "string" && ids.includes(formId) ? formId : post.form.id;
  const form =
    targetId === post.form.id
      ? post.form
      : await prisma.form.findUnique({
          where: { id: targetId },
          select: { id: true, title: true, fillable: true },
        });
  if (!form?.fillable) return { ok: false, error: "auth" };

  const route = formEmailRoute(form.title);
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
  const send = {
    route,
    formTitle: form.title,
    recipientEmail: recipient.email,
    ccEmails: buildCc(await routeCcList(route), user.email, recipient.email),
    submitterName: name,
    submitterEmail: user.email,
    replyTo: user.email,
    message,
    pdfBase64,
    pdfName,
  };
  // a form about a person served is stored first and emailed as a link
  if (route.clientRecord) {
    const r = await deliverClientRecordForm({
      send,
      store: { formId: form.id, userId: user.id, attribution: "signed-in", announcementId: post.id, ip },
    });
    if (!r.stored) return { ok: false, error: r.error || "send" };
    return { ok: true, emailed: !!r.ok, stored: true };
  }
  const result = await sendFilledForm(send);

  // STORED EVEN IF THE MAIL FAILS. Everywhere else keeps the copy only when the
  // email went, which quietly discards a good signature on a Resend hiccup. A
  // signature is the thing being collected here; losing it because a mail server
  // was briefly unhappy is the wrong trade.
  let stored = null;
  try {
    stored = await storeFormSubmission({
      formId: form.id,
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

// THE OPEN, RECORDED FROM THE BROWSER AND ONLY FROM THE BROWSER.
//
// The emailed button used to write this on its way past. Now the email lands on
// the document itself, and this page deliberately records nothing on load: mail
// scanners fetch every link in a message, so a server-side write here would mark
// the whole audience as having looked at a document none of them opened. That is
// the rule the ack page's own header sets, and it stands.
//
// So the client calls this once the document has actually rendered - see
// FormFiller. A scanner does not run JavaScript, so it cannot reach this, and
// what gets recorded is stronger than the old press was: the pages were drawn on
// a real screen, not a button was clicked on the way to them.
//
// It is the SAME row the portal's own view writes (Mánu 2026-09-08, "just let us
// know if someone has opened it in the portal"), so the roster's Opened column
// covers both doors again. Signing writes it too, through storeFormSubmission,
// and the write is an upsert - the first one wins and the timestamp is the
// earliest look, which is what an Opened column should say.
export async function recordOpenedByToken(token) {
  const parsed = verifyAckToken(String(token || ""));
  if (!parsed) return { ok: false };
  if (!(await announcementLinkOpen(parsed.announcementId, parsed.userId))) return { ok: false };

  const [post, user] = await Promise.all([
    prisma.announcement.findUnique({
      where: { id: parsed.announcementId },
      select: { id: true, requireAck: true, deletedAt: true, formId: true },
    }),
    prisma.user.findUnique({
      where: { id: parsed.userId },
      select: { id: true, deactivatedAt: true },
    }),
  ]);
  // only a live, form-backed post that actually asks for an acknowledgment, and
  // only for an account that still exists. Anything else records nothing rather
  // than guessing.
  if (!post || post.deletedAt || !post.requireAck || !post.formId) return { ok: false };
  if (!user || user.deactivatedAt) return { ok: false };

  const { recordAnnouncementAck } = await import("@/lib/announcement-ack");
  await recordAnnouncementAck({ announcementId: post.id, userId: user.id, viaEmail: true });
  return { ok: true };
}
