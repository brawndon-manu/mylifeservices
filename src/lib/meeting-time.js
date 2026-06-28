// meeting time helpers. a meeting start is stored as ONE absolute instant; every
// viewer sees it in their own device timezone. pure - Intl works in node + the
// browser, so this is safe to import from server or client code.

export const US_TIMEZONES = [
  { value: "America/Los_Angeles", label: "Pacific" },
  { value: "America/Denver", label: "Mountain" },
  { value: "America/Chicago", label: "Central" },
  { value: "America/New_York", label: "Eastern" },
  { value: "America/Phoenix", label: "Arizona" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
];

export function deviceTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
  } catch {
    return "America/Los_Angeles";
  }
}

// ms offset of `tz` from UTC at a given instant.
function tzOffsetMs(tz, date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = {};
  for (const part of dtf.formatToParts(date)) p[part.type] = part.value;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUTC - date.getTime();
}

// (date "YYYY-MM-DD", time "HH:MM", IANA tz) -> ISO instant string, or null.
export function zonedToInstant(dateStr, timeStr, tz) {
  if (!dateStr || !timeStr || !tz) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  if ([y, m, d, hh, mm].some((n) => Number.isNaN(n))) return null;
  try {
    const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
    const offset = tzOffsetMs(tz, guess);
    return new Date(guess.getTime() - offset).toISOString();
  } catch {
    return null;
  }
}

// inverse: an instant -> the wall date/time in a given tz, for prefilling inputs.
export function instantToZoned(iso, tz) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { date: "", time: "" };
  const p = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date))
    p[part.type] = part.value;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

// short zone abbreviation like "PST" / "PDT" / "EST" at a given instant.
export function tzAbbrev(tz, date) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(date);
    return parts.find((p) => p.type === "timeZoneName")?.value || "";
  } catch {
    return "";
  }
}

// format an instant in a tz: "Mon, Jun 30, 2026 · 12:00 PM PST".
export function formatInstant(iso, tz) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const dateStr = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
  const timeStr = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  return `${dateStr} · ${timeStr} ${tzAbbrev(tz, date)}`.trim();
}

function fmtMin(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const parts = [];
  if (h) parts.push(`${h} hr`);
  if (m) parts.push(`${m} min`);
  return parts.join(" ") || "0 min";
}

// "1 hr 30 min" or "1 hr 30 min – 2 hr".
export function formatDuration(fromMin, toMin) {
  if (!fromMin) return "";
  if (toMin && toMin > fromMin) return `${fmtMin(fromMin)} – ${fmtMin(toMin)}`;
  return fmtMin(fromMin);
}
