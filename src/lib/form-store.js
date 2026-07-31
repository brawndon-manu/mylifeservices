import { put } from "@vercel/blob";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

// store a completed form submission: the signed PDF goes to Blob under a random,
// unguessable key (Blob is a public store, so it's streamed back through a gated
// route, never linked to the browser), and a FormSubmission row records who / when
// for the forms admin panel + retention.
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

  const buffer = Buffer.from(pdfBase64, "base64");
  const key = `form-submissions/${randomBytes(12).toString("hex")}.pdf`;
  const blob = await put(key, buffer, {
    access: "public",
    contentType: "application/pdf",
  });

  return prisma.formSubmission.create({
    data: {
      formId,
      pdfUrl: blob.url,
      pdfName: pdfName || null,
      submitterName,
      submitterEmail,
      userId,
      attribution,
      announcementId,
      ip,
    },
  });
}
