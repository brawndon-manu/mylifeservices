"use client";

import { useState } from "react";
import DayCalendar from "@/app/t/[token]/DayCalendar";

// THE DAY ITSELF, UNDER THE FINDING THAT NAMES IT.
//
// Every row on the checks screen is a person and a date, and until now working
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
export default function DayPeek({ day, rests = [], scheduled = [], bookedMeal = false, notes = [] }) {
  const [open, setOpen] = useState(false);
  // a day with no punch pairs draws nothing at all - `DayCalendar` returns null
  // on it - so the control would open onto an empty box
  if (!(day?.punches || []).length) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs font-medium text-brand"
      >
        <span aria-hidden="true" className={`transition-transform ${open ? "rotate-90" : ""}`}>
          ▶
        </span>
        {open ? "Hide the day" : "Show the day"}
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
        <div className="mt-2 max-w-4xl rounded-md border border-border bg-surface-2 p-3 pr-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <DayCalendar day={day} rests={rests} scheduled={scheduled} bookedMeal={bookedMeal} />
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
        </div>
      )}
    </div>
  );
}
