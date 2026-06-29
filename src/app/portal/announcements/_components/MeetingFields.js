"use client";

// the extra form fields for a Company Meeting: kind, format (Zoom / in person /
// hybrid, which decides whether link+passcode and/or address show), mandatory,
// and the time block (date / start time / timezone / duration). when "offer
// multiple sessions" is on, each session carries its OWN time block + an
// editable name (default "Session N"), serialized to a hidden meetingOptions
// JSON field. otherwise the single meeting's time is emitted as hidden fields.
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
const DEFAULT_TZ = "America/Los_Angeles";

function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M4 13.5V16h2.5l7.4-7.4-2.5-2.5L4 13.5z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.6 5.4l1.4-1.4a1 1 0 0 1 1.4 0l1.1 1.1a1 1 0 0 1 0 1.4l-1.4 1.4-2.5-2.5z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const splitHrs = (min) => (min ? String(Math.floor(min / 60) || "") : "");
const splitMin = (min) => (min ? String(min % 60 || "") : "");

// a blank time block keyed to a timezone.
const blankTime = (tz) => ({
  date: "",
  time: "",
  tz,
  durFromHrs: "",
  durFromMin: "",
  durToHrs: "",
  durToMin: "",
});

// the shared date / start time / timezone / duration block (controlled). used
// for the single meeting AND each session so they look identical.
function TimeBlock({ value, onChange }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const instant = zonedToInstant(value.date, value.time, value.tz);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className={LABEL}>Date</label>
        <input type="date" value={value.date} onChange={(e) => set({ date: e.target.value })} className={INPUT} />
      </div>
      <div>
        <label className={LABEL}>Start time</label>
        <input type="time" value={value.time} onChange={(e) => set({ time: e.target.value })} className={INPUT} />
      </div>
      <div className="sm:col-span-2">
        <label className={LABEL}>
          Time zone <span className="text-faint">(defaults to your device)</span>
        </label>
        <select value={value.tz} onChange={(e) => set({ tz: e.target.value })} className={INPUT}>
          {US_TIMEZONES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
          {!US_TIMEZONES.some((t) => t.value === value.tz) && (
            <option value={value.tz}>{value.tz}</option>
          )}
        </select>
        {instant && (
          <p className="mt-1 text-xs text-muted">
            Saved as one moment - everyone sees it in their own zone. You&apos;d
            see: {formatInstant(instant, deviceTimezone())}
          </p>
        )}
      </div>
      <div className="sm:col-span-2">
        <label className={LABEL}>
          Duration estimate <span className="text-faint">(optional)</span>
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted">
          <input type="text" inputMode="numeric" value={value.durFromHrs} onChange={(e) => set({ durFromHrs: e.target.value })} placeholder="0" className={`${INPUT} mt-0 !w-16`} />
          hr
          <input type="text" inputMode="numeric" value={value.durFromMin} onChange={(e) => set({ durFromMin: e.target.value })} placeholder="00" className={`${INPUT} mt-0 !w-16`} />
          min
          <span className="px-1 text-faint">to</span>
          <input type="text" inputMode="numeric" value={value.durToHrs} onChange={(e) => set({ durToHrs: e.target.value })} placeholder="0" className={`${INPUT} mt-0 !w-16`} />
          hr
          <input type="text" inputMode="numeric" value={value.durToMin} onChange={(e) => set({ durToMin: e.target.value })} placeholder="00" className={`${INPUT} mt-0 !w-16`} />
          min
        </div>
        <p className="mt-1 text-xs text-muted">Leave the second pair blank for a single estimate.</p>
      </div>
    </div>
  );
}

export default function MeetingFields({ defaults = {} }) {
  const d = defaults;
  const [format, setFormat] = useState(d.meetingFormat || "zoom");
  const initTz = d.meetingTimezone || DEFAULT_TZ;

  // single-meeting time block (used when NOT offering sessions).
  const presetSingle = d.meetingAt ? instantToZoned(d.meetingAt, initTz) : null;
  const [single, setSingle] = useState({
    date: presetSingle?.date || "",
    time: presetSingle?.time || "",
    tz: initTz,
    durFromHrs: splitHrs(d.meetingDurationFromMin),
    durFromMin: splitMin(d.meetingDurationFromMin),
    durToHrs: splitHrs(d.meetingDurationToMin),
    durToMin: splitMin(d.meetingDurationToMin),
  });

  // sessions: each carries its own time block + a name.
  const presetSessions = (Array.isArray(d.meetingOptions) ? d.meetingOptions : []).map((o, i) => {
    const z = o.at ? instantToZoned(o.at, o.tz || initTz) : { date: "", time: "" };
    return {
      id: String(o.id || `opt${i}`),
      name: o.label || `Session ${i + 1}`,
      date: z.date,
      time: z.time,
      tz: o.tz || initTz,
      durFromHrs: splitHrs(o.durationFromMin),
      durFromMin: splitMin(o.durationFromMin),
      durToHrs: splitHrs(o.durationToMin),
      durToMin: splitMin(o.durationToMin),
      editing: false,
    };
  });
  const [hasOptions, setHasOptions] = useState(presetSessions.length > 0);
  const [options, setOptions] = useState(presetSessions);

  // snap the single block's tz to the author's device zone on mount (unless
  // editing a preset). new sessions read the device zone when added.
  useEffect(() => {
    if (!d.meetingTimezone) {
      const tz = deviceTimezone();
      // device zone isn't known during SSR; snap to it after mount (lazy init
      // would hydration-mismatch the server's zone).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSingle((s) => (s.tz === DEFAULT_TZ ? { ...s, tz } : s));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const online = formatHasOnline(format);
  const addr = formatHasAddress(format);
  const singleInstant = !hasOptions ? zonedToInstant(single.date, single.time, single.tz) : null;

  const addSession = () =>
    setOptions((o) => [
      ...o,
      { id: crypto.randomUUID(), name: `Session ${o.length + 1}`, ...blankTime(deviceTimezone()), editing: false },
    ]);
  const patchSession = (id, patch) =>
    setOptions((o) => o.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const removeSession = (id) => setOptions((o) => o.filter((x) => x.id !== id));

  const durMin = (h, m) => {
    const t = (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0);
    return t > 0 ? t : null;
  };
  // serialize sessions to the stored shape { id, label, at, tz, durationFromMin, durationToMin }.
  const sessionsJson = JSON.stringify(
    options.map((o) => ({
      id: o.id,
      label: (o.name || "").trim() || "Session",
      at: zonedToInstant(o.date, o.time, o.tz) || "",
      tz: o.tz,
      durationFromMin: durMin(o.durFromHrs, o.durFromMin),
      durationToMin: durMin(o.durToHrs, o.durToMin),
    })),
  );

  return (
    <div className="space-y-5 rounded-md border border-border bg-surface-2 p-4">
      <p className="text-sm font-semibold text-foreground">Meeting details</p>

      <div>
        <label htmlFor="meetingKind" className={LABEL}>
          Kind of meeting
        </label>
        <select id="meetingKind" name="meetingKind" defaultValue={d.meetingKind || MEETING_KINDS[0]} className={INPUT}>
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
            <input id="zoomLink" name="zoomLink" type="url" defaultValue={d.zoomLink || ""} placeholder="https://zoom.us/j/..." className={INPUT} />
          </div>
          <div>
            <label htmlFor="zoomCode" className={LABEL}>
              Passcode <span className="text-faint">(optional)</span>
            </label>
            <input id="zoomCode" name="zoomCode" type="text" defaultValue={d.zoomCode || ""} placeholder="e.g. 849302" className={INPUT} />
          </div>
        </>
      )}

      {addr && (
        <div>
          <label htmlFor="meetingAddress" className={LABEL}>
            Address
          </label>
          <input id="meetingAddress" name="meetingAddress" type="text" defaultValue={d.meetingAddress || ""} placeholder="Street, city, state" className={INPUT} />
        </div>
      )}

      <label className="flex items-start gap-3">
        <input type="checkbox" name="meetingMandatory" defaultChecked={!!d.meetingMandatory} className="mt-0.5 h-4 w-4 accent-brand" />
        <span>
          <span className="block text-sm font-medium text-foreground">Mandatory</span>
          <span className="block text-xs text-muted">
            Shows a &quot;Mandatory&quot; badge - attendance is required.
          </span>
        </span>
      </label>

      {!hasOptions && (
        <>
          <TimeBlock value={single} onChange={setSingle} />
          <input type="hidden" name="meetingAt" value={singleInstant || ""} />
          <input type="hidden" name="meetingTimezone" value={single.tz} />
          <input type="hidden" name="meetingDurFromHrs" value={single.durFromHrs} />
          <input type="hidden" name="meetingDurFromMin" value={single.durFromMin} />
          <input type="hidden" name="meetingDurToHrs" value={single.durToHrs} />
          <input type="hidden" name="meetingDurToMin" value={single.durToMin} />
        </>
      )}

      <div className="border-t border-border pt-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={hasOptions}
            onChange={(e) => {
              setHasOptions(e.target.checked);
              if (e.target.checked && options.length === 0) addSession();
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
          <div className="mt-3 space-y-4">
            <input type="hidden" name="meetingOptions" value={sessionsJson} />
            {options.map((o, i) => (
              <div key={o.id} className="rounded-md border border-border bg-surface p-3">
                <div className="mb-2 flex items-center gap-2">
                  {o.editing ? (
                    <input
                      autoFocus
                      value={o.name}
                      onChange={(e) => patchSession(o.id, { name: e.target.value })}
                      onBlur={() => patchSession(o.id, { editing: false })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          patchSession(o.id, { editing: false });
                        }
                      }}
                      placeholder={`Session ${i + 1}`}
                      className={`${INPUT} mt-0 !w-52`}
                    />
                  ) : (
                    <>
                      <span className="text-sm font-semibold text-foreground">
                        {o.name || `Session ${i + 1}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => patchSession(o.id, { editing: true })}
                        aria-label="Rename session"
                        className="rounded p-1 text-muted transition hover:bg-surface-3 hover:text-brand"
                      >
                        <PencilIcon />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => removeSession(o.id)}
                    aria-label="Remove session"
                    className="ml-auto rounded-md px-2 py-1 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                  >
                    ✕
                  </button>
                </div>
                <TimeBlock value={o} onChange={(v) => patchSession(o.id, v)} />
              </div>
            ))}
            <button type="button" onClick={addSession} className="text-sm font-medium text-brand transition hover:underline">
              + Add a session
            </button>

            <label className="mt-2 flex items-center gap-2">
              <input type="checkbox" name="meetingMultiPick" defaultChecked={!!d.meetingMultiPick} className="h-4 w-4 accent-brand" />
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
