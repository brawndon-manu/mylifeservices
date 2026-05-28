// internal Suggestions & Bugs board - shared constants + helpers.
// pure (no prisma/db) so it can be imported anywhere.

export const FEEDBACK_TYPES = [
  { value: "SUGGESTION", label: "Suggestion", chip: "bg-violet-100 text-violet-800" },
  { value: "BUG", label: "Bug", chip: "bg-rose-100 text-rose-800" },
];

export function typeLabel(value) {
  return FEEDBACK_TYPES.find((t) => t.value === value)?.label ?? value;
}
export function typeChip(value) {
  return (
    FEEDBACK_TYPES.find((t) => t.value === value)?.chip ??
    "bg-slate-100 text-slate-700"
  );
}
export function isValidType(value) {
  return FEEDBACK_TYPES.some((t) => t.value === value);
}

// status lifecycle. "active" statuses float to the top of the board.
export const FEEDBACK_STATUSES = [
  { value: "OPEN", label: "Open", chip: "bg-sky-100 text-sky-800", active: true },
  { value: "IN_PROGRESS", label: "In progress", chip: "bg-amber-100 text-amber-800", active: true },
  { value: "RESOLVED", label: "Complete", chip: "bg-emerald-100 text-emerald-800", active: false },
  { value: "DECLINED", label: "Discarded", chip: "bg-slate-200 text-slate-600", active: false },
];

export function statusLabel(value) {
  return FEEDBACK_STATUSES.find((s) => s.value === value)?.label ?? value;
}
export function statusChip(value) {
  return (
    FEEDBACK_STATUSES.find((s) => s.value === value)?.chip ??
    "bg-slate-100 text-slate-700"
  );
}
export function isValidStatus(value) {
  return FEEDBACK_STATUSES.some((s) => s.value === value);
}
// statuses that count as "closed" - set resolvedBy/resolvedAt for these.
export function isClosedStatus(value) {
  return value === "RESOLVED" || value === "DECLINED";
}

// sort order for the board: active first (open, in progress), then closed.
export const STATUS_SORT = {
  OPEN: 0,
  IN_PROGRESS: 1,
  RESOLVED: 2,
  DECLINED: 3,
};

export const FB_TITLE_MAX = 120;
export const FB_BODY_MAX = 3000;

// reuse the same image rules + body cleaner as the hub.
export { IMAGE_ACCEPT, IMAGE_MAX_BYTES, cleanBody, timeAgo } from "@/lib/hub";
