"use server";

import { headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hasBlobStorage, putBlob } from "@/lib/blob";
import { verifyAmendmentToken } from "@/lib/clock-amendment/token";
import { isSignerKind, signerIsPresent, asksStart, asksEnd } from "@/lib/clock-amendment/rules";
import { tidyTime, anchorOf, isTime } from "@/lib/clock-amendment/typed-time";

// THE TWO SIGNATURES, COLLECTED ON THE PHONE THE LINK WAS OPENED ON.
//
// the token is the credential: it names exactly one amendment, and these
// actions do nothing a page without it could not see. neither step can run on
// an approved amendment - an approved one is a document somebody put their
// name to.

async function callerIp() {
  const h = await headers();
  return (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || null;
}

// a drawn signature arrives as a png data url from the pad. stored as a file
// where there is a store, and inline where there is not, so a laptop with no
// blob token can still run the whole flow
async function storeSignature(id, which, dataUrl) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!m) return null;
  const bytes = Buffer.from(m[1], "base64");
  if (bytes.length < 200 || bytes.length > 400_000) return null;
  if (!hasBlobStorage()) return dataUrl;
  try {
    const blob = await putBlob(`clock-amendments/${id}/${randomBytes(6).toString("hex")}-${which}-signature.png`, bytes, {
      access: "public",
      contentType: "image/png",
    });
    return blob.url;
  } catch (e) {
    console.error("clock amendment: signature not stored:", e);
    return dataUrl;
  }
}

async function open(token) {
  const id = verifyAmendmentToken(token);
  if (!id) return null;
  return prisma.clockAmendment.findUnique({
    where: { id },
    select: {
      id: true, filledAt: true, approvedAt: true, clientSignedAt: true, clientUnavailableReason: true,
      clockedIn: true, clockedOut: true, scheduledIn: true, scheduledOut: true, clockRow: true,
      recipient: { select: { name: true, preferredFirstName: true, preferredLastName: true } },
    },
  });
}

const str = (v, max = 300) => String(v ?? "").trim().slice(0, max) || null;

// STEP ONE: the person asked confirms or corrects what the office took down,
// and signs. their answers go in the confirmed columns; the intake stays as it
// was, so the document can show a correction.
export async function confirmAndSign(token, payload) {
  const a = await open(token);
  if (!a) return { ok: false, error: "notfound" };
  if (a.approvedAt) return { ok: false, error: "approved" };
  if (a.filledAt) return { ok: false, error: "signed" };

  // their own account of what happened, in their words. the whole point.
  const reasonText = str(payload?.reasonText, 2000);
  if (!reasonText) return { ok: false, error: "reason" };
  // the times, read the same way the box reads them so what they saw after
  // clicking off is what gets signed
  const actualIn = str(payload?.actualIn, 12) ? tidyTime(str(payload?.actualIn, 12), anchorOf(a.scheduledIn)) : null;
  const actualOut = str(payload?.actualOut, 12) ? tidyTime(str(payload?.actualOut, 12), anchorOf(a.scheduledOut)) : null;
  if (asksEnd(a) && !actualOut) return { ok: false, error: "times" };
  if (asksStart(a) && !actualIn) return { ok: false, error: "times" };
  if ((actualIn && !isTime(actualIn)) || (actualOut && !isTime(actualOut))) return { ok: false, error: "times" };
  const signedName = str(payload?.signedName, 120);
  if (!signedName) return { ok: false, error: "name" };
  if (payload?.attested !== true) return { ok: false, error: "attest" };

  const signatureUrl = await storeSignature(a.id, "staff", payload?.signaturePng);
  if (!signatureUrl) return { ok: false, error: "signature" };

  await prisma.clockAmendment.update({
    where: { id: a.id },
    data: {
      reasonText, actualIn, actualOut,
      filledName: signedName,
      filledAt: new Date(),
      filledIp: await callerIp(),
      staffSignatureUrl: signatureUrl,
    },
  });
  return { ok: true };
}

// STEP TWO: the person served signs on the same phone, or the form says
// honestly that nobody could.
export async function clientSign(token, payload) {
  const a = await open(token);
  if (!a) return { ok: false, error: "notfound" };
  if (a.approvedAt) return { ok: false, error: "approved" };
  if (!a.filledAt) return { ok: false, error: "unsigned" };
  if (a.clientSignedAt || a.clientUnavailableReason) return { ok: false, error: "done" };

  const kind = str(payload?.signerKind, 20);
  if (!isSignerKind(kind)) return { ok: false, error: "kind" };

  if (!signerIsPresent(kind)) {
    const why = str(payload?.unavailableReason, 500);
    if (!why) return { ok: false, error: "why" };
    await prisma.clockAmendment.update({
      where: { id: a.id },
      data: { clientSignerKind: kind, clientUnavailableReason: why },
    });
    return { ok: true, unavailable: true };
  }

  const signer = str(payload?.signerName, 120);
  if (!signer) return { ok: false, error: "name" };
  const signatureUrl = await storeSignature(a.id, "client", payload?.signaturePng);
  if (!signatureUrl) return { ok: false, error: "signature" };

  await prisma.clockAmendment.update({
    where: { id: a.id },
    data: {
      clientSigner: signer,
      clientSignerKind: kind,
      clientSignedAt: new Date(),
      clientSignedIp: await callerIp(),
      clientSignatureUrl: signatureUrl,
    },
  });
  return { ok: true };
}
