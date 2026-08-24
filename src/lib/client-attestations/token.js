// THE LINK THAT OPENS ONE CLIENT'S FORM FOR SIGNING.
//
// Same shape as the ack token: an HMAC over the payload with AUTH_SECRET, so a
// forged or tweaked link cannot open somebody else's document. There is no
// tokens table - the ClientAttestation row IS the record, and the token unlocks
// exactly that one form.
//
// THE TOKEN SAYS WHO IT WAS CUT FOR, because the audience decides what the
// page offers (Mánu 2026-08-24):
//
//   client       only the client's fields - their signature and its date
//   staff        the same client fields; the staff member is sitting with the
//                client and the client signs off the staff's email
//   supervisor   the whole form
//
// A client link edited into a supervisor link fails the HMAC, which is the
// point of signing the audience rather than passing it as a query param.
import crypto from "crypto";

const PREFIX = "ca";
export const TOKEN_AUDIENCES = ["client", "staff", "supervisor"];

function sign(body) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET missing - cant sign attestation tokens");
  return crypto.createHmac("sha256", `${PREFIX}:${secret}`).update(body).digest("base64url");
}

export function signAttestationToken(attestationId, audience = "supervisor") {
  if (!TOKEN_AUDIENCES.includes(audience)) {
    throw new Error(`unknown attestation token audience: ${audience}`);
  }
  const body = Buffer.from(`${attestationId}.${audience}`).toString("base64url");
  return `${body}.${sign(body)}`;
}

// returns { attestationId, audience } when the signature checks out, else null
export function verifyAttestationToken(token) {
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
  const attestationId = payload.slice(0, sep);
  const audience = payload.slice(sep + 1);
  if (!attestationId || !TOKEN_AUDIENCES.includes(audience)) return null;
  return { attestationId, audience };
}
