"use client";

import styles from "./DataChecks.module.css";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import DayCalendar from "@/app/t/[token]/DayCalendar";
import { shiftsOf } from "@/lib/timesheet/questions";

// THE DAY ITSELF, UNDER THE FINDING THAT NAMES IT.
//
// A finding names a person and one or more dates. Previously, working
// out what that day actually looked like meant opening their sheet in another
// tab and finding the date again. The finding says "a rest at 1:00 PM to 1:10
// PM, off the clock"; the picture says which shift that was beside, how big the
// hole around it is, and whether the roster booked anything there.
//
// THE SAME COMPONENT THE EMPLOYEE SEES, not a second drawing of the same day.
// `DayCalendar` is the corrected timesheet's own view, so the colours, the
// scale and the rules about where a break belongs are one implementation. Two
// pictures of one day is how the two screens start disagreeing about it.
//
// It is safe outside the timesheet review page: `DayCalendar` reads half-typed answers
// through `useStagedOn`, which returns an empty list when there is no provider
// above it - there is nothing being typed here, and nothing on this screen can
// write an answer.
//
// MOUNTED ONLY WHEN OPENED, which is why this is a button and a state flag
// rather than <details>. A <details> renders its contents whether or not it is
// open, and this batch draws 124 rows - a calendar apiece, each one laying out
// a day's blocks, for pictures nobody has asked to see yet.
export default function DayPeek({ day, rests = [], scheduled = [], bookedMeal = false, notes = [], days, children }) {
  const [open, setOpen] = useState(false);
  const views = days || [{ day, rests, scheduled, bookedMeal, notes }];
  const label = views.length > 1 ? "the days" : "the day";

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`${styles.dayToggle} flex items-center gap-1.5 text-xs font-medium text-brand`}
      >
        <ChevronRight size={15} aria-hidden="true" className={open ? "rotate-90" : ""} />
        {open ? `Hide ${label}` : `Show ${label}`}
      </button>
      {open && (
        // WIDE ENOUGH TO READ THE SERVICE ON AN OVERLAP. Mánu 2026-08-12: "I
        // can't see what kind of service it is ... I want someone else to look
        // at this and see what it is." Two bookings at once halve the column, so
        // at max-w-xs each lane was about 130px and "ILS Service" truncated on
        // every clash - the case somebody opens this picture to understand.
        //
        // Nothing competes for the width here, unlike the employee's own page
        // where the calendar shares the row with the answer options, so it takes
        // what the card gives it up to a readable cap.
        <div className="space-y-4">
          {views.map((view, i) => (
            <DayPreview key={view.day?.date || i} {...view} showDate={!!days} />
          ))}
          {children}
        </div>
      )}
    </div>
  );
}

const clock = (min) => {
  const hour = Math.floor(min / 60);
  return `${hour % 12 || 12}:${String(min % 60).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
};

function DayPreview({ day, rests = [], scheduled = [], bookedMeal = false, notes = [], summary, showDate }) {
  const hasShifts = shiftsOf(day).length > 0;
  return (
    <section className={`${styles.dayPanel} mt-2 max-w-4xl rounded-md border border-border bg-surface-2 p-3 pr-4`} aria-label={day?.date ? `Day details for ${day.date}` : "Day details"}>
      {showDate && (
        <header className="mb-3 text-xs">
          <p className="font-semibold text-foreground">{day?.date}</p>
          {summary && <p className="mt-1 text-muted">{summary}</p>}
        </header>
      )}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {hasShifts ? (
          <DayCalendar day={day} rests={rests} scheduled={scheduled} bookedMeal={bookedMeal} />
        ) : (
          <div className="min-w-0 text-xs leading-relaxed text-muted">
            <p>{day?.punches?.length ? "The recorded punches do not form a complete forward-running shift." : "No timesheet punches were recorded for this day."}</p>
            {scheduled.length > 0 ? (
              <>
                <p className="mt-3 font-semibold text-foreground">Scheduled blocks</p>
                <ul className="mt-2 space-y-2">
                  {scheduled.map((block, i) => (
                    <li key={i}>
                      <span className="block font-medium text-foreground">{clock(block.from)} – {clock(block.to)}</span>
                      {block.service}{block.client ? ` · ${block.client}` : ""}
                    </li>
                  ))}
                </ul>
              </>
            ) : <p className="mt-2">No schedule blocks are available for this day.</p>}
          </div>
        )}
        {/* WHAT THEY WROTE ON THE DAY, BESIDE THE DAY. Mánu 2026-08-26:
            "is there a way to show those notes next to the shifts in the
            admin day by day view only? ... it can live in the space next to
            the calendar."

            ADMIN ONLY, which is why it is here and not in `DayCalendar`.
            The calendar is shared with the employee's own page, and these
            are the notes payroll reads while deciding a premium - they are
            already the employee's own words, but where they are read
            matters. Nothing on `/t/` renders this file.

            Each note names its own block, so the time is the label and the
            sentence sits under it. */}
        {notes.length > 0 && (
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-faint">
              Notes on this day
            </p>
            <ul className="mt-2 space-y-2.5">
              {notes.map((c) => (
                <li key={`${c.n}-${c.from}`} className="text-xs leading-relaxed">
                  <span className="block font-mono font-semibold text-foreground">
                    {c.from}&ndash;{c.to}
                  </span>
                  <span className="text-muted">{c.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
