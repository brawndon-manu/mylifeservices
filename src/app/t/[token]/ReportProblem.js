"use client";

// the employee's side of a correction. they build up a list of what's wrong -
// usually one day, sometimes a few - and send it in one go, so payroll gets a
// single message rather than an email per item.
//
// which options show for a day depends on what the punches actually say. there
// is no point offering "I did take my lunch, it just isn't punched" on a day
// that already has a punched lunch; the honest option there is the opposite
// one. filtering it this way is also what stops people picking the option that
// happens to pay more without noticing it doesn't describe their day.
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useReviewFlow, REPORTS_PENDING, reportSlots, ChangeLines } from "./ReviewFlow";
import { CORRECTION_KINDS, addsWorkHours, correctionNoteProblem, ADDED_HOURS_REASON, REMOVED_HOURS_REASON, CHANGE_REASON } from "@/lib/timesheet/corrections";
import { NEEDS_REAL_WORDS } from "@/lib/timesheet/meaningful-text";
import { kindsForDay } from "@/lib/timesheet/report-kinds";
// the attestation covers the tens now - see rest-attestation.js
// the same loose reading the question cards use, so "331" means 3:31 here too
import { parseLooseTime, formatTimeDisplay } from "@/lib/loose-time";
// the period's own day list, the same one the time-off card offers - a
// missing day is by definition one of the period's dates the sheet lacks
import { periodDates } from "@/lib/timesheet/time-off";
import reviewStyles from "./ReviewFlow.module.css";
// the engine's own punch-pair reader, so the boxes open on exactly the shifts
// the calendar draws
import { shiftsOf } from "@/lib/timesheet/questions";
// THE FULL DAY'S SLOTS. Same module the server checks with - see work-slots.js
import {
  checkWorkSlots,
  slotsFromShifts,
  clockLabel,
  kindTakesSlots,
  readSlot,
  slotHours,
  slotProblems,
  MAX_SLOTS,
} from "@/lib/timesheet/work-slots";


const fmt = (n) => (Math.round((n || 0) * 100) / 100).toFixed(2);
// "Thu, Jul 16" from the sheet's own "07/16/26", for the Live offer's lines
const shortDay = (date) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(date || "");
  if (!m) return date;
  return new Date(2000 + Number(m[3]), Number(m[1]) - 1, Number(m[2]))
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};

// `live`, `employeeName`, `acceptAction`: Live only. Office staff who send a
// report from somebody's page get the offer to accept it on the spot, so the
// sheet can be generated straight away - see acceptReportsNow.
export default function ReportProblem({ token, days, submitAction, period = null, live = false, employeeName = null, acceptAction = null }) {
  const flow = useReviewFlow();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [localItems, setLocalItems] = useState([]);
  const items = flow?.items ?? localItems;
  const setItems = flow?.setItems ?? setLocalItems;
  const [editingIndex, setEditingIndex] = useState(null);
  const [date, setDate] = useState(days[0]?.date || "");
  // WHICH date the missing day was. It used to ride the note in prose, and an
  // accepted claim then patched nothing - the override write is keyed on the
  // row's date, and a null date was dropped without a word. Bustamante 08/28,
  // 2026-09-02: accepted, "Adds a 8.00 hr day", and 88 stayed 88.
  const [newDayDate, setNewDayDate] = useState("");
  const [kind, setKind] = useState("hours");
  const [times, setTimes] = useState([]);
  // THE WHOLE DAY, NOT THE DIFFERENCE. An hours claim carries every work slot
  // for the day, unchanged ones included, so payroll gets a day it can rebuild
  // rather than a number it has to guess the shape of.
  const [slots, setSlots] = useState([]);
  // THE DAY AS RECORDED, slot by slot, so a box somebody changes can show the
  // time it had before. Seeded from the day's own
  // shifts whenever the form opens on a day - never from a draft, so editing
  // a draft still compares with the record.
  const [seed, setSeed] = useState([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  // Live's offer to accept what was just sent: { ids, items } while it stands
  const [offer, setOffer] = useState(null);

  const NEW_DAY = "__new__";
  const NO_DAY = "__sheet__";

  const day = days.find((d) => d.date === date) || null;
  const available =
    date === NEW_DAY ? ["day_missing"] : date === NO_DAY ? ["other"] : kindsForDay(day);
  const activeKind = available.includes(kind) ? kind : available[0];
  const meta = CORRECTION_KINDS[activeKind];

  // AN UNPUNCHED BREAK NEEDS ITS TIME. One box for a lunch; for rests, one per
  // ten the punches are short (capped at the two a day can owe). The email the
  // office works from prints exactly these times.
  const timeSlots = !meta?.asksTimes
    ? 0
    : meta.asksTimes === "meal"
      ? 1
      : Math.min(2, Math.max(1, (day?.restRequired || 0) - (day?.restCount || 0)));
  // "HH:MM" on a readable time, null otherwise - parseLooseTime says "" for
  // unreadable, and "" slips straight through a `== null` check
  const timeMin = (i) => parseLooseTime(times[i] || "", { assumeWorkday: true }) || null;

  // an existing day opens on its own punches; a missing day opens blank
  function slotsForDay(nextKind, nextDay) {
    if (!kindTakesSlots(nextKind)) return [];
    const from = nextDay ? slotsFromShifts(shiftsOf(nextDay)) : [];
    return from.length ? from : [{ from: "", to: "" }];
  }

  const takesSlots = kindTakesSlots(activeKind);
  // THE DAY'S HOURS ARE THE SLOTS ADDED UP, never typed (Mánu 2026-09-25).
  // Every kind that asks for hours takes slots, so the figure is read off
  // them: the box that used to hold it is gone, and the total cannot
  // disagree with the slots under it.
  // a slot that runs into another, or ends before it starts, is refused as
  // typed - the box at fault red, no total - not just on Add: the rules of
  // the day apply while it is being described. see slotProblems
  const problems = takesSlots ? slotProblems(slots, seed) : { boxes: new Set(), ok: true };
  const slotTotal = takesSlots && problems.ok ? slotHours(slots) : null;
  const hours = slotTotal == null ? "" : String(slotTotal);
  const slotCheck = takesSlots ? checkWorkSlots(slots, hours) : null;
  const addingHours = activeKind === "day_missing"
    || addsWorkHours(activeKind, day, hours)
    || addsWorkHours(activeKind, day, slotCheck?.hours);
  // AN HOURS REPORT ALWAYS CARRIES A REASON: the box used to
  // turn optional when the day came out shorter. Which reason it asks for
  // follows the change - adding, removing, or the same hours moved about.
  const needsNote = meta?.needsNote || takesSlots;
  const removingHours = takesSlots && !addingHours && !!day && slotTotal != null && slotTotal < (day.paidHours || 0);
  const reasonLine = addingHours ? ADDED_HOURS_REASON : removingHours ? REMOVED_HOURS_REASON : takesSlots ? CHANGE_REASON : null;
  const setSlot = (i, key, value) =>
    setSlots((prev) => prev.map((s, j) => (j === i ? { ...s, [key]: value } : s)));
  const displayTime = (raw) => {
    const parsed = parseLooseTime(raw, { assumeWorkday: true });
    return parsed ? formatTimeDisplay(parsed) : raw;
  };

  useImperativeHandle(flow?.reportRef, () => ({
    start(wantedDate, index = null) {
      const item = index == null ? null : items[index];
      const chosen = item ? item.date : wantedDate;
      const recorded = days.find((d) => d.date === chosen) || null;
      const nextKind = item?.kind || (recorded ? "hours" : "day_missing");
      setDate(item && !item.date ? NO_DAY : recorded ? chosen : NEW_DAY);
      setNewDayDate(recorded ? "" : chosen || "");
      setKind(nextKind);
      setSlots(item?.slots ? item.slots.map((slot) => ({ ...slot })) : slotsForDay(nextKind, recorded));
      setSeed(slotsForDay(nextKind, recorded));
      setTimes(item?.times || []);
      setNote(item?.note || "");
      setEditingIndex(index);
      setError(null);
      setOpen(true);
    },
    // the floating bar's Cancel, while the form is open
    cancel,
  }));

  function cancel() {
    setOpen(false);
    setEditingIndex(null);
    flow?.setEditorTarget(null);
  }

  // THE FORM COMES INTO VIEW, the page does not jump to the top of the day. it
  // opens at the bottom of the day's card, which can be well below the screen
  // when Report a problem is pressed from the floating bar, so once it is on the
  // page its top is brought up under the header - and only when it is not
  // already sitting in the top part of the screen.
  const editorRef = useRef(null);
  const editorTarget = flow?.editorTarget || null;
  useEffect(() => {
    if (!open || !editorTarget) return;
    const el = editorRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    if (top < 96 || top > window.innerHeight * 0.6) window.scrollBy({ top: top - 96 });
  }, [open, editorTarget]);

  function add() {
    setError(null);
    if (takesSlots) {
      const check = checkWorkSlots(slots, hours);
      if (!check.ok) {
        setError(check.message);
        return;
      }
    }
    if (meta?.asksHours && !hours) {
      setError("Add the day's work slots, so payroll knows what to check.");
      return;
    }
    if (timeSlots > 0) {
      for (let i = 0; i < timeSlots; i += 1) {
        if (timeMin(i) == null) {
          setError("Enter the time it started.");
          return;
        }
      }
    }
    const noteProblem = correctionNoteProblem(activeKind, day, hours, note);
    if (noteProblem) {
      setError(noteProblem === "junk" ? NEEDS_REAL_WORDS
        : noteProblem === "addedHoursReason" ? ADDED_HOURS_REASON
          : noteProblem === "changeReason" ? (reasonLine || CHANGE_REASON)
            : "Tell us briefly what's wrong.");
      return;
    }
    if (date === NEW_DAY && !newDayDate) {
      setError("Pick the day you worked.");
      return;
    }
    const item = {
        date: date === NO_DAY ? null : date === NEW_DAY ? newDayDate : date,
        kind: activeKind,
        claimedHours: meta?.asksHours && hours ? Number(hours) : null,
        // raw as typed, like `times` above - the server runs the same
        // checkWorkSlots on the employee's own input rather than trusting our
        // reading of it
        slots: takesSlots ? slots.map((sl) => ({ from: sl.from, to: sl.to })) : null,
        // raw as typed; the server reads them the same way the box did
        times: timeSlots > 0 ? times.slice(0, timeSlots) : null,
        note: note.trim() || null,
      };
    if (items.some((other, i) => i !== editingIndex && other.date === item.date
      && (other.kind === item.kind || other.kind === "day_extra" || item.kind === "day_extra"))) {
      setError("This day already has that correction. Edit the existing issue in review.");
      return;
    }
    setItems((prev) => editingIndex == null ? [...prev, item] : prev.map((old, i) => i === editingIndex ? item : old));
    if (flow) cancel();
    setTimes([]);
    setSlots([]);
    setNote("");
  }

  async function send() {
    setError(null);
    const payload = items.length ? items : null;
    if (!payload) {
      setError("Add what's wrong first.");
      return;
    }
    setBusy(true);
    try {
      const res = await submitAction({ token, items: payload });
      if (res?.ok) {
        setDone(true);
        flow?.setReported(true);
        // Live: the office can accept what it just sent, right here
        if (live && acceptAction && Array.isArray(res.ids) && res.ids.length) setOffer({ ids: res.ids, items: payload });
        // the page's own rows take over from the drafts - see ToldUsPanel
        router.refresh();
      }
      else setError(messageFor(res));
    } catch {
      setError("Something went wrong sending that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // ACCEPT NOW, from Live (Mánu 2026-09-25, the mock's fourth frame). The same
  // decision the desk would make, made from the page the report was sent
  // from; the sheet rebuilds and this tab follows it like any decision.
  async function acceptNow() {
    setError(null);
    setBusy(true);
    try {
      const res = await acceptAction({ token, ids: offer.ids });
      if (res?.ok) { setOffer(null); setDone(false); }
      else setError(res?.error === "changed"
        ? "These reports have already been decided. Reload the page to see where they stand."
        : "Something went wrong accepting that. Please try again.");
    } catch {
      setError("Something went wrong accepting that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (offer) {
    return (
      <div className="mt-6 rounded-xl bg-surface px-5 py-4 shadow-sm night:ring-1 night:ring-border">
        <p className="text-sm font-semibold text-foreground">Accept these changes now?</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          You are in Live on {employeeName || "this person"}&apos;s timesheet. Accepting applies the changes now, so their timesheet can be generated.
        </p>
        <ul className="mt-3 divide-y divide-sep">
          {offer.items.map((item, i) => {
            const before = days.find((d) => d.date === item.date) || null;
            return (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-[13px]">
                <span className="font-semibold text-foreground">{item.date ? shortDay(item.date) : "This timesheet"}</span>
                <span className="text-muted">
                  {CORRECTION_KINDS[item.kind]?.label}
                  {item.claimedHours != null && <> · <span className={`tabular-nums text-foreground ${reviewStyles.hours}`}>{fmt(before?.paidHours)} → {fmt(item.claimedHours)}</span> hrs</>}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button type="button" onClick={acceptNow} disabled={busy} className="min-h-[44px] rounded-[9px] bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? "Accepting..." : "Accept now"}</button>
          <button type="button" onClick={() => setOffer(null)} disabled={busy} className="min-h-[44px] text-sm text-muted disabled:opacity-50">Leave it for review</button>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      </div>
    );
  }

  if (done) {
    return (
      <div className="amber-tint-card mt-6 rounded-xl px-5 py-4 shadow-sm night:ring-1 night:ring-border">
        <p className="text-sm font-semibold text-foreground">
          Thanks - payroll has been told.
        </p>
        {/* A REPORTED SHEET WAITS FOR PAYROLL (Mánu 2026-09-25, his words),
            going back on the 09-09 pending document this line used to
            describe: nothing signs until the reports are decided, and the
            email says when. The same sentence holds the Generate band. */}
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          {REPORTS_PENDING}
        </p>
      </div>
    );
  }

  if (flow?.stage === "reports") {
    return (
      <section className="mt-7">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Your reports</h2>
        {/* THE LINE HAS TO SAY THE TRUE THING IN BOTH CASES - Mánu 2026-09-16,
            on an ILS sheet of his own: it named a step ILS does not have (the
            PTO stage is the day program's alone since 7581540), and under an
            empty list "review these" sat above "No problems reported", which he
            read as off. Empty says so and stops; a list says what comes next,
            and what comes next depends on the program. Wording his. */}
        <p className="mt-2 text-sm text-muted">
          {items.length === 0
            ? "Nothing reported on this timesheet."
            : flow?.leave
              ? "Review these before moving to PTO & sick pay."
              : "Review these before you generate your document."}
        </p>
        <ul className="mt-5 divide-y divide-sep">
          {items.map((item, index) => {
            const before = days.find((day) => day.date === item.date);
            // only what the report changes, the way the card under the day
            // shows it - see reportSlots
            const { minuteSlots, changes } = reportSlots(item, before);
            return (
              <li key={index} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h3 className="font-medium text-foreground">{item.date || "This timesheet"}</h3><p className="mt-1 text-sm text-muted">{CORRECTION_KINDS[item.kind]?.label}</p></div>
                  {/* a report already sent is payroll's now - nothing here can
                      edit or take it back, so the list stops offering to */}
                  {!flow.reported && (
                    <div className="flex gap-4">
                      <button type="button" disabled={busy} className="min-h-[44px] text-sm text-accent" onClick={() => flow.report(item.date || days[0]?.date, index)}>Edit</button>
                      <button type="button" disabled={busy} className="min-h-[44px] text-sm text-muted" onClick={() => setItems((old) => old.filter((_, i) => i !== index))}>Remove</button>
                    </div>
                  )}
                </div>
                {item.claimedHours != null && <p className={`mt-3 text-xl tabular-nums text-foreground ${reviewStyles.hours}`}>{fmt(before?.paidHours)} → {fmt(item.claimedHours)} <span className="text-sm text-muted">hrs</span></p>}
                {changes && changes.length > 0
                  ? <ChangeLines changes={changes} />
                  : !changes && minuteSlots.length > 0 && <p className="mt-2 text-sm text-muted">{minuteSlots.map((slot) => `${clockLabel(slot.from)} to ${clockLabel(slot.to)}`).join(", ")}</p>}
                {!!item.times?.length && <p className="mt-2 text-sm text-muted">{item.times.map((time) => formatTimeDisplay(parseLooseTime(time, { assumeWorkday: true }))).join(", ")}</p>}
                {item.note && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{item.note}</p>}
                {/* the day card's own two words for the same state */}
                <p className="mt-2 text-xs text-muted">{flow.reported ? "Awaiting payroll" : "Not sent"}</p>
              </li>
            );
          })}
        </ul>
        {items.length > 0 && !flow.reported && <>
          <button type="button" onClick={send} disabled={busy} className="mt-4 min-h-[44px] rounded-[9px] bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? "Sending..." : "Send reports"}</button>
        </>}
        {error && <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      </section>
    );
  }
  if (flow && !open) return null;

  if (!open) {
    return (
      <div className="mt-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-sep pt-5">
        <button
          type="button"
          onClick={() => {
            // SEED THE BOXES AS THE CARD OPENS. They used to fill only when
            // the day or the category CHANGED, so the first thing anyone saw
            // was "When did you work?" over nothing at all.
            const first = days.find((d) => d.date === date) || null;
            setSlots(slotsForDay(kind, first));
            setSeed(slotsForDay(kind, first));
            setOpen(true);
          }}
          className="inline-flex min-h-[44px] items-center gap-2 rounded text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" />
          </svg>
          Something doesn&apos;t look right
        </button>
        <p className="text-[12.5px] text-faint">We&apos;ll help you get it corrected.</p>
      </div>
    );
  }

  const editor = (
    <div ref={editorRef} className="mt-4 rounded-xl bg-surface px-5 py-4 shadow-sm night:ring-1 night:ring-border">
      <h2 className="text-base font-semibold text-foreground">
        Tell payroll what&apos;s wrong
      </h2>
      <p className="mt-1 text-sm text-muted">
        Add anything that doesn&apos;t match what you actually worked.{" "}
        <span className="font-semibold text-foreground">
          You can report more than one day
        </span>{" "}
        - add each one, then send them together. What you send goes to payroll,
        and your timesheet waits until they decide.
      </p>

      {!flow && items.length > 0 && (
        <>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">
          Ready to send ({items.length})
        </p>
        <ul className="mt-2 space-y-2">
          {items.map((it, i) => (
            <li
              key={i}
              className="flex items-start justify-between gap-3 rounded-[9px] bg-fill px-3 py-2"
            >
              <span className="text-sm text-foreground">
                <span className="font-semibold">{it.date || "This timesheet"}</span>
                {" - "}
                {CORRECTION_KINDS[it.kind]?.label}
                {it.claimedHours != null && ` (${fmt(it.claimedHours)} hrs)`}
                {(it.times || []).some((t) => parseLooseTime(t || "", { assumeWorkday: true })) &&
                  ` (at ${it.times
                    .map((t) => parseLooseTime(t || "", { assumeWorkday: true }))
                    .filter(Boolean)
                    .map((m) => formatTimeDisplay(m))
                    .join(" and ")})`}
                {(it.slots || []).length > 0 && (
                  <span className="mt-0.5 block text-xs tabular-nums text-muted">
                    {(checkWorkSlots(it.slots, it.claimedHours).slots || [])
                      .map((sl) => `${clockLabel(sl.from)} to ${clockLabel(sl.to)}`)
                      .join(", ")}
                  </span>
                )}
                {it.note && (
                  <span className="block text-xs text-muted">{it.note}</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => setItems((p) => p.filter((_, j) => j !== i))}
                className="shrink-0 text-xs font-semibold text-muted underline hover:text-foreground"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        </>
      )}

      <div className="mt-4 grid gap-4">
        <label className="grid gap-1">
          <span className="text-sm font-semibold text-foreground">Which day?</span>
          <select
            value={date}
            onChange={(e) => {
              const next = e.target.value;
              setDate(next);
              setError(null);
              // the boxes follow the day, so a switch cannot leave one day's
              // punches sitting under another day's heading
              const nextDay = days.find((d) => d.date === next) || null;
              const nextKind = available.includes(kind) ? kind : "hours";
              setSlots(slotsForDay(nextKind, nextDay));
              setSeed(slotsForDay(nextKind, nextDay));
            }}
            className="rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-faint focus:outline-2 focus:-outline-offset-1 focus:outline-brand"
          >
            {days.map((d) => (
              <option key={d.date} value={d.date}>
                {d.date} - {fmt(d.paidHours)} hrs
              </option>
            ))}
            <option value={NEW_DAY}>A day that isn&apos;t listed</option>
            <option value={NO_DAY}>Not about one specific day</option>
          </select>
        </label>

        {/* THE MISSING DAY'S OWN DATE, a real field rather than prose in the
            note. The choices are exactly the period's dates the sheet has no
            row for, so a date that exists cannot be claimed missing and a
            date outside the period cannot be picked at all. */}
        {date === NEW_DAY && (
          <label className="grid gap-1">
            <span className="text-sm font-semibold text-foreground">Which day was it?</span>
            <select
              value={newDayDate}
              onChange={(e) => setNewDayDate(e.target.value)}
              className="rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-faint focus:outline-2 focus:-outline-offset-1 focus:outline-brand"
            >
              <option value="">Pick the day</option>
              {(period ? periodDates(period.from, period.to) : [])
                .filter((d) => !days.some((x) => x.date === d))
                .map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
            </select>
          </label>
        )}

        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold text-foreground">
            What&apos;s wrong?
          </legend>
          {available.map((k) => (
            <label
              key={k}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
                activeKind === k
                  ? "border-brand-dark bg-surface"
                  : "border-border bg-surface"
              }`}
            >
              <input
                type="radio"
                name="kind"
                value={k}
                checked={activeKind === k}
                onChange={() => {
                  setKind(k);
                  setError(null);
                  setSlots(slotsForDay(k, day));
                  setSeed(slotsForDay(k, day));
                }}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">
                  {CORRECTION_KINDS[k].label}
                </span>
                <span className="block text-xs text-muted">
                  {CORRECTION_KINDS[k].help}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        {timeSlots > 0 && (
          <div className="grid gap-2">
            <span className="text-sm font-semibold text-foreground">
              {meta.asksTimes === "meal"
                ? "What time did your lunch start?"
                : timeSlots === 1
                  ? "What time did your rest break start?"
                  : "What time did each rest break start?"}
            </span>
            {Array.from({ length: timeSlots }, (_, i) => {
              const raw = times[i] || "";
              const mins = timeMin(i);
              return (
                <div key={i} className="flex flex-wrap items-center gap-2.5">
                  {timeSlots > 1 && (
                    <span className="w-14 text-sm text-muted">{i === 0 ? "First" : "Second"}</span>
                  )}
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={raw}
                    onBlur={(e) => {
                      const formatted = displayTime(e.target.value);
                      setTimes((previous) => previous.map((value, j) => j === i ? formatted : value));
                    }}
                    onChange={(e) =>
                      setTimes((t) => {
                        const next = [...t];
                        next[i] = e.target.value;
                        return next;
                      })
                    }
                    className={`w-36 rounded-lg border bg-surface px-3 py-2 text-sm text-foreground ${
                      mins != null ? "border-emerald-500" : raw.trim() ? "border-rose-500" : "border-border"
                    }`}
                  />
                  {/* the typed time reads itself back, the same as the day
                      question's slot row - no placeholder to imitate and no
                      "reads as" preamble, the figure IS the confirmation */}
                  {mins != null && (
                    <span className="text-sm text-foreground">{formatTimeDisplay(mins)}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {meta?.asksHours && (
          <div className="grid gap-4">
            {/* THE DAY'S TOTAL, on its own fill row. The figure is the anchor
                and the slots underneath have to agree with it. */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-[10px] bg-fill px-4 py-4">
              <div className="grid gap-1">
                <span className="text-sm font-semibold text-foreground">
                  {takesSlots ? "The day's work hours" : meta.hint}
                </span>
                <span className="max-w-[16rem] text-[12.5px] leading-relaxed text-muted">
                  {activeKind === "day_missing"
                    ? "Missing from this timesheet."
                    : day
                      ? `${fmt(day.paidHours)} hours recorded now.`
                      : meta.hoursHelp}
                </span>
              </div>
              {/* THE TOTAL OF THE SLOTS BELOW, not a box (Mánu 2026-09-25):
                  it follows the times as they are typed, and a dash until
                  one slot reads */}
              <div className="flex shrink-0 items-baseline gap-2 text-[12.5px] text-muted">
                <span data-slot-total className={`text-2xl font-medium tabular-nums text-foreground ${reviewStyles.hours}`}>
                  {slotTotal == null ? "—" : fmt(slotTotal)}
                </span>
                <span>hrs</span>
              </div>
            </div>
            {takesSlots && (
              <p className="text-[12.5px] leading-relaxed text-muted">
                Include paid breaks. Leave out an unpaid lunch, PTO and sick
                pay.
              </p>
            )}

            {/* EVERY SLOT FOR THE DAY, unchanged ones included - a difference
                is not something payroll can rebuild a day from. */}
            {takesSlots && (
              <div className="grid gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="text-[15px] font-medium text-foreground">
                    When did you work?
                  </h3>
                  <span className="rounded-md bg-fill px-2 py-1 text-[11px] text-muted">
                    Required
                  </span>
                </div>
                <p className="text-[12.5px] leading-relaxed text-muted">
                  List every slot you worked on this day. Leave unpaid gaps
                  between them.
                </p>
                <div className="grid gap-2">
                  {slots.map((slot, i) => {
                    const read = readSlot(slot);
                    // the time this box had when the form opened, shown once
                    // it has been changed to something else that reads
                    const wasOf = (key) => {
                      const before = seed[i]?.[key];
                      if (!before || !read[key]) return null;
                      return displayTime(before) === formatTimeDisplay(read[key]) ? null : displayTime(before);
                    };
                    return (
                      <div
                        key={i}
                        className="grid grid-cols-[1fr_1fr_auto] items-start gap-2 rounded-[10px] bg-fill px-3 py-3 sm:grid-cols-[1.5rem_1fr_1fr_auto] sm:gap-3 sm:px-4"
                      >
                        <span className="hidden pt-7 text-[12.5px] text-muted sm:block">
                          {i + 1}
                        </span>
                        {[
                          ["from", "Start"],
                          ["to", "End"],
                        ].map(([key, label]) => (
                          <label key={key} className="grid gap-1">
                            <span className="text-[12.5px] font-medium text-foreground">
                              {label}
                            </span>
                            <input
                              type="text"
                              inputMode="numeric"
                              autoComplete="off"
                              value={slot[key] || ""}
                              onChange={(e) => setSlot(i, key, e.target.value)}
                              onBlur={(e) => setSlot(i, key, displayTime(e.target.value))}
                              className={`w-full rounded-[9px] border bg-surface px-3 py-2 text-[15px] text-foreground focus:outline-2 focus:-outline-offset-1 focus:outline-brand ${
                                read[key] && !problems.boxes.has(`${i}:${key}`)
                                  ? "border-emerald-400/80"
                                  : (slot[key] || "").trim()
                                    ? "border-rose-400"
                                    : "border-border"
                              }`}
                            />
                            {/* the figure IS the confirmation, same as the day
                                question's slot row - and the time it had
                                before, struck, once it has been changed */}
                            <span className="min-h-4 text-[11px] text-muted">
                              {read[key] ? formatTimeDisplay(read[key]) : ""}
                              {wasOf(key) && <> <s className="text-faint">{wasOf(key)}</s></>}
                            </span>
                          </label>
                        ))}
                        <button
                          type="button"
                          // the seed goes with it, so the slots after it keep comparing
                          // with their own recorded times, not the one before
                          onClick={() => { setSlots((p) => p.filter((_, j) => j !== i)); setSeed((p) => p.filter((_, j) => j !== i)); }}
                          disabled={slots.length === 1}
                          aria-label={`Remove work slot ${i + 1}`}
                          className="mt-6 inline-flex h-9 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface disabled:opacity-40"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                            <path d="M18 6 6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => setSlots((p) => [...p, { from: "", to: "" }])}
                    disabled={slots.length >= MAX_SLOTS}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded text-[13px] font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-40"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Add a work slot
                  </button>
                </div>
                {slotCheck && (
                  <p
                    role="status"
                    aria-live="polite"
                    className={`flex items-start gap-2 text-[12.5px] leading-relaxed ${
                      slotCheck.ok
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-muted"
                    }`}
                  >
                    {slotCheck.message}
                  </p>
                )}
                <SlotCompare day={day} slots={slotCheck?.slots || null} />
              </div>
            )}
          </div>
        )}

        <label className="grid gap-1">
          <span className="text-sm font-semibold text-foreground">
            {addingHours ? "Reason for adding hours" : removingHours ? "Reason for removing hours" : takesSlots ? "Reason for the change" : needsNote ? "Reason for the correction" : "Anything else about it?"}{" "}
            {needsNote && <><span aria-hidden="true" style={{ color: "var(--status-danger)" }}>*</span><span className="sr-only">(required)</span></>}
            {!needsNote && (
              <span className="font-normal text-muted">(optional)</span>
            )}
          </span>
          <textarea
            required={needsNote}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={reasonLine || "Anything that helps payroll check it"}
            className="rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-faint focus:outline-2 focus:-outline-offset-1 focus:outline-brand"
          />
        </label>
      </div>

      {error && (
        <p className="mt-3 text-sm font-semibold text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={add}
          // THE BLUE BUTTON ON THE FORM: as a quiet link nobody could tell it
          // had to be pressed for the report to go anywhere. this press is
          // what puts the report on the list that goes to payroll; Cancel
          // stays the quiet one
          className="rounded-[9px] bg-brand px-4 py-2 text-[13.5px] font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-50"
        >
          {flow ? "Add to reports" : items.length ? "Add another" : "Add this"}
        </button>
        {!flow && <button
          type="button"
          onClick={send}
          disabled={busy || !items.length}
          className="rounded-[9px] bg-brand px-4 py-2 text-[13.5px] font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-50"
        >
          {busy
            ? "Sending..."
            : items.length
              ? `Send ${items.length} to payroll`
              : "Send to payroll"}
        </button>}
        <button
          type="button"
          onClick={cancel}
          className="text-sm text-muted underline hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
  return flow ? (flow.editorTarget ? createPortal(editor, flow.editorTarget) : null) : editor;
}

// WHAT THE DAY LOOKS LIKE NOW, AND WHAT IT WOULD LOOK LIKE.
//
// Two lanes side by side rather than one drawing with two meanings: the day on
// record is quiet and neutral, the proposed day carries the accent. The
// drawing is aria-hidden and the figures above it carry the meaning, the same
// rule the double-booking day column follows.
//
// It is NOT DayCalendar. That component draws the day the engine recorded, and
// its own note says a calendar re-deriving the engine's answer is a second
// opinion that can disagree with the question beside it. A provisional claim
// is not the engine's answer, so it gets its own quiet picture.
// the slot refusals in a sentence. The live check beside the boxes says all of
// this as you type; this is the fallback for a request the form did not build.
function checkSlotMessage(code) {
  switch (code) {
    case "noSlots":
      return "add the day's work slots.";
    case "tooMany":
      return `a day takes up to ${MAX_SLOTS} work slots.`;
    case "badHours":
      return "enter the day's work hours, more than 0.";
    case "incomplete":
      return "every work slot needs a start and an end.";
    case "backwards":
      return "each slot has to end after it starts, on the same day.";
    case "overlap":
      return "two work slots overlap. Each minute counts once.";
    case "mismatch":
      return "the slots do not add up to the hours entered.";
    default:
      return "check the work slots for this day.";
  }
}

function SlotCompare({ day, slots }) {
  const current = shiftsOf(day);
  if (!slots?.length) return null;
  const all = [...current, ...slots];
  const low = Math.floor(Math.min(...all.map((s) => s.from)) / 60) * 60;
  const high = Math.ceil(Math.max(...all.map((s) => s.to)) / 60) * 60;
  const span = Math.max(60, high - low);
  const hrs = (list) => Math.round((list.reduce((n, s) => n + (s.to - s.from), 0) / 60) * 100) / 100;

  const lane = (list, mine) => (
    <div className="relative rounded-[8px] bg-fill" aria-hidden="true">
      {list.map((s, i) => (
        <div
          key={i}
          style={{ top: `${((s.from - low) / span) * 100}%`, height: `${((s.to - s.from) / span) * 100}%` }}
          className={`absolute inset-x-0 overflow-hidden rounded-[4px] border-l-2 px-1.5 py-1 text-[10.5px] leading-tight ${
            mine
              ? "border-accent bg-accent/10 text-accent"
              : "border-border-strong bg-surface text-muted"
          }`}
        >
          {clockLabel(s.from)}
        </div>
      ))}
    </div>
  );

  return (
    <div className="mt-1 grid gap-2">
      <div className="grid grid-cols-2 gap-3 text-[12.5px] text-muted">
        <div>
          On this timesheet
          <b className={`mt-0.5 block text-lg font-medium tabular-nums text-foreground ${reviewStyles.hours}`}>
            {hrs(current).toFixed(2)} <span className="text-[12.5px] font-normal text-muted">hrs</span>
          </b>
        </div>
        <div>
          What you are reporting
          <b className={`mt-0.5 block text-lg font-medium tabular-nums text-foreground ${reviewStyles.hours}`}>
            {hrs(slots).toFixed(2)} <span className="text-[12.5px] font-normal text-muted">hrs</span>
          </b>
        </div>
      </div>
      <div className="grid h-40 grid-cols-2 gap-3">
        {lane(current, false)}
        {lane(slots, true)}
      </div>
      <p className="text-[12.5px] leading-relaxed text-muted">
        Payroll reviews these slots before the figures change.
      </p>
    </div>
  );
}

function messageFor(res) {
  // AN ITEM WAS REFUSED, and the action names which day and why. The screen
  // checks all of this first, so reaching here means a request the form did
  // not build - but it says what happened rather than "something went wrong".
  if (res?.error === "item") {
    const at = res.at ? `${res.at}: ` : "";
    const code = String(res.code || "");
    if (code.startsWith("slots:")) {
      return `${at}${checkSlotMessage(code.slice(6))}`;
    }
    switch (code) {
      case "newDayDate":
        return "Pick the day you worked.";
      case "outsidePeriod":
        return `${at}that day is not in this pay period.`;
      case "dayExists":
        return `${at}this timesheet already lists that day, so report the hours on it instead.`;
      case "unknownDay":
        return `${at}that day is not on this timesheet.`;
      case "note":
        return "Tell us briefly what's wrong.";
      case "addedHoursReason":
        return `${at}${ADDED_HOURS_REASON}`;
      case "changeReason":
        return `${at}${CHANGE_REASON}`;
      case "junk":
        return NEEDS_REAL_WORDS;
      case "times":
        return "Enter the time it started.";
      default:
        return "Something in what you reported could not be read. Check it and try again.";
    }
  }
  switch (res?.error) {
    case "already":
      return "This timesheet has already been signed, so it can't be changed here. Reply to the email that brought you here.";
    case "reported":
      return "You've already reported something on this timesheet - payroll is looking at it.";
    // the preview's refusal on a real batch, in the time-off card's words -
    // it read "Something went wrong" and invited a retry that could never work
    case "preview":
      return "Preview only - nothing was saved.";
    case "empty":
      return "Add what's wrong first.";
    case "badtime":
      // where and what, quoted back - a bare verdict points at nothing
      return `${res?.at?.date ? `${res.at.date}: ` : ""}the time${res?.given ? ` "${res.given}"` : ""} doesn't line up with the punches for that day.`;
    default:
      return "Something went wrong sending that. Please try again.";
  }
}
