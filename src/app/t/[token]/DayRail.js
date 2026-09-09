"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert } from "lucide-react";
import { reportedReviewDay } from "@/lib/timesheet/review-days";
import styles from "./ReviewFlow.module.css";
import { useReviewFlow } from "./ReviewFlow";
import { useDayDone, DayNavProvider } from "./TimesheetQuestion";

// THE DAY RAIL: the period's days down the left, one day's work shown at a
// time. Presentation only - every pane stays MOUNTED and the unselected ones
// are `hidden`, so the batch provider's staged answers, the day-done state and
// every half-typed time survive switching days exactly as they survived
// scrolling past them in the old stacked list. `hidden` is display:none, so
// nothing hidden is clickable or in the tab order.
//
// The issue panel above links to #day-<date>; a hash change selects that day
// and brings the box into view, so those jumps keep working with only one day
// on screen.
export default function DayRail({ days, children, stacked = false }) {
  const flow = useReviewFlow();
  const first = flow ? 0 : Math.max(0, days.findIndex((d) => d.needs && !d.done));
  const [sel, setSel] = useState(first === -1 ? 0 : first);
  const boxRef = useRef(null);
  const afterRef = useRef(null);
  const paneRefs = useRef([]);
  // a day finished in this tab counts as done on the ring, not only a saved
  // one - see useDayDone
  const readyOn = useDayDone();

  useEffect(() => {
    const onHash = () => {
      const m = decodeURIComponent(window.location.hash || "").match(/^#day-(.+)$/);
      if (!m) return;
      const i = days.findIndex((d) => d.date === m[1]);
      if (i >= 0) {
        setSel(i);
        boxRef.current?.scrollIntoView({ block: "start" });
      }
    };
    window.addEventListener("hashchange", onHash);
    onHash();
    return () => window.removeEventListener("hashchange", onHash);
    // the day list is stable for the life of the page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const panes = Array.isArray(children) ? children : [children];

  if (stacked) return (
    <>
      <div className="mt-3 divide-y divide-sep overflow-hidden rounded-xl bg-surface shadow-sm night:ring-1 night:ring-border">
        {panes.map((pane, i) => (
          <div key={days[i]?.date ?? i} ref={(el) => { paneRefs.current[i] = el; }} tabIndex={-1} className="scroll-mt-24">
            <DayNavProvider dates={days.map((d) => d.date)} index={i} go={(next) => {
              if (flow?.editorTarget) return;
              if (next === days.length && flow) { flow.go("reports"); return; }
              const target = next === days.length ? afterRef.current : paneRefs.current[next];
              target?.focus({ preventScroll: true });
              target?.scrollIntoView({ block: "start" });
            }}>{pane}</DayNavProvider>
          </div>
        ))}
      </div>
      <div ref={afterRef} tabIndex={-1} className="scroll-mt-24" />
    </>
  );

  return (
    <>
    <div
      ref={boxRef}
      className="mt-3 scroll-mt-24 overflow-hidden rounded-xl bg-surface shadow-sm night:ring-1 night:ring-border sm:flex sm:items-stretch"
    >
      <nav
        aria-label="Days in this pay period"
        className="flex gap-1 overflow-x-auto border-b border-sep bg-surface-2 p-2 sm:w-52 sm:flex-none sm:flex-col sm:overflow-x-visible sm:border-b-0 sm:border-r lg:w-64"
      >
        {days.map((d, i) => {
          const on = i === sel;
          const answered = d.done || readyOn(d.date);
          const needsAnswer = d.needs && !answered;
          const reviewed = !needsAnswer && (answered || flow?.reviewedDays.has(d.date));
          const hasReport = flow?.items.some((item) => item.date === d.date);
          const display = reportedReviewDay({ date: d.date, paidHours: Number(d.hrs) }, flow?.items);
          return (
            <button
              key={d.date}
              type="button"
              aria-current={on ? "true" : undefined}
              disabled={!!flow?.editorTarget}
              onClick={() => setSel(i)}
              className={`relative flex min-w-[7.5rem] flex-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors focus:outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand sm:min-w-0 ${
                on ? "accent-fill-soft" : "hover:bg-fill"
              }`}
            >
              <span className="min-w-0">
                <span className={`flex flex-col text-[13px] font-medium ${on ? "" : "text-foreground"}`}>
                  <span>{d.weekday || d.label}</span>
                  {d.monthDay && <span className={`whitespace-nowrap ${styles.month}`}>{d.monthDay}</span>}
                </span>
                <span className={`block text-[11.5px] ${styles.hours} ${on ? "" : "text-faint"}`}>
                  {display.paidHours.toFixed(2)} hrs{display.reviewReported ? " reported" : ""}
                </span>
              </span>
              <span aria-hidden="true" className="flex flex-none items-center gap-1.5">
                {(hasReport || needsAnswer) && <CircleAlert size={16} className={styles.issue} />}
                {!needsAnswer && (
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full ${reviewed ? styles.reviewed : "border-[1.5px] border-border-strong"}`}>
                    {reviewed && <Check size={11} strokeWidth={3} />}
                  </span>
                )}
              </span>
              <span className="sr-only">
                {needsAnswer ? "Needs answers" : reviewed ? "Reviewed" : hasReport ? "" : "Nothing to check"}
                {hasReport ? `${needsAnswer || reviewed ? " · " : ""}${flow.reported ? "Awaiting payroll" : "Report added"}` : ""}
              </span>
            </button>
          );
        })}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        {panes.map((pane, i) => (
          <div key={days[i]?.date ?? i} id={`day-${days[i]?.date}`} hidden={i !== sel} className={i === sel ? "flex flex-1 flex-col" : undefined}>
            {/* the day's own footer needs to know where it sits and how to
                move - the rail owns the selection, so it hands it down. Wrapped
                per pane rather than once around the list because each pane's
                index is the thing being told. `go` also brings the box back
                into view, the same as a rail click on a long page. */}
            <DayNavProvider
              dates={days.map((d) => d.date)}
              index={i}
              go={(next) => {
                if (flow?.editorTarget) return;
                if (next === days.length && flow) { flow.go("reports"); return; }
                if (next === days.length) {
                  afterRef.current?.focus({ preventScroll: true });
                  afterRef.current?.scrollIntoView({ block: "start" });
                  return;
                }
                if (next < 0 || next >= days.length) return;
                setSel(next);
                boxRef.current?.scrollIntoView({ block: "start" });
              }}
            >
              {pane}
            </DayNavProvider>
          </div>
        ))}
      </div>
    </div>
    <div ref={afterRef} tabIndex={-1} className="scroll-mt-24" />
    </>
  );
}

// the "N of M days answered" line, counting the days finished in this tab as
// well as the saved ones - it sat server-rendered and contradicted the rings.
export function DaysAnsweredCount({ days }) {
  const readyOn = useDayDone();
  const flow = useReviewFlow();
  if (flow) return null;
  const need = days.filter((d) => d.needs);
  if (!need.length) return null;
  const done = need.filter((d) => d.done || readyOn(d.date)).length;
  return (
    <p className="mt-0.5 text-[12.5px] text-faint">
      {done} of {need.length} day{need.length === 1 ? "" : "s"} answered
    </p>
  );
}
