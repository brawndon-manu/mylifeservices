// signed token for the no-login "confirm and sign your clock amendment" link.
// same hmac pattern as timesheet-token.js, with its own prefix so a timesheet
// token can never open an amendment or the other way round.
//
// the token is the credential: whoever holds it can open and sign that one
// amendment, and nothing else. it grants no portal access. it is only ever
// handed out by email to the person the office picked.
import crypto from "crypto";

function sign(body) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET missing - cant sign amendment tokens");
  return crypto.createHmac("sha256", secret).update(`ca:${body}`).digest("base64url");
}

export function signAmendmentToken(amendmentId) {
  const body = Buffer.from(String(amendmentId)).toString("base64url");
  return `${body}.${sign(body)}`;
}

// the amendment id when the signature checks out, else null
export function verifyAmendmentToken(token) {
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

  try {
    const id = Buffer.from(body, "base64url").toString("utf8");
    return id || null;
  } catch {
    return null;
  }
}
