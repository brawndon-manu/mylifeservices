"use client";

import { useState, useRef, useEffect, useId } from "react";

// custom date picker: a text input + a calendar popover. two granularities:
//   granularity="day"   -> MM/DD/YYYY input, month/year selects + day grid,
//                          submits YYYY-MM-DD (drop-in for <input type="date">)
//   granularity="month" -> mm/yyyy input, year select + 12-month grid,
//                          submits MM/YYYY (matches the free-text from/to fields)
// allowPresent adds a "Present" checkbox (for open-ended "to" dates); when
// checked the field submits "Present". the value rides on a hidden input under
// `name`, so no server/action changes are needed. theme-aware.

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const YEARS = Array.from({ length: 2035 - 1920 + 1 }, (_, i) => 1920 + i);

const pad = (n) => String(n).padStart(2, "0");
const sameDay = (a, b) =>
  a && b &&
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();
const sameMonth = (a, b) =>
  a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

function monthGrid(year, month) {
  const startWeekday = new Date(year, month, 1).getDay();
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(year, month, 1 - startWeekday + i);
    return { date, inMonth: date.getMonth() === month };
  });
}

export default function DatePicker({
  label,
  name,
  required = false,
  defaultValue = "",
  granularity = "day",
  allowPresent = false,
  id,
}) {
  const isMonth = granularity === "month";
  const reactId = useId();
  const inputId = id || reactId;
  const POP_H = (isMonth ? 260 : 360) + 8; // rough popover height, for placement
  const HEADER_H = 76; // the sticky pill header eats the top of the viewport

  const fmt = (d) =>
    isMonth
      ? `${pad(d.getMonth() + 1)}/${d.getFullYear()}`
      : `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
  const serialize = (d) =>
    isMonth
      ? `${pad(d.getMonth() + 1)}/${d.getFullYear()}`
      : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseTyped = (s) => {
    const str = String(s).trim();
    if (isMonth) {
      const m = str.match(/^(\d{1,2})\/(\d{4})$/);
      if (!m) return null;
      const mm = +m[1];
      if (mm < 1 || mm > 12) return null;
      return new Date(+m[2], mm - 1, 1);
    }
    const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const mm = +m[1], dd = +m[2], yy = +m[3];
    const dt = new Date(yy, mm - 1, dd);
    return dt.getMonth() === mm - 1 && dt.getDate() === dd ? dt : null;
  };
  const parseDefault = (s) => {
    if (!s) return null;
    // accept an ISO or an already-formatted string
    const iso = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
    return parseTyped(s);
  };

  const initial = parseDefault(defaultValue);
  const [value, setValue] = useState(initial);
  const [text, setText] = useState(initial ? fmt(initial) : "");
  const [present, setPresent] = useState(defaultValue === "Present");
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(null); // { year, month }
  const [above, setAbove] = useState(true);
  const aboveRef = useRef(true);
  aboveRef.current = above;
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const submitted = present ? "Present" : value ? serialize(value) : "";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    // on scroll, keep the popover open but flip it to whichever side still has
    // room; only close it once it truly can't fit (caught by the header / off
    // the bottom) or the field itself scrolls out of view. capture catches
    // scrolls in any container, not just the window.
    const onScroll = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (rect.bottom <= HEADER_H || rect.top >= window.innerHeight) {
        setOpen(false);
        return;
      }
      const fitsAbove = rect.top - HEADER_H >= POP_H;
      const fitsBelow = window.innerHeight - rect.bottom >= POP_H;
      if (aboveRef.current && !fitsAbove) {
        fitsBelow ? setAbove(false) : setOpen(false);
      } else if (!aboveRef.current && !fitsBelow) {
        fitsAbove ? setAbove(true) : setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  function openCalendar() {
    if (present) return;
    const base = value || new Date();
    setView({ year: base.getFullYear(), month: base.getMonth() });
    // place by available room: above when it fits up top, below when the field
    // is too high for it, otherwise whichever side has more room
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) {
      const spaceAbove = rect.top - HEADER_H;
      const spaceBelow = window.innerHeight - rect.bottom;
      const fitsAbove = spaceAbove >= POP_H;
      const fitsBelow = spaceBelow >= POP_H;
      setAbove(fitsAbove ? true : fitsBelow ? false : spaceAbove >= spaceBelow);
    }
    setOpen(true);
  }

  function pickDay(d) {
    setValue(d);
    setText(fmt(d));
    inputRef.current?.setCustomValidity("");
    setOpen(false);
  }
  function pickMonth(year, month) {
    const d = new Date(year, month, 1);
    setValue(d);
    setText(fmt(d));
    inputRef.current?.setCustomValidity("");
    setOpen(false);
  }

  function onType(e) {
    const raw = e.target.value;
    setText(raw);
    const d = parseTyped(raw);
    setValue(d);
    if (inputRef.current) {
      inputRef.current.setCustomValidity(
        raw.trim() && !d
          ? isMonth
            ? "Enter a valid month as MM/YYYY"
            : "Enter a valid date as MM/DD/YYYY"
          : "",
      );
    }
  }

  function togglePresent(e) {
    const on = e.target.checked;
    setPresent(on);
    setOpen(false);
    if (on) inputRef.current?.setCustomValidity("");
  }

  const today = open ? new Date() : null;
  const placeholder = isMonth ? "mm/yyyy" : "MM/DD/YYYY";

  return (
    <div className="relative" ref={wrapRef}>
      <label htmlFor={inputId} className="block text-xs font-semibold text-muted">
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </label>

      <input type="hidden" name={name} value={submitted} />

      <div className="relative mt-1">
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={present ? "" : placeholder}
          value={present ? "Present" : text}
          onChange={onType}
          disabled={present}
          required={required}
          aria-required={required}
          className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 pr-10 text-sm text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted"
        />
        <button
          type="button"
          onClick={() => (open ? setOpen(false) : openCalendar())}
          disabled={present}
          aria-label="Open calendar"
          aria-expanded={open}
          className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-3 text-muted transition hover:text-brand disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <CalendarIcon className="h-5 w-5" />
        </button>
      </div>

      {allowPresent && (
        <label className="mt-1.5 flex w-fit items-center gap-2 text-xs font-medium text-muted">
          <input
            type="checkbox"
            checked={present}
            onChange={togglePresent}
            className="h-3.5 w-3.5 rounded border-border-strong text-brand focus:ring-brand"
          />
          Present (I still work here)
        </label>
      )}

      {open && view && (
        <div
          className={`absolute left-0 z-50 w-[300px] rounded-xl border border-border bg-surface p-3 shadow-xl ${
            above ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          {isMonth ? (
            <MonthGrid view={view} setView={setView} value={value} today={today} onPick={pickMonth} />
          ) : (
            <DayGrid view={view} setView={setView} value={value} today={today} onPick={pickDay} />
          )}
        </div>
      )}
    </div>
  );
}

function DayGrid({ view, setView, value, today, onPick }) {
  return (
    <>
      <div className="flex gap-2">
        <label className="flex-1">
          <span className="mb-1 block text-xs font-semibold text-foreground">Month</span>
          <Select value={view.month} onChange={(e) => setView((v) => ({ ...v, month: +e.target.value }))}>
            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </Select>
        </label>
        <label className="w-[40%]">
          <span className="mb-1 block text-xs font-semibold text-foreground">Year</span>
          <Select value={view.year} onChange={(e) => setView((v) => ({ ...v, year: +e.target.value }))}>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </label>
      </div>

      <div className="mt-3 grid grid-cols-7 border-b border-border pb-2 text-center text-xs font-semibold text-muted">
        {WEEKDAYS.map((w, i) => <span key={i}>{w}</span>)}
      </div>

      <div className="mt-2 grid grid-cols-7 gap-y-1 text-center text-sm">
        {monthGrid(view.year, view.month).map((cell, i) => {
          const isSel = sameDay(cell.date, value);
          const isToday = sameDay(cell.date, today);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onPick(cell.date)}
              aria-current={isToday ? "date" : undefined}
              className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full transition ${
                isSel
                  ? "bg-brand font-semibold text-white"
                  : cell.inMonth
                    ? "text-brand hover:bg-surface-2"
                    : "text-faint hover:bg-surface-2"
              } ${isToday && !isSel ? "ring-1 ring-brand-light" : ""}`}
            >
              {cell.date.getDate()}
            </button>
          );
        })}
      </div>
    </>
  );
}

function MonthGrid({ view, setView, value, today, onPick }) {
  return (
    <>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-foreground">Year</span>
        <Select value={view.year} onChange={(e) => setView((v) => ({ ...v, year: +e.target.value }))}>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </Select>
      </label>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
        {MONTHS_SHORT.map((m, i) => {
          const cell = new Date(view.year, i, 1);
          const isSel = sameMonth(cell, value);
          const isNow = sameMonth(cell, today);
          return (
            <button
              key={m}
              type="button"
              onClick={() => onPick(view.year, i)}
              className={`rounded-lg py-2 font-medium transition ${
                isSel
                  ? "bg-brand text-white"
                  : "text-brand hover:bg-surface-2"
              } ${isNow && !isSel ? "ring-1 ring-brand-light" : ""}`}
            >
              {m}
            </button>
          );
        })}
      </div>
    </>
  );
}

function Select({ children, ...rest }) {
  return (
    <div className="relative">
      <select
        {...rest}
        className="w-full appearance-none rounded-md border border-border-strong bg-surface px-3 py-2 pr-8 text-sm text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 8l4 4 4-4" />
      </svg>
    </div>
  );
}

function CalendarIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
    </svg>
  );
}
