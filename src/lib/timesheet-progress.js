// Live progress for a timesheet upload.
//
// Parsing 60 employees and rendering 60 PDFs takes about a minute, and a server
// action can't talk back to the page while it runs. So the upload writes what
// it's doing into redis as it goes and the page polls for it. Without this the
// screen is a spinner: a stall and normal progress look identical, and the only
// honest thing the button could say was "this can take a minute".
//
// EVERY write here is best-effort. Progress reporting must never be able to
// fail an upload - a redis blip should cost you the counter, not the batch. The
// caller wraps nothing; that's this module's job.

import { Redis } from "@upstash/redis";

const globalForRedis = globalThis;
const redis = globalForRedis.upstashTsProgress ?? Redis.fromEnv();
if (process.env.NODE_ENV !== "production") {
  globalForRedis.upstashTsProgress = redis;
}

// an upload is a minute; the key lives a little longer so a slow poll or a
// reloaded tab can still read the finished state, then cleans itself up.
const TTL_SECONDS = 900;

// the id comes from the browser, so it is NEVER trusted as a key on its own -
// it's namespaced under the uploader's own user id. That way one person cannot
// read another's upload progress by guessing, and a malformed id can only ever
// collide with that user's own runs.
const KEY_MAX = 64;
export function progressKey(userId, uploadId) {
  const safe = String(uploadId || "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, KEY_MAX);
  if (!userId || !safe) return null;
  return `mls:ts:progress:${userId}:${safe}`;
}

// One write, never a read-modify-write. The caller already holds the whole
// state, and a get+set per employee would have put ~120 extra round-trips
// inside the slowest loop in the app - progress reporting that measurably slows
// down the thing it reports on is a bad trade.
//
// `minGapMs` skips a write that lands too soon after the last one. The screen
// polls once a second, so anything faster than that is invisible anyway. Pass
// 0 (the default) for the stage changes, which are rare and must not be lost.
// per key, not global - two people uploading at once must not throttle each
// other's counters
const lastWriteAt = new Map();

export async function setProgress(key, state, { minGapMs = 0 } = {}) {
  if (!key) return;
  const now = Date.now();
  if (minGapMs && now - (lastWriteAt.get(key) || 0) < minGapMs) return;
  lastWriteAt.set(key, now);
  try {
    await redis.set(key, { ...state, at: now }, { ex: TTL_SECONDS });
  } catch {
    // progress is a nicety; the upload is not
  }
}

export async function getProgress(key) {
  if (!key) return null;
  try {
    return (await redis.get(key)) || null;
  } catch {
    return null;
  }
}

// STAGES / RECENT_MAX / pushRecent deliberately live in `timesheet-stages.js`
// instead of here - the progress screen is a client component, and importing
// them from this file dragged the redis client into the browser bundle.
