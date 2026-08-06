// Public share links for guidebook pages.
//
// Same shape as a Form's `shareSlug`: a random, unguessable path that works
// without a login, is never linked from anywhere public, and carries noindex.
// Break policy is something staff need to be able to read on their phone
// without hunting for a portal password, and something HR needs to be able to
// send to somebody who does not have an account yet.
//
// THE SLUG LIVES IN AN ENV VAR, NOT IN THIS FILE. This repo is public, so a
// slug committed here would be published the moment it was pushed, which is the
// whole thing the random path is for. Forms keep theirs in the database for the
// same reason; guidebook pages are defined in code, so env is the equivalent.
//
// Set GUIDEBOOK_BREAKS_SLUG in .env.local and in Vercel. Unset is safe: the
// share button falls back to the portal link, so nothing breaks, it just is not
// shareable outside the portal.

const SLUGS = {
  breaks: process.env.GUIDEBOOK_BREAKS_SLUG || null,
};

// where each key renders inside the portal, used as the fallback share target
export const PORTAL_PATHS = {
  breaks: "/portal/guidebook/breaks",
};

export function shareSlug(key) {
  return SLUGS[key] || null;
}

// the public path to hand out, or the portal one when no slug is configured
export function sharePath(key) {
  const slug = shareSlug(key);
  return slug ? `/g/${slug}` : PORTAL_PATHS[key] || null;
}

// resolve an incoming /g/<slug> back to a page key. a plain equality check
// against a configured value - an unset slug must never match an empty or
// missing segment and hand out a page nobody meant to publish.
export function pageForSlug(slug) {
  if (!slug || typeof slug !== "string") return null;
  for (const [key, value] of Object.entries(SLUGS)) {
    if (value && value === slug) return key;
  }
  return null;
}
