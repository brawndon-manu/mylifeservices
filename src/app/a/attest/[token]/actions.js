"use server";

// Signing the post-meeting attestation from the emailed link, without a login.
//
// The same signed token as /a/ack and /a/sign - announcementId + userId, HMAC'd
// with AUTH_SECRET - so there is nothing to type and nothing to guess. What is
// different here is the DESTINATION: an acknowledgment form is completed by
// sending it to a review team, which is why /a/sign refuses a form with no email
// route. An attestation is not sent anywhere. It is filed against the meeting,
// and the FormSubmission row IS the record. So no route, no recipient, no cc.
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAckToken } from "@/lib/ack-token";
import { checkRateLimit } from "@/lib/security";
import { preferredName } from "@/lib/contacts";
import { storeFormSubmission } from "@/lib/form-store";

export async function submitAttestationByToken(token, { pdfBase64, pdfName }) {
  const parsed = verifyAckToken(token);
  if (!parsed) return { ok: false, error: "auth" };

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  // no session behind this, so it is rate limited like the other token routes
  const { ok: underLimit } = await checkRateLimit(`attest:${ip}`);
  if (!underLimit) return { ok: false, error: "rate" };

  const [post, user] = await Promise.all([
    prisma.announcement.findUnique({
      where: { id: parsed.announcementId },
      select: {
        id: true,
        deletedAt: true,
        meetingConcludedAt: true,
        meetingAttestationForm: { select: { id: true, fillable: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: parsed.userId },
      select: { id: true, email: true, name: true, preferredFirstName: true, preferredLastName: true, deactivatedAt: true },
    }),
  ]);
  // the link only works once the meeting has actually been concluded - that is
  // the moment these were sent, and a token minted for an earlier draft of the
  // meeting should not open a document nobody has been asked for yet.
  if (!post || post.deletedAt || !post.meetingConcludedAt) return { ok: false, error: "auth" };
  if (!post.meetingAttestationForm?.fillable) return { ok: false, error: "auth" };
  if (!user || user.deactivatedAt) return { ok: false, error: "auth" };
  if (typeof pdfBase64 !== "string" || pdfBase64.length < 100) return { ok: false, error: "nofile" };

  const name = preferredName(user) || user.name || "Staff";
  let stored = null;
  try {
    stored = await storeFormSubmission({
      formId: post.meetingAttestationForm.id,
      pdfBase64,
      pdfName,
      submitterName: name,
      submitterEmail: user.email,
      // the token is the proof of identity, same as /a/sign
      userId: user.id,
      attribution: "signed-in",
      announcementId: post.id,
      ip,
    });
  } catch (e) {
    console.error("attestation store failed:", e);
    return { ok: false, error: "store" };
  }
  return { ok: true, stored: !!stored, emailed: false };
}
