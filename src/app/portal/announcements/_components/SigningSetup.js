"use client";

import { useMemo, useState } from "react";
import DatePicker from "@/components/DatePicker";
import {
  generateSigningSlots, describeSetup, minutesOfDay,
} from "@/lib/signing-slots";

// THE WHOLE SETUP FOR AN IN-PERSON SIGNING, as one small form.
//
// Mánu 2026-08-22, after watching twenty session cards get filled in by hand:
// "it should be way easier to set up... TIme slots as its own unique setup."
// A signing week is one rule - which days, which hours, how long, how many at
// once - so the author states the rule and the slots generate themselves.
// Six fields instead of twenty cards.
//
// The output is ordinary meeting options in the hidden `meetingOptions` field,
// exactly what the sessions editor would have produced - so the server action,
// the picker, the roster, the reminders and the attestation flow all run
// unchanged and never know this screen exists.
const LABEL = "block text-sm font-medium text-foreground";
const INPUT =
  "mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground";

// the times somebody would actually pick for office hours, on the half hour
const TIME_CHOICES = [];
for (let h = 6; h <= 20; h++) {
  for (const m of [0, 30]) {
    const label = `${h % 12 === 0 ? 12 : h % 12}:${m === 0 ? "00" : "30"} ${h < 12 ? "AM" : "PM"}`;
    TIME_CHOICES.push({ value: `${String(h).padStart(2, "0")}:${m === 0 ? "00" : "30"}`, label });
  }
}

// AN EDIT OPENS ON WHAT WAS SAVED. The slots store the rule that made them in
// their own ids - "s-2026-08-24-0800" - so the rule is read back off the first
// and last of them. Editing an announcement used to mount this empty, and the
// empty state's hidden field then SAVED as empty: opening Edit and pressing
// Save silently deleted every slot. Manu hit exactly that on 2026-08-23.
function ruleFrom(options) {
  const none = { from: "", to: "", startTime: "08:00", endTime: "18:00", lengthMin: 30, capacity: 10 };
  if (!Array.isArray(options) || !options.length) return none;
  const parse = (id) => {
    const m = /^s-(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})$/.exec(String(id || ""));
    return m ? { date: m[1], min: Number(m[2]) * 60 + Number(m[3]) } : null;
  };
  const parsed = options.map((o) => parse(o.id));
  if (parsed.some((x) => !x)) return none; // not generator-made; start fresh
  const lengthMin = options[0].durationFromMin || 30;
  const firstDay = parsed[0].date;
  const sameDay = parsed.filter((x) => x.date === firstDay).map((x) => x.min);
  const pad2 = (n) => String(n).padStart(2, "0");
  const hhmm = (min) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
  return {
    from: firstDay,
    to: parsed[parsed.length - 1].date,
    startTime: hhmm(Math.min(...sameDay)),
    endTime: hhmm(Math.max(...sameDay) + lengthMin),
    lengthMin,
    capacity: Number.isInteger(options[0].capacity) ? options[0].capacity : "",
  };
}

export default function SigningSetup({ tz, zonedToInstant, initialOptions = [] }) {
  const initial = ruleFrom(initialOptions);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [endTime, setEndTime] = useState(initial.endTime);
  const [lengthMin, setLengthMin] = useState(initial.lengthMin);
  const [capacity, setCapacity] = useState(initial.capacity);

  const slots = useMemo(
    () =>
      generateSigningSlots({
        from, to, startTime, endTime,
        lengthMin: Number(lengthMin) || 0,
        capacity: Number(capacity) || null,
        tz, zonedToInstant,
      }),
    [from, to, startTime, endTime, lengthMin, capacity, tz, zonedToInstant],
  );
  const summary = useMemo(
    () => describeSetup({
      from, to, startTime, endTime,
      lengthMin: Number(lengthMin) || 0,
      capacity: Number(capacity) || 0,
    }),
    [from, to, startTime, endTime, lengthMin, capacity],
  );

  const badWindow =
    minutesOfDay(startTime) != null &&
    minutesOfDay(endTime) != null &&
    minutesOfDay(endTime) <= minutesOfDay(startTime);

  return (
    <div className="mt-4 space-y-4 rounded-md border border-border bg-surface-2 p-4">
      {/* the generated slots ride out through the SAME field the sessions
          editor uses, so the server never knows which screen made them */}
      <input type="hidden" name="meetingOptions" value={JSON.stringify(slots)} />

      {/* THE PORTAL'S OWN DatePicker, not the native date input - Mánu
          2026-08-22. Same calendar popover the user-management profile editor
          uses, with its whole manner: typed MM/DD/YYYY or picked from the
          grid, and the popover opens above or below by where the field sits,
          flipping live as you scroll. Controlled mode hands back the same
          YYYY-MM-DD string the generator already reads. */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL} htmlFor="signing-from">First day</label>
          <DatePicker id="signing-from" value={from} onChange={setFrom} inputClassName={`${INPUT} pr-10`} />
        </div>
        <div>
          <label className={LABEL} htmlFor="signing-to">Last day</label>
          <DatePicker id="signing-to" value={to} onChange={setTo} inputClassName={`${INPUT} pr-10`} />
        </div>
      </div>
      <p className="text-xs text-muted">
        Weekends in the range are skipped - a Monday-to-Friday week stays five days.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL} htmlFor="signing-start">Office hours from</label>
          <select
            id="signing-start" value={startTime}
            onChange={(e) => setStartTime(e.target.value)} className={INPUT}
          >
            {TIME_CHOICES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="signing-end">to</label>
          <select
            id="signing-end" value={endTime}
            onChange={(e) => setEndTime(e.target.value)} className={INPUT}
          >
            {TIME_CHOICES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL} htmlFor="signing-length">Appointment length</label>
          <select
            id="signing-length" value={String(lengthMin)}
            onChange={(e) => setLengthMin(Number(e.target.value))} className={INPUT}
          >
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="45">45 minutes</option>
            <option value="60">1 hour</option>
            <option value="120">2 hours</option>
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="signing-cap">People per slot</label>
          <input
            id="signing-cap" type="number" min="1" inputMode="numeric"
            value={capacity}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              setCapacity(Number.isFinite(n) && n > 0 ? n : "");
            }}
            className={INPUT}
          />
        </div>
      </div>

      {/* WHAT THIS RULE PRODUCES, before anything is published - the numbers
          and nothing else. This carried a second sentence nudging the author
          toward fewer slots, and Mánu read it exactly right on 2026-08-22:
          "AI wrote this and is talking to the person who wrote the prompt."
          Portal copy states facts in the product's own voice; it does not
          advise its author. A hundred slots is also simply this feature's
          normal shape - Kristy's week IS 8 to 6 at 30 minutes - so the list
          being long is the picker's problem to lay out, not the author's to
          avoid. */}
      {badWindow ? (
        <p className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          The end of the office hours has to come after the start.
        </p>
      ) : summary.total > 0 ? (
        <p className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-foreground">
          {summary.days} {summary.days === 1 ? "day" : "days"} × {summary.perDay} slots ={" "}
          <strong>{summary.total} time slots</strong>
          {summary.places != null && <>, room for {summary.places} sign-ups</>}.
        </p>
      ) : (
        <p className="text-xs text-muted">
          Pick the first and last day and the slots build themselves.
        </p>
      )}
    </div>
  );
}
