// signed token for the one-click email meeting-RSVP links. payload is
// announcementId + userId + choice, HMAC'd with AUTH_SECRET so a forged or
// tweaked link can't respond for someone else. no tokens table - the
// AnnouncementMeetingResponse/Choice rows ARE the record, and recording is
// idempotent + reversible in the portal, so a forwarded link is low-stakes.
//
// choice is one of: an option id (a specific session), "going" (single-session
// "I'll be there"), or "cant" ("can't make it" / "can't attend the series").

import crypto from "crypto";

function sign(body) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET missing - cant sign rsvp tokens");
  return crypto.createHmac("sha256", secret).update(body).digest("base64url");
}

export function signRsvpToken(announcementId, userId, choice) {
  const body = Buffer.from(`${announcementId}.${userId}.${choice}`).toString("base64url");
  return `${body}.${sign(body)}`;
}

// returns { announcementId, userId, choice } when the signature checks out, else
// null. choice may itself contain dots (an option id), so it's the remainder.
export function verifyRsvpToken(token) {
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
  const parts = payload.split(".");
  if (parts.length < 3) return null;
  const announcementId = parts[0];
  const userId = parts[1];
  const choice = parts.slice(2).join(".");
  if (!announcementId || !userId || !choice) return null;
  return { announcementId, userId, choice };
}
