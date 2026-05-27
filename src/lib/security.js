// little grab-bag of stuff to keep randos from messing with the portal:
// - cleanEmail: strip + lowercase + sanity check before we trust it
// - safeCallbackUrl: blocks open redirects (//evil.com etc.)
// - checkRateLimit: caps how often someone can hit the login form
//
// rate limiter uses upstash redis - shared across all vercel instances
// so it actually works in prod (in-memory wouldnt - serverless cold
// starts get fresh memory each time).

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// --- email cleanup -------------------------------------------------

// rfc-ish max email length. anything longer is almost certainly garbage
// or a someone trying to overflow a buffer somewhere.
const EMAIL_MAX_LEN = 254;

// not trying to perfectly match rfc 5322 here (that way lies madness).
// this catches typos + obvious junk, which is all we need - the real
// "is this email real" check happens when resend tries to deliver.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanEmail(raw) {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > EMAIL_MAX_LEN) return null;
  if (!EMAIL_RE.test(email)) return null;
  return email;
}

// --- callback url whitelist ----------------------------------------

// after sign-in we redirect to whatever url they had before. an attacker
// could try to slip in callbackUrl=//evil.com or callbackUrl=https://evil.com
// so we only accept same-origin paths (start with a single /).
const CALLBACK_MAX_LEN = 200;

export function safeCallbackUrl(raw, fallback = "/portal") {
  if (typeof raw !== "string") return fallback;
  if (raw.length === 0 || raw.length > CALLBACK_MAX_LEN) return fallback;
  // single leading / is fine. // is protocol-relative (basically a full url),
  // anything not starting with / is definitely not ours.
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}

// --- rate limiter (upstash) ---------------------------------------

// single shared Redis client. Redis.fromEnv() reads UPSTASH_REDIS_REST_URL
// + UPSTASH_REDIS_REST_TOKEN from env automatically.
//
// stashed on globalThis so hot reload in dev doesnt make a new one every
// save (same trick as prisma).
const globalForRedis = globalThis;
const redis = globalForRedis.upstashRedis ?? Redis.fromEnv();
if (process.env.NODE_ENV !== "production") {
  globalForRedis.upstashRedis = redis;
}

// sliding window: 5 hits per minute per key. sliding (vs fixed window)
// means someone cant burst 5 at the end of one window + 5 at the start
// of the next - it smooths it out.
const ratelimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "1 m"),
  prefix: "mls:ratelimit",
  analytics: true, // shows hits/misses in the upstash dashboard
});

export async function checkRateLimit(key) {
  const result = await ratelimiter.limit(key);
  return { ok: result.success };
}
