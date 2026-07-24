// signs and verifies the maintenance bypass cookie, plus checks the typed
// password. all HMAC-SHA256 via Web Crypto so the exact same code runs in the
// edge proxy (verify) and the node route handler (sign + password check).
//
// the password is never compared as raw text: both the typed value and the
// secret are HMAC'd with AUTH_SECRET (which acts as the salt/pepper) and the
// resulting fixed-length hashes are compared in constant time. that, plus the
// rate limit on the endpoint and the long random secret, is the hardening.

const encoder = new TextEncoder();

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

async function hmacHex(message) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// constant-time compare of two equal-length hex strings.
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const BYPASS_COOKIE = "mls_maint_bypass";
const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

// is the typed password correct? both sides are hashed first so we never do a
// length- or content-revealing compare on the raw secret.
export async function checkBypassPassword(input) {
  const expected = process.env.MAINTENANCE_BYPASS;
  if (!expected || typeof input !== "string" || input.length === 0) return false;
  const [a, b] = await Promise.all([hmacHex(input), hmacHex(expected)]);
  return safeEqual(a, b);
}

// token = "<expiryMs>.<hmac(expiryMs)>"
export async function createBypassToken(ttlMs = DEFAULT_TTL_MS) {
  const exp = String(Date.now() + ttlMs);
  const sig = await hmacHex(exp);
  return `${exp}.${sig}`;
}

export async function verifyBypassToken(token) {
  if (!token || typeof token !== "string") return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const expected = await hmacHex(exp);
  return safeEqual(sig, expected);
}
