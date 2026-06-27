// Announcements - tag list + helpers. kept separate from the Hub's POST_TAGS
// (src/lib/hub.js) so the two boards can diverge. pure (no db / no prisma).

// the "type" of an announcement, picked first on the form; the rest of the form
// adapts to it (Changelog gets a title + markdown body, the rest are plain).
export const ANNOUNCEMENT_TAGS = [
  "Announcement",
  "Changelog",
  "Event",
  "Training",
  "Other",
];

// the Changelog type is special: IT/Super only, and it renders Discord-style.
export const CHANGELOG_TAG = "Changelog";

export function isChangelog(tag) {
  return tag === CHANGELOG_TAG;
}

export function isValidAnnouncementTag(tag) {
  return typeof tag === "string" && ANNOUNCEMENT_TAGS.includes(tag);
}

// tag chip colors. paired by tag so they're stable.
export const ANNOUNCEMENT_TAG_STYLES = {
  Announcement: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300",
  Changelog: "bg-[#5865f2] text-white",
  Event: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300",
  Training: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  Other: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export const ANNOUNCEMENT_TITLE_MAX = 140;

// changelogs are long-form (multiple sections), so they get a much bigger cap
// than a plain post (POST_CONTENT_MAX = 2000 in hub.js).
export const CHANGELOG_CONTENT_MAX = 20000;
