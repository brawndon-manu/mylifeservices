// THE PROMPT'S HANDLE ON A DECISION EMAIL. after the last decision on a
// sheet, the desk and Live ask "send them their new timesheet?" - and what
// goes out has to be what the decision produced, not whatever a page hands
// back. so the sheet and the email's exact title and sentence travel signed,
// the same way the /t links are, and live a day: the prompt is answered on
// the spot or the sheet goes from the batch page like any other.
// server only (crypto, AUTH_SECRET); dependency-free so a node test can
// import it straight.
import crypto from "crypto";

const LIFE_MS = 24 * 60 * 60 * 1000;

function sign(body) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET missing - cant sign a decision send");
  return crypto.createHmac("sha256", secret).update(`decision-send:${body}`).digest("base64url");
}

export function signDecisionSend({ id, title, plain }, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ id, title, plain, exp: now + LIFE_MS })).toString("base64url");
  return `${body}.${sign(body)}`;
}

// { id, title, plain } when the handle is ours and still alive, else null
export function verifyDecisionSend(token, now = Date.now()) {
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
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!p?.id || !p.title || !p.plain || !(Number(p.exp) > now)) return null;
    return { id: String(p.id), title: String(p.title), plain: String(p.plain) };
  } catch {
    return null;
  }
}
