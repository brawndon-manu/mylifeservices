"use client";

// the standard time input across the portal wherever there's a date + start time
// (Company Meetings, Events, ...). accepts loose entry ("9", "9am", "230pm",
// "9:00 AM", "0930", "1430") and normalizes to a padded 12h display ("09:00 AM")
// on blur/Enter, keeping the canonical "HH:MM" (24h) in the parent.
import { useEffect, useRef, useState } from "react";
// the parsing moved to src/lib/loose-time.js when the timesheet needed it too.
// re-exported here so this module's API is unchanged.
import { parseLooseTime, formatTimeDisplay } from "@/lib/loose-time";

export { parseLooseTime, formatTimeDisplay };

const INPUT =
  "mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

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
