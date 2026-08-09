// Loose time entry, typed rather than picked.
//
// Lived in the announcements TimeField, which is where it grew up (Company
// Meetings, Events). It is a pure function used by two unrelated features now,
// so it sits here and TimeField re-exports it. Nothing about the announcements
// behaviour changes.
//
// Accepts "9", "9am", "230pm", "9:00 AM", "0930", "1430" and normalises to a
// canonical 24-hour "HH:MM".

// loose time entry -> canonical "HH:MM" (24h).
//
// `assumeWorkday` applies the rule Mánu gave 2026-08-09 for the timesheet:
// with no am/pm typed, 7 through 11 is morning and 12 through 6 is afternoon.
// OFF by default, because Company Meetings and Events have used this for months
// and an 8pm event typed as "8" should not silently become 8am there.
export function parseLooseTime(str, { assumeWorkday = false } = {}) {
  if (!str) return "";
  let s = String(str).trim().toLowerCase().replace(/\s+/g, "").replace(/\./g, "");
  let ampm = "";
  if (s.endsWith("am") || s.endsWith("a")) { ampm = "am"; s = s.replace(/am?$/, ""); }
  else if (s.endsWith("pm") || s.endsWith("p")) { ampm = "pm"; s = s.replace(/pm?$/, ""); }
  s = s.replace(/[^\d:]/g, "");
  let h, min;
  // FOUR BARE DIGITS IS 24-HOUR NOTATION and is left alone. Otherwise "0630"
  // would come back as half past six in the EVENING, and a wrong time on a wage
  // document is the thing this whole question exists to stop. Every example
  // Mánu gave still lands: 1230 reads as 12:30 either way.
  let explicit24 = false;
  if (s.includes(":")) {
    const [hh, mm] = s.split(":");
    h = parseInt(hh, 10); min = parseInt(mm || "0", 10);
  } else if (/^\d+$/.test(s)) {
    if (s.length <= 2) { h = parseInt(s, 10); min = 0; }
    else if (s.length === 3) { h = parseInt(s.slice(0, 1), 10); min = parseInt(s.slice(1), 10); }
    else { h = parseInt(s.slice(0, 2), 10); min = parseInt(s.slice(2, 4), 10); explicit24 = true; }
  } else {
    return "";
  }
  if (Number.isNaN(h) || Number.isNaN(min)) return "";
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  // 7 through 12 already mean what they say in 24-hour terms, so the rule only
  // ever has to move 1 through 6 into the afternoon.
  if (assumeWorkday && !ampm && !explicit24 && h >= 1 && h <= 6) h += 12;
  if (h > 23 || min > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// "09:00" -> "09:00 AM" (12h with a padded hour).
export function formatTimeDisplay(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return "";
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`;
}
