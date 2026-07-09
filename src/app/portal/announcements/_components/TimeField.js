"use client";

// the standard time input across the portal wherever there's a date + start time
// (Company Meetings, Events, ...). accepts loose entry ("9", "9am", "230pm",
// "9:00 AM", "0930", "1430") and normalizes to a padded 12h display ("09:00 AM")
// on blur/Enter, keeping the canonical "HH:MM" (24h) in the parent.
import { useEffect, useRef, useState } from "react";

const INPUT =
  "mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

// loose time entry -> canonical "HH:MM" (24h).
export function parseLooseTime(str) {
  if (!str) return "";
  let s = String(str).trim().toLowerCase().replace(/\s+/g, "").replace(/\./g, "");
  let ampm = "";
  if (s.endsWith("am") || s.endsWith("a")) { ampm = "am"; s = s.replace(/am?$/, ""); }
  else if (s.endsWith("pm") || s.endsWith("p")) { ampm = "pm"; s = s.replace(/pm?$/, ""); }
  s = s.replace(/[^\d:]/g, "");
  let h, min;
  if (s.includes(":")) {
    const [hh, mm] = s.split(":");
    h = parseInt(hh, 10); min = parseInt(mm || "0", 10);
  } else if (/^\d+$/.test(s)) {
    if (s.length <= 2) { h = parseInt(s, 10); min = 0; }
    else if (s.length === 3) { h = parseInt(s.slice(0, 1), 10); min = parseInt(s.slice(1), 10); }
    else { h = parseInt(s.slice(0, 2), 10); min = parseInt(s.slice(2, 4), 10); }
  } else {
    return "";
  }
  if (Number.isNaN(h) || Number.isNaN(min)) return "";
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
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

export default function TimeField({ value, onChange }) {
  const [text, setText] = useState(() => formatTimeDisplay(value));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(formatTimeDisplay(value));
    }
  }, [value]);
  const commit = () => {
    const parsed = parseLooseTime(text);
    if (parsed) {
      last.current = parsed;
      setText(formatTimeDisplay(parsed));
      if (parsed !== value) onChange(parsed);
    } else if (!text.trim() && value) {
      last.current = "";
      onChange("");
    }
  };
  return (
    <input
      type="text"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      placeholder="e.g. 9:00 AM"
      className={INPUT}
    />
  );
}
