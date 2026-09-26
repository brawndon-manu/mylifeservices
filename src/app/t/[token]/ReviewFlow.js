"use client";

import { createContext, useContext, useRef, useState } from "react";
import { CORRECTION_KINDS } from "@/lib/timesheet/corrections";
import { reportedReviewDay, dayChipLabel } from "@/lib/timesheet/review-days";
// the engine's own overtime split, in a file a browser can import - see overtime.js
import { applyOvertime } from "@/lib/timesheet/overtime";
import { checkWorkSlots, clockLabel } from "@/lib/timesheet/work-slots";
import { slotChanges } from "@/lib/timesheet/report-diff";
import { shiftsOf } from "@/lib/timesheet/questions";
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
// what the page says while questions are still open: the reports step's hold
// line, and the strip of days under the day list. one sentence, said once.
export const REMAINING_QUESTIONS = "Answer the remaining questions to generate your document.";
// and while a report waits on payroll (Mánu 2026-09-25, his words): on the
// Generate band, on the panel after Send reports, and on the footer's hold
export const REPORTS_PENDING = "Your reported issues are pending. You'll get an email once payroll has decided.";
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
  // AND THE SENT ONES FOLLOW THE SHEET. they were read once when the tab
  // opened, so a report payroll had just accepted stayed on its day as
  // "Awaiting payroll" after the page refreshed with the rebuilt figures under
  // it. when the server's list of open reports changes, a tab holding sent
  // reports takes the new list - an emptied one puts Report a problem back.
  // drafts not sent yet are the tab's own and are left alone.
  // done while rendering, React's way of resetting state off a prop, so the
  // page never paints the stale list first
  const serverReports = initialReports.map((r) => r.id).join("|");
  const [seenReports, setSeenReports] = useState(serverReports);
  if (!readOnly && seenReports !== serverReports) {
    setSeenReports(serverReports);
    if (reported || initialReports.length) {
      setItems(initialReports);
      setReported(initialReports.length > 0);
    }
  }
  const [generated, setGenerated] = useState(false);
  // the days walked through live on DayDoneProvider now, seeded from the sheet.
  // a second copy kept here only in the tab outlived a reset and a Change this
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
  // drafts must be sent before the document generates, and sent ones hold it
  // until payroll decides (Mánu 2026-09-25, going back on the 09-09 pending
  // document) - `ready` already knows about the reports the server holds,
  // `reported` covers the ones this tab just sent
  const draftsUnsent = items.length > 0 && !reported;
  const canGenerate = ready && !editorTarget && !draftsUnsent && !reported;
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
    : reported && stage !== "days" ? REPORTS_PENDING
    : (stage === "leave" || (!leave && stage === "reports")) && !ready ? REMAINING_QUESTIONS
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
      {enabled && !readOnly && (stage !== "days" || hold) && (
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
          {/* no Review reports button on the days stage any more: a drafted
              report sits in the told-us panel, which opens the reports page -
              see ToldUsPanel */}
          {stage !== "days" && <div className="flex items-center justify-between gap-3">
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

// WHAT THEY HAVE DRAFTED, IN THE TOLD-US PANEL. A report not yet sent sits
// with the answers already on record, as a row of the same shape with its
// figure; the lone Review reports button at the foot of the page is gone, and
// "View reports" under the rows opens the reports page, where the sending
// stays. Once sent the page refreshes and the server's own
// row ("reported") takes over, so the drafts are drawn only while nothing is
// sent. The panel itself is here so it can show for a draft on a sheet that
// has told us nothing else yet.
export function ToldUsPanel({ hasRows, children }) {
  const flow = useReviewFlow();
  const drafts = flow && !flow.readOnly && !flow.reported ? flow.items : [];
  if (!hasRows && !drafts.length) return null;
  return (
    <div className="mt-5 rounded-xl bg-surface px-5 py-4 shadow-sm night:ring-1 night:ring-border">
      <p className="text-[15px] font-semibold text-foreground">
        What you have told us about this timesheet
      </p>
      {children}
      {drafts.length > 0 && (
        <ul className="mt-1.5 divide-y divide-sep">
          {drafts.map((item, i) => (
            <li key={i} className="flex gap-4 py-2.5 text-[13px]">
              <span className="w-24 flex-none font-semibold text-foreground">
                {item.date ? dayChipLabel(item.date) : "This timesheet"}
              </span>
              <span className="min-w-0 text-muted">
                <span className="font-semibold text-amber-700 dark:text-amber-400">not sent</span>
                <span className="mt-0.5 block text-faint">
                  {CORRECTION_KINDS[item.kind]?.label || item.kind}
                  {item.claimedHours != null && <> · <span className={`tabular-nums text-foreground ${styles.hours}`}>{Number(item.claimedHours).toFixed(2)}</span> hrs</>}
                </span>
                {item.note && (
                  <span className="mt-1 block border-l-2 border-sep pl-2 italic text-faint">
                    &ldquo;{item.note}&rdquo;
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {drafts.length > 0 && (
        <div className="mt-1">
          <button type="button" onClick={() => flow.go("reports")} disabled={!!flow.editorTarget}
            className="min-h-[44px] text-[13px] font-medium text-accent disabled:opacity-40">
            View reports
          </button>
        </div>
      )}
    </div>
  );
}

export function ReviewStage({ name, children }) {
  const flow = useReviewFlow();
  return <div hidden={!!flow && flow.stage !== name}>{children}</div>;
}

// `note`: the day's own line about what it still needs, kept in the card rather
// than on the bar. `floats`: false in All questions, where every day is on the
// page at once - fixed there, all their bars stacked on one spot and the one on
// top was the last day's, so Next and Report a problem acted on the wrong day.
// WHAT A REPORT DOES TO ITS DAY, for the card under the day and the reports
// list alike: the slots in minutes (a draft's typed ones read, a sent one's
// stored ones) and, on an hours report with a record to compare, only what
// changed - see slotChanges. a missing day has nothing to differ from, so
// `changes` is null and the caller prints the plain slots
export function reportSlots(item, day) {
  const minuteSlots = item.slots ? checkWorkSlots(item.slots, item.claimedHours).slots || [] : item.statedSlots || [];
  const changes = item.kind === "hours" && day ? slotChanges(shiftsOf(day), minuteSlots) : null;
  return { minuteSlots, changes };
}

// the changes as lines: the old range crossed out beside the new one and the
// hours it adds or takes, a plus before an added shift, a removed one crossed
// out. a slot left as it was is not printed
export function ChangeLines({ changes }) {
  const range = (from, to) => `${clockLabel(from)}–${clockLabel(to)}`;
  return (
    <ul className="mt-1.5 space-y-0.5 font-mono text-[12.5px] leading-relaxed text-muted">
      {changes.map((c, i) => (
        <li key={i} className="flex flex-wrap items-baseline gap-x-2">
          {c.kind !== "added" && <s className={styles.wasFigure}>{range(c.wasFrom, c.wasTo)}</s>}
          {c.kind === "added" && <span className="text-muted">+</span>}
          {c.kind !== "removed" && <span className="text-foreground">{range(c.from, c.to)}</span>}
          <span className="text-muted">{c.delta >= 0 ? "+" : "−"}{Math.abs(c.delta).toFixed(2)} hrs</span>
        </li>
      ))}
    </ul>
  );
}

// `day`: the day as recorded, so an hours report can be drawn as what it
// changes - see reportSlots
export function DayReport({ date, day = null, navigation, note = null, floats = true }) {
  const flow = useReviewFlow();
  if (!flow) return navigation;
  const reports = flow.items.map((item, index) => ({ item, index })).filter(({ item }) => item.date === date);
  return (
    <div className={`mt-4 border-t border-sep pt-3 ${styles.dayBarHost}`}>
      {/* THE REPORT ON THIS DAY, as a card rather than bare lines under an
          amber rule: the sent panel's amber tint, the
          kind as its heading with the state as a pill beside it, the figure,
          the slots as one mono line, the note quoted the way the told-us
          panel quotes one, and Edit / Remove only while it is still theirs */}
      {reports.map(({ item, index }) => {
        // ONLY WHAT CHANGED: a shift stretched to 11pm shows as the old range
        // crossed out beside the new one and the hours it adds. A missing day
        // has no record to differ from, so it keeps its plain list
        const { minuteSlots, changes } = reportSlots(item, day);
        const slots = minuteSlots.map((slot) => `${clockLabel(slot.from)} to ${clockLabel(slot.to)}`);
        return (
        <div key={item.id || index} className="amber-tint-card mb-4 rounded-xl px-4 py-3.5 night:ring-1 night:ring-border">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="text-sm font-semibold text-foreground">{CORRECTION_KINDS[item.kind]?.label || item.kind}</p>
            <span className="rounded-full bg-surface/70 px-2 py-0.5 text-[11px] font-medium text-muted">{flow.reported ? "Awaiting payroll" : "Not sent"}</span>
          </div>
          {item.claimedHours != null && <p className={`mt-2 text-xl tabular-nums text-foreground ${styles.hours}`}>
            {/* the day's figure crossed out beside the reported one, the way
                the day's heading shows it */}
            {day && item.kind === "hours" && <span className={styles.wasFigure}>{Number(day.paidHours || 0).toFixed(2)}</span>}
            <span className={day && item.kind === "hours" ? styles.nowFigure : undefined}>{Number(item.claimedHours).toFixed(2)}</span>
            {" "}<span className="text-xs font-normal text-muted">hrs reported</span>
          </p>}
          {changes && changes.length > 0 ? (
            <ChangeLines changes={changes} />
          ) : slots.length > 0 && !changes && <p className="mt-1.5 font-mono text-[12.5px] leading-relaxed text-muted">{slots.join(" · ")}</p>}
          {!!item.times?.length && <p className="mt-1.5 font-mono text-[12.5px] text-muted">{item.times.map((time) => formatTimeDisplay(parseLooseTime(time, { assumeWorkday: true }))).join(" · ")}</p>}
          {item.note && <p className="mt-2 border-l-2 border-sep pl-2 text-[13px] italic leading-relaxed text-muted whitespace-pre-wrap">&ldquo;{item.note}&rdquo;</p>}
          {!flow.reported && <div className="mt-1 flex gap-5">
            <button type="button" disabled={!!flow.editorTarget} onClick={() => flow.report(date, index)} className="min-h-[44px] text-[13px] font-medium text-accent disabled:opacity-40">Edit</button>
            <button type="button" disabled={!!flow.editorTarget} onClick={() => flow.setItems((old) => old.filter((_, i) => i !== index))} className="min-h-[44px] text-[13px] font-medium text-muted disabled:opacity-40">Remove</button>
          </div>}
        </div>
        );
      })}
      <div ref={(node) => { if (node) flow.targets.current.set(date, node); else flow.targets.current.delete(date); }} />
      {/* the line saying what the day still needs stays down here in the card,
          in the page - only the controls float */}
      {note}
      {/* the whole row rides the bottom of the screen, not just Back and Next:
          it is the arrangement he settled on 2026-09-08 and Report a problem is
          the one thing on it somebody reaches for mid-calendar. every width now,
          lined up with the day column on a wider screen. */}
      <div data-day-bar className={`flex items-center justify-between gap-3 ${floats ? styles.dayBar : "mt-3"}`}>
        <span className="flex shrink-0 items-center gap-4">
          <button type="button" disabled={!!flow.editorTarget || flow.reported}
            onClick={() => flow.report(date)} className="min-h-[44px] shrink-0 text-[13px] font-medium text-accent disabled:opacity-40">Report a problem</button>
          {/* the way out of the form, on the bar too (Mánu 2026-09-25): the
              form's own Cancel sits at its foot, under the screen when the
              form is tall */}
          {flow.editorTarget && <button type="button" onClick={() => flow.reportRef.current?.cancel()}
            className="min-h-[44px] shrink-0 text-[13px] font-medium text-muted">Cancel</button>}
        </span>
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

// `scheduled`: the day's rostered blocks, so a reported slot keeps the name the
// roster gave that time (without it a shift stretched to 11pm turned every
// block on the day into "Work"). The calendar names worked time by overlap
// with the roster, so a slot
// nothing was booked over is the only one that reads Work.
export function ReportedDayVisual({ day, label, part, children, scheduled = [] }) {
  const flow = useReviewFlow();
  const display = reportedReviewDay(day, flow?.items);
  if (!display.reviewReported) return children;
  if (part === "quiet") return null;
  if (part === "calendar") return <div className={styles.calendar}>
    {display.punches.length ? <DayCalendar day={display} scheduled={scheduled} /> : <p className="py-8 text-sm text-muted">No work reported.</p>}
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
