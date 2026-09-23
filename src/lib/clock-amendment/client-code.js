// THE SHORT CODE THE PERSON SERVED SCANS OR TYPES.
//
// once the staff member has signed, their screen shows a code that opens the
// client-only signing page on the client's own phone. it is short enough to
// type from the line under the QR and to keep the QR coarse enough to scan
// with a logo over its middle, and it lives only until the end of that
// California day: long enough for the visit, short enough that a code on a
// screenshot is dead by morning. a fresh one can be shown at any time.
//
// dependency-free so node --test reads it; the crypto comes from the caller.

// no 0/O, 1/I/L: a code read out loud or typed from a screen must not turn on
// a letter that looks like a digit
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_LENGTH = 8;

// bytes -> a code, one letter per byte. hand it enough random bytes
export function codeFromBytes(bytes) {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

// what a person sees and types: "7KQ4-2MZD"
export function formatCode(code) {
  const c = normalizeCode(code);
  return c.length === CODE_LENGTH ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

// what a typed or scanned code becomes before it is looked up: upper case,
// the dash and any spaces gone. the alphabet holds no look-alikes, so a
// typed O or 1 is simply a code that opens nothing
export function normalizeCode(raw) {
  return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// the last instant of the California day `now` falls in, as a UTC instant.
// the server runs on UTC, so the day is asked of the zone, never of the clock
export function codeExpiry(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t) => Number(parts.find((p) => p.type === t)?.value || 0);
  const h = get("hour") % 24;
  // seconds left in the California day, added to the start of this second,
  // so the answer is the day's last millisecond and never the next day's first
  const left = (23 - h) * 3600 + (59 - get("minute")) * 60 + (59 - get("second"));
  return new Date(now.getTime() - now.getMilliseconds() + left * 1000 + 999);
}

export const codeExpired = (expiresAt, now = new Date()) =>
  !expiresAt || new Date(expiresAt).getTime() < now.getTime();
