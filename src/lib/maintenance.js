// maintenance-mode on/off state, kept in upstash redis so it can be flipped
// instantly from the portal with no redeploy. the public site checks this on
// every request in proxy.js, so the edge read is cached for a few seconds to
// avoid a redis round-trip on every single hit. tradeoff: flipping the switch
// in the portal takes up to CACHE_MS to fully propagate to every edge region.

import { Redis } from "@upstash/redis";

// single shared client, stashed on globalThis so dev hot-reload doesn't spin up
// a new one every save (same trick as prisma / the rate limiter).
const globalForRedis = globalThis;
const redis = globalForRedis.upstashMaint ?? Redis.fromEnv();
if (process.env.NODE_ENV !== "production") {
  globalForRedis.upstashMaint = redis;
}

export const MAINTENANCE_KEY = "mls:maintenance";

const CACHE_MS = 8000;
let cache = { on: false, at: 0 };

// cached read for the hot path (proxy.js). if redis is unreachable we fail
// OPEN - the site stays up rather than locking everyone out on an infra blip.
export async function isMaintenanceOn() {
  const now = Date.now();
  if (now - cache.at < CACHE_MS) return cache.on;
  let on = cache.on;
  try {
    on = (await redis.get(MAINTENANCE_KEY)) === "on";
  } catch {
    // keep the last known value on error
  }
  cache = { on, at: now };
  return on;
}

// uncached read for the portal toggle UI, so it always shows the true state.
export async function getMaintenanceState() {
  try {
    return (await redis.get(MAINTENANCE_KEY)) === "on";
  } catch {
    return false;
  }
}

export async function setMaintenance(on) {
  await redis.set(MAINTENANCE_KEY, on ? "on" : "off");
  cache = { on: !!on, at: Date.now() };
}
