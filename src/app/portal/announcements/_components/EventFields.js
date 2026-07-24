"use client";

// the extra form fields for an Event: who it's for (employee vs client), a date +
// start/optional-end time in a timezone, and a venue name + address (the address
// drives the Google Map embed on the detail page). staff RSVP for a headcount on
// the detail page; no RSVP config needed here.
import { useEffect, useState } from "react";
import DatePicker from "@/components/DatePicker";
import { EVENT_AUDIENCES } from "@/lib/announcements";
import {
  US_TIMEZONES,
  deviceTimezone,
  zonedToInstant,
  instantToZoned,
  formatInstant,
} from "@/lib/meeting-time";
import TimeField from "./TimeField";

const INPUT =
  "mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";
const LABEL = "block text-sm font-medium text-muted";
const DEFAULT_TZ = "America/Los_Angeles";

// a date string "YYYY-MM-DD" -> "Sat, Aug 23, 2026" (month-name format, tz-agnostic).
function prettyDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return "";
  try {
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export default function EventFields({ defaults = {} }) {
  const d = defaults;
  const initTz = d.eventTimezone || DEFAULT_TZ;
  const startZ = d.eventAt ? instantToZoned(d.eventAt, initTz) : null;
  const endZ = d.eventEndAt ? instantToZoned(d.eventEndAt, initTz) : null;

  const [audience, setAudience] = useState(d.eventAudience || "employee");
  const [date, setDate] = useState(startZ?.date || "");
  const [start, setStart] = useState(startZ?.time || "");
  const [end, setEnd] = useState(endZ?.time || "");
  const [tz, setTz] = useState(initTz);

  // snap to the author's device zone on mount (unless editing a preset).
  useEffect(() => {
    if (!d.eventTimezone) {
      const dz = deviceTimezone();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTz((z) => (z === DEFAULT_TZ ? dz : z));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startInstant = zonedToInstant(date, start, tz) || "";
  const endInstant = end ? zonedToInstant(date, end, tz) || "" : "";

  return (
    <div className="space-y-5 rounded-md border border-border bg-surface-2 p-4">
      <p className="text-sm font-semibold text-foreground">Event details</p>

      <div>
        <label className={LABEL}>Who&apos;s it for?</label>
        <input type="hidden" name="eventAudience" value={audience} />
        <div className="mt-2 grid grid-cols-2 gap-2">
          {EVENT_AUDIENCES.map((a) => {
            const on = audience === a.value;
            const ring = a.value === "client" ? "border-amber-500 ring-amber-500 bg-amber-50 dark:bg-amber-950/30" : "border-brand ring-brand bg-sky-50 dark:bg-sky-950/40";
            return (
              <button
                key={a.value}
                type="button"
                onClick={() => setAudience(a.value)}
                className={`rounded-md border p-3 text-left transition ${on ? `${ring} ring-1` : "border-border bg-surface hover:border-brand-light"}`}
              >
                <span className="block text-sm font-semibold text-foreground">{a.label}</span>
                <span className="block text-xs text-muted">{a.blurb}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL}>Date</label>
          <DatePicker value={date} onChange={setDate} inputClassName={`${INPUT} pr-10`} />
          {date && <p className="mt-1 text-xs text-muted">{prettyDate(date)}</p>}
        </div>
        <div>
          <label className={LABEL}>Time zone</label>
          <select value={tz} onChange={(e) => setTz(e.target.value)} className={INPUT}>
            {US_TIMEZONES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
            {!US_TIMEZONES.some((t) => t.value === tz) && <option value={tz}>{tz}</option>}
          </select>
        </div>
        <div>
          <label className={LABEL}>Start time</label>
          <TimeField value={start} onChange={setStart} />
        </div>
        <div>
          <label className={LABEL}>
            End time <span className="text-faint">(optional)</span>
          </label>
          <TimeField value={end} onChange={setEnd} />
        </div>
      </div>
      {startInstant && (
        <p className="-mt-2 text-xs text-muted">
          Saved as one moment - everyone sees it in their own zone. You&apos;d see:{" "}
          {formatInstant(startInstant, deviceTimezone())}
        </p>
      )}

      <div>
        <label htmlFor="eventLocationName" className={LABEL}>Location name</label>
        <input id="eventLocationName" name="eventLocationName" type="text" defaultValue={d.eventLocationName || ""} placeholder="e.g. Craig Regional Park - Shelter 3" className={INPUT} />
      </div>
      <div>
        <label htmlFor="eventAddress" className={LABEL}>
          Address <span className="text-faint">(optional, shows a map)</span>
        </label>
        <input id="eventAddress" name="eventAddress" type="text" defaultValue={d.eventAddress || ""} placeholder="Street, city, state" className={INPUT} />
      </div>

      <input type="hidden" name="eventAt" value={startInstant} />
      <input type="hidden" name="eventEndAt" value={endInstant} />
      <input type="hidden" name="eventTimezone" value={tz} />
    </div>
  );
}
