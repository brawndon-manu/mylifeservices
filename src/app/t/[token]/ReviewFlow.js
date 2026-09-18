"use client";

import { createContext, useContext, useRef, useState } from "react";
import { CORRECTION_KINDS } from "@/lib/timesheet/corrections";
import { reportedReviewDay, dayChipLabel } from "@/lib/timesheet/review-days";
// the engine's own overtime split, in a file a browser can import - see overtime.js
import { applyOvertime } from "@/lib/timesheet/overtime";
import { checkWorkSlots, clockLabel } from "@/lib/timesheet/work-slots";
import { parseLooseTime, formatTimeDisplay } from "@/lib/loose-time";
import DayCalendar from "./DayCalendar";
import styles from "./ReviewFlow.module.css";

const ReviewContext = createContext(null);
// the rail selects whichever day the address bar names - its #day-<date>
// handler - and a hash already set fires no event, so that case is fired by hand
const selectDay = (date) => {
  const want = `#day-${date}`;
  if (window.location.hash === want) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else window.location.hash = want;
};
export const useReviewFlow = () => useContext(ReviewContext);
const button = "min-h-[44px] rounded-[9px] bg-fill px-4 py-2 text-[13px] font-medium text-foreground disabled:opacity-40";

// THE STATE, LIFTED OUT OF THE VISUALS - 2026-09-17.
//
// It all used to live in `ReviewFlow`, which renders the step strip and the
// footer and therefore sits partway down the page, inside the unsigned branch.
// That was fine until the SUMMARY at the top needed to know about a drafted
// report ("i want the hours above to change too"): a component above the
// provider gets null from the hook and silently shows the unchanged figure.
//
// So the provider wraps the whole page and the strip stays where it was. Every
// value the strip and footer derive is on the context now, so there is still
// exactly one place that decides what stage the review is in.
export function ReviewProvider({
  enabled, readOnly = false, initialReports = [], leave = true, ready, openDays = [], children,
}) {
  const [stage, setStage] = useState("days");
  // reports already sent arrive as the list, marked sent: not drafts, not
  // editable, and since 2026-09-09 no longer a hold on the signature - what
  // gets signed while they wait is the pending document that carries them
  const [draftItems, setItems] = useState(() => (readOnly ? [] : initialReports));
  const items = readOnly ? initialReports : draftItems;
  const [reported, setReported] = useState(readOnly || initialReports.length > 0);
  const [generated, setGenerated] = useState(false);
  const [reviewedDays, setReviewedDays] = useState(() => new Set());
  const markReviewed = (date) => setReviewedDays((previous) => new Set(previous).add(date));
  const [editorTarget, setEditorTarget] = useState(null);
  const [activeDate, setActiveDate] = useState(null);
  const [leaveEditing, setLeaveEditing] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const reportRef = useRef(null);
  const targets = useRef(new Map());
  const headingRef = useRef(null);

  function go(next) {
    if (readOnly || editorTarget || leaveEditing || leaveBusy) return;
    setStage(next);
    headingRef.current?.scrollIntoView({ block: "start" });
  }
  function report(date, index = null) {
    const target = targets.current.get(date);
    if (!target) return;
    setStage("days");
    setActiveDate({ date });
    setEditorTarget(target);
    reportRef.current?.start(date, index);
  }
  // drafts must be sent before the document generates; sent ones do not hold it
  const draftsUnsent = items.length > 0 && !reported;
  const canGenerate = ready && !editorTarget && !draftsUnsent;
  // WHY THE FOOTER IS HELD, said above the buttons. Mánu 2026-09-09: he added a
  // report on the 3rd, pressed Next without sending it, and found Next dead on
  // the PTO step with the reason printed under the fold. The reports step holds
  // now, where the Send button is, and every hold says why in the one place.
  // THE DAYS THE HOLD IS WAITING ON, so "answer the remaining questions" can
  // point somewhere. The days stage is hidden from here, and so are its rail,
  // its questions and its save - the sentence on its own was all a person had.
  // A chip goes back to the days and opens that one; the rail selects whichever
  // day the address bar names.
  const askingDays = (stage === "leave" || (!leave && stage === "reports")) && !ready;
  const openDay = (date) => { go("days"); selectDay(date); };
  const hold = editorTarget ? "Add this report or cancel it before continuing."
    : leaveEditing ? "Save your answer or cancel before continuing."
    : draftsUnsent && stage !== "days" ? "Review and send your reports before generating your timesheet."
    : (stage === "leave" || (!leave && stage === "reports")) && !ready ? "Answer the remaining questions to generate your document."
    : null;
  // the strip: four steps with the leave stage, three without; the step after
  // the reports stage is the leave stage when there is one, else the document
  const steps = leave ? ["Review days", "PTO & sick pay", "Generate", "Sign"] : ["Review days", "Generate", "Sign"];
  // THREE ACROSS ON A PHONE, FOUR IN A SQUARE - Mánu 2026-09-16: "on mobile the
  // numbers can also be side by side cause it looks awkward with 1 review days
  // 2 generate and 3 sign on its own row alone."
  //
  // The two column grid is right for the day program's four and wrong for ILS's
  // three, which it breaks 2 + 1 with Sign alone underneath. Measured at 375:
  // three steps in a row take 245px against a 343px budget, four take exactly
  // 343 and wrap "Review days" onto two lines. So the COUNT decides it, not the
  // width - a media query would have to guess which flow it is in.
  const stripClass = steps.length > 3 ? "grid grid-cols-2 gap-2" : "flex gap-3";
  const afterReports = leave ? "leave" : "document";
  const generateStep = leave ? 2 : 1;
  const current = stage === "days" || stage === "reports" ? 0 : stage === "leave" ? 1 : generated ? generateStep + 1 : generateStep;
  const value = enabled ? { stage, go, items, setItems, reported, setReported, readOnly, leave,
    reviewedDays, markReviewed,
    generated, setGenerated, editorTarget, setEditorTarget, activeDate,
    reportRef, targets, report, leaveEditing, setLeaveEditing, leaveBusy, setLeaveBusy,
    // what the strip and the footer draw from, so the visuals hold no rules
    enabled, ready, openDays, draftsUnsent, canGenerate, hold, askingDays, openDay,
    steps, stripClass, afterReports, generateStep, current, headingRef } : null;

  return <ReviewContext.Provider value={value}>{children}</ReviewContext.Provider>;
}

// THE STEP STRIP AND THE FOOTER. Pure visuals now - every decision it draws is
// read off the provider above, which is what lets the summary at the top of the
// page see the same drafted report this does.
export default function ReviewFlow({ children, reports }) {
  const flow = useReviewFlow();
  if (!flow) return <>{children}<div>{reports}</div></>;
  const {
    stage, go, items, readOnly, editorTarget, leaveEditing, leaveBusy, generated,
    enabled, openDays, draftsUnsent, canGenerate, hold, askingDays, openDay,
    steps, stripClass, afterReports, generateStep, current, headingRef, leave,
  } = flow;

  return (
    <>
      {enabled && !readOnly && (
        <ol ref={headingRef} aria-label="Timesheet progress" className={`mt-6 scroll-mt-24 border-b border-sep pb-5 sm:flex sm:flex-wrap sm:gap-5 ${stripClass}`}>
          {steps.map((label, i) => (
            <li key={label}>
              <button type="button" aria-current={i === current ? "step" : undefined}
                disabled={!!editorTarget || leaveEditing || leaveBusy || (i >= generateStep && !canGenerate) || (i === generateStep + 1 && !generated)}
                onClick={() => go(i === 0 ? "days" : leave && i === 1 ? "leave" : "document")}
                className={`flex min-h-[44px] items-center gap-2 text-[13px] disabled:opacity-50 ${i === current ? "font-semibold text-accent" : "text-muted"}`}>
                <span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${i === current ? styles.activeStep : "bg-fill"}`}>{i + 1}</span>{label}
              </button>
            </li>
          ))}
        </ol>
      )}
      {children}
      <div hidden={enabled && stage !== "reports"}>{reports}</div>
      {enabled && !readOnly && (stage !== "days" || items.length > 0 || editorTarget) && (
        <div className="mt-6 border-t border-sep pt-5">
          {hold && <p className="mb-3 text-xs text-muted">
            {hold}
            {askingDays && openDays.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => openDay(d)}
                className="ml-2 inline-flex rounded-[7px] bg-amber-500/15 px-2 py-0.5 align-baseline font-mono text-xs font-semibold text-amber-700 transition hover:bg-amber-500/25 dark:text-amber-300"
              >
                {dayChipLabel(d)}
              </button>
            ))}
          </p>}
          {stage === "days" ? <div className="flex justify-end"><button type="button" className={button} disabled={!!editorTarget} onClick={() => go("reports")}>Review reports ({items.length})</button></div> : <div className="flex items-center justify-between gap-3">
            <button type="button" className={button} disabled={!!editorTarget || leaveEditing || leaveBusy}
              onClick={() => go(stage === "reports" ? "days" : stage === "leave" ? "reports" : leave ? "leave" : "reports")}>Back</button>
            {stage !== "document" && <button type="button" className={`${button} ${styles.primary}`}
              disabled={!!editorTarget || leaveEditing || leaveBusy || (stage === "reports" && (draftsUnsent || (!leave && !canGenerate))) || (stage === "leave" && !canGenerate)}
              onClick={() => go(stage === "reports" ? afterReports : "document")}>Next</button>}
          </div>}
          {stage !== "days" && stage !== "document" && <p className="mt-2 text-right text-xs text-muted">Next: {stage === "reports" && leave ? "PTO & sick pay" : "Generate"}</p>}
        </div>
      )}
    </>
  );
}

export function ReviewStage({ name, children }) {
  const flow = useReviewFlow();
  return <div hidden={!!flow && flow.stage !== name}>{children}</div>;
}

export function DayReport({ date, navigation }) {
  const flow = useReviewFlow();
  if (!flow) return navigation;
  const reports = flow.items.map((item, index) => ({ item, index })).filter(({ item }) => item.date === date);
  return (
    <div className={`mt-4 border-t border-sep pt-3 ${styles.dayBarHost}`}>
      {reports.map(({ item, index }) => (
        <div key={item.id || index} className="mb-4 border-l-2 border-amber-400 pl-3">
          <p className="text-sm font-medium text-foreground">{CORRECTION_KINDS[item.kind]?.label || item.kind}</p>
          {item.claimedHours != null && <p className={`mt-2 text-lg tabular-nums ${styles.hours}`}>{Number(item.claimedHours).toFixed(2)} <span className="text-xs text-muted">hrs reported</span></p>}
          <p className="mt-1 text-sm text-muted">{(item.slots ? checkWorkSlots(item.slots, item.claimedHours).slots || [] : item.statedSlots || []).map((slot) => `${clockLabel(slot.from)} to ${clockLabel(slot.to)}`).join(", ")}</p>
          {!!item.times?.length && <p className="mt-1 text-sm text-muted">{item.times.map((time) => formatTimeDisplay(parseLooseTime(time, { assumeWorkday: true }))).join(", ")}</p>}
          {item.note && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{item.note}</p>}
          <p className="mt-2 text-xs text-muted">{flow.reported ? "Awaiting payroll" : "Not sent"}</p>
          {!flow.reported && <div className="flex gap-4">
            <button type="button" disabled={!!flow.editorTarget} onClick={() => flow.report(date, index)} className="min-h-[44px] text-sm text-accent disabled:opacity-40">Edit</button>
            <button type="button" disabled={!!flow.editorTarget} onClick={() => flow.setItems((old) => old.filter((_, i) => i !== index))} className="min-h-[44px] text-sm text-muted disabled:opacity-40">Remove</button>
          </div>}
        </div>
      ))}
      <div ref={(node) => { if (node) flow.targets.current.set(date, node); else flow.targets.current.delete(date); }} />
      {/* the whole row rides the bottom of a phone screen, not just Back and
          Next: it is the arrangement he settled on 2026-09-08 and Report a
          problem is the one thing on it somebody reaches for mid-calendar. */}
      <div data-day-bar className={`flex items-center justify-between gap-3 ${styles.dayBar}`}>
        <button type="button" disabled={!!flow.editorTarget || flow.reported}
          onClick={() => flow.report(date)} className="min-h-[44px] shrink-0 text-[13px] font-medium text-accent disabled:opacity-40">Report a problem</button>
        {navigation}
      </div>
    </div>
  );
}

// THE FIGURES AT THE TOP, WITH WHAT THEY HAVE REPORTED FOLDED IN.
//
// Mánu 2026-09-17: "i want the hours above to change too." I had asked and left
// it out on purpose the first time round - the rule everywhere else here is
// that a claim moves nothing on its own - and this is him answering it.
//
// WHAT MOVES AND WHAT DOES NOT. Hours worked and Paid hours move, struck the
// same way the day header is, so the sentence reads alike in both places.
// Overtime and double time DO NOT: whether a longer day crosses forty is the
// overtime engine's answer, not arithmetic that can be redone in a browser, and
// printing a guess next to a real figure is worse than leaving it. They settle
// when the office accepts the report and the sheet rebuilds.
//
// STILL NOTHING BUT A PICTURE. The stored figures, the payroll total and the
// document are untouched until that acceptance - this is the same screen-only
// change `reportedReviewDay` has always made, carried up to the summary.
export function ReviewTotals({
  dayHours = [], paidHours = 0, otHours = 0, doubleHours = 0,
  // the three kinds, each drawn only when it is above zero. `timeOffHours` is
  // their sum and is what Paid hours grows by - kept as its own prop rather
  // than re-added here, so this cannot disagree with what the page worked out.
  pto = 0, sick = 0, holiday = 0, timeOffHours = 0,
  payPeriod = null,
}) {
  const flow = useReviewFlow();
  const r2 = (n) => Math.round((n || 0) * 100) / 100;

  // THE DAYS AS THEY WOULD BE IF WE ACCEPTED WHAT THEY HAVE REPORTED, each one
  // through `reportedReviewDay` - the rule the day header draws from - so a
  // claim the slots do not support is ignored here exactly as it is there,
  // rather than moving the total and not the day.
  let delta = 0;
  const claimed = dayHours.map((d) => {
    const shown = reportedReviewDay({ date: d.date, paidHours: d.paidHours || 0 }, flow?.items);
    const hours = shown.reviewReported ? shown.paidHours : (d.paidHours || 0);
    if (shown.reviewReported) delta += hours - (d.paidHours || 0);
    return { date: d.date, paidHours: hours, printed: d.printed };
  });
  delta = r2(delta);
  const changed = Math.abs(delta) > 0.005;

  // AND THE OVERTIME THAT FALLS OUT OF THEM, from the engine's own rule.
  //
  // Mánu 2026-09-17: "why didnt ot change". It did not, because I had left it
  // deferred - and on an 11.50 hour day that is not caution, it is a wrong
  // number sitting beside a right one. Whether a day crosses eight is not a
  // judgement call, it is `applyOvertime`, so the honest fix was to move that
  // function somewhere a browser can run it rather than approximate it here.
  // See overtime.js.
  //
  // Only when something is actually claimed: on an ordinary sheet these stay
  // the figures the engine already stored, untouched.
  let ot = otHours;
  let dbl = doubleHours;
  if (changed && claimed.length) {
    const rerun = applyOvertime(claimed, payPeriod || null);
    ot = r2(rerun.reduce((n, d) => n + (d.otHours || 0), 0));
    dbl = r2(rerun.reduce((n, d) => n + (d.doubleHours || 0), 0));
  }

  const worked = r2(paidHours + delta);
  const paid = r2(worked + timeOffHours);

  return (
    <div className="mt-6 divide-y divide-sep border-y border-sep">
      <Figure label="Hours worked" value={worked} was={changed ? paidHours : null} strong />
      {ot > 0 && <Figure label="Overtime" value={ot} was={changed && Math.abs(ot - otHours) > 0.005 ? otHours : null} />}
      {dbl > 0 && <Figure label="Double time" value={dbl} was={changed && Math.abs(dbl - doubleHours) > 0.005 ? doubleHours : null} />}
      {/* NAMED, NOT LUMPED - Mánu 2026-09-17, having seen it as one line:
          "time off shoudnt be there. its just PTO Sick pay". They are paid under
          separate codes and their balances track separately, so a person
          reading their own sheet should see which is which. Holiday sits with
          them ready for when QuickSolve starts reporting one - every row only
          draws above zero, so today it never appears. */}
      {pto > 0 && <Figure label="PTO" value={pto} />}
      {sick > 0 && <Figure label="Sick pay" value={sick} />}
      {holiday > 0 && <Figure label="Holiday" value={holiday} />}
      {timeOffHours > 0 && (
        <Figure label="Paid hours" value={paid} was={changed ? r2(paidHours + timeOffHours) : null} strong />
      )}
      {changed && (
        <p className="py-3 text-[12px] leading-snug text-muted">
          {flow?.reported
            ? "This includes the hours you reported. We will check them before anything changes."
            : "This includes the hours you have not sent yet."}
        </p>
      )}
    </div>
  );
}

// `was` is the figure before a report, struck beside the new one - the same
// shape the day header uses, so one page does not have two ways of saying it
function Figure({ label, value, strong, tone, was = null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-3">
      <span className={`text-sm ${strong ? "font-medium text-foreground" : "text-muted"}`}>
        {label}
      </span>
      <span
        className={
          tone === "prem"
            ? "text-sm font-semibold text-rose-600 dark:text-rose-400"
            // noted, not charged - the same grey the sheet itself uses for a
            // premium it assumed away rather than billed
            : tone === "muted"
              ? "text-sm font-semibold text-muted"
              : strong
                ? "text-[22px] font-semibold tracking-tight text-foreground"
                : "text-sm font-semibold text-foreground"
        }
      >
        {was != null && (
          <span className={`align-baseline text-sm ${styles.wasFigure}`}>
            {(Math.round(was * 100) / 100).toFixed(2)}
          </span>
        )}
        <span className={was != null ? styles.nowFigure : (tone ? undefined : styles.hours)}>{(Math.round((value || 0) * 100) / 100).toFixed(2)}</span>
        <span className="ml-1 text-[12px] font-normal text-faint">hrs</span>
      </span>
    </div>
  );
}

export function ReportedDayVisual({ day, label, part, children }) {
  const flow = useReviewFlow();
  const display = reportedReviewDay(day, flow?.items);
  if (!display.reviewReported) return children;
  if (part === "quiet") return null;
  if (part === "calendar") return <div className={styles.calendar}>
    {display.punches.length ? <DayCalendar day={display} /> : <p className="py-8 text-sm text-muted">No work reported.</p>}
  </div>;
  const [weekday, ...month] = label.split(", ");
  const slots = display.punches;
  return <div>
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <h3 className="text-[17px] font-semibold tracking-tight"><span className="text-muted">{weekday}, </span><span className={styles.month}>{month.join(", ")}</span></h3>
      {/* WHAT IT SAID, AND WHAT THEY SAY IT IS. Mánu 2026-09-17: "cross out
          the current hours and next to it have the new total". It read as two
          separate sentences before - "9.50 hrs reported" up here and "8.00
          hours recorded" underneath - which is the same two numbers with the
          relationship between them left to the reader.
          `reviewRecordedHours` is the pre-claim figure, kept by
          reportedReviewDay itself, so this cannot drift from what the rail
          draws for the same day. */}
      <p className="text-sm text-muted">
        <span className={styles.wasFigure}>
          {Number(display.reviewRecordedHours ?? day.paidHours ?? 0).toFixed(2)}
        </span>
        now <span className={`font-semibold ${styles.nowFigure}`}>{display.paidHours.toFixed(2)}</span> hrs
      </p>
    </div>
    {!!slots.length && <p className="mt-1 text-[13px] text-muted">{clockLabel(slots[0].min)} to {clockLabel(slots.at(-1).min)}</p>}
    <p className="mt-2 text-[13px] text-muted">{flow.reported ? "You reported this. We will check it before anything changes." : "Not sent yet."}</p>
  </div>;
}
