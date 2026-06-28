// signed token for the one-click email acknowledge link. the payload is just
// announcementId + userId; we HMAC it with AUTH_SECRET so a forged or tweaked
// link cant acknowledge for someone else. no tokens table needed - the
// AnnouncementAck row IS the record. the link only ever marks-as-read and is
// idempotent, so a forwarded link is low-stakes (worst case someone acks an
// announcement that wasnt theirs to ack).

import crypto from "crypto";

function sign(body) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET missing - cant sign ack tokens");
  return crypto.createHmac("sha256", secret).update(body).digest("base64url");
}

// cuid ids are [a-z0-9] only, so a literal "." safely separates the two parts
// and never collides with the ids themselves.
export function signAckToken(announcementId, userId) {
  const body = Buffer.from(`${announcementId}.${userId}`).toString("base64url");
  return `${body}.${sign(body)}`;
}

// returns { announcementId, userId } when the signature checks out, else null.
export function verifyAckToken(token) {
  if (typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  let expected;
  try {
    expected = sign(body);
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload;
  try {
    payload = Buffer.from(body, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const sep = payload.indexOf(".");
  if (sep === -1) return null;
  const announcementId = payload.slice(0, sep);
  const userId = payload.slice(sep + 1);
  if (!announcementId || !userId) return null;
  return { announcementId, userId };
}
