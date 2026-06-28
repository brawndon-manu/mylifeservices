"use client";

// the extra form fields for a Company Meeting: kind, format (Zoom / in person /
// hybrid, which decides whether link+passcode and/or address show), mandatory,
// and an optional list of sessions to pick from (with a pick-one-vs-multiple
// setting). serializes the session list to a hidden meetingOptions JSON field.
import { useState, useEffect } from "react";
import {
  MEETING_KINDS,
  MEETING_FORMATS,
  formatHasOnline,
  formatHasAddress,
} from "@/lib/announcements";
import {
  US_TIMEZONES,
  deviceTimezone,
  zonedToInstant,
  instantToZoned,
  formatInstant,
} from "@/lib/meeting-time";

const INPUT =
  "mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";
const LABEL = "block text-sm font-medium text-muted";

export default function MeetingFields({ defaults = {} }) {
  const d = defaults;
  const [format, setFormat] = useState(d.meetingFormat || "zoom");
  const presetOptions =
    Array.isArray(d.meetingOptions) && d.meetingOptions.length
      ? d.meetingOptions
      : [];
  const [hasOptions, setHasOptions] = useState(presetOptions.length > 0);
  const [options, setOptions] = useState(presetOptions);

  // single-meeting date/time/timezone. tz defaults to a stable value for SSR,
  // then snaps to the author's device zone on mount (unless editing a preset).
  const [tz, setTz] = useState(d.meetingTimezone || "America/Los_Angeles");
  const preset = d.meetingAt
    ? instantToZoned(d.meetingAt, d.meetingTimezone || "America/Los_Angeles")
    : { date: "", time: "" };
  const [date, setDate] = useState(preset.date);
  const [time, setTime] = useState(preset.time);
  useEffect(() => {
    if (!d.meetingTimezone) setTz(deviceTimezone());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const online = formatHasOnline(format);
  const addr = formatHasAddress(format);
  const instant = !hasOptions ? zonedToInstant(date, time, tz) : null;

  const addOption = () =>
    setOptions((o) => [...o, { id: crypto.randomUUID(), label: "" }]);
  const setLabel = (id, label) =>
    setOptions((o) => o.map((x) => (x.id === id ? { ...x, label } : x)));
  const removeOption = (id) => setOptions((o) => o.filter((x) => x.id !== id));

  return (
    <div className="space-y-5 rounded-md border border-border bg-surface-2 p-4">
      <p className="text-sm font-semibold text-foreground">Meeting details</p>

      <div>
        <label htmlFor="meetingKind" className={LABEL}>
          Kind of meeting
        </label>
        <select
          id="meetingKind"
          name="meetingKind"
          defaultValue={d.meetingKind || MEETING_KINDS[0]}
          className={INPUT}
        >
          {MEETING_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={LABEL}>Format</label>
        <input type="hidden" name="meetingFormat" value={format} />
        <div className="mt-2 grid grid-cols-3 gap-2">
          {MEETING_FORMATS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFormat(f.value)}
              className={`rounded-md border p-2.5 text-sm transition ${
                format === f.value
                  ? "border-brand bg-sky-50 text-brand ring-1 ring-brand dark:bg-sky-950/40"
                  : "border-border bg-surface text-foreground hover:border-brand-light"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {online && (
        <>
          <div>
            <label htmlFor="zoomLink" className={LABEL}>
              Zoom link
            </label>
            <input
              id="zoomLink"
              name="zoomLink"
              type="url"
              defaultValue={d.zoomLink || ""}
              placeholder="https://zoom.us/j/..."
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="zoomCode" className={LABEL}>
              Passcode <span className="text-faint">(optional)</span>
            </label>
            <input
              id="zoomCode"
              name="zoomCode"
              type="text"
              defaultValue={d.zoomCode || ""}
              placeholder="e.g. 849302"
              className={INPUT}
            />
          </div>
        </>
      )}

      {addr && (
        <div>
          <label htmlFor="meetingAddress" className={LABEL}>
            Address
          </label>
          <input
            id="meetingAddress"
            name="meetingAddress"
            type="text"
            defaultValue={d.meetingAddress || ""}
            placeholder="Street, city, state"
            className={INPUT}
          />
        </div>
      )}

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="meetingMandatory"
          defaultChecked={!!d.meetingMandatory}
          className="mt-0.5 h-4 w-4 accent-brand"
        />
        <span>
          <span className="block text-sm font-medium text-foreground">Mandatory</span>
          <span className="block text-xs text-muted">
            Shows a &quot;Mandatory&quot; badge - attendance is required.
          </span>
        </span>
      </label>

      {!hasOptions && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="meetingDate" className={LABEL}>
              Date
            </label>
            <input
              id="meetingDate"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="meetingTime" className={LABEL}>
              Start time
            </label>
            <input
              id="meetingTime"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={INPUT}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="meetingTzSel" className={LABEL}>
              Time zone <span className="text-faint">(defaults to your device)</span>
            </label>
            <select
              id="meetingTzSel"
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              className={INPUT}
            >
              {US_TIMEZONES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
              {!US_TIMEZONES.some((t) => t.value === tz) && (
                <option value={tz}>{tz}</option>
              )}
            </select>
            {instant && (
              <p className="mt-1 text-xs text-muted">
                Saved as one moment - everyone sees it in their own zone. You&apos;d
                see: {formatInstant(instant, deviceTimezone())}
              </p>
            )}
          </div>
          <input type="hidden" name="meetingAt" value={instant || ""} />
          <input type="hidden" name="meetingTimezone" value={tz} />
        </div>
      )}

      <div>
        <label className={LABEL}>
          Duration estimate <span className="text-faint">(optional)</span>
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted">
          <input name="meetingDurFromHrs" type="number" min="0" max="24" defaultValue={d.meetingDurationFromMin ? Math.floor(d.meetingDurationFromMin / 60) || "" : ""} placeholder="0" className={`${INPUT} mt-0 !w-16`} />
          hr
          <input name="meetingDurFromMin" type="number" min="0" max="59" defaultValue={d.meetingDurationFromMin ? d.meetingDurationFromMin % 60 || "" : ""} placeholder="00" className={`${INPUT} mt-0 !w-16`} />
          min
          <span className="px-1 text-faint">to</span>
          <input name="meetingDurToHrs" type="number" min="0" max="24" defaultValue={d.meetingDurationToMin ? Math.floor(d.meetingDurationToMin / 60) || "" : ""} placeholder="0" className={`${INPUT} mt-0 !w-16`} />
          hr
          <input name="meetingDurToMin" type="number" min="0" max="59" defaultValue={d.meetingDurationToMin ? d.meetingDurationToMin % 60 || "" : ""} placeholder="00" className={`${INPUT} mt-0 !w-16`} />
          min
        </div>
        <p className="mt-1 text-xs text-muted">
          Leave the second pair blank for a single estimate.
        </p>
      </div>

      <div className="border-t border-border pt-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={hasOptions}
            onChange={(e) => {
              setHasOptions(e.target.checked);
              if (e.target.checked && options.length === 0) addOption();
            }}
            className="mt-0.5 h-4 w-4 accent-brand"
          />
          <span>
            <span className="block text-sm font-medium text-foreground">
              Offer multiple sessions to choose from
            </span>
            <span className="block text-xs text-muted">
              Attendees pick which session they&apos;ll attend; you see who picked
              what.
            </span>
          </span>
        </label>

        {hasOptions && (
          <div className="mt-3 space-y-2">
            <input
              type="hidden"
              name="meetingOptions"
              value={JSON.stringify(options.filter((o) => o.label.trim()))}
            />
            {options.map((o, i) => (
              <div key={o.id} className="flex items-center gap-2">
                <input
                  value={o.label}
                  onChange={(e) => setLabel(o.id, e.target.value)}
                  placeholder={`Session ${i + 1} - e.g. Mon Jun 30, 9:00 AM`}
                  className={`${INPUT} mt-0`}
                />
                <button
                  type="button"
                  onClick={() => removeOption(o.id)}
                  aria-label="Remove session"
                  className="rounded-md px-2 py-1.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addOption}
              className="text-sm font-medium text-brand transition hover:underline"
            >
              + Add a session
            </button>

            <label className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                name="meetingMultiPick"
                defaultChecked={!!d.meetingMultiPick}
                className="h-4 w-4 accent-brand"
              />
              <span className="text-sm text-foreground">
                Let attendees pick more than one session
              </span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
