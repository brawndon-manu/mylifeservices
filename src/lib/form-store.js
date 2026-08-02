import { put } from "@vercel/blob";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { recordAnnouncementAck } from "@/lib/announcement-ack";

// store a completed form submission: the signed PDF goes to Blob under a random,
// unguessable key (Blob is a public store, so it's streamed back through a gated
// route, never linked to the browser), and a FormSubmission row records who / when
// for the forms admin panel + retention.
//
// a no-login submit that comes in "unassigned" gets one auto-reconciliation pass
// here: if the typed email matches an active staff account, attribute it to them
// as "email-match" (tagged so HR can still eyeball it - a typed email isn't proof
// of identity). a signed-in submit already knows who it is and skips this.
//
// callers wrap this in try/catch: storage must NEVER break a submission that has
// already emailed. if there's no Blob token (or before the migration lands) it
// just skips, and the form still sends.
export async function storeFormSubmission({
  formId,
  pdfBase64,
  pdfName,
  submitterName,
  submitterEmail,
  userId = null,
  attribution = "unassigned",
  announcementId = null,
  ip = null,
}) {
  if (!pdfBase64 || !process.env.BLOB_READ_WRITE_TOKEN) return null;

  let resolvedUserId = userId;
  let resolvedAttribution = attribution;
  if (!resolvedUserId && attribution === "unassigned" && submitterEmail) {
    const match = await prisma.user.findFirst({
      where: { email: { equals: submitterEmail, mode: "insensitive" }, deactivatedAt: null },
      select: { id: true },
    });
    if (match) {
      resolvedUserId = match.id;
      resolvedAttribution = "email-match";
    }
  }

  const buffer = Buffer.from(pdfBase64, "base64");
  const key = `form-submissions/${randomBytes(12).toString("hex")}.pdf`;
  const blob = await put(key, buffer, {
    access: "public",
    contentType: "application/pdf",
  });

  const submission = await prisma.formSubmission.create({
    data: {
      formId,
      pdfUrl: blob.url,
      pdfName: pdfName || null,
      submitterName,
      submitterEmail,
      userId: resolvedUserId,
      attribution: resolvedAttribution,
      announcementId,
      ip,
    },
  });

  // this submission fulfills an announcement's acknowledgment - and we already
  // know who it's for, so write the same ack row the checkbox/email-link path
  // does. a manual assign later (still unresolved here) writes it then instead.
  if (resolvedUserId && announcementId) {
    await recordAnnouncementAck({ announcementId, userId: resolvedUserId });
  }

  return submission;
}
