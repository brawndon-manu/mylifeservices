// Review status is separate from the last document rebuild. An old rebuild
// cannot finish a correction accepted after it.
const timestamp = (value) => value ? new Date(value).getTime() || 0 : 0;

export function reportQueue(sheet) {
  if (sheet.corrections.some((c) => c.status === "open")) return "review";
  const rebuilt = timestamp(sheet.recomputedAt);
  const pending = sheet.corrections.some((c) => c.status === "accepted"
    && (!rebuilt || timestamp(c.resolvedAt || c.createdAt) > rebuilt));
  return pending ? "rebuild" : "history";
}

export function reportDate(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(value || "");
  if (!match) return value || "This timesheet";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
  }).format(new Date(Date.UTC(2000 + +match[3], +match[1] - 1, +match[2])));
}

export function reportTimestamp(value) {
  if (!timestamp(value)) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    timeZone: "America/Los_Angeles",
  }).format(new Date(value));
}

export function validReportSlots(slots) {
  return Array.isArray(slots) ? slots.filter((s) => Number.isFinite(s?.from)
    && Number.isFinite(s?.to) && s.from >= 0 && s.to <= 1440 && s.to > s.from) : [];
}

export function reportSlotCheck(slots, hours) {
  const list = validReportSlots(slots);
  if (!Array.isArray(slots) || !slots.length) return null;
  if (list.length !== slots.length) return "Some reported time slots are invalid.";
  const sorted = [...list].sort((a, b) => a.from - b.from);
  if (sorted.some((s, i) => i > 0 && s.from < sorted[i - 1].to)) return "Reported time slots overlap.";
  const total = Math.round(list.reduce((sum, s) => sum + s.to - s.from, 0) / 60 * 100);
  if (hours == null || total !== Math.round(hours * 100)) return "The reported time slots do not match the claimed hours.";
  return null;
}
