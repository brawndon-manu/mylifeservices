// shared constants + helpers for the admin-managed public site photos.
// pure (no prisma/db) so it can be imported anywhere incl. client comps.

// every public photo spot admins can fill, grouped by the page it lives on.
//   page:  which public page (used to group the manager UI)
//   multi: true = cycles through several photos (slideshow); false = a
//          single photo (the first active one)
//   note:  optional hint shown in the manager (e.g. "also on the home page")
// adding a new spot is just a row here + wiring it on the page.
export const SITE_PHOTO_SECTIONS = [
  // About page
  { value: "about-hero", page: "About", label: "Hero (top of page)", multi: false },
  { value: "agency-overview", page: "About", label: "Agency Overview slideshow", multi: true },
  { value: "about-team", page: "About", label: "Our Team", multi: false },
  { value: "partnership", page: "About", label: "Partnership", multi: false },
  // Stories page (the portraits also appear on the home page "Real stories" cards)
  { value: "story-ro-portrait", page: "Stories", label: "RO portrait", multi: false, note: "Also shown on the home page" },
  { value: "story-ro-milestone", page: "Stories", label: "RO move-in photo", multi: false },
  { value: "story-rr-portrait", page: "Stories", label: "RR portrait", multi: false, note: "Also shown on the home page" },
];

// page groups in display order, for the manager UI.
export const SITE_PHOTO_PAGES = ["About", "Stories"];

export function sectionsForPage(page) {
  return SITE_PHOTO_SECTIONS.filter((s) => s.page === page);
}

export function isValidSection(value) {
  return SITE_PHOTO_SECTIONS.some((s) => s.value === value);
}

export function sectionLabel(value) {
  return SITE_PHOTO_SECTIONS.find((s) => s.value === value)?.label ?? value;
}

export function sectionIsMulti(value) {
  return SITE_PHOTO_SECTIONS.find((s) => s.value === value)?.multi ?? false;
}

// length caps for the text fields.
export const SITE_PHOTO_CAPTION_MAX = 200;
export const SITE_PHOTO_ALT_MAX = 160;

// reuse the same image rules as the hub so uploads behave consistently.
export { IMAGE_ACCEPT, IMAGE_MAX_BYTES } from "@/lib/hub";
