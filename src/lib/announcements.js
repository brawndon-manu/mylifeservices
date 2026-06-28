// Announcements - tag list + helpers. kept separate from the Hub's POST_TAGS
// (src/lib/hub.js) so the two boards can diverge. pure (no db / no prisma).

// the "type" of an announcement, picked first on the form; the rest of the form
// adapts to it (Changelog gets a title + markdown body, the rest are plain).
export const ANNOUNCEMENT_TAGS = [
  "Announcement",
  "Changelog",
  "Event",
  "Company Meeting",
  "Other",
];

// the Changelog type is special: IT/Super only, and it renders Discord-style.
export const CHANGELOG_TAG = "Changelog";

export function isChangelog(tag) {
  return tag === CHANGELOG_TAG;
}

// the Company Meeting type carries meeting details (kind, format, link, code,
// address, sessions to pick from) on top of the normal title + markdown body.
export const COMPANY_MEETING_TAG = "Company Meeting";

export function isCompanyMeeting(tag) {
  return tag === COMPANY_MEETING_TAG;
}

export function isValidAnnouncementTag(tag) {
  return typeof tag === "string" && ANNOUNCEMENT_TAGS.includes(tag);
}

// tag chip colors. paired by tag so they're stable.
export const ANNOUNCEMENT_TAG_STYLES = {
  Announcement: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300",
  Changelog: "bg-[#5865f2] text-white",
  Event: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300",
  "Company Meeting": "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
  Other: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

// ---- Company Meeting options ----
export const MEETING_KINDS = [
  "Training",
  "Team meeting",
  "All-hands",
  "Orientation",
  "Other",
];

export function isValidMeetingKind(k) {
  return typeof k === "string" && MEETING_KINDS.includes(k);
}

export const MEETING_FORMATS = [
  { value: "zoom", label: "Zoom" },
  { value: "in_person", label: "In person" },
  { value: "hybrid", label: "Hybrid" },
];

export function isValidMeetingFormat(f) {
  return f === "zoom" || f === "in_person" || f === "hybrid";
}

// zoom + hybrid need a link/passcode; in-person + hybrid need an address.
export function formatHasOnline(f) {
  return f === "zoom" || f === "hybrid";
}
export function formatHasAddress(f) {
  return f === "in_person" || f === "hybrid";
}

export const MEETING_FORMAT_LABELS = {
  zoom: "Zoom",
  in_person: "In person",
  hybrid: "Hybrid",
};

export const ANNOUNCEMENT_TITLE_MAX = 140;

// changelogs are long-form (multiple sections), so they get a much bigger cap
// than a plain post (POST_CONTENT_MAX = 2000 in hub.js).
export const CHANGELOG_CONTENT_MAX = 20000;
