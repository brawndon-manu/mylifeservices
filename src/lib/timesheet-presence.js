// WHO ELSE IS LOOKING AT THIS BATCH RIGHT NOW.
//
// Mánu 2026-08-13: "So I can see in lifetime which cards my coworkers are
// looking at? Kinda like in Google Docs."
//
// NOT WEBSOCKETS, and that is a decision rather than a shortcut. A socket needs
// a process that stays alive holding the connection, and Vercel's functions
// spin up per request and die - so "add websockets" means adding a third party
// to hold them (Pusher, Ably, Liveblocks). For two people on an internal screen
// that is a vendor, a bill and a new failure mode for an effect that a heartbeat
// gives you.
//
// So it is the same shape as `timesheet-progress.js`, which has been in
// production doing this since the upload screen was built: somebody writes where
// they are into redis, somebody else polls for it. Same client, same
// best-effort rule, same reason.
//
// EVERY WRITE AND READ HERE IS BEST-EFFORT. Presence is a nicety. A redis blip
// should cost you a face on a screen, never a page.

import { Redis } from "@upstash/redis";

const globalForRedis = globalThis;
const redis = globalForRedis.upstashTsPresence ?? Redis.fromEnv();
if (process.env.NODE_ENV !== "production") {
  globalForRedis.upstashTsPresence = redis;
}

// HOW LONG A HEARTBEAT COUNTS FOR. The browser sends one every 10 seconds, so
// 30 gives it two misses before somebody vanishes - a slow request or a laptop
// waking up should not blink them off the screen.
//
// A CLOSED TAB DISAPPEARS ON ITS OWN, which is the whole reason this is a
// timeout rather than a "leave" event. There is no reliable way to be told a
// browser closed, so anything that relies on being told leaves ghosts behind.
const STALE_MS = 30_000;
// the batch's whole hash goes eventually, so a period nobody has opened in an
// hour is not still sitting in redis
const TTL_SECONDS = 3600;

// one hash per batch, one field per person. Per-field expiry does not exist in
// redis, so freshness is decided on READ from the timestamp in the value - which
// is also what makes a stale entry harmless rather than something to clean up.
const keyFor = (batchId) =>
  batchId ? `mls:ts:presence:${String(batchId).replace(/[^a-zA-Z0-9]/g, "").slice(0, 64)}` : null;

// I am here, and this is what I am looking at.
//
// `rowKey` is optional: on a list page somebody is on the batch but not on any
// one person, and saying so is more honest than guessing from scroll position.
export async function heartbeat({ batchId, userId, name, image, rowKey = null, page = null }) {
  const key = keyFor(batchId);
  if (!key || !userId) return;
  try {
    await redis.hset(key, {
      [userId]: { userId, name: name || null, image: image || null, rowKey, page, at: Date.now() },
    });
    await redis.expire(key, TTL_SECONDS);
  } catch {
    // presence is a nicety; the page is not
  }
}

// stop showing me immediately, for the case we CAN detect - a tab navigating
// away tells us on the way out. Everything else falls back to the timeout.
export async function clearPresence({ batchId, userId }) {
  const key = keyFor(batchId);
  if (!key || !userId) return;
  try {
    await redis.hdel(key, userId);
  } catch {
    // same rule
  }
}

// everybody currently on this batch, freshest first, minus whoever is asking.
//
// Stale entries are filtered rather than deleted: a read is not the place to do
// writes, two people polling would race to delete the same field, and the hash's
// own TTL takes care of the rest.
export async function whoIsHere(batchId, { exceptUserId = null } = {}) {
  const key = keyFor(batchId);
  if (!key) return [];
  try {
    const all = await redis.hgetall(key);
    if (!all) return [];
    const now = Date.now();
    return Object.values(all)
      .map((v) => (typeof v === "string" ? safeParse(v) : v))
      .filter(Boolean)
      .filter((v) => v.userId && v.userId !== exceptUserId)
      .filter((v) => now - (v.at || 0) < STALE_MS)
      .sort((a, b) => (b.at || 0) - (a.at || 0));
  } catch {
    return [];
  }
}

// the client stores objects, but a hash written by an older build or by hand
// could hold a string. A presence entry nobody can parse is one missing face,
// never a thrown page.
function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
