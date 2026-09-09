"use client";

import { createContext, useContext, useRef, useState } from "react";
import { CORRECTION_KINDS } from "@/lib/timesheet/corrections";
import { reportedReviewDay } from "@/lib/timesheet/review-days";
import { checkWorkSlots, clockLabel } from "@/lib/timesheet/work-slots";
import { parseLooseTime, formatTimeDisplay } from "@/lib/loose-time";
import DayCalendar from "./DayCalendar";
import styles from "./ReviewFlow.module.css";

const ReviewContext = createContext(null);
export const useReviewFlow = () => useContext(ReviewContext);
const button = "min-h-[44px] rounded-[9px] bg-fill px-4 py-2 text-[13px] font-medium text-foreground disabled:opacity-40";

export default function ReviewFlow({ enabled, ready, reports, children, initialReports = [], readOnly = false }) {
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
  const hold = editorTarget ? "Add this report or cancel it before continuing."
    : leaveEditing ? "Save your answer or cancel before continuing."
    : draftsUnsent && stage !== "days" ? "Review and send your reports before generating your timesheet."
    : stage === "leave" && !ready ? "Answer the remaining questions to generate your document."
    : null;
  const current = stage === "days" || stage === "reports" ? 0 : stage === "leave" ? 1 : generated ? 3 : 2;
  const value = enabled ? { stage, go, items, setItems, reported, setReported, readOnly,
    reviewedDays, markReviewed,
    generated, setGenerated, editorTarget, setEditorTarget, activeDate,
    reportRef, targets, report, leaveEditing, setLeaveEditing, leaveBusy, setLeaveBusy } : null;

  return (
    <ReviewContext.Provider value={value}>
      {enabled && !readOnly && (
        <ol ref={headingRef} aria-label="Timesheet progress" className="mt-6 grid scroll-mt-24 grid-cols-2 gap-2 border-b border-sep pb-5 sm:flex sm:flex-wrap sm:gap-5">
          {["Review days", "PTO & sick pay", "Generate", "Sign"].map((label, i) => (
            <li key={label}>
              <button type="button" aria-current={i === current ? "step" : undefined}
                disabled={!!editorTarget || leaveEditing || leaveBusy || (i >= 2 && !canGenerate) || (i === 3 && !generated)}
                onClick={() => go(i === 0 ? "days" : i === 1 ? "leave" : "document")}
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
          {hold && <p className="mb-3 text-xs text-muted">{hold}</p>}
          {stage === "days" ? <div className="flex justify-end"><button type="button" className={button} disabled={!!editorTarget} onClick={() => go("reports")}>Review reports ({items.length})</button></div> : <div className="flex items-center justify-between gap-3">
            <button type="button" className={button} disabled={!!editorTarget || leaveEditing || leaveBusy}
              onClick={() => go(stage === "reports" ? "days" : stage === "leave" ? "reports" : "leave")}>Back</button>
            {stage !== "document" && <button type="button" className={`${button} ${styles.primary}`}
              disabled={!!editorTarget || leaveEditing || leaveBusy || (stage === "reports" && draftsUnsent) || (stage === "leave" && !canGenerate)}
              onClick={() => go(stage === "reports" ? "leave" : "document")}>Next</button>}
          </div>}
          {stage !== "days" && stage !== "document" && <p className="mt-2 text-right text-xs text-muted">Next: {stage === "reports" ? "PTO & sick pay" : "Generate"}</p>}
        </div>
      )}
    </ReviewContext.Provider>
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
    <div className="mt-4 border-t border-sep pt-3">
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
      <div className="flex items-center justify-between gap-3">
        <button type="button" disabled={!!flow.editorTarget || flow.reported}
          onClick={() => flow.report(date)} className="min-h-[44px] shrink-0 text-[13px] font-medium text-accent disabled:opacity-40">Report a problem</button>
        {navigation}
      </div>
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
      <p className="text-sm text-muted"><span className={`font-semibold ${styles.hours}`}>{display.paidHours.toFixed(2)}</span> hrs reported</p>
    </div>
    {!!slots.length && <p className="mt-1 text-[13px] text-muted">{clockLabel(slots[0].min)} to {clockLabel(slots.at(-1).min)}</p>}
    <p className="mt-2 text-[13px] text-muted">{Number(day.paidHours || 0).toFixed(2)} hours recorded. {flow.reported ? "Awaiting payroll." : "Not sent."}</p>
  </div>;
}
