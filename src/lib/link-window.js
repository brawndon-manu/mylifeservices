// HOW LONG AN EMAILED LINK KEEPS WORKING: 30 days after the newest thing that
// happened on its record - sent, resent, reminded, signed, approved, due. a
// resend or a reminder is the task moving again, so its link gets a fresh 30
// days. a record with no date to count from stays open.
//
// dependency-free so the node tests can pin it; link-life.js does the lookups.
export const LINK_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function withinWindow(dates, now = Date.now()) {
  const times = (dates || [])
    .filter(Boolean)
    .map((d) => new Date(d).getTime())
    .filter(Number.isFinite);
  if (!times.length) return true;
  return now <= Math.max(...times) + LINK_DAYS * DAY_MS;
}
