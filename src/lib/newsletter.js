// "This Week in My Life Services" newsletter - shared constants + helpers.
// pure (no prisma/db) so it can be imported anywhere incl. client comps.

// category values mirror the NewsletterCategory enum in schema.prisma.
export const NL_CATEGORIES = [
  { value: "PAST_WEEK", label: "This past week", chip: "bg-emerald-100 text-emerald-800" },
  { value: "UPCOMING", label: "Coming up", chip: "bg-sky-100 text-sky-800" },
];

export function categoryLabel(value) {
  return NL_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export function categoryChip(value) {
  return (
    NL_CATEGORIES.find((c) => c.value === value)?.chip ??
    "bg-slate-100 text-slate-700"
  );
}

export function isValidCategory(value) {
  return NL_CATEGORIES.some((c) => c.value === value);
}

// status values mirror NewsletterStatus enum. labels + chip styles for
// the portal review queue + submitter's "my submissions" list.
export const NL_STATUS_LABELS = {
  SUBMITTED: "Pending review",
  APPROVED: "Approved — awaiting publish",
  PUBLISHED: "Published",
  REJECTED: "Not approved",
};

export const NL_STATUS_CHIP = {
  SUBMITTED: "bg-amber-100 text-amber-800",
  APPROVED: "bg-sky-100 text-sky-800",
  PUBLISHED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-800",
};

// length caps. title short, body roomy.
export const NL_TITLE_MAX = 120;
export const NL_BODY_MAX = 3000;
export const NL_NOTE_MAX = 500;

// reuse the same image rules as the hub so uploads behave consistently.
export { IMAGE_ACCEPT, IMAGE_MAX_BYTES, cleanBody } from "@/lib/hub";

// pretty date for the public page + portal ("Mar 15, 2026").
export function formatDate(date) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
