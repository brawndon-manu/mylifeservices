// A TIME OFF ONE OF THESE EXPORTS, AS MINUTES PAST MIDNIGHT.
//
// On its own with no imports, because both the browser and the readers need
// it and service-notes.js is server-only - it pulls the pdfjs shim. That is
// the same split printed-date.js got on 2026-09-14, for the same reason: a
// client component reaching for one small function used to drag node:fs into
// the browser chunk and fail the build outright.
export function noteMinute(v) {
  const m = /^(\d{1,2}):(\d{2})\s*([AP])M$/i.exec(String(v ?? "").trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "P") h += 12;
  return h * 60 + Number(m[2]);
}
