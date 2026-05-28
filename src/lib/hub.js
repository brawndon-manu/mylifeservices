// MLS Hub - constants + helpers for the internal feed (posts, comments).
// kept pure (no prisma / no db) so it can be imported from anywhere
// including client components.

// allowed tag values for a post. kept as plain strings + validated
// server-side via isValidTag(). add new ones here when needed - no
// migration required since Post.tag is a free String.
export const POST_TAGS = [
  "Food bank",
  "Job / Job fair",
  "Event",
  "Training",
  "Resource",
  "Announcement",
  "Other",
];

// tailwind classes for the tag chip on each post. paired by index with
// POST_TAGS so the colors are stable per tag.
export const TAG_STYLES = {
  "Food bank": "bg-emerald-100 text-emerald-800",
  "Job / Job fair": "bg-sky-100 text-sky-800",
  "Event": "bg-violet-100 text-violet-800",
  "Training": "bg-amber-100 text-amber-800",
  "Resource": "bg-teal-100 text-teal-800",
  "Announcement": "bg-rose-100 text-rose-800",
  "Other": "bg-slate-100 text-slate-700",
};

export function isValidTag(tag) {
  return typeof tag === "string" && POST_TAGS.includes(tag);
}

// time windows for the feed filter. value goes in the URL as ?window=...
export const TIME_WINDOWS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

export function isValidWindow(value) {
  return TIME_WINDOWS.some((w) => w.value === value);
}

// returns a Date cutoff for the given window value. null = no cutoff.
export function windowCutoff(value) {
  const now = new Date();
  switch (value) {
    case "today": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d;
    }
    case "month": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return d;
    }
    default:
      return null;
  }
}

// max characters for a post body or comment body. keeps the feed scannable.
export const POST_CONTENT_MAX = 2000;
export const COMMENT_CONTENT_MAX = 1000;

// max upload size for a post image, in bytes. matches the
// serverActions.bodySizeLimit in next.config.mjs (5mb) with a little
// headroom for the rest of the form data.
export const IMAGE_MAX_BYTES = 4 * 1024 * 1024;

// accepted image mime types. enforced client-side via accept attribute
// AND server-side before sending to Vercel Blob.
export const IMAGE_ACCEPT = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// trims + caps a body of text. used for post content + comment content.
// returns null if the result is empty after trim. matches the same
// style as cleanDisplayName in security.js.
export function cleanBody(raw, max) {
  if (typeof raw !== "string") return null;
  // strip ascii control chars except newline + tab so multi-line posts
  // are allowed but no zero-width / null trickery.
  // eslint-disable-next-line no-control-regex
  const stripped = raw.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, "");
  const trimmed = stripped.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

// pretty relative time for the feed - "5m ago", "2h ago", "3d ago",
// then falls back to a full date once > 7 days.
export function timeAgo(date) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

// is this post past its expiration?
export function isExpired(post) {
  return !!(post?.expiresAt && new Date(post.expiresAt).getTime() < Date.now());
}
