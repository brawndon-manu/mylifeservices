"use server";

import { headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hasBlobStorage, putBlob } from "@/lib/blob";
import { verifyAmendmentToken } from "@/lib/clock-amendment/token";
import { isSignerKind, signerIsPresent, asksStart, asksEnd, asksPlace, firstLast, confirmedOf } from "@/lib/clock-amendment/rules";
import { tidyTime, anchorOf, isTime } from "@/lib/clock-amendment/typed-time";
import { codeFromBytes, codeExpiry, codeExpired, formatCode, CODE_LENGTH } from "@/lib/clock-amendment/client-code";
import { sendClientSignLink } from "@/lib/clock-amendment/email";
import { preferredName } from "@/lib/contacts";

// THE STAFF SIGNATURE, ON THE PHONE THE LINK WAS OPENED ON; THE CLIENT'S ON
// THEIR OWN. once the staff member has signed, a short code is minted for the
// person served to scan or type on their own phone (see /s/[code]). the
// hand-off on the staff member's phone stays as a fallback and says so.
//
// the token is the credential: it names exactly one amendment, and these
// actions do nothing a page without it could not see. neither step can run on
// an approved amendment - an approved one is a document somebody put their
// name to.

async function callerIp() {
  const h = await headers();
  return (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || null;
}

// the browser and device kind, beside the address: two phones on one Wi-Fi
// share an address, and this is what still tells them apart
async function callerUa() {
  const h = await headers();
  return String(h.get("user-agent") || "").slice(0, 300) || null;
}

// the id the page keeps in that phone's storage, when the page sent one
const deviceOf = (payload) => {
  const v = String(payload?.deviceId || "").trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null;
};

const BASE = () => process.env.AUTH_URL || "https://www.mylifeservicesinc.com";

// a fresh code for the client half, unique across the table, good until the
// end of the California day
async function mintClientCode(id) {
  for (let i = 0; i < 6; i++) {
    const code = codeFromBytes(randomBytes(CODE_LENGTH));
    try {
      await prisma.clockAmendment.update({ where: { id }, data: { clientCode: code, clientCodeExpiresAt: codeExpiry() } });
      return code;
    } catch (e) {
      // another row holds this code: draw again
      if (e?.code !== "P2002") throw e;
    }
  }
  return null;
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
      clientCode: true, clientCodeExpiresAt: true, clientName: true, shiftDate: true, testOnly: true, demo: true,
      actualIn: true, actualOut: true, intakeActualIn: true, intakeActualOut: true,
      recipient: { select: { name: true, preferredFirstName: true, preferredLastName: true } },
      staff: { select: { name: true, preferredFirstName: true, preferredLastName: true } },
      createdBy: { select: { email: true } },
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
  // where they were at a punch the clock holds no location for: theirs to say
  const place = asksPlace(a);
  const placeIn = place.in ? str(payload?.placeIn, 300) : null;
  const placeOut = place.out ? str(payload?.placeOut, 300) : null;
  if ((place.in && !placeIn) || (place.out && !placeOut)) return { ok: false, error: "place" };
  const signedName = str(payload?.signedName, 120);
  if (!signedName) return { ok: false, error: "name" };
  if (payload?.attested !== true) return { ok: false, error: "attest" };

  const signatureUrl = await storeSignature(a.id, "staff", payload?.signaturePng);
  if (!signatureUrl) return { ok: false, error: "signature" };

  await prisma.clockAmendment.update({
    where: { id: a.id },
    data: {
      reasonText, actualIn, actualOut, placeIn, placeOut,
      filledName: signedName,
      filledAt: new Date(),
      filledIp: await callerIp(),
      filledUa: await callerUa(),
      filledDevice: deviceOf(payload),
      staffSignatureUrl: signatureUrl,
    },
  });
  // the code the person served scans, minted the moment the staff half is in
  await mintClientCode(a.id);
  return { ok: true };
}

// WHERE THE CLIENT HALF STANDS, asked by the staff member's screen every few
// seconds while the code is showing, so it can say "signed" on its own
export async function clientHalfStatus(token) {
  const a = await open(token);
  if (!a) return { ok: false, error: "notfound" };
  return {
    ok: true,
    signed: !!a.clientSignedAt,
    unavailable: !!a.clientUnavailableReason,
    approved: !!a.approvedAt,
    code: a.clientCode ? formatCode(a.clientCode) : null,
    expired: codeExpired(a.clientCodeExpiresAt),
  };
}

// A NEW CODE, when the day has rolled over or the old one was shown to the
// wrong screen. only while the client half is still open.
export async function refreshClientCode(token) {
  const a = await open(token);
  if (!a) return { ok: false, error: "notfound" };
  if (a.approvedAt) return { ok: false, error: "approved" };
  if (!a.filledAt) return { ok: false, error: "unsigned" };
  if (a.clientSignedAt || a.clientUnavailableReason) return { ok: false, error: "done" };
  const code = await mintClientCode(a.id);
  if (!code) return { ok: false, error: "failed" };
  return { ok: true, code: formatCode(code), link: `${BASE()}/s/${code}` };
}

// THE LINK BY EMAIL, to a parent or representative who is not in the room.
// the same code and the same page; a code past its day is replaced first.
export async function emailClientLink(token, email) {
  const a = await open(token);
  if (!a) return { ok: false, error: "notfound" };
  if (a.approvedAt) return { ok: false, error: "approved" };
  if (!a.filledAt) return { ok: false, error: "unsigned" };
  if (a.clientSignedAt || a.clientUnavailableReason) return { ok: false, error: "done" };
  const to = str(email, 200);
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false, error: "email" };
  let code = a.clientCode;
  if (!code || codeExpired(a.clientCodeExpiresAt)) code = await mintClientCode(a.id);
  if (!code) return { ok: false, error: "failed" };
  const c = confirmedOf(a);
  const sent = await sendClientSignLink({
    intendedEmail: to,
    // a rehearsal's mail goes to whoever raised it and nowhere else; a demo's
    // goes where it was addressed, like the real thing
    forceTo: a.testOnly && !a.demo ? a.createdBy?.email || null : null,
    staffName: preferredName(a.staff) || a.staff?.name || "",
    clientName: firstLast(a.clientName) || "the person served",
    date: a.shiftDate,
    link: `${BASE()}/s/${code}`,
  });
  if (!sent.ok) return { ok: false, error: "send" };
  await prisma.clockAmendment.update({ where: { id: a.id }, data: { clientLinkEmail: to, clientLinkEmailedAt: new Date() } });
  return { ok: true, sentTo: sent.sentTo, redirected: !!sent.redirected, unusedTimes: !!c };
}

// STEP TWO ON THE STAFF MEMBER'S PHONE: the hand-off, kept as the fallback
// for a person served with no phone, or the honest record that nobody could
// sign. the document says the signature came from the staff member's phone.
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
      clientSignedUa: await callerUa(),
      clientSignedDevice: deviceOf(payload),
      clientSignedVia: "staff",
      clientSignatureUrl: signatureUrl,
    },
  });
  return { ok: true };
}
