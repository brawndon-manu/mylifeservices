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
import TimeField from "./TimeField";
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
// shared duration hr/min-from-to inputs. `v` has {fromHrs, fromMin, toHrs, toMin}.
function DurationInputs({ v, set }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted">
      <input type="text" inputMode="numeric" value={v.fromHrs} onChange={(e) => set({ fromHrs: e.target.value })} placeholder="0" className={`${INPUT} mt-0 !w-16`} />
      hr
      <input type="text" inputMode="numeric" value={v.fromMin} onChange={(e) => set({ fromMin: e.target.value })} placeholder="00" className={`${INPUT} mt-0 !w-16`} />
      min
      <span className="px-1 text-faint">to</span>
      <input type="text" inputMode="numeric" value={v.toHrs} onChange={(e) => set({ toHrs: e.target.value })} placeholder="0" className={`${INPUT} mt-0 !w-16`} />
      hr
      <input type="text" inputMode="numeric" value={v.toMin} onChange={(e) => set({ toMin: e.target.value })} placeholder="00" className={`${INPUT} mt-0 !w-16`} />
      min
    </div>
  );
}

function TimeBlock({ value, onChange, hideTime = false, hideDuration = false }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const instant = zonedToInstant(value.date, value.time, value.tz);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className={hideTime ? "sm:col-span-2" : ""}>
        <label className={LABEL}>Date</label>
        <input type="date" value={value.date} onChange={(e) => set({ date: e.target.value })} className={INPUT} />
      </div>
      {!hideTime && (
        <>
          <div>
            <label className={LABEL}>Start time</label>
            <TimeField value={value.time} onChange={(v) => set({ time: v })} />
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
        </>
      )}
      {!hideDuration && (
        <div className="sm:col-span-2">
          <label className={LABEL}>
            Duration estimate <span className="text-faint">(optional)</span>
          </label>
          <DurationInputs
            v={{ fromHrs: value.durFromHrs, fromMin: value.durFromMin, toHrs: value.durToHrs, toMin: value.durToMin }}
            set={(p) => {
              const map = { fromHrs: "durFromHrs", fromMin: "durFromMin", toHrs: "durToHrs", toMin: "durToMin" };
              const patch = {};
              for (const k in p) patch[map[k]] = p[k];
              set(patch);
            }}
          />
          <p className="mt-1 text-xs text-muted">Leave the second pair blank for a single estimate.</p>
        </div>
      )}
    </div>
  );
}

// a date string "YYYY-MM-DD" -> "Mon, Jul 9" (date-only label, tz-agnostic).
function prettyDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return "";
  try {
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

// one date/session card: name (or date caption) + remove, a TimeBlock, and the
// per-session Zoom link toggle. reused by the flat session list and each series.
function OptionCard({ o, index, online, onPatch, onRemove, showName = true, namePrefix = "Session", autoName = null, hideTime = false, hideDuration = false }) {
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="mb-2 flex items-center gap-2">
        {autoName ? (
          // auto-numbered (e.g. series sessions): a fixed, non-editable label.
          <span className="text-sm font-semibold text-foreground">{autoName}</span>
        ) : showName ? (
          o.editing ? (
            <input
              autoFocus
              value={o.name}
              onChange={(e) => onPatch({ name: e.target.value })}
              onBlur={() => onPatch({ editing: false })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onPatch({ editing: false });
                }
              }}
              placeholder={`${namePrefix} ${index + 1}`}
              className={`${INPUT} mt-0 !w-52`}
            />
          ) : (
            <>
              <span className="text-sm font-semibold text-foreground">
                {o.name || `${namePrefix} ${index + 1}`}
              </span>
              <button
                type="button"
                onClick={() => onPatch({ editing: true })}
                aria-label="Rename"
                className="rounded p-1 text-muted transition hover:bg-surface-3 hover:text-brand"
              >
                <PencilIcon />
              </button>
            </>
          )
        ) : (
          <span className="text-sm font-semibold text-foreground">
            {prettyDate(o.date) || `Date ${index + 1}`}
          </span>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          className="ml-auto rounded-md px-2 py-1 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
        >
          ✕
        </button>
      </div>
      <TimeBlock value={o} onChange={(v) => onPatch(v)} hideTime={hideTime} hideDuration={hideDuration} />
      {online && (
        <div className="mt-3">
          <span className={LABEL}>Zoom link for this {showName ? "session" : "date"}</span>
          <div className="mt-1 flex gap-2">
            {[
              ["same", "Same Default Link as Above"],
              ["different", "Different link"],
            ].map(([val, text]) => {
              const on = (o.linkMode || "same") === val;
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => onPatch({ linkMode: val })}
                  className={`flex flex-1 items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${
                    on
                      ? "border-brand bg-sky-50 text-foreground ring-1 ring-brand dark:bg-sky-950/40"
                      : "border-border-strong text-muted hover:border-brand-light"
                  }`}
                >
                  <span
                    className={`h-3.5 w-3.5 flex-none rounded-full border-2 ${
                      on ? "border-brand bg-brand" : "border-border-strong"
                    }`}
                  />
                  {text}
                </button>
              );
            })}
          </div>
          {(o.linkMode || "same") === "different" && (
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <input
                type="url"
                value={o.zoomLink}
                onChange={(e) => onPatch({ zoomLink: e.target.value })}
                placeholder="https://zoom.us/j/..."
                className={INPUT}
              />
              <input
                type="text"
                value={o.zoomCode}
                onChange={(e) => onPatch({ zoomCode: e.target.value })}
                placeholder="Passcode (optional)"
                className={INPUT}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MeetingFields({ defaults = {}, showTimeNotify = false }) {
  const d = defaults;
  const [format, setFormat] = useState(d.meetingFormat || "zoom");
  const [linkTbd, setLinkTbd] = useState(!!d.zoomLinkTbd);
  // mandatory drives the RSVP requirement: when on, we ask for a "Response needed
  // by" date. responding to the meeting is itself the acknowledgment.
  const [mandatory, setMandatory] = useState(!!d.meetingMandatory);
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
      zoomLink: o.zoomLink || "",
      zoomCode: o.zoomCode || "",
      linkMode: o.zoomLink ? "different" : "same",
      seriesId: o.seriesId || null,
      seriesLabel: o.seriesLabel || "",
      editing: false,
    };
  });
  const [hasOptions, setHasOptions] = useState(presetSessions.length > 0);
  const [options, setOptions] = useState(presetSessions);

  // series mode: sessions grouped into named series; attendees pick one date per
  // series. inferred from preset options carrying a seriesId.
  const presetSeries = [];
  for (const o of presetSessions) {
    if (o.seriesId && !presetSeries.some((s) => s.id === o.seriesId)) {
      presetSeries.push({
        id: o.seriesId,
        name: o.seriesLabel || `Series ${presetSeries.length + 1}`,
        editing: false,
      });
    }
  }
  const [seriesMode, setSeriesMode] = useState(presetSeries.length > 0);
  const [seriesList, setSeriesList] = useState(presetSeries);

  // "same time / duration for every session" - set once, applied to all. detect
  // from a preset where every session already shares the same time/tz/duration.
  const durKey = (o) => `${o.durFromHrs}|${o.durFromMin}|${o.durToHrs}|${o.durToMin}`;
  const allSameTime =
    presetSessions.length > 1 &&
    presetSessions.every((o) => o.time && o.time === presetSessions[0].time && o.tz === presetSessions[0].tz);
  const presetHasDur = presetSessions[0] && (presetSessions[0].durFromHrs || presetSessions[0].durFromMin);
  const allSameDur =
    presetSessions.length > 1 && presetSessions.every((o) => durKey(o) === durKey(presetSessions[0]));
  const [sameTime, setSameTime] = useState(allSameTime);
  const [sharedTime, setSharedTime] = useState(allSameTime ? presetSessions[0].time : "");
  const [sharedTz, setSharedTz] = useState(allSameTime ? presetSessions[0].tz : initTz);
  const [sameDur, setSameDur] = useState(!!(allSameDur && presetHasDur));
  const [sharedDur, setSharedDur] = useState({
    fromHrs: allSameDur ? presetSessions[0].durFromHrs : "",
    fromMin: allSameDur ? presetSessions[0].durFromMin : "",
    toHrs: allSameDur ? presetSessions[0].durToHrs : "",
    toMin: allSameDur ? presetSessions[0].durToMin : "",
  });

  // optional "response needed by" date - stored as end-of-day in the author's
  // zone. (the auto second-notice email that uses it lands in a later phase.)
  const presetDue = d.meetingResponseDueAt
    ? instantToZoned(d.meetingResponseDueAt, d.meetingResponseDueTz || initTz).date
    : "";
  const [dueDate, setDueDate] = useState(presetDue);

  // snap the single block's tz to the author's device zone on mount (unless
  // editing a preset). new sessions read the device zone when added.
  useEffect(() => {
    if (!d.meetingTimezone) {
      const tz = deviceTimezone();
      // device zone isn't known during SSR; snap to it after mount (lazy init
      // would hydration-mismatch the server's zone).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSingle((s) => (s.tz === DEFAULT_TZ ? { ...s, tz } : s));
      setSharedTz((z) => (z === DEFAULT_TZ ? tz : z));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const online = formatHasOnline(format);
  const addr = formatHasAddress(format);
  const singleInstant = !hasOptions ? zonedToInstant(single.date, single.time, single.tz) : null;

  const blankOption = (seriesId = null) => ({
    id: crypto.randomUUID(),
    name: "",
    ...blankTime(deviceTimezone()),
    zoomLink: "",
    zoomCode: "",
    linkMode: "same",
    seriesId,
    editing: false,
  });
  const addSession = () =>
    setOptions((o) => [...o, { ...blankOption(), name: `Session ${o.length + 1}` }]);
  const patchSession = (id, patch) =>
    setOptions((o) => o.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const removeSession = (id) => setOptions((o) => o.filter((x) => x.id !== id));

  // series helpers
  const addSeries = () => {
    const sid = crypto.randomUUID();
    setSeriesList((s) => [...s, { id: sid, name: `Series ${s.length + 1}`, editing: false }]);
    setOptions((o) => [...o, { ...blankOption(sid), name: "Session 1" }]);
  };
  const removeSeries = (sid) => {
    setSeriesList((s) => s.filter((x) => x.id !== sid));
    setOptions((o) => o.filter((x) => x.seriesId !== sid));
  };
  const patchSeries = (sid, patch) =>
    setSeriesList((s) => s.map((x) => (x.id === sid ? { ...x, ...patch } : x)));
  const addDate = (sid) =>
    setOptions((o) => {
      const n = o.filter((x) => x.seriesId === sid).length + 1;
      return [...o, { ...blankOption(sid), name: `Session ${n}` }];
    });

  const durMin = (h, m) => {
    const t = (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0);
    return t > 0 ? t : null;
  };
  // serialize sessions to the stored shape. in series mode each option carries
  // its seriesId + seriesLabel, and the label is auto-numbered per series
  // ("Session 1", "Session 2", ...) by position - so it always restarts at 1 in
  // each series and renumbers when one is removed.
  const seriesCounters = {};
  const sessionsJson = JSON.stringify(
    options
      .filter((o) => !seriesMode || o.seriesId)
      .map((o) => {
        let label = (o.name || "").trim() || "Session";
        if (seriesMode && o.seriesId) {
          seriesCounters[o.seriesId] = (seriesCounters[o.seriesId] || 0) + 1;
          label = `Session ${seriesCounters[o.seriesId]}`;
        }
        // "same for all" overrides each session's own time/tz/duration.
        const t = sameTime ? sharedTime : o.time;
        const z = sameTime ? sharedTz : o.tz;
        const base = {
          id: o.id,
          label,
          at: zonedToInstant(o.date, t, z) || "",
          tz: z,
          durationFromMin: sameDur ? durMin(sharedDur.fromHrs, sharedDur.fromMin) : durMin(o.durFromHrs, o.durFromMin),
          durationToMin: sameDur ? durMin(sharedDur.toHrs, sharedDur.toMin) : durMin(o.durToHrs, o.durToMin),
          // only store a per-session link when this session opted for its own;
          // "same" leaves it blank so it falls back to the default link.
          zoomLink: online && o.linkMode === "different" ? (o.zoomLink || "").trim() : "",
          zoomCode: online && o.linkMode === "different" ? (o.zoomCode || "").trim() : "",
        };
        if (seriesMode && o.seriesId) {
          base.seriesId = o.seriesId;
          base.seriesLabel =
            (seriesList.find((s) => s.id === o.seriesId)?.name || "").trim() || "Series";
        }
        return base;
      }),
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
              {hasOptions ? "Default Zoom link" : "Zoom link"}
            </label>
            {linkTbd ? (
              <p className="mt-1 rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-sm text-muted">
                All links will be provided later - attendees get them in the reminder.
              </p>
            ) : (
              <>
                <input id="zoomLink" name="zoomLink" type="url" defaultValue={d.zoomLink || ""} placeholder="https://zoom.us/j/..." className={INPUT} />
                {hasOptions && (
                  <p className="mt-1 text-xs text-muted">
                    Used for every session below, unless a session sets its own.
                  </p>
                )}
              </>
            )}
            <label className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                name="zoomLinkTbd"
                checked={linkTbd}
                onChange={(e) => setLinkTbd(e.target.checked)}
                className="h-4 w-4 accent-brand"
              />
              <span className="text-sm text-foreground">
                Provide the link closer to the date{" "}
                <span className="text-xs text-muted">
                  (we&apos;ll remind you, and attendees get it in the reminder)
                </span>
              </span>
            </label>
          </div>
          {!linkTbd && (
            <div>
              <label htmlFor="zoomCode" className={LABEL}>
                Passcode <span className="text-faint">(optional)</span>
              </label>
              <input id="zoomCode" name="zoomCode" type="text" defaultValue={d.zoomCode || ""} placeholder="e.g. 849302" className={INPUT} />
            </div>
          )}
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
        <input
          type="checkbox"
          name="meetingMandatory"
          checked={mandatory}
          onChange={(e) => setMandatory(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-brand"
        />
        <span>
          <span className="block text-sm font-medium text-foreground">Mandatory</span>
          <span className="block text-xs text-muted">
            Shows a &quot;Mandatory&quot; badge, attendance is required, and everyone
            is asked to respond by a date.
          </span>
        </span>
      </label>

      {mandatory && (
        <div>
          <label className={LABEL}>
            Response needed by <span className="text-faint">(optional)</span>
          </label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={INPUT} />
          <p className="mt-1 text-xs text-muted">
            A deadline to respond. Anyone who hasn&apos;t by then gets a
            second-notice email. Responding is the acknowledgment, so there&apos;s no
            separate step.
          </p>
          <input
            type="hidden"
            name="meetingResponseDueAt"
            value={dueDate ? zonedToInstant(dueDate, "23:59", single.tz) || "" : ""}
          />
          <input type="hidden" name="meetingResponseDueTz" value={single.tz} />
        </div>
      )}

      <div>
        <label className={LABEL}>Reminder</label>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted">
          Send a &quot;starting soon&quot; email
          <input
            name="meetingReminderLeadMin"
            type="text"
            inputMode="numeric"
            defaultValue={d.meetingReminderLeadMin ?? 10}
            className={`${INPUT} mt-0 !w-16`}
          />
          minutes before each session starts.
        </div>
        <label className="mt-2 flex items-center gap-2">
          <input
            type="checkbox"
            name="meetingNightBefore"
            defaultChecked={d.meetingNightBefore !== false}
            className="h-4 w-4 accent-brand"
          />
          <span className="text-sm text-foreground">
            Also send a &quot;meeting tomorrow&quot; reminder the night before{" "}
            <span className="text-xs text-muted">(8pm the day before)</span>
          </span>
        </label>
      </div>

      <div className="border-t border-border pt-4">
        {/* choose single-vs-multi FIRST, then show the matching time fields -
            otherwise checking this box wipes the date/time you just entered */}
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

        {!hasOptions && (
          <div className="mt-4">
            <TimeBlock value={single} onChange={setSingle} />
            <input type="hidden" name="meetingAt" value={singleInstant || ""} />
            <input type="hidden" name="meetingTimezone" value={single.tz} />
            <input type="hidden" name="meetingDurFromHrs" value={single.durFromHrs} />
            <input type="hidden" name="meetingDurFromMin" value={single.durFromMin} />
            <input type="hidden" name="meetingDurToHrs" value={single.durToHrs} />
            <input type="hidden" name="meetingDurToMin" value={single.durToMin} />
          </div>
        )}

        {hasOptions && (
          <div className="mt-3 space-y-4">
            <input type="hidden" name="meetingOptions" value={sessionsJson} />

            <label className="flex items-start gap-3 rounded-md border border-border bg-surface p-3">
              <input
                type="checkbox"
                checked={seriesMode}
                onChange={(e) => {
                  const on = e.target.checked;
                  setSeriesMode(on);
                  if (on && seriesList.length === 0) addSeries();
                }}
                className="mt-0.5 h-4 w-4 accent-brand"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">
                  Organize into series
                </span>
                <span className="block text-xs text-muted">
                  Attendees pick one date from each series (e.g. Series 1 offers two
                  dates, they pick one).
                </span>
              </span>
            </label>

            {/* same time / duration for every session - set once, auto-applied so
                each session below only needs a date. */}
            <div className="space-y-3 rounded-md border border-border bg-surface p-3">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={sameTime} onChange={(e) => setSameTime(e.target.checked)} className="h-4 w-4 accent-brand" />
                <span className="text-sm font-medium text-foreground">Same start time for every session</span>
              </label>
              {sameTime && (
                <div className="grid gap-3 pl-6 sm:grid-cols-2">
                  <div>
                    <label className={LABEL}>Start time</label>
                    <TimeField value={sharedTime} onChange={setSharedTime} />
                  </div>
                  <div>
                    <label className={LABEL}>Time zone</label>
                    <select value={sharedTz} onChange={(e) => setSharedTz(e.target.value)} className={INPUT}>
                      {US_TIMEZONES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                      {!US_TIMEZONES.some((t) => t.value === sharedTz) && (
                        <option value={sharedTz}>{sharedTz}</option>
                      )}
                    </select>
                  </div>
                </div>
              )}
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={sameDur} onChange={(e) => setSameDur(e.target.checked)} className="h-4 w-4 accent-brand" />
                <span className="text-sm font-medium text-foreground">Same duration for every session</span>
              </label>
              {sameDur && (
                <div className="pl-6">
                  <label className={LABEL}>
                    Duration estimate <span className="text-faint">(optional)</span>
                  </label>
                  <DurationInputs v={sharedDur} set={(p) => setSharedDur((s) => ({ ...s, ...p }))} />
                </div>
              )}
            </div>

            {!seriesMode ? (
              <>
                {options.map((o, i) => (
                  <OptionCard
                    key={o.id}
                    o={o}
                    index={i}
                    online={online && !linkTbd}
                    hideTime={sameTime}
                    hideDuration={sameDur}
                    onPatch={(patch) => patchSession(o.id, patch)}
                    onRemove={() => removeSession(o.id)}
                  />
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
              </>
            ) : (
              <div className="space-y-4">
                {seriesList.map((s, si) => {
                  const dates = options.filter((o) => o.seriesId === s.id);
                  return (
                    <div key={s.id} className="rounded-lg border border-border-strong bg-surface-2 p-3">
                      <div className="mb-2 flex items-center gap-2">
                        {s.editing ? (
                          <input
                            autoFocus
                            value={s.name}
                            onChange={(e) => patchSeries(s.id, { name: e.target.value })}
                            onBlur={() => patchSeries(s.id, { editing: false })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                patchSeries(s.id, { editing: false });
                              }
                            }}
                            placeholder={`Series ${si + 1}`}
                            className={`${INPUT} mt-0 !w-52`}
                          />
                        ) : (
                          <>
                            <span className="text-sm font-semibold text-foreground">
                              {s.name || `Series ${si + 1}`}
                            </span>
                            <button
                              type="button"
                              onClick={() => patchSeries(s.id, { editing: true })}
                              aria-label="Rename series"
                              className="rounded p-1 text-muted transition hover:bg-surface-3 hover:text-brand"
                            >
                              <PencilIcon />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => removeSeries(s.id)}
                          aria-label="Remove series"
                          className="ml-auto rounded-md px-2 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50"
                        >
                          Remove series
                        </button>
                      </div>
                      <p className="mb-2 text-xs text-muted">
                        Sessions in this series - attendees pick one:
                      </p>
                      <div className="space-y-3">
                        {dates.map((o, di) => (
                          <OptionCard
                            key={o.id}
                            o={o}
                            index={di}
                            online={online && !linkTbd}
                            autoName={`Session ${di + 1}`}
                            hideTime={sameTime}
                            hideDuration={sameDur}
                            onPatch={(patch) => patchSession(o.id, patch)}
                            onRemove={() => removeSession(o.id)}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => addDate(s.id)}
                        className="mt-2 text-sm font-medium text-brand transition hover:underline"
                      >
                        + Add a session
                      </button>
                    </div>
                  );
                })}
                <button type="button" onClick={addSeries} className="text-sm font-medium text-brand transition hover:underline">
                  + Add a series
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {showTimeNotify && (
        <div className="border-t border-border pt-4">
          <label className={LABEL}>If you change a session time</label>
          <p className="mt-1 text-xs text-muted">
            Anyone who picked a session whose time you change has to RSVP again.
            Nothing is emailed unless you pick a group here.
          </p>
          <div className="mt-2 space-y-1.5">
            {[
              ["none", "Don't email - I'll tell them myself"],
              ["affected", "Email just the people who need to RSVP again"],
              ["everyone", "Email everyone invited"],
            ].map(([val, label]) => (
              <label key={val} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="timeChangeNotify"
                  value={val}
                  defaultChecked={val === "none"}
                  className="h-4 w-4 accent-brand"
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
