"use server";

// FILING A SIGNED CLIENT ATTESTATION FROM THE EMAILED LINK, without a login.
//
// The token is the credential - an HMAC over the attestation id AND the
// audience the link was cut for - and it unlocks exactly this one document.
// Sibling of /a/attest: the row IS the record, and a stage that is already on
// file refuses to be filed again.
//
// TWO STAGES, BY AUDIENCE. A client or staff link files the CLIENT'S HALF: the
// partly-signed PDF lands in clientSignedPdfUrl, the supervisor's fields stay
// live inside it, and the form routes itself to the field supervisor. The
// supervisor link files the whole thing - that is the copy that counts as
// signed everywhere else in the portal.
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAttestationToken, signAttestationToken } from "@/lib/client-attestations/token";
import { checkRateLimit } from "@/lib/security";
import { hasBlobStorage, putBlob } from "@/lib/blob";
import { randomBytes } from "node:crypto";
import { sendAttestation } from "@/lib/client-attestations/send";
import { formFileName } from "@/lib/client-attestations/serve";
import { preferredName } from "@/lib/contacts";
import { attestationLiveSend } from "@/lib/timesheet-mode";

function baseUrl() {
  return (
    process.env.AUTH_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000")
  );
}

export async function submitSignedScheduleByToken(token, { pdfBase64, employeeName }) {
  const parsed = verifyAttestationToken(token);
  if (!parsed) return { ok: false, error: "auth" };

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  // no session behind this, so it is rate limited like the other token routes
  const { ok: underLimit } = await checkRateLimit(`schedule-sign:${ip}`);
  if (!underLimit) return { ok: false, error: "rate" };

  const row = await prisma.clientAttestation.findUnique({
    where: { id: parsed.attestationId },
    select: {
      id: true,
      clientName: true,
      signedAt: true,
      clientSignedAt: true,
      formUrl: true,
      batch: { select: { id: true, monthLabel: true } },
      supervisor: {
        select: { email: true, name: true, preferredFirstName: true, preferredLastName: true },
      },
    },
  });
  if (!row || !row.formUrl) return { ok: false, error: "gone" };
  // SIGNED IS FINAL, at either stage: a second submission through a forwarded
  // link must not overwrite the copy already on file.
  if (row.signedAt) return { ok: false, error: "signed" };
  const clientStage = parsed.audience !== "supervisor";
  if (clientStage && row.clientSignedAt) return { ok: false, error: "signed" };

  if (!pdfBase64 || typeof pdfBase64 !== "string") return { ok: false, error: "nopdf" };
  // the generated forms run ~40KB; a signature and the field text add little.
  // Same ceiling the timesheet signer uses.
  if (pdfBase64.length > 15 * 1024 * 1024 * 1.4) return { ok: false, error: "toobig" };
  if (!hasBlobStorage()) return { ok: false, error: "storage" };

  let stored;
  try {
    stored = await putBlob(
      `client-attestations/${clientStage ? "partial" : "signed"}/${randomBytes(12).toString("hex")}.pdf`,
      Buffer.from(pdfBase64, "base64"),
      { access: "public", contentType: "application/pdf" },
    );
  } catch (e) {
    console.error("signed attestation store failed:", e?.message || e);
    return { ok: false, error: "storage" };
  }

  // the guards above are advisory; this conditional write is the real gate, so
  // two tabs racing cannot both file a copy.
  const updated = clientStage
    ? await prisma.clientAttestation.updateMany({
        where: { id: row.id, clientSignedAt: null, signedAt: null },
        data: {
          clientSignedAt: new Date(),
          clientSignedPdfUrl: stored.url,
          clientSignedIp: ip,
          clientSignedVia: parsed.audience,
        },
      })
    : await prisma.clientAttestation.updateMany({
        where: { id: row.id, signedAt: null },
        data: {
          signedAt: new Date(),
          signedPdfUrl: stored.url,
          signedName: (employeeName || "").trim().slice(0, 120) || null,
          signedIp: ip,
          signedVia: "portal",
        },
      });
  if (updated.count === 0) return { ok: false, error: "signed" };

  // THE CLIENT'S HALF ROUTES ITSELF ONWARD. The remaining fields are the field
  // supervisor's, so when one is assigned with an email, the partly-signed form
  // goes to them without anybody pressing a second send. Guarded like every
  // send: off the live deployment, or without the live phrase, it reaches only
  // the test inbox. A send failure never takes the filing with it - the
  // signature is already on record, and the review screen still shows who has
  // not been sent to.
  if (clientStage && row.supervisor?.email) {
    try {
      const result = await sendAttestation({
        intendedEmail: row.supervisor.email,
        recipientName: preferredName(row.supervisor),
        kind: "supervisor",
        clientName: row.clientName,
        monthLabel: row.batch.monthLabel,
        signUrl: `${baseUrl()}/a/schedule/${signAttestationToken(row.id, "supervisor")}`,
        pdf: Buffer.from(pdfBase64, "base64"),
        pdfName: formFileName(row.clientName, row.batch.monthLabel),
      });
      if (result.ok) {
        await prisma.clientAttestation.update({
          where: { id: row.id },
          data: {
            sentAt: new Date(),
            sentToEmail: result.to[0],
            intendedEmail: result.intendedEmail,
            sentToKind: "supervisor",
          },
        });
        await prisma.clientAttestationBatch.update({
          where: { id: row.batch.id },
          data: { testMode: !attestationLiveSend() },
        });
      }
    } catch (e) {
      console.error("supervisor forward failed:", e?.message || e);
    }
  }

  return { ok: true };
}
