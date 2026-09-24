"use server";

import { headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hasBlobStorage, putBlob } from "@/lib/blob";
import { normalizeCode, codeExpired } from "@/lib/clock-amendment/client-code";
import { isSignerKind, signerIsPresent } from "@/lib/clock-amendment/rules";

// THE PERSON SERVED SIGNS ON THEIR OWN PHONE. the code is the credential and
// it opens exactly one amendment's client half; this does nothing the page
// without it could not see, and never touches the staff member's half.

async function callerIp() {
  const h = await headers();
  return (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || null;
}

async function callerUa() {
  const h = await headers();
  return String(h.get("user-agent") || "").slice(0, 300) || null;
}

const str = (v, max = 300) => String(v ?? "").trim().slice(0, max) || null;

const deviceOf = (payload) => {
  const v = String(payload?.deviceId || "").trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null;
};

// the same storing rule as the staff half: a file where there is a store,
// inline where there is not
async function storeSignature(id, dataUrl) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!m) return null;
  const bytes = Buffer.from(m[1], "base64");
  if (bytes.length < 200 || bytes.length > 400_000) return null;
  if (!hasBlobStorage()) return dataUrl;
  try {
    const blob = await putBlob(`clock-amendments/${id}/${randomBytes(6).toString("hex")}-client-signature.png`, bytes, {
      contentType: "image/png",
    });
    return blob.url;
  } catch (e) {
    console.error("clock amendment: client signature not stored:", e);
    return dataUrl;
  }
}

export async function clientSignByCode(rawCode, payload) {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, error: "notfound" };
  const a = await prisma.clockAmendment.findUnique({
    where: { clientCode: code },
    select: { id: true, filledAt: true, approvedAt: true, clientSignedAt: true, clientUnavailableReason: true, clientCodeExpiresAt: true, clientLinkEmailedAt: true },
  });
  if (!a) return { ok: false, error: "notfound" };
  if (a.approvedAt) return { ok: false, error: "approved" };
  if (!a.filledAt) return { ok: false, error: "unsigned" };
  if (a.clientSignedAt || a.clientUnavailableReason) return { ok: false, error: "done" };
  if (codeExpired(a.clientCodeExpiresAt)) return { ok: false, error: "expired" };

  // only somebody present signs here; "nobody was available" is the staff
  // member's to record, on their own screen
  const kind = str(payload?.signerKind, 20);
  if (!isSignerKind(kind) || !signerIsPresent(kind)) return { ok: false, error: "kind" };
  const signer = str(payload?.signerName, 120);
  if (!signer) return { ok: false, error: "name" };
  const signatureUrl = await storeSignature(a.id, payload?.signaturePng);
  if (!signatureUrl) return { ok: false, error: "signature" };

  await prisma.clockAmendment.update({
    where: { id: a.id },
    data: {
      clientSigner: signer,
      clientSignerKind: kind,
      clientSignedAt: new Date(),
      clientSignedIp: await callerIp(),
      clientSignedUa: await callerUa(),
      clientSignedDevice: deviceOf(payload),
      // from the emailed link when one was sent, otherwise the code scanned
      // or typed in the room: either way their own device
      clientSignedVia: a.clientLinkEmailedAt ? "email" : "own",
      clientSignatureUrl: signatureUrl,
    },
  });
  return { ok: true };
}
