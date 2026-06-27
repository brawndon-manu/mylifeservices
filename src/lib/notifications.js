// in-portal notification config - pure (no db). the server-side creator
// lives in src/lib/notify.js. timeAgo is reused from the hub helpers.
import { timeAgo } from "@/lib/hub";

export { timeAgo };

// per-type display: short chip label, chip colors, left-accent border, and
// the unread dot color. keeps the notifications list color-coded by source.
export const NOTIFICATION_TYPES = {
  RESOURCE_PENDING: {
    label: "Resource",
    chip: "bg-green-100 text-green-800",
    accent: "border-l-green-600",
    dot: "bg-green-600",
  },
  FEEDBACK_NEW: {
    label: "Suggestion",
    chip: "bg-amber-100 text-amber-800",
    accent: "border-l-amber-600",
    dot: "bg-amber-600",
  },
  NEWSLETTER_PENDING: {
    label: "Newsletter",
    chip: "bg-blue-100 text-blue-700",
    accent: "border-l-blue-600",
    dot: "bg-blue-600",
  },
  USER_ADDED: {
    label: "User",
    chip: "bg-violet-100 text-violet-700",
    accent: "border-l-violet-600",
    dot: "bg-violet-600",
  },
};

export function notifConfig(type) {
  return NOTIFICATION_TYPES[type] || NOTIFICATION_TYPES.RESOURCE_PENDING;
}
