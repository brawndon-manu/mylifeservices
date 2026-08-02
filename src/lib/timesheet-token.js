// signed token for the no-login "sign your timesheet" link. same HMAC pattern
// as ack-token.js, but the stakes are higher here (the link opens someone's own
// hours and lets them sign), so the payload pins the exact timesheet row and
// the link is only ever handed out by email to that person's address.
//
// the token is the credential - anyone holding it can view + sign that one
// timesheet, and nothing else. it grants no portal access.
import crypto from "crypto";

function sign(body) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET missing - cant sign timesheet tokens");
  return crypto.createHmac("sha256", secret).update(`ts:${body}`).digest("base64url");
}

export function signTimesheetToken(timesheetId) {
  const body = Buffer.from(String(timesheetId)).toString("base64url");
  return `${body}.${sign(body)}`;
}

// returns the timesheetId when the signature checks out, else null.
export function verifyTimesheetToken(token) {
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
