"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, Flag } from "lucide-react";
import { reportedReviewDay } from "@/lib/timesheet/review-days";
import styles from "./ReviewFlow.module.css";
import { useReviewFlow } from "./ReviewFlow";
import { useDayDone, DayNavProvider, usePendingAnswers } from "./TimesheetQuestion";

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
  const unsaved = usePendingAnswers();
  // IT OPENS ON THE FIRST DAY OF THE PERIOD, so somebody can start at the top
  // and press Next all the way through.
  //
  // It used to land on the first day that still needed something, which reads
  // as the page having skipped ahead - and the days it skipped are exactly the
  // ones nobody then looks at, on a document they are about to sign. Nothing
  // is lost by starting at the beginning: the panel above still lists what
  // needs answering and still jumps straight to it.
  //
  // A DEEP LINK STILL WINS. The #day-<date> handler below runs on mount, so a
  // link into one day selects that day rather than this one.
  const [sel, setSel] = useState(0);
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

  const requestedDate = flow?.activeDate;
  // WHICH REQUEST WE HAVE ALREADY HONOURED.
  //
  // Mánu 2026-09-09: he reported the 3rd, answered a question on the 11th, and
  // the rail threw him back to the 3rd. `activeDate` is set by an explicit Edit
  // or Report and never cleared, and this effect listed `days` - which is a
  // freshly built array on every render. So any re-render re-ran it and it
  // dutifully re-selected the last date anybody had asked for. Every time, not
  // intermittently.
  //
  // `report()` hands over a NEW object per request, so honouring each object
  // once is exactly "follow an explicit action, and only when it is made".
  const honoured = useRef(null);
  useEffect(() => {
    if (!requestedDate || honoured.current === requestedDate) return;
    honoured.current = requestedDate;
    const i = days.findIndex((day) => day.date === requestedDate.date);
    // Selection follows an explicit Edit or Report action in the shared flow.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (i >= 0) setSel(i);
    const target = stacked ? paneRefs.current[i] : boxRef.current;
    target?.scrollIntoView({ block: "start" });
  }, [requestedDate, days, stacked]);

  const panes = Array.isArray(children) ? children : [children];

  // LEAVING THE DAYS SAVES WHAT IS TYPED, WHEREVER IT IS.
  //
  // The last day's Save and next saves that day on the way out, but an answer
  // can be typed on one day and the rail pressed to go to another, so the
  // leaving checks every day. Every finished answer is saved before the
  // reports open. Half an answer anywhere stops it: the page goes to that day
  // and the card says what it still needs. Elizabeth Matias, 2026-09-16, was
  // the case for the older version of this door - five answers staged, nothing
  // saved, and the next step telling her to answer questions she could not see.
  const leaveDays = async () => {
    const waiting = unsaved?.pendingAll?.() || [];
    const half = waiting.find((e) => e.state === "incomplete");
    if (half) {
      unsaved.attempt(half.date);
      const i = days.findIndex((d) => d.date === half.date);
      if (i >= 0) setSel(i);
      (stacked ? paneRefs.current[i] : boxRef.current)?.scrollIntoView({ block: "start" });
      return;
    }
    for (const e of waiting) {
      if (!(await unsaved.saveOne(e.id))) return;
    }
    flow.go("reports");
  };

  if (stacked) return (
    <>
      <div className="mt-3 divide-y divide-sep overflow-hidden rounded-xl bg-surface shadow-sm night:ring-1 night:ring-border">
        {panes.map((pane, i) => (
          <div key={days[i]?.date ?? i} ref={(el) => { paneRefs.current[i] = el; }} tabIndex={-1} className="scroll-mt-24">
            <DayNavProvider dates={days.map((d) => d.date)} index={i} go={(next) => {
              if (flow?.editorTarget) return;
              if (next === days.length && flow) { leaveDays(); return; }
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
          // WALKING PAST A DAY IS NOT ANSWERING IT - Mánu 2026-09-16, Carminia
          // Suarez: "cant proceed with her timesheet and i dont know why".
          //
          // These two were one value. `d.done` is the day's questions actually
          // answered on the server; `readyOn` is the walk - "I have been here".
          // ORed together, being there cleared `needsAnswer`, so her three days
          // with an unanswered meal question went from "Needs answers" to
          // "Reviewed" the moment she pressed Next past them. Eleven green days,
          // a Generate that refuses, and nothing on the page pointing at the
          // three it is waiting for.
          //
          // It was a browser-session quirk until the walk moved onto the sheet
          // on 2026-09-16, which made it survive every reload.
          //
          // the walk is the provider's alone now. a second copy the flow kept in
          // the tab never learned about a reset or a Change this, so a day could
          // stay solid after the sheet had forgotten it was walked
          const walked = readyOn(d.date);
          const needsAnswer = !!d.needs && !d.done;
          const reviewed = !needsAnswer && (d.done || walked);
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
              {/* STATUS FIRST: green is a day with nothing on it, yellow is a
                  day with something on it. the "!" is an answer still owed, the
                  flag is a problem they reported, and a reported day shows the
                  flag alone rather than a warning beside a check. a quiet day's
                  check stays light until they have been through it, because
                  "nothing flagged" only means our checks found nothing - the
                  hours are theirs to look at */}
              <span aria-hidden="true" className="flex flex-none items-center gap-1.5">
                {needsAnswer && <CircleAlert size={16} className={styles.issue} />}
                {hasReport && <Flag size={15} className={styles.issue} />}
                {!needsAnswer && !hasReport && (
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full ${reviewed ? styles.reviewed : styles.quiet}`}>
                    <Check size={reviewed ? 11 : 10} strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className="sr-only">
                {needsAnswer ? "Needs answers" : hasReport ? "" : reviewed ? "Reviewed" : "Nothing to check"}
                {hasReport ? `${needsAnswer ? " · " : ""}${flow.reported ? "Awaiting payroll" : "Report added"}` : ""}
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
                if (next === days.length && flow) { leaveDays(); return; }
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
  // the same rule as the rail above: a day that asks something is answered when
  // it is answered, not when somebody has walked past it
  const done = need.filter((d) => d.done).length;
  return (
    <p className="mt-0.5 text-[12.5px] text-faint">
      {done} of {need.length} day{need.length === 1 ? "" : "s"} answered
    </p>
  );
}
