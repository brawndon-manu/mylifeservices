"use client";

// The questions an employee answers before they can sign.
//
// ONE CARD PER KIND, not per row. April Martinez has eleven identical entries
// and eleven cards would be unusable; a kind that is one habit gets one card
// with its dates listed. A kind where each day is a separate hour of somebody's
// money gets one card with a row PER DAY - Hernadez's two thirty minute
// entries, answered separately inside the same card. Mánu 2026-08-09.
//
// NOTHING IS PRE-SELECTED and NOTHING SUBMITS ON THE FIRST CLICK. An answer is
// picked, filled in, and saved with its own Save answer, with a line beside the
// button saying what it will do - or saved by the day's Save and next on the
// way past. There is no second save anywhere, and nothing waits unsaved in the
// tab for a press further down the page.
//
// COLOUR CARRIES THE SAME MEANING AS THE SHEET: amber while we are still asking,
// green once an answer has left the figures alone, plain once it has not.
import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition, Fragment } from "react";
import { useRouter } from "next/navigation";
import { useReviewFlow } from "./ReviewFlow";
import reviewStyles from "./ReviewFlow.module.css";
import { CircleAlert, CircleCheck, Clock3 } from "lucide-react";
import { parseLooseTime, formatTimeDisplay, spokenTime } from "@/lib/loose-time";
// whether a day folds to its one line - a press, not a keystroke, decides it
import { shellFolds } from "@/lib/timesheet/day-shell";
// the five sentences, already written and already counting correctly - see the
// note on `renderReason`. Client-safe: break-answers.js imports nothing.
import {
  employeeQuestion, reasonOwedOn, reasonSlotFor, breakFindingKey,
} from "@/lib/timesheet/break-answers";
// a typed break against the stretches its question offered, the server's rules
import { lunchOutside, restOutside } from "@/lib/timesheet/typed-break";
import { useStagedPublisher } from "./StagedTimes";

// THE BATCH ANSWER, SHARED SO ITS ROWS CAN BE SPLIT ACROSS THE PAGE.
//
// A batched kind is many days answered separately - see BatchProvider. "Day by
// day" needs each of those days to sit beside its own calendar, so the rows
// cannot live inside one card; the state lives in a provider and BatchDays draws
// it wherever a day is.
//
// It used to commit every day in ONE press at the bottom, after the last day,
// and until then nothing was written. Somebody who pressed Next through the
// fortnight and left had saved nothing, and the sign step then said their
// questions were unanswered. Each answer saves on its own now, where it is given.
const BatchCtx = createContext(null);

// WHAT THE RAIL NEEDS BEFORE IT LETS SOMEBODY LEAVE THE DAYS: every answer
// started and not saved yet, wherever it is, and the way to save one. Null
// outside the provider.
export function usePendingAnswers() {
  const done = useContext(DayDoneCtx);
  if (!done?.pendingAll) return null;
  return { pendingAll: done.pendingAll, saveOne: done.saveOne, attempt: done.attempt };
}

// ONE ANSWER BEING GIVEN, REPORTED UP. A card renders this while it holds an
// answer that is not saved yet: "ready" once it is complete, "incomplete" while
// a time or a reason is still missing, nothing otherwise. A component rather
// than a hook call inside the card, because the single card returns early for a
// kind with no copy and a hook below that line would break the rules of hooks.
// `stays` marks an answer that opens another card on the same day once saved -
// the lunch-move no - so the day's button saves it and stays for that card.
function PendingReporter({ id, date, state, stays = false, save }) {
  const done = useContext(DayDoneCtx);
  const setPending = done?.setPending;
  // the save is read at the moment somebody presses, so the freshest one runs
  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; });
  useEffect(() => {
    if (!setPending) return;
    setPending(id, state ? { date, state, stays, save: () => saveRef.current?.() } : null);
  }, [setPending, id, date, state, stays]);
  useEffect(() => () => setPending?.(id, null), [setPending, id]);
  return null;
}

// DAYS SOMEBODY HAS FINISHED WITH.
//
// This started inside `BatchProvider`, which meant only a day carrying a batched
// breaks question could ever be marked done - a day whose only item was a Misc
// question, a late lunch or an off-clock rest had no way to be closed at all.
// Mánu 2026-08-15: all cards need it. So it owns its own context, wrapping every
// day rather than only the batched ones.
//
// STILL NOT A SAVE ON ITS OWN. Every card saves its own answer; this is the
// person saying they are through with the day, which collapses it and lets the
// panel count it. What it does carry now is the list of answers started and not
// saved yet, so the day's button can save them on the way past.
const DayDoneCtx = createContext(null);

// WHERE THIS DAY SITS IN THE PERIOD, and how to move. The rail owns the
// selection, so it fills this in; the day's own footer reads it to know whether
// there is a day behind this one and which one is next.
//
// It lives in this file rather than in DayRail.js because DayRail already
// imports from here, and the other direction would be an import cycle. Same
// reason DayDoneCtx and BatchCtx sit here.
const DayNavCtx = createContext(null);

export function DayNavProvider({ dates = [], index = 0, go, children }) {
  return (
    <DayNavCtx.Provider value={{ dates, index, go }}>{children}</DayNavCtx.Provider>
  );
}

// the rail's way in: whether a day has been marked done in THIS tab. The
// rail ring used to read only SAVED answers, so a day worked through and
// closed stayed amber until Save my answers - which read as nothing
// happening. Null-safe outside the provider.
export function useDayDone() {
  const done = useContext(DayDoneCtx);
  return (date) => !!done?.readyOn?.(date);
}

// WHICH DAYS THEY HAVE WORKED THROUGH, KEPT ACROSS A RELOAD.
//
// It lived for the life of the page, so somebody who got halfway down a
// fortnight and refreshed - or closed the tab and came back to finish - lost
// every tick and started again with no idea where they had stopped.
//
// ON THE SHEET NOW, AND IT USED TO BE IN THE BROWSER ON PURPOSE.
//
// The argument for localStorage was a good one and is worth keeping: a walk says
// where somebody has got to, not what they attested to, and writing "scrolled
// past this day" onto a payroll record is a claim about a person that nothing
// here is entitled to make. The cost was the other half of it - open the same
// link on a laptop after starting on a phone and every ring was empty again.
//
// Mánu 2026-09-16 weighed the two and moved it: the press is the evidence that
// somebody looked at a day, and evidence that cannot leave the browser it was
// made in is evidence of nothing.
//
// SO THE BOUNDARY MOVES INTO THE COLUMN INSTEAD. `walkedDays` is a bare list of
// dates. It is not an answer, not a correction and not a claim; it moves no
// figure, and nothing prints it, emails it or shows it to payroll as something
// the person said. If it ever starts reading as one of those, this is the note
// that says it was not meant to.
// `finishers`: date -> the id of the ONE question whose answer would finish that
// day, from the page, which is the only place that knows what else is open on it
// (see `finisherFor`). It is what lets a confirm carry somebody to the next day
// instead of leaving them to find Next at the far side of the calendar.
//
// A MAP RATHER THAN THE FUNCTION IT STARTED AS. The page is a server component
// and this is a client one, and a function cannot cross that line - it throws
// "Functions cannot be passed directly to Client Components", which is how this
// was found. Dates to ids serialize, and the card only ever wanted to compare
// its own id against one.
export function DayDoneProvider({ children, token = null, finishers = null, walked = null, walkAction = null }) {
  // SEEDED FROM THE SHEET, not from this browser. `walked` is the list the
  // server holds; the state here is the optimistic copy, so a ring ticks the
  // moment it is pressed and the write catches up behind it.
  const [ready, setReady] = useState(() => new Set(walked || []));
  // HOW MANY TIMES EACH DAY HAS BEEN PRESSED FINISHED IN THIS TAB. The set above
  // cannot say, because a day walked on another day is already in it and a
  // second press changes nothing there. The shell reads this to fold a day on a
  // press and never on a keystroke - see `shellFolds`.
  const [presses, setPresses] = useState({});

  // the sheet's own list wins whenever it changes under us - another device, or
  // this one after a refresh. A date pressed here and not yet written is kept,
  // or a slow write would visibly untick the ring somebody just pressed.
  const fromSheet = (walked || []).join("|");
  useEffect(() => {
    if (!fromSheet) return;
    setReady((r) => new Set([...r, ...fromSheet.split("|")]));
  }, [fromSheet]);

  // BEST EFFORT, AND NEVER IN THE WAY. The ring has already moved by the time
  // this is called; a failed write costs the trail on the next device, never the
  // press. It is deliberately not awaited and deliberately does not refresh.
  // THE TOKEN GOES WITH IT, because that is what the action authenticates on.
  // Left off, `markDayWalked` refuses with "auth" and returns it quietly, which
  // is exactly what happened the first time: the ring ticked, the day turned,
  // and the column stayed empty. A silent no is what a best-effort write buys,
  // so the payload has to be right rather than merely accepted.
  const write = (date, undo = false) => {
    if (!walkAction || !token) return;
    try {
      Promise.resolve(walkAction({ token, date, undo })).catch(() => {});
    } catch {
      // an action that cannot even be called must not take the page down
    }
  };

  // ANSWERS STARTED AND NOT SAVED YET, by question - see PendingReporter. The
  // day and the state live in state, so the day's button redraws as they
  // change; the save functions change on every render of their card, so they
  // sit in a ref and are only read when somebody presses.
  const [pending, setPendingState] = useState(() => new Map());
  const savers = useRef(new Map());
  const setPending = useCallback((id, entry) => {
    if (entry) savers.current.set(id, entry.save);
    else savers.current.delete(id);
    setPendingState((m) => {
      const was = m.get(id);
      if (!entry) {
        if (!was) return m;
        const n = new Map(m);
        n.delete(id);
        return n;
      }
      if (was && was.date === entry.date && was.state === entry.state && was.stays === !!entry.stays) return m;
      const n = new Map(m);
      n.set(id, { date: entry.date, state: entry.state, stays: !!entry.stays });
      return n;
    });
  }, []);
  const pendingAll = () => [...pending].map(([id, e]) => ({ id, ...e }));
  // the days somebody tried to leave with an answer half given, so the card can
  // say what it still needs where the missing box is
  const [attempted, setAttempted] = useState(() => new Set());

  // CLOSING THE TAB WITH AN ANSWER ON SCREEN ASKS FIRST. The browser writes the
  // words; all a page can do is ask it to ask.
  const anyPending = pending.size > 0;
  useEffect(() => {
    if (!anyPending) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [anyPending]);

  return (
    <DayDoneCtx.Provider
      value={{
        ready,
        readyOn: (date) => ready.has(date),
        pressesOn: (date) => presses[date] || 0,
        finishesDay: (date, id) => !!id && finishers?.[date] === id,
        setPending,
        pendingAll,
        pendingOn: (date) => pendingAll().filter((e) => e.date === date),
        // resolves true once the answer is on record, false if it was refused
        saveOne: async (id) => {
          const save = savers.current.get(id);
          return save ? !!(await save()) : true;
        },
        attempt: (date) => setAttempted((a) => (a.has(date) ? a : new Set(a).add(date))),
        attemptedOn: (date) => attempted.has(date),
        markReady: (date) => {
          setReady((r) => (r.has(date) ? r : new Set(r).add(date)));
          setPresses((p) => ({ ...p, [date]: (p[date] || 0) + 1 }));
          write(date);
        },
        unmarkReady: (date) => {
          setReady((r) => { const n = new Set(r); n.delete(date); return n; });
          write(date, true);
        },
      }}
    >
      {children}
    </DayDoneCtx.Provider>
  );
}

// THE BUTTON, ON EVERY DAY. What blocks it comes from two places and both have
// to be clear: the plain cards on the day are counted on the server, because
// they save on their own and the page knows what is on record; the batched rows
// are staged in the browser, so only the batch provider knows.
export function DayDoneButton({ date, plainBlocked = false, hasQuestions = true }) {
  const done = useContext(DayDoneCtx);
  const batch = useContext(BatchCtx);
  // read before any early return - a hook cannot be called conditionally
  const nav = useContext(DayNavCtx);
  const flow = useReviewFlow();
  // the save this button is running, so it says so and cannot go twice
  const [saving, setSaving] = useState(false);
  if (!done) return null;
  if (!nav && done.readyOn(date)) return null;
  const hasBatchRow = !!batch?.byDay?.some?.((d) => d.date === date);
  const blocked = plainBlocked || (hasBatchRow && batch.blockedOn(date));
  const hasBack = (nav?.index ?? 0) > 0;
  // SAVE AND NEXT. An answer started on this day and not saved yet is saved by
  // the press that leaves the day, so typing a time and pressing Next does what
  // it looks like it does - and the button says so rather than doing it
  // quietly. Half an answer stops here instead: the card says what it still
  // needs beside the missing box, and nothing half done is ever kept.
  const waiting = done.pendingOn?.(date) || [];
  const halfDone = waiting.some((e) => e.state === "incomplete");
  // AN ANSWER THAT OPENS ANOTHER CARD ON THIS DAY keeps the press here: the
  // lunch-move no is followed by the card for the lunch as booked, which has to
  // open under it rather than behind a jump to the next day
  const staying = waiting.some((e) => e.stays);
  const nextLabel = saving ? "Saving…" : staying ? "Save answer" : waiting.length ? "Save and next" : "Next";
  const saveThenGo = async (finish) => {
    if (halfDone) {
      done.attempt?.(date);
      return;
    }
    setSaving(true);
    for (const e of waiting) {
      if (!(await done.saveOne(e.id))) {
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    if (staying) return;
    if (finish) {
      flow?.markReviewed(date);
      done.markReady(date);
    }
    if (nav?.go) nav.go(nav.index + 1);
  };
  // BACK IS JUST NAVIGATION, so it does not wait on the day being finished. A
  // day with answers still owing keeps the sentence where Next would be - there
  // is nothing to move forward to yet - and still offers the way back.
  if (blocked) {
    return (
      <div className={`${flow ? "" : "mt-3"} flex flex-col gap-2`}>
        {/* the sentence on its own line, Back and Next together under it -
            Mánu 2026-09-15, the day program's arrangement for both */}
        <p className="text-xs text-muted">
          Answer everything on this day to finish with it.
        </p>
        <div className="flex items-center justify-end gap-3">
        {hasBack && <BackButton nav={nav} disabled={!!flow?.editorTarget} />}
        {/* MOVING ON AND FINISHING ARE TWO DIFFERENT THINGS, and one button was
            doing both - so gating the second gated the first, and a day with a
            question owing had no way forward at all. On a real fortnight that
            was twelve of thirteen days: somebody could only ever go BACK.
            This one only navigates. It does not mark the day finished and does
            not tick its ring, so the sentence beside it stays true and the day
            stays amber until its questions are actually answered. */}
        {nav?.go && nav.index < (nav.dates?.length ?? 0) - 1 && (
          <button
            type="button"
            disabled={!!flow?.editorTarget || saving}
            // an answer on the way is saved first; with none it only moves
            onClick={() => (waiting.length ? saveThenGo(false) : nav.go(nav.index + 1))}
            className={`min-h-[44px] rounded-[9px] bg-fill px-3.5 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-fill-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${flow ? reviewStyles.primary : ""}`}
          >
            {nextLabel}
          </button>
        )}
        </div>
      </div>
    );
  }
  // NEXT ON THE RIGHT, BACK ON THE LEFT - Mánu 2026-09-08: "instead of done
  // with day lets just have it say next on the bottom right of the card to move
  // forward. then the ones after all back on the bottom left for them."
  //
  // Next still marks the day finished, which is what turns its ring green; it
  // just says where it takes you instead of naming the bookkeeping. Back only
  // moves - a day already worked through stays worked through.
  return (
    <div className={`${flow ? "" : "mt-3"} flex items-center gap-3`}>
      {hasBack && <BackButton nav={nav} disabled={!!flow?.editorTarget} />}
      <button
        type="button"
        disabled={!!flow?.editorTarget || saving || (flow?.readOnly && nav?.index === nav?.dates?.length - 1)}
        onClick={() => {
          // an answer on the way is saved first, and the day finishes after
          if (waiting.length) {
            saveThenGo(true);
            return;
          }
          flow?.markReviewed(date);
          // A DAY WITH NOTHING TO CHECK IS STILL A DAY YOU FINISHED.
          //
          // This was `if (hasQuestions)`, so pressing Next on a quiet day
          // marked nothing and its ring stayed an empty circle - somebody
          // working through a fortnight got no sign they had been anywhere,
          // and on most days of most periods there is nothing to answer.
          //
          // Unconditional changes nothing for a day that asks something: that
          // branch already called this. The only day that behaves differently
          // is the one that used to record nothing at all.
          done.markReady(date);
          if (nav?.go) nav.go(nav.index + 1);
        }}
        className={`ml-auto min-h-[44px] rounded-[9px] bg-fill px-3.5 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-fill-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${flow ? reviewStyles.primary : ""}`}
      >
        {nextLabel}
      </button>
    </div>
  );
}

function BackButton({ nav, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => nav.go(nav.index - 1)}
      className="rounded-[9px] px-3.5 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      Back
    </button>
  );
}

const r2 = (n) => Math.round((n || 0) * 100) / 100;

// 730 -> "12 hours 10 minutes". Spelled out rather than left as a decimal,
// because "12.17 hrs" is a figure and "12 hours 10 minutes" is an argument -
// nobody reads the second one and thinks it might be a rest period.
const spellMinutes = (n) => {
  const m = Math.round(Number(n) || 0);
  if (m <= 0) return null;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const parts = [];
  if (h) parts.push(`${h} hour${h === 1 ? "" : "s"}`);
  if (mm) parts.push(`${mm} minute${mm === 1 ? "" : "s"}`);
  return parts.join(" ");
};

// "1:15p" / "115" -> minutes past midnight, for drawing on the day's axis
const toMin = (raw) => {
  const t = parseLooseTime(raw || "", { assumeWorkday: true });
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

// what each kind asks, and what each answer means. Kept as data so the wording
// can be read in one place rather than chased through six branches of JSX.
//
// NOT ONE OF THESE CARDS TALKS ABOUT PAY. Mánu 2026-08-12: "remove any talk of
// penalty or added time. audit every single possibility to not mention that."
//
// Every card used to quote a figure and what the answer would do to it - "your
// penalty pay goes from 10.00 hours to 9.00 hours", "those 10 minutes go on to
// your hours", "that hour comes off". All of it is gone, and with it `standing`,
// `prem`, `leftIfYes` and `q.moves`, which existed only to compute those
// sentences. The arithmetic still happens; the employee is simply not asked to
// weigh their answer against it.
//
// What every card says now is what the answer does to THE RECORD. That is the
// question actually being asked - "when did you take your break" - and it is the
// only one the person answering is in a position to know. `standing` is still a
// parameter because callers pass it; nothing here reads it.
function copyFor(q, standing) {
  switch (q.kind) {
    case "repair":
      return {
        // THE HEADING ASKS THE QUESTION rather than naming the fault. "Rest
        // break time looks mis-entered" is our finding about the document; what
        // the person is being asked is whether they took a break then, and a
        // heading that states the fault reads as though the answer is settled.
        title: "Did you take a break at this time?",
        short: "Break time looks mis-entered",
        body: (
          <>
            On <b>{q.date}</b> the break record has your rest break entered as{" "}
            <b>{q.row.out || "(blank)"} to {q.row.in || "(blank)"}</b>, which cannot be read.
            We think somebody picked the wrong time and it was meant to be{" "}
            <b>{q.proposed.from} to {q.proposed.to}</b>, a normal {q.row.minutes} minute break.
          </>
        ),
        evidence: [
          `What the record has: out ${q.row.out || "(blank)"} · in ${q.row.in || "(blank)"}`,
          `${q.row.derivation}, which is not a break`,
          `What we think: out ${q.proposed.from} · in ${q.proposed.to} = ${q.row.minutes} min`,
        ],
        // THE SAME TWO FACTS, SHORT ENOUGH FOR THE SIMPLE VIEW. Mánu 2026-08-12:
        // "I know I said simplify the day by day but it still needs context ...
        // there's what it looks like, and we put our estimate."
        //
        // Stripping the body left "Rest break time looks mis-entered" and two
        // buttons, which asks somebody to confirm a break without showing them
        // the times being confirmed. The long card said all of this in
        // paragraphs; this is the same evidence with the prose taken out.
        facts: [
          {
            label: "The record says",
            value: `${q.row.out || "(blank)"} to ${q.row.in || "(blank)"}`,
            // the length it implies, in red, right beside it. Mánu 2026-08-12:
            // "put next to it in red, twelve hours ten minutes."
            aside: spellMinutes(q.row.recordedMinutes),
          },
          { label: "We think", value: `${q.proposed.from} to ${q.proposed.to}`, ours: true },
        ],
        // THE SAME WORDS AS `restOutsideScheduled`, because they mean the same
        // thing. "No, I did not take it" here and "I did not take it at all"
        // there were one outcome under two labels, on two cards somebody reads
        // one after the other.
        //
        // `canGiveTime` with no `needsOn` puts the time box on YES, so "that is
        // when I took it" is also where somebody corrects the time we proposed -
        // they accept the reading, then adjust it if we guessed the minute wrong.
        // There is no separate "I took it at a different time" button because it
        // would land on the same patch as yes.
        // NAME THE TIME. The label used to end in a demonstrative - one word
        // standing in for a time - under a heading saying the entry looks
        // mis-entered, beside a record reading 11:30 PM, our reading of 11:30 AM
        // and a block drawn at 11:30a. Four times on screen and one word
        // pointing at none of them in particular; read one way it confirmed the
        // very time we were calling wrong.
        //
        // Worded without quoting the old label, because the test that pins this
        // reads the file as text and a comment repeating it counts as the label
        // still being here.
        //
        // So the answer carries the time it means and the question stops being
        // about which of them is meant.
        yes: {
          label: <>Yes, I took it at {markMeridiem(q.proposed.from)}</>,
          why: "Change the time below if it was not exactly then.",
        },
        no: {
          label: "No, I did not take a break then",
          why: "You worked through that time.",
        },
        timeLabel: `What time did your break start on ${q.date}?`,
        yesEffect: <>Your break is recorded at that time.</>,
        noEffect: <>The record stays as it is, with no break on that day.</>,
      };

    case "restIsMealLength":
      return {
        title: "Was this your meal break?",
        short: "Break long enough to be a meal",
        body: (
          <>
            On <b>{q.date}</b> the break record has a <b>{q.row.minutes} minute</b> break from{" "}
            <b>{q.row.from} to {q.row.to}</b>. Thirty minutes is the length of a meal break, not a
            rest break, and nothing we hold says which this was.
          </>
        ),
        evidence: [
          `Filed as: a rest break, ${q.row.from} to ${q.row.to} = ${q.row.minutes} min`,
          "A rest break is ten minutes. A meal is thirty.",
        ],
        yes: { label: "Yes, that was my meal", why: "You took your thirty minutes and it was logged in the wrong place." },
        no: { label: "No, that was a rest break", why: "You did not get a meal that day." },
        yesEffect: <>Those thirty minutes are recorded as your meal break.</>,
        noEffect: <>The record stays as it is, with no meal break on that day.</>,
      };

    case "duplicateDay": {
      // "twice" for the common case, a count for the day that ever exceeds it
      const times = q.row.copies === 2 ? "twice" : `${q.row.copies} times`;
      return {
        title: "Did you work this shift twice?",
        short: q.row.copies === 2 ? "This shift appears twice." : `This shift appears ${q.row.copies} times.`,
        body: (
          <>
            On <b>{q.date}</b> the schedule has the same <b>{q.row.from} to {q.row.to}</b> shift
            entered <b>{times}</b>, and the day counts <b>{q.row.hours} hours</b>. Worked once,
            it is <b>{q.row.single} hours</b>.
          </>
        ),
        evidence: [
          `Entered: ${q.row.from} to ${q.row.to}, ${times}`,
          `The day counts ${q.row.hours} hours · worked once it is ${q.row.single}`,
        ],
        facts: [
          { label: "Entered", value: `${q.row.from} to ${q.row.to}, ${times}` },
          { label: "The day counts", value: `${q.row.hours} hrs` },
          { label: "Worked once", value: `${q.row.single} hrs`, ours: true },
        ],
        yes: { label: q.row.copies === 2 ? "I worked it twice" : `I worked it ${q.row.copies} times`, why: q.row.copies === 2 ? "Both entries should count." : "All entries should count." },
        no: { label: "I worked it once", why: q.row.copies === 2 ? "One of the entries is a duplicate." : "The other entries are duplicates." },
        yesEffect: <>The record stays as it is.</>,
        noEffect: <>The duplicate is recorded as an entry to remove in QuickSolve.</>,
      };
    }

    case "restNoTimes":
      return {
        title: "Did you take this break?",
        short: "Break recorded with no times",
        // THE BODY HAS TO FOLLOW THE FIGURE, not assert one. It said "and pays
        // you an hour for it" on every sheet, which contradicted its own
        // footnote the moment the blank row started COUNTING as a break taken
        // (2026-08-11) - Flores 07/29 reads "1 of 1 rest breaks" and owes
        // nothing, above a sentence promising her an hour. Caught by opening
        // the page, which is the only thing that ever catches these.
        body: (
          <>
            On <b>{q.date}</b> the break record has a rest break for you with <b>no times on it</b>.
            We cannot tell when it was, or whether it happened. Your timesheet says you took{" "}
            <b>{q.row.taken} of {q.row.owed}</b> rest breaks that day. What is missing is the time.
          </>
        ),
        evidence: [
          "Rest entry: no start, no end",
          `Your punches: ${(q.row.punches || []).join(" | ") || "none recorded"}`,
          `Hours that day: ${q.row.hours} · rest breaks due: ${q.row.owed}`,
        ],
        yes: { label: "Yes, I took it", why: "Somebody logged it without the times." },
        no: { label: "No, I did not take it", why: "You worked through that time." },
        timeLabel: `What time did your break start on ${q.date}?`,
        yesEffect: <>Your record gets the time on it.</>,
        noEffect: <>The record stays as it is, with no break on that day.</>,
      };

    // A TEN LOGGED OUTSIDE DOCUMENTED WORKING HOURS. Before the rostered day,
    // after it, against a service edge, or in an unpaid gap - one card for all
    // four shapes since 2026-08-11, because they are one event and one habit.
    //
    // THE ONLY CARD WHERE "YES" IS THE CHEAP ANSWER. Everywhere else confirming
    // takes pay off; here it keeps the ten and DECLINING takes it off, because
    // the question is "was that the right time?" rather than "did you take it?".
    case "restOutsideScheduled": {
      const shapes = new Set((q.row.detail || []).map((x) => x.where));
      const shapeWords = shapes.has("unpaid-gap") && shapes.size === 1
        ? "in a gap in your schedule, when you were not booked with anyone"
        : shapes.has("before") && shapes.size === 1
          ? "before the shift it was filed under had started"
          : shapes.has("after") && shapes.size === 1
            ? "after the shift it was filed under had ended"
            : "outside the hours you were scheduled to be working";
      // THE SAME FAULT IN FOUR WORDS, for the simple view. Mánu 2026-08-11: "we
      // don't have to over explain for the day by day view because this is the
      // simple view. It can just say rest taken after shift time."
      // THE TIME THE RECORD HOLDS, so the answer can name it.
      //
      // "I did take it then" points at a word that is not on screen. The terse
      // day-by-day view drops the title, which is where the question lives, so
      // the options were a No and a Yes answering nothing visible - and the
      // reader has to work out that "then" means the time two lines above.
      //
      // Null unless the card covers exactly one logged break. Every one of them
      // does on both live batches, and has since this kind started emitting one
      // question per date, but a card covering two cannot name one time and the
      // old wording is right for it.
      // said out loud, because it lands in a sentence rather than in the column
      // of facts above, where the compact form is a readout and is right
      const loggedAt = (q.row.detail || []).length === 1
        ? (spokenTime(q.row.detail[0]?.wasFrom) || null)
        : null;
      const loggedTo = (q.row.detail || []).length === 1
        ? (spokenTime(q.row.detail[0]?.wasTo) || null)
        : null;
      const shapeShort = shapes.has("unpaid-gap") && shapes.size === 1
        ? "Rest taken in unscheduled time"
        : shapes.has("before") && shapes.size === 1
          ? "Rest taken before shift time"
          : shapes.has("after") && shapes.size === 1
            ? "Rest taken after shift time"
            : "Rest taken outside shift time";
      return {
        // ONE CARD COVERS ALL OF THEM, so the heading has to count. Mánu
        // 2026-08-11 asked whether it was a notice for one or for any number:
        // it is one card however many rows there are, and saying "one of your
        // breaks" above three dates made that look like a bug.
        title: q.row.days === 1
          ? "A rest break is recorded outside your shifts. Was that a mistake?"
          : "Some rest breaks are recorded outside your shifts. Was that a mistake?",
        short: shapeShort,
        // WHY IT IS A PROBLEM AT ALL, IN ONE LINE.
        //
        // Every card here says what the record holds and what we make of it, and
        // none of them said what RULE the day broke - so the answer options read
        // as a form to fill in rather than as a question about something that
        // matters. Mánu 2026-08-14.
        //
        // NO PREMIUM AND NO PENALTY IN IT. That is the standing rule for
        // anything an employee reads, and it is not a loss here: what is owed is
        // admin's business, and what the person needs is the rule and the way
        // out of breaking it. The second sentence is that way out.
        rule: "A rest break has to be taken inside a shift you are scheduled for. If you cannot fit one in, tell your supervisor at the time so it can be sorted.",
        // what was logged, and the shift it was logged against - the two things
        // somebody needs to see before saying whether that is when they took it
        facts: [
          ...(q.row.detail || []).slice(0, 2).flatMap((x) => [
            { label: "Logged at", value: `${x.wasFrom} to ${x.wasTo}` },
            ...(x.service ? [{ label: "Your shift", value: x.service }] : []),
          ]),
          // AND THAT IT LANDS IN THEIR LUNCH, which this card never said. The
          // admin finding has carried the same fact since 2026-08-12, so
          // leaving it off here meant telling ourselves the ten was inside the
          // meal and telling them it was after their shift. The terse day-by-day
          // view drops the body, so a fact is the only place it will be read.
          ...(q.row.inLunch > 0
            ? [{
              label: q.row.inLunch === 1 ? "It also falls in" : "They also fall in",
              value: "the lunch your schedule rosters",
              ours: true,
            }]
            : []),
        ],
        body: (
          <>
            On <b>{q.row.days} {q.row.days === 1 ? "day" : "days"}</b> your ten minute rest break is
            recorded <b>{shapeWords}</b>, and you were not clocked in for it.
            <br /><br />
            {/* NOT ADDED UNTIL SOMEBODY SAYS SO. Mánu 2026-08-12: "the engine
                should automatically not add in more hours. It should treat it
                as put in wrong and only add the time once they confirm it was
                taken there." The card used to open by telling them the minutes
                had already been added and asking whether to keep them. */}
            A ten minute rest period belongs <b>inside a shift</b>, so it only counts when you
            were on the clock for it. This one is recorded where you were not, which usually means
            the time was entered wrong.
            <br /><br />
            <b>Was that a mistake?</b> If it was, tell us when you really took it and we will put it
            there. If it was not - you did take it at that time - say so. And if you never got the
            break at all, say that instead.
          </>
        ),
        dates: q.dates,
        evidence: (q.row.detail || []).slice(0, 8).map(
          (x) => `${x.date}: logged ${x.wasFrom}-${x.wasTo}` +
            (x.service ? ` · filed under your ${x.service} shift` : " · no shift on the row") +
            (x.from ? ` · inside it would be ${x.from}` : ""),
        ),
        // THE POLARITY TURNED OVER ON 2026-08-12 with the default. "Yes" used to
        // mean "yes, keep the minutes you already paid me"; it now means "no, it
        // was not a mistake" and it is the answer that ADDS them.
        //
        // AND ON 2026-08-17 THE YES AND THE NO CAME OFF THE LABELS ENTIRELY.
        // Somebody reading this card told Mánu it sounds like a double negative,
        // and they were reading the day-by-day view - which drops the body, so
        // "Was that a mistake?" is not on the screen at all. Two options then
        // opened with words answering a question nobody could see, and their
        // polarity ran BACKWARDS against reading order: the "No" one meant the
        // record is right, the "Yes" one meant it is wrong. "No - I did take it
        // at 3pm" put the negative and the affirmative in one breath.
        //
        // The card is telling three FACTS apart, and not one of them is a yes or
        // a no. So all three now take the same shape - "I took it ..." - and the
        // only part that differs is the part being chosen between: as logged, at
        // another time, or not at all. The stored values are untouched, so every
        // answer already on record still reads back the same.
        yes: {
          label: loggedAt ? `I took it at ${loggedAt}, as logged` : "I took it as logged",
          why: "That was a real break, recorded at the time it happened.",
        },
        no: {
          label: "I took it, but at a different time",
          why: "Tell us when you really took it. You were on the clock then, so it is already in your hours.",
        },
        // THE THIRD OUTCOME. Mánu 2026-08-11: "or if she didnt take it at all."
        // Without it somebody who never got the break had to claim they did, on
        // a day the sheet is currently counting as a rest taken.
        third: {
          value: "notaken",
          label: "I did not take it at all",
          why: "It stops counting as a break you had.",
        },
        timeLabel: "When during your shift did you take it?",
        timeHint: "The record has a time on it, it just is not inside a shift. Tell us when it really was.",
        // NO HOURS CLAIM HERE. This read "<n> hours go on to your timesheet,
        // along with any overtime they create" - Mánu 2026-08-12 had it removed
        // along with every other sentence on these cards that talks about
        // gaining time. The answer records where the break was; what that does
        // to pay is not the confirm box's business.
        yesEffect: loggedAt
          ? <>We will record that you took your break at <b>{loggedAt}</b>.</>
          : <>We will record that you took your break at that time.</>,
        // AND THE HALF WE CANNOT DO FOR THEM.
        //
        // Saying the break really happened at a time nothing was booked for
        // leaves the record still not showing it. Two entries are missing -
        // the schedule has to carry those minutes, and a rest period has to be
        // filed against them. That is what turns this into the shape the
        // engine reads as a break taken, the same shape as a short Misc block
        // with a rest row over it. The office makes both edits; this card only
        // says what the record is missing.
        //
        // It sits on the ANSWERED card rather than in the confirm panel. The
        // confirm panel says what the answer does; this is the state of the
        // record, and it has to still be on the page when they come back to
        // the day.
        afterYes: loggedAt && loggedTo
          ? {
            title: "Two entries missing in QuickSolve",
            body: <>
              <b>{loggedAt} to {loggedTo}</b> on <b>{q.date}</b> is not booked as <b>Misc</b> time
              on the schedule, and no <b>rest period</b> is filed against it. Until both are in,
              nothing on the record shows the break you have just told us about.
            </>,
          }
          : null,
        noEffect: <>Your break moves to the time you give us.</>,
        thirdEffect: <>The break stops counting as one you had.</>,
      };
    }

    // ONE QUESTION PER DAY NOW, rendered as one card by BatchCard. The copy
    // here is the card's heading, so it describes the whole set; the per-day
    // wording lives in the rows.
    // SPLIT PER BREAK 2026-08-10, and both kinds share this copy. The card is
    // still one per person - the page groups them - so the heading describes the
    // whole set and the per-break wording lives on the rows.
    //
    // Without these two cases the switch fell to `default: return null` and the
    // card rendered NOTHING, on a page that still said "answer all 17 questions
    // above". Caught by looking at the rendered page rather than the build.
    // TIME YOUR SCHEDULE PUT DOWN AS MISC, AND WHAT IT ACTUALLY WAS.
    //
    // Mánu 2026-08-12: Misc time over ten minutes is usually PTO or sick pay, so
    // the engine stops counting it toward the hours that decide whether a break
    // is owed. This is the only route by which it counts again.
    //
    // FOUR ANSWERS SINCE 2026-08-17, when Client cancellation joined. The
    // draft's own fourth - "a ten I could not fit into my service hours" - was
    // cut and stays cut: a block of ten minutes or less already counts as
    // worked without being asked about.
    //
    // NOTHING ON THIS CARD PROMISES PAY. It says what the answer does to the
    // record and to the hours the entitlement is measured over, and stops. The
    // premium is admin's business and appears on admin's screens.
    case "miscTime":
      return {
        title: "Time on your schedule marked as Misc",
        body: (
          <>
            Your schedule has {q.row?.hours} hours down as Misc
            {q.row?.blocks?.length === 1
              ? <> on this day, {q.row.blocks[0].from} to {q.row.blocks[0].to}</>
              : null}
            . Time marked as Misc is paid on your timesheet, but it does not
            count toward the hours that decide whether a rest break or meal
            period is required. Tell us what it was.
          </>
        ),
        yes: {
          label: "Paid time off",
          why: "You were not working. Nothing on your timesheet changes.",
        },
        no: {
          label: "Sick pay",
          why: "You were not working. Nothing on your timesheet changes.",
        },
        third: {
          value: "worked",
          label: "Working hours",
          why: "You worked those hours, they just were not booked to a client.",
          // WHAT COUNTS AS WORKING, because the other two options name themselves
          // and this one does not.
          //
          // THIS NOTE WENT MISSING WITHOUT ANYBODY DELETING IT. The `note` and
          // `why` lines were drawn only while a question was unanswered, which
          // was invisible for as long as an answered card did not render at all.
          // The moment an answered card came back so it could be CHANGED, the
          // options returned without their explanations - and the one option
          // that cannot explain itself from its label is this one. They are
          // drawn while editing now; see the Choice props below.
          //
          // The cancelled-visit clause was cut from this note on 2026-08-17,
          // when Client cancellation became its own answer below - a note
          // steering cancellations into "working" would fight the button that
          // now exists for them, and a test pins the absence.
          note: "Any Misc service you worked.",
        },
        // CLIENT CANCELLATION, the fourth answer, Mánu 2026-08-17: paid,
        // unworked time, counted as unscheduled - the stretches either side of
        // it stand on their own. Same rule whichever route says it; the
        // reviewer's control carries the same four.
        fourth: {
          value: "cancelled",
          label: "Client cancellation",
          why: "Your client cancelled. The time is paid, and it is not time worked.",
        },
        yesEffect: <>Your record says that time was paid time off.</>,
        noEffect: <>Your record says that time was sick pay.</>,
        thirdEffect: (
          <>
            Your record says you worked those hours, so they count toward
            whether a rest break or meal period was required that day.
          </>
        ),
        fourthEffect: (
          <>
            Your record says that time was a client cancellation - paid, but
            not time worked, and the hours either side of it are counted on
            their own.
          </>
        ),
      };

    // THE MEAL HALF LANDED ON THE MISC CARD FOR WEEKS.
    //
    // These two labels sat directly above `case "miscTime"`, so every
    // "we found nothing recorded for your lunch" question rendered as "Time on
    // your schedule marked as Misc" - and printed the DAY'S PAID HOURS as the
    // hours of Misc, because both kinds happen to carry `row.hours` and it
    // means different things on each. Verduzco 08/12 read "your schedule has
    // 6.18 hours down as Misc" on a sheet with no Misc time on any day of any
    // upload. As the batched card's heading it rendered above the whole day
    // list, so it was also the most prominent thing on the page.
    //
    // They were added to stop the switch falling to `default: return null`,
    // which rendered nothing - and landed one case too early. Same class of
    // fault the note there describes: caught by looking at the page, not by the
    // build.
    case "nothingDocumented":
    case "nothingDocumentedMeal":
    case "nothingDocumentedRest":
      // NO HEADING AND NO INTRO. Mánu 2026-08-12 had the whole block removed:
      // "We could not find some of your breaks on record", the count of days,
      // "we have paid you the penalty for every one", and the paragraph about
      // what saying yes would take off. The day rows below carry the question,
      // each beside its own calendar, which is where somebody answers it.
      //
      // Both are null rather than empty strings, because `BatchHeading` and the
      // batched card test for them and drop the whole panel when there is
      // nothing to put in it - an empty amber box is worse than no box.
      return {
        title: null,
        body: null,
        // THE RULE, same shape as the off-clock card - what is required, then
        // the way out of breaking it. No premium and no penalty in it: what is
        // owed is admin's business, and what the person needs is the rule and
        // somewhere to go when the day will not allow it.
        rule: "You are due a ten minute rest break for every four hours you work, and a meal break before the end of your fifth hour. If a day does not leave room for one, tell your supervisor at the time so it can be sorted.",
        yes: {
          label: "Yes, I took my breaks",
          why: "You took them and just did not write them down.",
        },
        no: {
          label: "No, I missed them",
          why: "You worked through that day.",
        },
        yesEffect: <>Your record says you took your breaks and did not write them down.</>,
        noEffect: <>Your record says the breaks were missed.</>,
        // the "you are legally entitled to these breaks ... you lose nothing by
        // ignoring this" footnote was removed 2026-08-12 at Mánu's instruction.
      };

    // A BREAK TOO LONG TO BE A REST, ON A DAY WHOSE LUNCH IS ACCOUNTED FOR.
    // Hatt 07/20: sixty minutes logged while clocked out between two shifts,
    // with her lunch already rostered at noon. Before 2026-08-10 the row was
    // thrown away, she lost the rest credit, and nobody asked her anything.
    // TWO LUNCHES ON ONE DAY. Hatt 07/20 has her rostered noon lunch AND a sixty
    // minute entry at 3:30, so the day carries two meal periods and the honest
    // card is about that rather than about "a break that is not a break".
    //
    // THREE OUTCOMES, Mánu 2026-08-12: "if they have 2 lunches then make it be
    // asked if its correct or if it accidentally added in or if one needs to be
    // removed." The three are not the same claim: both real, the extra one never
    // happened, or one lunch happened and the wrong record is the rostered one.
    // Only the middle one can say which block to take off the calendar, which is
    // why "removed" is its own answer rather than a shade of "mistake".
    case "restTooLongOffClock":
      if (q.row.twoLunches) {
        return {
          title: "Two lunches are on record for this day",
          short: "Two lunches on record",
          // BOTH SIDES ARE TIMES, or the comparison is not one. This read
          // "Your schedule has / a lunch that day" against "And this is
          // recorded / 3:30p to 4:30p" - a sentence fragment on one side and a
          // time on the other, which is not a thing anybody can compare. The
          // rostered times were on the schedule row all along and simply were
          // not carried onto the question. Falls back to the old words when the
          // roster has no readable range, which is the only case it could not.
          facts: [
            {
              label: "Your schedule has",
              value: q.row.rosteredFrom
                ? `${q.row.rosteredFrom} to ${q.row.rosteredTo}`
                : "a lunch that day",
              aside: q.row.rosteredMinutes ? spellMinutes(q.row.rosteredMinutes) : null,
            },
            {
              label: "And this is recorded",
              value: `${q.row.from || "(blank)"} to ${q.row.to || "(blank)"}`,
              aside: spellMinutes(q.row.minutes),
            },
          ],
          body: (
            <>
              On <b>{q.date}</b> your schedule rosters a lunch, and a second break of{" "}
              <b>{q.row.minutes} minutes</b> is also recorded from <b>{q.row.from}</b> to{" "}
              <b>{q.row.to}</b>. That is two lunches on one day
              {q.row.onClock ? "" : ", and you were clocked out for the second one"}.
              <br /><br />
              We have <b>changed nothing</b> on your timesheet. Both are drawn on the day below so
              you can see them. We just need to know which of these it is.
            </>
          ),
          yes: {
            label: "Both are right, I took two",
            why: "We will keep both on the record.",
          },
          no: {
            label: "The second one was added by mistake",
            why: "We will take it off the record, and off the picture below.",
          },
          third: {
            value: "wrongone",
            label: "I only took one, and it was this one",
            why: "The lunch on your schedule is the wrong record, and that one is corrected instead.",
          },
          yesEffect: <>Both stay on the record, exactly as they are.</>,
          noEffect: <>The entry is marked as a mis-entry and stops being drawn on your day.</>,
          thirdEffect: (
            <>
              The rostered lunch is marked as the wrong record, and this one stands as your real
              lunch.
            </>
          ),
          footnote: (
            <>
              <b>This one is about the record.</b> Two lunches on a day is a data-entry problem, and
              guessing which one to throw away would be us deciding what happened on your day.
            </>
          ),
        };
      }
      return {
        title: "One of your breaks does not look like a break",
        short: "Break too long to be a rest",
        // the same two lines the other cards carry: what the record holds, and
        // how long that actually is. A card asking "was this a real break?"
        // without showing the break was asking somebody to confirm a blank.
        facts: [
          {
            label: "The record says",
            value: `${q.row.from || "(blank)"} to ${q.row.to || "(blank)"}`,
            aside: spellMinutes(q.row.minutes),
          },
        ],
        body: (
          <>
            On <b>{q.date}</b> a break is recorded from <b>{q.row.from}</b> to <b>{q.row.to}</b>,
            which is <b>{q.row.minutes} minutes</b>. A rest break is ten minutes and your lunch
            that day is already accounted for
            {q.row.onClock ? "" : ", and you were clocked out at the time"}.
            <br /><br />
            We have left it exactly as it is. We would just like to know what it was, so the
            record is right.
          </>
        ),
        yes: {
          label: "That was a real break I took",
          why: "We will note it as a break you took.",
        },
        no: {
          label: "That looks like a mistake",
          why: "We will note it as a mis-entry so payroll knows to ignore it.",
        },
        yesEffect: <>The entry stands on your record as a break you took.</>,
        noEffect: <>The entry is marked as a mis-entry so it is not read as a break.</>,
        footnote: (
          <>
            <b>This one is about the record.</b> It is here because throwing the entry away without
            asking would be us deciding what happened on your day.
          </>
        ),
      };

    case "mealLate": {
      // THE ONE VIOLATION AN EMPLOYEE HAS NEVER BEEN ASKED ABOUT. `mealLate` days
      // are excluded from the "nothing documented" question by construction -
      // "did you take your lunch?" is the wrong question when the record says
      // they did - and nothing else covered them. 11 on the live batch.
      //
      // ASKING WHETHER IT WAS TAKEN WOULD PUT A FALSE SENTENCE ON A DOCUMENT
      // SOMEBODY SIGNS. The same trap `employeeQuestion` was fixed for: it told
      // people whose lunch merely started late that they never had one.
      const late = q.row.lateMinutes ? spellMinutes(q.row.lateMinutes) : null;
      return {
        title: "Your meal break started later than it should have",
        short: "Lunch started late",
        // WHAT THE RULE ACTUALLY IS on this one - the timing, not the taking.
        // The break happened; what is in question is when it started, so the
        // sentence names the fifth hour rather than the entitlement.
        rule: "Your meal break has to start before the end of your fifth hour. If something on the day stops you getting to it, tell your supervisor at the time so it can be sorted.",
        facts: [
          ...(q.row.from ? [{ label: "Your lunch", value: `${q.row.from} to ${q.row.to}` }] : []),
          ...(late ? [{ label: "That is", value: `${late} into your day`, aside: "after the fifth hour" }] : []),
        ],
        body: (
          <>
            On <b>{q.date}</b> your punches show a meal break
            {q.row.from ? <> from <b>{q.row.from}</b> to <b>{q.row.to}</b></> : null}
            {late ? <>, which is <b>{late}</b> into your day</> : null}.
            A meal is due before the end of the fifth hour.
            <br /><br />
            <b>We have changed nothing.</b> You took the break - the only question is whether it
            really started then, or whether the punch is what is wrong.
          </>
        ),
        yes: {
          label: "Yes, it really was that late",
          why: "The record is right, and we will ask you why below.",
        },
        no: {
          label: "No, I went on time - the punch is wrong",
          why: "Your lunch started inside the fifth hour and the clock-out is what is wrong.",
        },
        yesEffect: <>Your record keeps the late meal, with your reason on it.</>,
        noEffect: <>Your record says the meal was on time.</>,
        footnote: (
          <>
            <b>This is the only card where confirming asks for a sentence.</b> Everywhere else a
            missed break is the thing that needs explaining; here the break happened, and what
            nothing on any export can say is what held it up.
          </>
        ),
      };
    }

    // A LUNCH THE ROSTER BOOKED INSIDE A BLOCK THEY WERE WORKING.
    //
    // TWO KINDS, AND THEY GET OPPOSITE TREATMENT. You clock in and out of a
    // service shift, so a lunch booked inside one cannot have happened and the
    // schedule is what needs correcting. Admin and Misc time is typed in rather
    // than punched, so the BLOCK can move and the lunch can stand.
    //
    // BOTH TIMES, THE WAY THE OFF-CLOCK CARD SHOWS THEM. Two facts carry the
    // whole argument - what was booked and what it lands inside - so nothing
    // here asserts that the lunch was impossible in a paragraph.
    //
    // "MEAL BREAK" WHATEVER THE LENGTH. Three of the July ones are booked ten
    // minutes, which is a rest by any measure, but the roster calls them a meal
    // and arguing with its own label mid-question helps nobody.
    case "mealInShift":
      return {
        title: "Your meal break is booked inside a shift you were working",
        short: "Meal booked inside a shift",
        rule: "A meal break has to be taken off the clock. You clock in and out of "
          + `${q.row?.service || "that shift"}, so a meal break booked inside one cannot have `
          + "happened. Your schedule needs it moved outside the shift.",
        facts: [
          { label: "Booked at", value: `${q.row?.mealFrom} to ${q.row?.mealTo}` },
          { label: "Your shift", value: `${q.row?.blockFrom}-${q.row?.blockTo}, ${q.row?.service}` },
        ],
        body: (
          <>
            Your schedule books a meal break at <b>{q.row?.mealFrom} to {q.row?.mealTo}</b> on{" "}
            <b>{q.date}</b>, inside your <b>{q.row?.service}</b> shift of{" "}
            <b>{q.row?.blockFrom} to {q.row?.blockTo}</b>.
            <br /><br />
            You clock in and out of that shift, so a break booked inside it is not one you could
            have taken. What needs fixing is the schedule.
          </>
        ),
        // ONE OPTION, because there is no second true answer - see the note on
        // `noRoom`, which is the same shape for the same reason.
        no: {
          label: "I understand, I did not get a meal break that day",
          why: "Your record says the meal break was missed, with your reason on it.",
        },
        noEffect: <>Your record says the meal break was missed, with your reason on it.</>,
      };

    case "mealMovable":
      return {
        title: `Your meal break is booked inside your ${q.row?.service || "unpunched"} time`,
        short: "Meal booked inside movable time",
        rule: `A meal break has to be taken off the clock. ${q.row?.service || "That time"} is not `
          + "punched, so it can be moved rather than the break being written off.",
        facts: [
          { label: "Booked at", value: `${q.row?.mealFrom} to ${q.row?.mealTo}` },
          { label: "That time", value: `${q.row?.blockFrom}-${q.row?.blockTo}, ${q.row?.service}` },
        ],
        body: (
          <>
            Your schedule books a meal break at <b>{q.row?.mealFrom} to {q.row?.mealTo}</b> on{" "}
            <b>{q.date}</b>, inside your <b>{q.row?.service}</b> time of{" "}
            <b>{q.row?.blockFrom} to {q.row?.blockTo}</b>.
            <br /><br />
            You do not clock in and out of that, so it can be moved instead.
          </>
        ),
        yes: {
          label: "Yes, that time can be moved",
          why: "Tell us when your meal break really was and what that time becomes.",
        },
        no: {
          label: "No, it has to stay where it is",
          why: "Then the meal break could not have happened, and we will ask why.",
        },
        yesEffect: <>Your record says you took your meal break, and your schedule needs changing to match.</>,
        noEffect: <>Your record says the meal break was missed, with your reason on it.</>,
        // where the meal break can go, the lunch-move card's sentence. a day
        // with no gap keeps the general line, since any time is taken there
        timeHint: q.needs?.[0]?.windows?.length
          ? `Has to be a half hour inside ${q.needs[0].windows.join(" or ")}.`
          : undefined,
      };

    case "shortMealRest":
      return {
        title: "We read a meal block as your rest break. Is that right?",
        short: "Meal block read as your rest break",
        body: (
          <>
            On <b>{q.row.days} {q.row.days === 1 ? "day" : "days"}</b> your schedule has a block
            called a meal break that is only ten minutes long. Ten minutes is a rest break, not a
            meal, so we have counted it as your <b>rest period</b> rather than as a meal.
          </>
        ),
        dates: q.dates,
        yes: { label: "Yes, that was my rest break", why: "Our reading stands. Nothing more changes." },
        no: {
          label: "No, I did not take a break then",
          why: "It stops being read as your rest break.",
        },
        yesEffect: <>Nothing changes. Your timesheet stays as it is below.</>,
        noEffect: <>The block stops being read as your rest break, and your sheet is rebuilt.</>,
        footnote: (
          <>
            <b>We already made this change</b>, so confirming it changes nothing. Say no if you did
            not take a break at that time.
          </>
        ),
      };

    // A LUNCH THAT CAME TO LESS THAN THIRTY MINUTES, booked short or with a
    // booking running into it. counted the way a lunch inside a shift is, so
    // the day starts with the hour on.
    //
    // it used to carry one answer, the missed meal, on the reading that a
    // roster leaving less than thirty offered no meal at all. it asks now: the
    // chance at a full thirty was there and they came back early, which owes
    // nothing, or it never was, which is the missed meal and takes a reason
    // like one. the facts say how it came up short and nothing here says which
    // answer is true.
    case "mealShort":
      return {
        title: "Your meal period was less than 30 minutes",
        short: "Your meal period was less than 30 minutes",
        ask: "Were you provided the opportunity to take a full, uninterrupted 30-minute meal period?",
        facts: [
          { label: "Booked at", value: `${q.row?.mealFrom} to ${q.row?.mealTo}` },
          ...(q.row?.eaten
            ? [
              { label: "Worked until", value: `${q.row?.blockTo}, ${q.row?.service}` },
              { label: "Left clear", value: `${q.row?.minutes} minutes` },
            ]
            : [{ label: "Length", value: `${q.row?.minutes} minutes` }]),
        ],
        body: (
          <>
            Your schedule books a meal break at <b>{q.row?.mealFrom} to {q.row?.mealTo}</b> on{" "}
            <b>{q.date}</b>.{" "}
            {q.row?.eaten ? (
              <>
                Your <b>{q.row?.service}</b> runs until <b>{q.row?.blockTo}</b>, which is{" "}
                <b>{q.row?.eaten} minutes</b> into it, so only <b>{q.row?.minutes} minutes</b> of it
                are clear.
              </>
            ) : (
              <>That is <b>{q.row?.minutes} minutes</b>, and a meal break has to be thirty.</>
            )}
          </>
        ),
        yes: {
          label: "Yes. I was provided the opportunity to take a full 30-minute meal period but voluntarily chose to return early.",
          why: "Your record says you had your full meal break.",
        },
        no: {
          label: "No. I was not provided the opportunity to take a full, uninterrupted 30-minute meal period.",
          why: "Your record says the meal break was cut short, and we ask you why below.",
        },
        yesEffect: <>Your record says you were given a full meal break and chose to come back early.</>,
        noEffect: <>Your record says the meal break was cut short, with your reason on it.</>,
      };

    // THE SAME LUNCH, ON A DAY WITH A FREE HALF HOUR IN IT. the roster booked
    // it short or inside a clocked shift, but the punches and the roster both
    // leave a stretch of thirty or more open, so this asks first whether the
    // lunch was really taken there. yes gives the time; no opens the card for
    // the lunch as booked, so the facts are the booked ones plus the free time.
    case "mealCouldMove": {
      const free = (q.row?.free || []).map((w) => `${w.from} to ${w.to}`).join(" or ");
      const facts = [
        { label: "Booked at", value: `${q.row?.mealFrom} to ${q.row?.mealTo}` },
        q.row?.booked === "inside"
          ? { label: "Your shift", value: `${q.row?.blockFrom}-${q.row?.blockTo}, ${q.row?.service}` }
          : { label: "Worked until", value: `${q.row?.blockTo}, ${q.row?.service}` },
        { label: "Free", value: free },
      ];
      return {
        title: "Your meal break could have been moved",
        short: "Your meal break could have been moved",
        ask: "Could your meal break have been moved to when you were free?",
        facts,
        // the long card has no facts list of its own, so the same three lines
        // stand in for the paragraph there
        body: (
          <>
            {facts.map((f, i) => (
              <span key={f.label}>
                {i > 0 && <br />}
                {f.label} <b>{f.value}</b>
              </span>
            ))}
          </>
        ),
        timeHint: `Has to be a half hour inside ${(q.row?.free || []).map((w) => `${w.from}-${w.to}`).join(" or ")}.`,
        yes: {
          label: "Yes, I took it then",
          why: "Tell us when your meal break started.",
        },
        no: {
          label: "No, it could not have been moved",
          why: "Then we ask about the meal break as it was booked.",
        },
        yesEffect: <>Your record says you took your meal break, and your schedule needs changing to match.</>,
        noEffect: <>Nothing changes yet. The next question asks about the meal break as it was booked.</>,
      };
    }

    default:
      return null;
  }
}

// GREEN IS "NOTHING CHANGES", RED IS "MONEY MOVES", and it used to be the other
// way round by accident: "yes" lit up brand blue and "no" lit up emerald, so
// telling us you missed twelve breaks turned the card green. Mánu 2026-08-09.
// Same language the timesheet itself uses - green for a settled day, red for
// one that owes something.
// WHY A SAVE WAS REFUSED, IN WORDS, FOR EVERY REASON IT CAN BE.
//
// `answerTimesheetQuestion` can refuse eleven different ways and this had words
// for THREE. The other eight - a missing reason, a time outside the shift, a
// lunch with no gap to put it in - all came out as "That didn't save. Refresh
// the page and try again", which is advice that cannot work: the refusal is a
// judgement about what was sent, and refreshing sends it again.
//
// Every one of these is a thing the person can act on, which is the whole test
// for whether it deserves its own sentence.
const REFUSALS = {
  already: "This timesheet is already signed, so it cannot be changed.",
  // the link ran past its 30 days, or the account behind it was deactivated
  expired: "This link has expired.",
  superseded: "This timesheet was replaced by a newer copy, so answers here no longer count. Use the most recent email from the office, or ask them to resend your link.",
  // `?preview=1` refuses every write on a real person's batch - see `act` in
  // page.js. On a test batch it does not refuse at all, so this never fires
  // there.
  preview: "Preview only - nothing is saved from this view. Open the employee's own link to answer for real.",
  needreason: "Saying you missed a break needs a reason. Write why in the box before saving.",
  needblock: "Say what that time becomes once the meal break is moved out of it, then save.",
  badchoice: "That answer is not one this question offers. Reload the page and pick again.",
  toomany: "Too many answers were sent at once. Reload the page and try again.",
  missingtime: "Every day you answered “took them” needs the time it started.",
  badtime: "That time didn't look right. Pick a time on this day, with at least ten minutes left before midnight.",
  outsideshift: "A rest break has to sit inside a shift you actually worked. Pick a time inside one of the hours shown.",
  alreadyrecorded: "A break at that time is already on this day's record. Give the time of the one that has no record, or answer that you did not take it.",
  shifthasten: "QuickSolve holds one rest break per shift, and that shift already has one. Pick a time inside a shift that does not, or answer that you did not take it.",
  nolunchgap: "There is no half hour gap in that day long enough to hold a lunch, so that time cannot be right.",
  // THE WRITE ITSELF FAILED, which is the one refusal where "try again" is real
  // advice: nothing was saved, so there is nothing to undo before retrying. The
  // answers and the sheet rebuild commit in one transaction now (see
  // `answerTimesheetQuestion`), so "nothing changed" is a guarantee and not a
  // hope - before that, a failure here could take an answer off the record and
  // leave the figures untouched.
  save: "That didn't save, so nothing on your timesheet changed. Try it again.",
  // the three below mean the browser sent something the server would not
  // recognise. They are not the person's fault and there is nothing for them to
  // change, so they say so rather than blaming the answer.
  auth: "That link is not valid any more. Open the timesheet from your email again.",
  badchoice: "Something went wrong sending that answer. Reload the page and try it again.",
  toomany: "Too many answers were sent at once. Reload the page and answer them again.",
  unknown: "That question is not on this timesheet any more - it may have been rebuilt. Reload the page.",
};
// AND WHERE IT HAPPENED, which is the half that makes it actionable.
//
// A batch card commits every day it holds in ONE write, so "needs a reason" or
// "outside the shift" on its own points at thirteen days at once and leaves the
// person hunting for the one that stopped it. The action carries `at` - the day,
// the slot and its label - plus the hours the answer had to land inside, because
// the target is more use than the verdict.
function Refusal({ err }) {
  const code = typeof err === "string" ? err : err?.error;
  const at = typeof err === "string" ? null : err?.at;
  const given = typeof err === "string" ? null : err?.given;
  const where = [at?.date, at?.label || at?.slot].filter(Boolean).join(" · ");
  const inside = at?.shifts?.length ? at.shifts : at?.window?.length ? at.window : at?.windows;

  return (
    <div className="mt-3 rounded-xl bg-rose-500/10 p-3.5">
      {where && (
        <p className="font-mono text-xs font-bold text-rose-800 dark:text-rose-300">
          {where}
          {given ? <> &middot; you typed <b>{given}</b></> : null}
        </p>
      )}
      <p className={`text-sm font-semibold text-rose-700 dark:text-rose-400 ${where ? "mt-1" : ""}`}>
        {REFUSALS[code] || "That didn't save. Refresh the page and try again."}
      </p>
      {inside?.length ? (
        <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">
          It has to be inside{" "}
          <b className="font-mono">{inside.join(" or ")}</b>.
        </p>
      ) : null}
    </div>
  );
}

// THE HALF OF THE TIME THAT WAS ACTUALLY WRONG.
//
// Every repair on both batches is an AM/PM slip - the digits are right and the
// meridiem is not - so "11:30 AM" and "11:30 PM" differ by two characters out of
// eight, in the middle of a sentence somebody is skim-reading before they tap.
// Emphasising those two is the difference between reading the label and reading
// the correction.
//
// Returns a node, not a string. `Choice` renders whatever it is handed, so this
// costs nothing anywhere else.
function markMeridiem(time) {
  const m = /^(.*?)(\s*[AP]\.?M\.?|\s*[ap])$/i.exec(String(time || "").trim());
  if (!m) return time;
  return (
    <>
      {m[1]}
      <em className="not-italic underline decoration-2 underline-offset-2">{m[2]}</em>
    </>
  );
}

function Choice({ on, tone, label, why, note, onClick, busy, hours }) {
  if (hours != null) {
    return (
      <button type="button" onClick={onClick} disabled={busy} aria-pressed={on} className={reviewStyles.duplicateChoice}>
        <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px] ${on ? "border-accent" : "border-faint"}`}>
          {on && <span className="h-2 w-2 rounded-full bg-accent" />}
        </span>
        <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
          {label}
          <span className="mt-1 block text-xs font-normal text-muted">{why}</span>
        </span>
        <span className={`shrink-0 text-lg tabular-nums text-accent ${reviewStyles.hours}`}>
          {Number(hours).toFixed(2)} <span className="text-xs">hrs</span>
        </span>
      </button>
    );
  }
  // ONE COLOUR FOR EVERY OPTION, 2026-08-14. Green for yes and red for no was
  // deliberate - the same language the timesheet itself uses, green for a
  // settled day and red for one that owes something - and it was reversed
  // because telling us you missed twelve breaks turned the card green.
  //
  // It goes because the colour is an OPINION about the answer, shown before
  // anybody has finished giving it. `tone` is still passed and still says
  // which is which; nothing reads it here any more.
  const ring = on
    ? "choice-on border"
    : "border border-border bg-surface hover:border-border-strong";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={on}
      className={`flex-1 basis-60 rounded-[10px] p-3 text-left transition-colors disabled:opacity-60 ${ring}`}
    >
      <span className={`flex items-center gap-2 text-sm font-semibold ${on ? "text-accent" : "text-foreground"}`}>
        <span
          aria-hidden="true"
          className={`flex h-[15px] w-[15px] flex-none items-center justify-center rounded-full border-[1.5px] ${
            on ? "border-accent" : "border-faint"
          }`}
        >
          {on && <span className="h-[7px] w-[7px] rounded-full bg-accent" />}
        </span>
        {label}
      </span>
      {why && <span className="mt-1.5 block pl-5.5 text-xs text-muted">{why}</span>}
      {/* WHAT THE OPTION COVERS, and it survives the terse view.
          `why` is what the answer DOES, and the day-by-day view drops it on
          purpose - the calendar beside the card does that explaining. A note is
          the other thing: what counts as this answer in the first place. Somebody
          who does not know whether their case is one of these cannot pick it,
          and no picture next to the card can tell them. */}
      {note && <span className="mt-1.5 block pl-5.5 text-xs text-muted">{note}</span>}
    </button>
  );
}

// one question inside the card: the choices, the optional typed time, and the
// confirm panel that has to be got past before anything is written
function OneQuestion({
  token, q, answer, answerHasTimes, answerTimes, savedChoice, locked, disturbCount,
  standing, submitAction, showDate, terse, reasonsOnRecord = null,
}) {
  // THE PAGE HAS TO REFETCH, AND `revalidatePath` ALONE DID NOT DO IT.
  //
  // Mánu 2026-08-11: "the hours up top doesn't change as I answer stuff, and it
  // should", and "I'm not able to go back and change it once I confirm it, even
  // though it says I can". Both are the same fault. The server action
  // revalidates the path, but nothing asked this tree to re-render, so the
  // summary kept the old hours AND `answer` stayed stale - so the card had no
  // idea it had been answered and would not let him change it.
  const router = useRouter();
  // the days somebody tried to leave with an answer half given, so this card can
  // say what it still needs. Read before any early return: a hook cannot be
  // called conditionally.
  const done = useContext(DayDoneCtx);
  const [pending, start] = useTransition();
  const [err, setErr] = useState(null);
  const [at, setAt] = useState("");
  // ONE TIME PER DATE, keyed by slot. A grouped card covers several days and
  // each of them is its own ten minute break - Mánu 2026-08-11: "it should ask
  // for the times for each of these 10 minute rest periods not just grouped all
  // together." One box for three days asked him to pick which day to be honest
  // about.
  const [slotAt, setSlotAt] = useState({});
  // WHY THE BREAK WAS NOT TAKEN.
  //
  // This box lived only on the batched card, which is the one card asking "did
  // you take your breaks". Every other kind that records a break as gone is a
  // plain card and had nowhere to put a sentence - so `mealLate`, whose reason
  // hangs off its YES, could not be answered at all: the browser sent no reason
  // and the action refused it. 12 of those on the live batch, 13 in July.
  const [reason, setReason] = useState(null);
  // WHAT THE UNPUNCHED BLOCK BECOMES once the meal has been moved out of it.
  // Free text on purpose: it is an instruction somebody types into QuickSolve,
  // not a time this sheet computes with, and a range is what they are moving.
  const [block, setBlock] = useState("");
  // AN ANSWERED CARD COLLAPSES. Mánu 2026-08-11: "after the answer is given i
  // dont think it should show the options like this. i think it should show the
  // times they chose and then an option to go back ... so they arent in
  // scrolling hell after a long time sheet."
  //
  // Three full-width choice boxes and a wall of body text stay on the page for
  // ever once a question is settled, and a sheet with a dozen of them becomes
  // something you scroll past rather than read. Answered shows one line of what
  // they said; "Change this" puts the question back.
  const [editing, setEditing] = useState(false);
  // "are you sure" before reopening an answer that others were derived from
  const [warning, setWarning] = useState(false);
  const [proposed, setProposed] = useState(null);
  // WHAT THEY JUST SAVED, HELD ON SCREEN. The server takes the answer in a
  // second or two and the page re-renders a beat later; between the two this
  // card used to fall back to the old props, so the answer visibly came undone
  // and then came back. Measured 2026-09-15: gone at 1.4s, back at 1.9s. Held
  // from the moment the save returns, dropped the moment the props move.
  const [held, setHeld] = useState(null);
  // WHETHER THE BOXES ARE SHOWING, worked out before the early return below so
  // the publisher hooks can sit above it. `needsTime` further down is the same
  // condition and stays the one the rendering uses.
  const wantsTime = !!q.canGiveTime && proposed?.choice === (q.needsOn || "yes");

  // PUBLISH WHAT IS IN THE BOXES so the day's calendar can draw it. Derived from
  // `slotAt` rather than written from each handler, so the "Use 12p" buttons,
  // typing, clearing and switching answers all go through one path - and picking
  // a choice that needs no time publishes nothing, which takes the block back
  // off the axis.
  const publishStaged = useStagedPublisher();
  const stagedKey = JSON.stringify(slotAt);
  useEffect(() => {
    if (!wantsTime) return publishStaged(q.id, []);
    const entries = [];
    for (const need of q.needs || []) {
      const min = toMin(slotAt[need.slot]);
      if (min == null) continue;
      entries.push({
        date: need.date || q.date,
        min,
        minutes: need.minutes,
        kind: need.kindOf,
      });
    }
    publishStaged(q.id, entries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.id, q.date, q.needs, wantsTime, stagedKey, publishStaged]);

  const c = copyFor(q, standing);
  if (!c) return null;

  // the answer as it stands in THIS tab: what was just saved counts from the
  // moment the server took it, not from the moment the page caught up
  const answerNow = held
    ? (held.choice === null ? null : held.choice === "yes" ? "accepted" : "declined")
    : answer;
  const answered = answerNow === "accepted" || answerNow === "declined";
  useEffect(() => {
    if (held && (answer !== held.answerThen || savedChoice !== held.savedThen)) setHeld(null);
  }, [held, answer, savedChoice]);
  const typedHHMM = parseLooseTime(at, { assumeWorkday: true });
  // WHAT IS CURRENTLY SHOWING, staged or saved. Clicking whichever one that is
  // takes it back off - staged answers just clear, and a SAVED one stages a
  // deletion the confirm panel then commits. Mánu 2026-08-11: "clicking on a
  // box clicked should also unclick the box and unhighlight."
  // THE STORED CHOICE FIRST, and the old guess only where there is not one.
  //
  // `status` collapses every non-yes answer to "declined", so this used to tell
  // the third outcome from "no" by whether times came back with it. That works
  // on `restOutsideScheduled`, whose "no" is the one that collects a time, and
  // it is simply wrong on `restTooLongOffClock`: its "added by accident" and
  // "the rostered one is wrong" are both declines carrying no times, so every
  // reload came back showing the third. `TimesheetCorrection.choice` records
  // what they actually picked; the inference stays for rows written before that
  // column existed, where it is still the best reading available.
  const shown = proposed
    ? proposed.choice
    : held ? held.choice
    : savedChoice ? savedChoice
      : answer === "accepted" ? "yes"
        : answer === "declined" ? (c.third && !answerHasTimes ? c.third.value : "no")
          : null;
  const pick = (v) => setProposed(shown === v ? { choice: null } : { choice: v });

  // WHICH ANSWER OPENS THE TIME BOX, and whether it may be left empty.
  //
  // `needsOn` is "yes" everywhere except `restOutsideScheduled`, where the
  // correction is "no" - so the box follows the answer that actually needs a
  // time rather than always hanging off "yes".
  //
  // REQUIRED only where the record holds no time at all. `restNoTimes` is the
  // whole reason this question exists: Mánu 2026-08-10, "because we need a
  // record of this". On `repair` the engine already has a time it can read, so
  // typing one is a correction and staying quiet accepts the proposal.
  const timeOn = q.needsOn || "yes";
  const needsTime = !!q.canGiveTime && proposed?.choice === timeOn;
  const slots = needsTime ? (q.needs || []) : [];
  const timeRequired = needsTime && slots.length > 0;
  const suggestion = q.proposed?.from || null;
  const slotMin = (need) => parseLooseTime(slotAt[need.slot] || "", { assumeWorkday: true });
  // a lunch typed outside the gaps the card offered, which the answer action
  // refuses (mealTimeFits, and the free time on the lunch-move card)
  const slotOutside = (need) => lunchOutside(need, toMin(slotAt[need.slot]));
  const timeOutside = timeRequired && slots.some(slotOutside);
  // EVERY slot has to be readable, not just the first. Each one is a separate
  // day's break and the sheet redraws all of them. and a lunch has to sit where
  // the server will take it.
  const timeBlocked = timeRequired
    ? slots.some((need) => !slotMin(need)) || timeOutside
    : !!(at.trim() && !typedHHMM);

  // AND NOT TWICE FOR ONE BREAK. Another question on this day may have collected
  // it already - a repair and a day with nothing recorded are both that day's
  // rests and share one row, because the day is the unit. The write path refuses
  // to overwrite either way; this is what stops somebody being asked to type
  // something that would then be discarded.
  const saidAlready = (() => {
    const key = breakFindingKey(reasonSlotFor(q.kind), q.date);
    return key ? (reasonsOnRecord?.[key] || null) : null;
  })();
  // seeded from whatever is on record for this day and this break, and editable
  // - see the note on `owesReason` in BatchProvider for why it is not hidden
  const reasonText = reason ?? saidAlready ?? "";
  const needsReason = reasonOwedOn(q.kind, proposed?.choice);
  const reasonBlocked = needsReason && !reasonText.trim();
  // AND WHAT THE BLOCK BECOMES, on the answer that says it can move. Saying it
  // can be rearranged without saying what to is an instruction nobody can carry
  // out in QuickSolve.
  const wantsBlock = !!q.wantsBlock && proposed?.choice === "yes";
  const blockBlocked = wantsBlock && !block.trim();
  // THE SENTENCE IS NOT WORDED HERE. `employeeQuestion` already writes one per
  // kind and per count - a missed lunch, one ten, neither of two, one of two
  // taken, a late meal - and the batched card asks through the same function.
  const reasonAsk = needsReason
    ? employeeQuestion(
      {
        kind: reasonSlotFor(q.kind),
        missingCount: Math.max(1, (q.needs || []).length),
        takenCount: proposed?.choice === "partial" ? Math.max(0, (q.needs || []).length - 1) : 0,
      },
      { lateMinutes: q.row?.lateMinutes ?? null },
    )
    : null;


  // WHAT THE COLLAPSED CARD SHOWS: the answer in their own words, and the times
  // they gave paired back to the dates they belong to. `statedBreaks` carries a
  // slot but not a date, so the dates come from `q.needs` - the same list the
  // boxes were built from, which is what keeps them in step.
  const chosenLabel =
    shown === "yes" ? c.yes?.label
      : shown === "no" ? c.no.label
        : shown === c.third?.value ? c.third.label
          : shown === c.fourth?.value ? c.fourth.label
            : "Answered";
  const statedPairs = (answerTimes || [])
    .map((b) => {
      const need = (q.needs || []).find((n) => n.slot === b.slot);
      return need?.date ? { slot: b.slot, date: need.date, from: b.from } : null;
    })
    .filter(Boolean);

  // SAVE ANSWER STAYS ON THE DAY. It used to carry somebody on to the next day
  // when it was the last thing open ("Confirm and move on"); the day's own
  // button does that now, as Save and next, so the card's button only saves and
  // the card folds to what was said where it was said.
  //
  // RESOLVES TRUE ONCE THE ANSWER IS ON RECORD, false if it was refused, so the
  // day's button can save it on the way past and stop if it did not land.
  const complete = !!proposed && proposed.choice !== null && !timeBlocked && !reasonBlocked && !blockBlocked;
  function commit() {
    if (!proposed || timeBlocked || reasonBlocked || blockBlocked) return Promise.resolve(false);
    setErr(null);
    return new Promise((resolve) => start(async () => {
      const res = await submitAction({
        token, id: q.id, choice: proposed.choice,
        // the boxes only exist on the answer that needs them, so a time typed
        // and then switched away from is never sent
        at: needsTime && !slots.length && typedHHMM ? typedHHMM : null,
        times: slots.length
          ? Object.fromEntries(slots.map((need) => [need.slot, slotMin(need)]).filter(([, m]) => m))
          : null,
        // same rule as the times: only ever sent on the answer that owes it, so
        // a sentence typed and then switched away from is never written
        reason: needsReason ? reasonText.trim() || null : null,
        // only ever sent on the answer that asks for it, so a range typed and
        // then switched away from is never written
        block: wantsBlock ? block.trim() || null : null,
      });
      if (!res?.ok) {
        setErr(res || { error: "failed" });
        resolve(false);
        return;
      }
      setHeld({ choice: proposed.choice, answerThen: answer, savedThen: savedChoice });
      setProposed(null); setAt(""); setSlotAt({}); setReason(null); setBlock(""); setEditing(false); router.refresh();
      resolve(true);
    }));
  }

  return (
    <div className={showDate ? "mt-4 border-t border-border pt-4 first:mt-0 first:border-0 first:pt-0" : ""}>
      {showDate && <p className="text-sm font-semibold text-foreground">{q.date}</p>}

      {answered && !editing ? (
        // WHAT THEY SAID, ON ONE LINE. The dates and their times sit inline so a
        // settled question costs a couple of rows instead of a screenful.
        <div className="mt-1">
          <p className="text-sm text-muted">
            <b className="text-foreground">{chosenLabel}</b>
            {" - "}
            {q.kind === "duplicateDay"
              ? (answerNow === "accepted" ? c.yesEffect : c.noEffect)
              : answerNow === "accepted" ? "thank you." : "your timesheet has been rebuilt."}
          </p>
          {/* the line every saved answer carries, here and on the batched rows */}
          <p className="mt-1 text-xs text-muted">Saved. You can change it any time before you sign.</p>
          {/* what is still theirs to do once the answer is in - see `afterYes` */}
          {answer === "accepted" && c.afterYes && (
            <div className="amber-tint-card mt-2 rounded-xl p-3.5">
              <p className="text-sm font-semibold text-foreground">
                {c.afterYes.title}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                {c.afterYes.body}
              </p>
            </div>
          )}
          {statedPairs.length > 0 && (
            <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
              {statedPairs.map((x) => (
                <span key={x.slot}>
                  <span className="font-mono text-xs text-foreground">{x.date}</span>{" "}
                  {x.from}
                </span>
              ))}
            </p>
          )}
          {/* CHANGING AN UPSTREAM ANSWER REACHES THE ONES BELOW IT, and only
              then is there anything to warn about. Mánu 2026-08-11: "if they go
              to change this, it should say are you sure - it will change the
              answers below ONLY IF they'll be changed." */}
          {warning ? (
            <div className="amber-tint-card mt-2 rounded-xl p-3.5">
              <p className="text-sm font-semibold text-foreground">Are you sure?</p>
              <p className="mt-1 text-sm text-muted">
                Changing this changes your hours for{" "}
                {q.dates?.length === 1 ? "that day" : `those ${q.dates?.length} days`}, and{" "}
                <b className="text-foreground">
                  {disturbCount} {disturbCount === 1 ? "answer" : "answers"}
                </b>{" "}
                you have already given below {disturbCount === 1 ? "is" : "are"} worked out from
                those hours. {disturbCount === 1 ? "It" : "They"} may change or go away.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => { setWarning(false); setEditing(true); }}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  Change it anyway
                </button>
                <button
                  type="button"
                  onClick={() => setWarning(false)}
                  className="rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-foreground"
                >
                  Leave it
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => (disturbCount > 0 ? setWarning(true) : setEditing(true))}
              className="mt-2 text-sm font-semibold text-brand transition hover:text-brand-dark"
            >
              Change this
            </button>
          )}
        </div>
      ) : (
        showDate && (
          <p className="mt-1 text-sm leading-relaxed text-muted">{c.body}</p>
        )
      )}

      {c.evidence && !answered && showDate && (
        <div className="mt-2.5 rounded-lg border border-border bg-surface-2 p-3 font-mono text-xs leading-relaxed text-muted">
          {c.evidence.map((line, i) => <p key={i}>{line}</p>)}
        </div>
      )}

      {/* CLICKING A CHOSEN BOX UNCHOOSES IT. Mánu 2026-08-11. Without this the
          only way out of a mis-tap was to pick the other answer, which on a
          question about somebody's pay means asserting the opposite of what you
          meant just to clear the first mistake. */}
      {/* LOCKED: an answer above this one moves the hours, and the hours decide
          what this question is even asking. Showing the buttons would invite an
          answer that is about to be recomputed out from under them. */}
      {locked && !answered && (
        <div className="mt-3 rounded-lg border border-dashed border-border-strong bg-surface-2 p-3">
          <p className="text-sm text-muted">
            <b className="text-foreground">Answer the question above first.</b> Your hours for{" "}
            {q.dates?.length > 1 ? "these days" : "this day"} depend on it, and your hours decide
            what this question is asking.
          </p>
        </div>
      )}

      {(!answered || editing) && !locked && (
      <div className={q.kind === "duplicateDay" ? reviewStyles.duplicateChoices : "mt-3 flex flex-wrap gap-2.5"}>
        {q.kind === "duplicateDay" ? (
          <>
            <Choice on={shown === "no"} busy={pending} label={c.no.label} why={c.no.why} hours={q.row.single} onClick={() => pick("no")} />
            <Choice on={shown === "yes"} busy={pending} label={c.yes.label} why={c.yes.why} hours={q.row.hours} onClick={() => pick("yes")} />
          </>
        ) : (
        <>
        {/* A KIND CAN HAVE ONE ANSWER. `mealInShift` is the first: a meal booked
            inside a shift they clock in and out of cannot have been taken, so
            there is no yes to offer and a card that showed one would be
            inviting a claim the day cannot support. Same reasoning as the
            no-room meal on the batched card, which returns only the decline. */}
        {c.yes && (
        <Choice
          on={shown === "yes"}
          tone="yes"
          busy={pending}
          label={c.yes.label}
          why={(!answered || editing) && !terse ? c.yes.why : null}
          note={!answered || editing ? c.yes.note : null}
          onClick={() => pick("yes")}
        />
        )}
        <Choice
          on={shown === "no"}
          tone="no"
          busy={pending}
          label={c.no.label}
          why={(!answered || editing) && !terse ? c.no.why : null}
          note={!answered || editing ? c.no.note : null}
          onClick={() => pick("no")}
        />
        {c.third && (
          <Choice
            on={shown === c.third.value}
            tone="no"
            busy={pending}
            label={c.third.label}
            why={(!answered || editing) && !terse ? c.third.why : null}
            note={!answered || editing ? c.third.note : null}
            onClick={() => pick(c.third.value)}
          />
        )}
        {c.fourth && (
          <Choice
            on={shown === c.fourth.value}
            tone="no"
            busy={pending}
            label={c.fourth.label}
            why={(!answered || editing) && !terse ? c.fourth.why : null}
            note={!answered || editing ? c.fourth.note : null}
            onClick={() => pick(c.fourth.value)}
          />
        )}
        </>
        )}
      </div>
      )}

      {/* THE TIME GOES UNDER THE ANSWER THAT NEEDS IT, not beside it as a third
          option. Mánu 2026-08-11: "yes i took it should have an option to enter
          a time, then the yes but a different time becomes redundant."

          There were three boxes - yes, no, and "yes but at a different time" -
          and the third was the same answer as the first with an extra field.
          Two of them lit up green and one of the two was a decoy.

          WHICH answer needs it depends on the question. Everywhere else it is
          "yes"; on `restOutsideScheduled` the correction is "no", so that is
          where the box has to appear. `needsOn` says which. */}
      {/* THE TIME BOX IS NOT GATED ON `answered`, and that gate was a dead end.
          Once anything had been confirmed the box vanished while the confirm
          panel still said "put the time in above first" - so the answer could
          never be changed to the one that needs a time. Mánu 2026-08-11:
          "doesnt let me go back and change it to this." */}
      {needsTime && (
        <div className="mt-3 rounded-xl bg-fill p-3.5">
          <p className="text-sm font-semibold text-foreground">{c.timeLabel}</p>
          <p className={`mt-1 text-xs ${timeOutside ? "text-rose-600 dark:text-rose-400" : "text-muted"}`}>
            {c.timeHint
              || (timeRequired
                ? "We need this before you can confirm - the record has no time on it at all."
                : "Optional. Leave it blank and we will use the time already on the record.")}
          </p>

          {slots.length > 0 ? (
            <div className="mt-2.5 space-y-2">
              {slots.map((need) => {
                const raw = slotAt[need.slot] || "";
                const mins = slotMin(need);
                return (
                  <div key={need.slot} className="flex flex-wrap items-center gap-2.5">
                    <label
                      htmlFor={`at-${q.id}-${need.slot}`}
                      className="w-24 font-mono text-sm text-foreground"
                    >
                      {need.date || need.label}
                    </label>
                    <input
                      id={`at-${q.id}-${need.slot}`}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      disabled={pending}
                      value={raw}
                      onChange={(e) => setSlotAt((t) => ({ ...t, [need.slot]: e.target.value }))}
                      className={`w-36 rounded-[9px] border bg-surface px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-faint focus:outline-2 focus:-outline-offset-1 focus:outline-brand ${
                        mins && !slotOutside(need) ? "border-emerald-400/80" : raw.trim() ? "border-rose-400" : "border-border"
                      }`}
                    />
                    {!mins && need.suggest && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setSlotAt((t) => ({ ...t, [need.slot]: need.suggest }))}
                        className="rounded-[9px] bg-fill px-3 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-fill-2"
                      >
                        Use {need.suggest}
                      </button>
                    )}
                    {/* EVERY GAP A LUNCH FITS IN, as something to pick. One per
                        gap rather than only the longest, and none of them
                        selected - typing their own is still the first-class
                        answer, which is why the box comes first. */}
                    {!mins &&
                      (need.options || []).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          disabled={pending}
                          onClick={() => setSlotAt((t) => ({ ...t, [need.slot]: opt }))}
                          className="rounded-[9px] bg-fill px-3 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-fill-2"
                        >
                          Use {opt}
                        </button>
                      ))}
                    {mins && (
                      <span className="text-sm text-muted">
                        reads as <b className="text-foreground">{formatTimeDisplay(mins)}</b>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
              <input
                id={`at-${q.id}`}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                disabled={pending}
                value={at}
                onChange={(e) => setAt(e.target.value)}
                className={`w-40 rounded-[9px] border bg-surface px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-faint focus:outline-2 focus:-outline-offset-1 focus:outline-brand ${
                  at.trim() && !typedHHMM ? "border-rose-400" : "border-border"
                }`}
              />
              {suggestion && !at.trim() && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setAt(suggestion)}
                  className="rounded-[9px] bg-fill px-3 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-fill-2"
                >
                  Use {suggestion}
                </button>
              )}
              <span className="text-sm text-muted">
                {at.trim()
                  ? typedHHMM
                    ? <>reads as <b className="text-foreground">{formatTimeDisplay(typedHHMM)}</b></>
                    : <span className="text-rose-600 dark:text-rose-400">not a time we can read</span>
                  : null}
              </span>
            </div>
          )}
        </div>
      )}

      {wantsBlock && (
        <div className="mt-3 rounded-xl bg-fill p-3.5">
          <p className="text-sm font-semibold text-foreground">
            What should your {q.row?.service || "unpunched"} time be on {q.date}?
          </p>
          <p className="mt-1 text-xs text-muted">
            It is {q.row?.blockFrom} to {q.row?.blockTo} now. Tell us what it becomes with the meal
            break moved out of it.
          </p>
          <input
            type="text"
            autoComplete="off"
            disabled={pending}
            value={block}
            onChange={(e) => setBlock(e.target.value)}
            placeholder="e.g. 8a-12p"
            className={`mt-2 w-48 rounded-[9px] border bg-surface px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-faint focus:outline-2 focus:-outline-offset-1 focus:outline-brand ${
              block.trim() ? "border-emerald-400/80" : "border-border"
            }`}
          />
          {!block.trim() && (
            <p className="mt-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
              Needed before this can be saved.
            </p>
          )}
        </div>
      )}

      {/* THE WHY, UNDER THE ANSWER THAT IS THE VIOLATION.
          Same box, same wording and the same row in the database as the batched
          card's, which is where this used to exist alone. The sentence comes
          from `employeeQuestion`, so nothing is worded twice.

          On a late lunch it hangs off the YES: the break happened, and what
          nothing on any export can say is what held it up. */}
      {needsReason && (
        <div className="amber-tint-card mt-3 rounded-xl p-3.5">
          <p className="text-sm font-semibold text-foreground">{reasonAsk.ask}</p>
          {/* min-h below sm because `rows` counts LINES, not pixels: the 16px
              these fields get on a phone (see no-focus-zoom in globals.css)
              makes two of them shorter than the placeholder, which then sits
              half-clipped at the bottom of the box. */}
          <textarea
            rows={2}
            disabled={pending}
            value={reasonText}
            onChange={(e) => setReason(e.target.value)}
            placeholder={reasonAsk.placeholder}
            className="mt-2 min-h-[5.5rem] w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-foreground sm:min-h-0"
          />
          {!reasonText.trim() ? (
            <p className="mt-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
              Needed before this can be saved. It goes at the bottom of your timesheet.
            </p>
          ) : saidAlready ? (
            <p className="mt-1.5 text-xs text-muted">
              This is what you told us for {dayLong(q.date)} already. Change it here if it is not right.
            </p>
          ) : null}
        </div>
      )}

      {/* SAVE ANSWER, UNDER THE ANSWER IT SAVES. No "are you sure" box and no
          second save anywhere: once the answer is complete the button is here,
          with the line saying what it does beside it, and the day's own button
          saves it too on the way past. While something is still missing the
          boxes above say so, and once somebody tries to leave the day with it
          half given, the line here says exactly what. */}
      {proposed && proposed.choice !== null && (
        <div className="mt-3 space-y-1.5 text-sm text-muted">
          {complete && (
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
              <button
                type="button"
                disabled={pending}
                onClick={commit}
                className="flex-none rounded-[9px] bg-brand px-4 py-2 text-[13.5px] font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-50"
              >
                {pending ? "Saving…" : "Save answer"}
              </button>
              <span>
                {proposed.choice === "yes" ? c.yesEffect
                  : proposed.choice === "no" ? c.noEffect
                    : proposed.choice === c.third?.value ? c.thirdEffect
                      : proposed.choice === c.fourth?.value ? c.fourthEffect
                        : null}
              </span>
            </div>
          )}
          {complete && needsTime && !slots.length && typedHHMM && (
            <p>
              The sheet will show <b className="text-foreground">{formatTimeDisplay(typedHHMM)}</b>,
              and say it came from you rather than from the break record.
            </p>
          )}
          {complete && needsTime && slots.length > 0 && (
            <p>
              Your sheet will show{" "}
              {slots.map((need, i) => (
                <span key={need.slot}>
                  {i > 0 ? ", " : ""}
                  {/* a single-day card's slots carry no date of their own */}
                  <b className="text-foreground">{need.date ? `${need.date} at ` : ""}{formatTimeDisplay(slotMin(need))}</b>
                </span>
              ))}
              , and say the times came from you rather than from the break record.
            </p>
          )}
          {!complete && done?.attemptedOn?.(q.date) && (
            <>
              {blockBlocked && (
                <p className="font-semibold text-rose-600 dark:text-rose-400">
                  Say what that time becomes above first.
                </p>
              )}
              {reasonBlocked && (
                <p className="font-semibold text-rose-600 dark:text-rose-400">
                  Write why in the box above first.
                </p>
              )}
              {/* a time that is there but outside its gaps needs no line here,
                  the hint above it is already red and names them. and a
                  single-day card's slot carries no date, so it gets the plain
                  sentence rather than "Put a time in for  above first." */}
              {timeBlocked && !(slots.length > 0 && slots.every((n) => slotMin(n))) && (
                <p className="font-semibold text-rose-600 dark:text-rose-400">
                  {slots.length > 0
                    ? slots.some((n) => !slotMin(n) && n.date)
                      ? `Put a time in for ${slots.filter((n) => !slotMin(n) && n.date).map((n) => n.date).join(", ")} above first.`
                      : "Put the time in above first."
                    : timeRequired && !at.trim()
                      ? "Put the time in above first."
                      : "That time cannot be read - check it above."}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* TAKING A SAVED ANSWER OFF is undoing one, not giving one, so it keeps
          its own sentence and its own button rather than the Save answer row. */}
      {proposed && proposed.choice === null && (
        <div className="mt-3 rounded-xl bg-fill p-3.5">
          <p className="text-sm text-muted">
            This goes back to unanswered, and your timesheet goes back to what it said before. You can answer it again any time.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={commit}
            className="mt-2.5 rounded-[9px] border border-border-strong px-4 py-2 text-[13.5px] font-semibold text-foreground disabled:opacity-50"
          >
            {pending ? "Saving…" : "Take it off"}
          </button>
        </div>
      )}

      {/* an answer being given and not saved yet, reported up so the day's
          Save and next can save it and closing the tab asks first */}
      <PendingReporter
        id={q.id}
        date={q.date}
        state={proposed && proposed.choice !== null ? (complete ? "ready" : "incomplete") : null}
        stays={!!q.followsOn && proposed?.choice === q.followsOn}
        save={commit}
      />
      {err && <Refusal err={err} />}
    </div>
  );
}

// A WHOLE CARD ANSWERED DAY BY DAY AND COMMITTED ONCE.
//
// Mánu 2026-08-09 late, looking at his own twelve day breaks card: "what if only
// some of them are no? with the way we have it right now, all of them are no or
// all of them are yes." So every day gets its own answer - but one confirm and
// one write, because thirteen confirm panels and thirteen sheet rebuilds is what
// Ford would otherwise be walked through.
//
// NOTHING IS PRE-SELECTED, same as every other card. The staged answers live
// here in client state until the confirm panel is got past, and until then the
// database has not been touched.
// WHAT THE BATCHED CARD SAYS BEFORE IT ASKS ANYTHING. Its own component because
// `copyFor` lives in this "use client" module: a server component can render a
// client component but it cannot call into one, so "Day by day" asks for the
// heading rather than computing it.
// WHAT A BATCHED DAY IS SHORT, IN A FEW WORDS. Lifted out of the provider so the
// panel at the top of the page can name the same row the card names, rather than
// spelling it a second way.
const WORDS = ["no", "one", "two", "three", "four", "five"];
const countWord = (n) => WORDS[n] || String(n);
export function breakLabel(q) {
  const owed = (q.needs || []).length;
  const have = (q.needs?.[0]?.known || []).length;
  const total = owed + have;
  if (q.row?.part === "meal") return "No meal break recorded";
  if (!owed) return "Rest break";
  if (have > 0) return `Rest break - ${countWord(owed)} of ${countWord(total)} missing`;
  return total > 1 ? `No rest breaks recorded - ${countWord(total)} owed` : "No rest break recorded";
}

// EVERY ISSUE ON THE SHEET, AT THE TOP, EACH LINKING TO ITS OWN DAY.
//
// Mánu asked for this three times before it was built, and deferred it three
// times because it touches the page every employee opens. The reason it exists:
// the batched card's heading was the only thing above the day list, so on a long
// sheet the real work was below the fold and whatever sat at the top read as the
// important thing.
//
// A CLIENT COMPONENT because it needs `copyFor`, and a server component can
// render one of those but cannot call into it - the same reason `BatchHeading`
// exists rather than the page computing its own heading.
//
// ONE ROW PER ISSUE, NOT PER DAY. A day carrying two is two things to do, and a
// row per day cannot be ticked off by halves. It is also what makes the count at
// the top mean the same thing as the count the signer quotes.
// A DAY THEY HAVE FINISHED WITH, COLLAPSED TO ONE LINE.
//
// The day card and its calendar are SERVER rendered, so they cannot read the
// staged state that says the day is done - that lives in the provider. This is
// the client wrapper that can: it takes the whole day as children and shows the
// summary instead once the day is marked.
//
// The children are still built on the server either way. Not rendering them is a
// display decision, not a saving of work, and it keeps this to one small
// component rather than moving the day list into the client.
export function DayShell({ date, summary = null, blocked = false, children }) {
  const done = useContext(DayDoneCtx);
  const ctx = useContext(BatchCtx);
  // WALKING PAST A DAY IS NOT ANSWERING IT - the second half. 6ea73c7 stopped
  // the rail calling a walked day answered; this shell still did. Carminia
  // Suarez, 2026-09-16: every day on her sheet was walked, none of her three
  // meal questions was on record, and this drew "Answered" under a green tick
  // over the question she had not answered - with the confirm below counting
  // it as still owing and the footer saying the day was not finished. "Change
  // this" reopened it, she answered, Next walked it again, and the next load
  // hid the question behind "Answered" once more: the walk lives on the sheet
  // and a staged answer lives in the tab, so a reload keeps one and loses the
  // other.
  //
  // The same test the footer applies: a day collapses only when nothing on it
  // is still owing. `blocked` is the server's reading of the plain cards, the
  // acks and the break reasons - see `plainBlockedOn` - and the batched rows
  // are asked directly, because they stage here and the server cannot see them.
  const hasBatchRow = !!ctx?.byDay?.some?.((d) => d.date === date);
  const open = blocked || (hasBatchRow && !!ctx?.blockedOn?.(date));
  // AND NOTHING FOLDS UNDER SOMEBODY'S FINGERS. `open` is read live off the
  // staged answers, so on a day walked before its question was answered it
  // first goes false on the FIRST CHARACTER of a required reason, or the first
  // time that parses - and this folded the day to its one line with the box
  // gone from under the person typing in it, 2026-09-16. The letter survived in
  // the tab, which is how a one-letter reason reached a signed sheet.
  //
  // So a fold takes a press. The provider counts them per day; a day shown open
  // while already marked remembers the count, and folds only once it has moved.
  // A day marked before this tab opened, with nothing owing, folds as it did.
  const ready = !!done?.readyOn?.(date);
  const presses = done?.pressesOn?.(date) ?? 0;
  const shownOpenAt = useRef(null);
  const folds = shellFolds({ ready, open, presses, pressesWhenShownOpen: shownOpenAt.current });
  useEffect(() => { shownOpenAt.current = ready && !folds ? presses : null; });
  if (!folds) return children;
  // THE DATE AND THE HOURS STAY OFF THIS ROW since 2026-09-08 - the shell sits
  // under the day pane's own heading now, which already says both.
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl bg-fill px-3.5 py-2.5">
      <span className="flex min-w-0 items-center gap-2 text-sm text-muted">
        <CircleCheck size={15} strokeWidth={1.8} aria-hidden="true" className="flex-none text-emerald-500" />
        <span className="min-w-0 font-medium text-foreground">
          {[ctx?.summaryFor?.(date), summary].filter(Boolean).join(" · ") || "Answered"}
        </span>
      </span>
      <button
        type="button"
        onClick={() => done.unmarkReady(date)}
        className="rounded-[9px] px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-fill focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
      >
        Change this
      </button>
    </div>
  );
}

export function IssuePanel({ rows = [], standing }) {
  // READY IS NOT SAVED, AND THE PANEL SAYS WHICH. Half the questions on this
  // batch are batched ones that stage locally, so a panel counting only saved
  // answers sat at 0 however many days somebody worked through.
  const finished = useContext(DayDoneCtx);
  const isReady = (r) => !r.done && !!r.date && !!finished?.readyOn?.(r.date);
  if (!rows.length) return null;
  const done = rows.filter((r) => r.done || isReady(r)).length;
  const pct = Math.round((done / rows.length) * 100);
  const label = (r) => {
    if (r.label) return r.label;
    if (r.batched) return breakLabel(r.q);
    return copyFor(r.q, standing)?.short || copyFor(r.q, standing)?.title || "Something to check";
  };
  return (
    <div className="mt-5 rounded-xl border-2 border-amber-400 bg-amber-50 p-5 dark:border-amber-700 dark:bg-amber-950/30">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-base font-semibold text-foreground">
          {rows.length === 1
            ? "One thing to check on this timesheet"
            : `${rows.length} things to check on this timesheet`}
        </p>
        <span className="text-sm text-muted">{done} of {rows.length} done</span>
      </div>
      {done > 0 && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
        </div>
      )}
      <p className="mt-2 text-sm text-muted">Each one is on the day it happened. Press it to go there.</p>
      <ul className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
        {rows.map((r) => (
          <li key={r.key}>
            <a
              href={`#day-${r.date}`}
              className="flex items-center gap-3 px-3.5 py-2.5 transition hover:bg-surface-3"
            >
              <span className={`w-[74px] flex-none font-mono text-xs font-semibold ${
                r.done || isReady(r) ? "text-faint" : "text-foreground"
              }`}
              >
                {r.date}
              </span>
              <span className={`min-w-0 flex-1 text-sm ${r.done || isReady(r) ? "text-muted" : "text-foreground"}`}>
                {label(r)}
                {r.said && <span className="mt-0.5 block text-xs text-muted">{r.said}</span>}
              </span>
              {/* THREE STATES, AND THE MIDDLE ONE IS NOT A QUESTION. A backwards
                  span is something recorded wrong that the office corrects, not
                  something to answer here, and a row that said "Answer" would be
                  asking for something this page cannot take. */}
              <span className={`flex-none rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                r.done || isReady(r)
                  ? "border-emerald-300 text-emerald-700 dark:border-emerald-800/70 dark:text-emerald-300"
                  : r.fix
                    ? "border-sky-300 text-sky-700 dark:border-sky-800/70 dark:text-sky-300"
                    : "border-amber-300 text-amber-800 dark:border-amber-700/70 dark:text-amber-300"
              }`}
              >
                {r.done ? "Done" : isReady(r) ? "Ready" : r.fix ? "Fix" : "Answer"}
              </span>
              <span aria-hidden="true" className="flex-none text-faint">&rsaquo;</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BatchHeading({ question, standing, className = "" }) {
  const c = copyFor(question, standing);
  if (!c) return null;
  // a kind with no title and no body draws no panel at all
  if (!c.title && !c.body) return null;
  return (
    <div className={className}>
      {c.title && <p className="text-base font-semibold text-foreground">{c.title}</p>}
      {c.body && <p className="mt-2 text-sm leading-relaxed text-muted">{c.body}</p>}
    </div>
  );
}

export function BatchProvider({
  token, list, answers, partials, waiting, standing, submitAction, copy: copyProp, children,
  // THE TIMES ALREADY SAVED, by question id. See `savedAt`.
  answerTimes = null,
  // WHAT IS ALREADY WRITTEN, by finding key. Handed down from the page rather
  // than fetched here: the card is a client component and the rows are the same
  // ones the page already read to build the reason cards further up.
  reasonsOnRecord = null,
}) {
  // one reason per day per break, whichever question collected it. Hands back
  // the WORDS rather than a yes or no, because a box that disappears without
  // saying why reads as a broken control - which is exactly what it did.
  const reasonAlready = (q) => {
    const key = breakFindingKey(reasonSlotFor(q.kind), q.date);
    return (key && reasonsOnRecord?.[key]) || null;
  };
  // the caller may hand the copy in (the "All questions" card already computed
  // it to pick the card tone) or leave it to be derived here
  const copy = copyProp || copyFor(list[0], standing) || {};
  // see the note in OneQuestion - the figures at the top of the page are server
  // rendered, so an answer that does not refresh the tree leaves them stale
  const router = useRouter();
  const [pending, start] = useTransition();
  // a refusal, with the questions it was about, so it shows under those
  const [err, setErr] = useState(null);
  const [picked, setPicked] = useState({});
  // the days somebody tried to leave with an answer half given - see DayDoneButton
  const done = useContext(DayDoneCtx);
  // WHY THEY MISSED IT, one per question. Required on a "no" - Mánu 2026-08-14 -
  // because a "no" IS the violation and the why is the one half no QSP export
  // has a field for. Leaving the whole question alone is still fine and still
  // keeps the pay; this only bites once somebody says they missed something.
  const [reasons, setReasons] = useState({});
  // { [questionId]: { [slot]: "raw text the person typed" } }
  const [times, setTimes] = useState({});
  // WHAT THEY JUST SAVED, HELD ON SCREEN until the refreshed `answers` carry
  // it, along with what they typed for it. Clearing on success and waiting for
  // the page put the answer back to unanswered for the length of the
  // re-render, which read as the save not working. The hold is keyed on the
  // props object itself: a refresh hands this component a new one, and that is
  // the moment the hold, and the typed copies of what it saved, can go.
  const [held, setHeld] = useState(null);
  useEffect(() => {
    if (!held || answers === held.answersThen) return;
    const saved = held.ids || new Set();
    const drop = (o) => Object.fromEntries(Object.entries(o).filter(([id]) => !saved.has(id)));
    setPicked(drop);
    setTimes(drop);
    setReasons(drop);
    setHeld(null);
  }, [held, answers]);
  // A SAVED ANSWER FOLDS TO ONE LINE, and Change this opens it again. The ids
  // opened that way, until their change is saved.
  const [editing, setEditing] = useState(() => new Set());
  // which questions a save is running for, so only their button says so
  const [savingIds, setSavingIds] = useState(() => new Set());
  // an answer already on record shows as the current setting, so changing your
  // mind is editing what you said rather than starting again
  //
  // A SAVED "declined" THAT STILL CARRIES TIMES IS A PARTIAL. There is no third
  // status on a correction row and this did not warrant a migration: declining
  // normally clears `statedBreaks`, so times surviving on a declined row can
  // only mean somebody said they took SOME of their tens. That is what lets the
  // choice come back as "partial" when the page reloads.
  const savedValue = (q) => {
    const a = answers?.[q.id];
    if (a === "accepted") return "yes";
    if (a === "declined") return partials?.[q.id] ? "partial" : "no";
    return null;
  };
  // A DAY WITH NOWHERE TO PUT A LUNCH DOES NOT OFFER "I TOOK IT".
  //
  // `noRoom` says no lawful half hour fits anywhere in the day and none was
  // rostered - see `slotsFor`. The card was offering the option and then telling
  // them, in the box underneath, that there is no gap long enough to have taken
  // one. Picking it led nowhere: the time is required and there is no time that
  // passes. So the finding stands on its own and the only thing asked is why.
  const noRoom = (q) =>
    q.row?.part === "meal" && (q.needs || []).length > 0
      && (q.needs || []).every((n) => n.noRoom);
  // AND WHERE THERE IS ONLY ONE ANSWER, IT IS THE ANSWER. Nothing else on this
  // card is pre-selected and that stays true: this is not a default, it is a day
  // with a single possible outcome, so the toggle is replaced by the finding and
  // the only thing left to collect is why. See `noRoom`.
  const valueFor = (q) => {
    if (noRoom(q)) return "no";
    return q.id in picked ? picked[q.id] : held && q.id in held.picked ? held.picked[q.id] : savedValue(q);
  };

  // WHAT IS ALREADY ON RECORD FOR THIS SLOT.
  //
  // THE BUG THIS FIXES, and it was every returning employee. A day answered
  // "took it" stores the time on the correction as `statedBreaks`, and the card
  // read the boxes ONLY from local state and `need.prefill` - which is null for
  // every kind that asks for a time. So on the next page load the answer came
  // back and the time did not: the boxes were empty, `missingTimes` counted
  // them, and the card refused to save until all of them were typed again.
  //
  // Mánu 2026-08-17, with sixteen answers and ten stored times on his own
  // sheet: "I answered everything, and then I put save. Why is it still saying
  // this?" It was asking him to retype what he had already sent us.
  //
  // Matched on the SLOT, which is what `statedBreaks` carries and what the
  // boxes are keyed by. `??` and not `||`, so clearing a box shows it empty
  // rather than springing back to the saved value.
  const savedAt = (q, slot) => {
    const rows = answerTimes?.[q.id];
    if (!Array.isArray(rows)) return "";
    return rows.find((b) => b?.slot === slot)?.from || "";
  };
  const rawAt = (q, slot) => times[q.id]?.[slot] ?? savedAt(q, slot);
  const setAt = (q, slot, v) =>
    setTimes((t) => ({ ...t, [q.id]: { ...(t[q.id] || {}), [slot]: v } }));
  // a slot is satisfied by anything the loose parser can read - "115", "1:15p",
  // "1.15 pm" - or by the schedule time it arrived pre-filled with
  // THE BATCH'S HALF-TYPED TIMES, onto the same axis. Only for a question whose
  // chosen answer actually asks for one - the box only renders on "yes" and
  // "partial", so un-picking or switching to "missed it" publishes an empty list
  // and the block leaves the calendar with it.
  const publishStaged = useStagedPublisher();
  const stagedKey = JSON.stringify([times, picked]);
  useEffect(() => {
    for (const q of list) {
      const v = q.id in picked ? picked[q.id] : savedValue(q);
      if (v !== "yes" && v !== "partial") { publishStaged(q.id, []); continue; }
      const entries = [];
      for (const need of q.needs || []) {
        const raw = times[q.id]?.[need.slot] ?? "";
        const min = toMin(raw.trim() ? raw : need.prefill);
        if (min == null) continue;
        entries.push({
          date: need.date || q.date,
          min,
          minutes: need.minutes,
          kind: need.kindOf,
        });
      }
      publishStaged(q.id, entries);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, stagedKey, publishStaged]);

  const minutesAt = (q, need) => {
    const raw = rawAt(q, need.slot);
    if (raw.trim()) return parseLooseTime(raw, { assumeWorkday: true });
    return need.prefill ? parseLooseTime(need.prefill, { assumeWorkday: true }) : null;
  };
  // A REST HAS TO LAND INSIDE A SHIFT, and inside its own half of one.
  //
  // BOTH CHECKS, not just the window. 12:05p on a 10a-12p / 12:15p-2:15p day is
  // inside the first ten's window and inside NO SHIFT - it is the unscheduled
  // hole the old suggestion used to point at. Checking only the window showed it
  // in green and left the server to refuse it on submit, which is the worst of
  // both: they type a time the page accepts and the save then fails.
  //
  // `restTimeFits` on the server is the authority; this is the same rule said
  // early enough to be useful.
  //
  // AND A LUNCH HAS TO LAND IN A GAP, the one `mealTimeFits` refuses on save.
  // only rests were checked here, so a lunch typed into the middle of a service
  // shift went green with Save answer under it and came back refused. both
  // rules live in typed-break.js now, in minutes: this used to add the ten to
  // "11:55" as text and pass a break the server then turned down.
  //
  // the minutes come from what was typed, read once - reading the parsed
  // "01:00" again would turn a typed 1a into 1p
  const badTime = (q, need) => {
    const raw = rawAt(q, need.slot);
    const m = toMin(raw.trim() ? raw : need.prefill);
    if (m == null) return null;
    if (need.kindOf === "meal") return lunchOutside(need, m) ? "lunch" : null;
    return restOutside(need, m);
  };
  // EVERY DAY ANSWERED "missed them" OWES A REASON, the way a day answered
  // "took them" owes its times. Only on the kinds the server also enforces it
  // on - see `NEEDS_REASON` in answerTimesheetQuestion - so the browser and the
  // action cannot disagree about who may save.
  // WHICH ANSWER OWES THE SENTENCE is `REASON_ON` in break-answers.js, which the
  // action reads too. It was a copy in each file and two copies that drift give
  // you a button saving nothing, or one refusing what the server would take.
  // WHAT IS IN THE BOX: theirs if they have touched it, otherwise whatever is
  // already on record for this day and this break.
  const reasonOf = (q) => String(reasons[q.id] ?? reasonAlready(q) ?? "").trim();
  // ONE ROW PER DAY PER BREAK, AND IT IS ALWAYS EDITABLE.
  //
  // The box used to be SUPPRESSED where a reason already existed, with a panel
  // saying we would not ask again. That stopped a second question about the same
  // day silently discarding the first one's sentence, which was the right thing
  // to protect - but it protected it by making the sentence read only, and the
  // person it was read only to was the one who wrote it.
  //
  // Showing it in the box protects the same thing better: nothing can be
  // discarded without being on screen first, because what would be replaced is
  // what they are looking at and typing over. Untouched, it submits the same
  // words back and nothing moves.
  const owesReason = (q, v) => reasonOwedOn(q.kind, v);

  // IS THIS ANSWER COMPLETE - the one test the Save answer button, the day's
  // Save and next and the day's own finish all ask, and the same the server
  // applies, so the button only shows on an answer that will save.
  //
  // EVERY DAY ANSWERED "took them" OWES ITS TIMES. Mánu 2026-08-10: required,
  // "because we need a record of this". A day answered "missed them" owes none -
  // there is nothing to say when about - and owes its reason instead. A PARTIAL
  // OWES AT LEAST ONE TIME, not all of them: the blanks are the tens they did
  // not get, and what cannot be accepted is a partial with nothing filled in.
  const completeQ = (q, v) => {
    if (!v) return false;
    if (v === "yes" && (q.needs || []).some((n) => !minutesAt(q, n) || badTime(q, n))) return false;
    if (v === "partial" && (!(q.needs || []).some((n) => minutesAt(q, n))
      || (q.needs || []).some((n) => minutesAt(q, n) && badTime(q, n)))) return false;
    if (owesReason(q, v) && !reasonOf(q)) return false;
    return true;
  };

  const chosen = list.map((q) => ({ q, v: waiting?.has?.(q.id) ? null : valueFor(q) }));
  // WHAT ONE ANSWER SAYS ON ITS ONE LINE: the answer in their words, plus any
  // time they gave, as CLOCK TIMES rather than the digits somebody typed -
  // "Took it, 115" said nothing; "Took it, 1:15 PM" is the record.
  const sayOf = (q, v) => {
    const said = v ? label(q, v) : null;
    if (!said) return null;
    if (v !== "yes" && v !== "partial") return said;
    const times = (q.needs || [])
      .map((need) => {
        const m = minutesAt(q, need);
        return m ? formatTimeDisplay(m) : rawAt(q, need.slot);
      })
      .filter(Boolean);
    return times.length ? `${said}, ${times.join(", ")}` : said;
  };
  // and a finished day's line, which is its answers side by side
  const summaryFor = (date) => chosen
    .filter(({ q }) => q.date === date)
    .map(({ q, v }) => sayOf(q, v))
    .filter(Boolean)
    .join(" · ");
  // a day can only be finished with once every question on it has an answer and
  // whatever that answer owes
  const blockedOn = (date) => chosen
    .filter(({ q }) => q.date === date)
    .some(({ q, v }) => !completeQ(q, v));
  // what is on record as far as this tab knows: the hold counts as saved
  const onRecord = (q) => (held && q.id in held.picked ? held.picked[q.id] : savedValue(q));

  // HAS SOMETHING BEEN GIVEN THAT IS NOT ON RECORD - the answer, one of its
  // times, or its reason. A CLEARED ONE COUNTS - unclicking a saved answer has
  // to be able to take it off the record. A day with one possible answer is not
  // started until something is typed in its box, or every such day would count
  // as unsaved the moment the page opened.
  const savedMinAt = (q, need) => {
    const raw = savedAt(q, need.slot) || need.prefill || "";
    return raw ? parseLooseTime(raw, { assumeWorkday: true }) : null;
  };
  const dirtyQ = (q) => {
    if (waiting?.has?.(q.id) || held?.ids?.has?.(q.id)) return false;
    const v = valueFor(q);
    if (noRoom(q) && onRecord(q) == null && !String(reasons[q.id] ?? "").trim()) return false;
    if (v !== onRecord(q)) return true;
    if (!v) return false;
    if ((v === "yes" || v === "partial")
      && (q.needs || []).some((n) => n.slot in (times[q.id] || {}) && minutesAt(q, n) !== savedMinAt(q, n))) return true;
    if (owesReason(q, v) && q.id in reasons && reasonOf(q) !== String(reasonAlready(q) ?? "").trim()) return true;
    return false;
  };
  // "ready" to save, "incomplete" while a time or a reason is missing, or
  // nothing - untouched, already on record, or an answer being taken off,
  // which waits for its own button rather than going with Save and next
  const stateOf = (q) => {
    if (!dirtyQ(q)) return null;
    const v = valueFor(q);
    if (!v) return null;
    return completeQ(q, v) ? "ready" : "incomplete";
  };
  const dayState = (date) => {
    const states = list.filter((q) => q.date === date).map(stateOf);
    return states.includes("incomplete") ? "incomplete" : states.includes("ready") ? "ready" : null;
  };
  // on record and not being changed: the answer folds to its one line
  const isSettled = (q) => !waiting?.has?.(q.id) && onRecord(q) != null && !editing.has(q.id) && !dirtyQ(q);

  // SAVE THESE ANSWERS NOW - one from its own Save answer, or every finished
  // one on a day from Save and next. One write and one rebuild for however many
  // go together. Resolves true once they are on record, false if refused.
  function saveQs(qs) {
    if (!qs.length) return Promise.resolve(true);
    const ids = new Set(qs.map((q) => q.id));
    setErr(null);
    setSavingIds(ids);
    return new Promise((resolve) => start(async () => {
      const res = await submitAction({
        token,
        batch: qs.map((q) => {
          const v = valueFor(q);
          return {
            id: q.id,
            // null takes a saved answer off the record - see the clear branch in
            // answerTimesheetQuestion
            choice: v,
            // sent as HH:MM, the one shape the server parses. A "missed them"
            // sends none - there is nothing to say when about. A partial sends
            // only the slots they actually filled in.
            times:
              (v === "yes" || v === "partial") && q.needs?.length
                ? Object.fromEntries(
                  q.needs
                    .map((need) => [need.slot, minutesAt(q, need)])
                    .filter(([, m]) => m),
                )
                : null,
            // WHY, on the answer that IS the violation. The server re-checks this
            // against the question it re-derives, so a browser that skipped the
            // box still cannot save one.
            reason: owesReason(q, v) ? reasonOf(q) || null : null,
          };
        }),
      });
      setSavingIds(new Set());
      if (!res?.ok) {
        setErr({ ...(res || { error: "failed" }), ids });
        resolve(false);
        return;
      }
      setHeld((h) => ({
        picked: { ...(h?.picked || {}), ...Object.fromEntries(qs.map((q) => [q.id, valueFor(q)])) },
        ids: new Set([...(h?.ids || []), ...ids]),
        answersThen: h?.answersThen ?? answers,
      }));
      setEditing((e) => {
        const n = new Set(e);
        for (const id of ids) n.delete(id);
        return n;
      });
      router.refresh();
      resolve(true);
    }));
  }
  // every finished answer on a day, for Save and next
  const saveDay = (date) => saveQs(list.filter((q) => q.date === date && stateOf(q) === "ready"));

  // WHAT IS ACTUALLY MISSING ON THIS DAY, in a few words. Mánu 2026-08-11:
  // "for the first day, it should say no scheduled rest break with the hours",
  // and for 07/27 - which owes two tens and holds one - "rest break, one of two
  // missing". The row used to say "rest break · 6 hrs worked", which names the
  // subject but never the fault.
  //
  // Both numbers come off the slots the engine already built: `needs` is what is
  // still owed and `known` is what is already on record, so this cannot drift
  // from what the question goes on to ask for.
  const missingLabel = breakLabel;

  // WHAT IF THEY ONLY TOOK ONE OF THE TWO? Mánu 2026-08-11. It was yes-or-no,
  // so somebody who got one ten and worked through the other had to claim they
  // missed both or took both - and neither is true.
  //
  // The money does not change: one hour per workday on which a rest period was
  // not provided, so one of two is the same premium as none of two. What was
  // wrong was the RECORD, and the time for the ten they did get.
  const owedOn = (q) => (q.row?.part === "rest" ? (q.needs || []).length : 1);
  // the block's own title and the word its sentences use - his design,
  // 2026-09-08: the kind is the heading, the finding is the line under it.
  const titleFor = (q) => (q.row?.part === "meal" ? "Meal break" : owedOn(q) >= 2 ? "Rest breaks" : "Rest break");
  const partWord = (q) => (q.row?.part === "meal" ? "meal break" : owedOn(q) >= 2 ? "breaks" : "break");
  const optionsFor = (q) => {
    if (noRoom(q)) return ["no"];
    return owedOn(q) >= 2 ? ["yes", "partial", "no"] : ["yes", "no"];
  };
  // SIX HOURS OWES ONE TEN, AND THE BUTTON HAS TO SAY SO. Mánu 2026-08-11 on his
  // 07/16: "it should ask accurately depending on how many hours I worked." The
  // engine already derives it - `restRequired` is 1 that day and the slot is
  // named "Your ten" - but only the meal case was ever singularised, so a day
  // owed one rest still read "Took them".
  const label = (q, v) => {
    if (q.row?.part === "meal") return v === "yes" ? "Took it" : "Missed it";
    const one = owedOn(q) <= 1;
    if (v === "yes") return one ? "Took it" : "Took them";
    if (v === "no") return one ? "Missed it" : "Missed them";
    return owedOn(q) === 2 ? "Took one" : "Took some";
  };
  // WHAT A HALF GIVEN ANSWER STILL NEEDS, said once somebody tries to leave its
  // day - naming the other answer by the card's own word for it, so a day owed
  // two tens says "Missed them". A day with only one possible answer has no
  // other answer to name.
  const timeStillNeeded = (q) =>
    `Add the time your ${q.row?.part === "meal" ? "meal break" : "break"} started, or pick ${label(q, "no")}.`;
  const reasonStillNeeded = (q) => (noRoom(q)
    ? "Tell us why you missed it."
    : `Tell us why you missed ${q.row?.part === "meal" || owedOn(q) <= 1 ? "it" : "them"}, or pick ${label(q, "yes")}.`);

  // the yes/no pair for one decision. Lifted out of the row markup when the
  // split arrived, because a day can now show two of them.
  //
  // A SEGMENTED CONTROL, NOT THREE TINTED BOXES. It was a ring inside a border
  // inside a row that itself went red, so a chosen answer read as three nested
  // boxes and the red band ran the width of the row past the words it was
  // about. Mánu 2026-08-11: "fix the way the green and red boxes are over missed
  // it and took them." One outline, one filled segment, no row tint.
  //
  // CLICKING THE CHOSEN SEGMENT CLEARS IT, same as the single questions.
  // A ROW CAN BE LOCKED ON ITS OWN. The question that moves the hours covers
  // some of these dates and not others, so locking the whole card would hold up
  // nine days over three. Per row, per date.
  // CALLED, NOT MOUNTED - and named in lower camel case so it cannot be written
  // as <Toggle/> again. See the note on `renderTimes` below: both of these are
  // defined inside this component, so each render makes a new function, and a new
  // function used as a JSX type is a new component type that React unmounts and
  // rebuilds. Toggle holds only buttons so it never showed the damage; the time
  // box did.
  const renderToggle = ({ item: { q, v } }) => (
    waiting?.has?.(q.id) ? (
      <span className="text-xs text-muted">waiting on the question above</span>
    ) : noRoom(q) ? null : (
    // A SEGMENTED CONTROL, his rendition 2026-09-08 (superseding the chip
    // round from earlier the same day): quiet track, the picked answer as the
    // raised segment. The focus ring is OURS - Safari's system-accent ring on
    // a click was clashing with the control.
    // FULL WIDTH AND 44px ON A PHONE. This pair is the whole point of the page
    // and the two answers mean opposite things. Unchanged above sm, where a
    // pointer is doing the work.
    <span role="group" aria-label={`Did you take your ${partWord(q)}?`} className="inline-flex w-full gap-0.5 rounded-[8px] bg-fill p-[3px] sm:w-auto">
      {optionsFor(q).map((opt) => (
        <button
          key={opt}
          type="button"
          disabled={pending}
          aria-pressed={v === opt}
          onClick={() => {
            // a fresh pick is asked afresh, so an old "what is still missing" line goes
            setPicked((p) => ({ ...p, [q.id]: valueFor(q) === opt ? null : opt }));
          }}
          className={`min-h-11 flex-1 rounded-[6px] px-4 py-1.5 text-[13px] transition-colors focus:outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand disabled:opacity-50 sm:min-h-9 sm:flex-none ${
            v === opt
              ? "seg-on font-medium text-foreground"
              : "font-medium text-muted hover:text-foreground"
          }`}
        >
          {label(q, opt)}
        </button>
      ))}
    </span>
    )
  );

  // the times a "took them" owes. Now scoped to ONE part, so a both-day answered
  // "took my lunch, missed my tens" asks for one time and not three.
  // AS SOON AS ONE KEYSTROKE PARSED, THE FIELD WENT AWAY UNDER THE CURSOR.
  //
  // Mánu 2026-08-12: "as soon as i press one value (that works) it takes me out
  // of the typing option. Now imagine how that's annoying if you wanna type
  // three thirty." Typing "3" is a valid time, so `setAt` re-rendered the
  // provider - which rebuilt this function, which React read as a DIFFERENT
  // component type, which meant unmounting the subtree and mounting a fresh
  // <input>. A brand new DOM node has no focus, so "330" could never be typed:
  // the "3" landed and the box was gone before the rest of it.
  //
  // Called rather than mounted, so its JSX is inlined into the parent's tree and
  // there is no component type to compare. The lower-case name is the guard -
  // `{renderTimes({ q, v })}` is the only way to write it.
  //
  // It uses no hooks, which is what makes calling it legal. If one is ever
  // needed here, this has to be hoisted to module scope and read the context
  // instead - do NOT put it back to <TimesFor/>.
  // THE WHY, under the answer that IS the violation.
  //
  // It opens on a "no" and nowhere else. Not a second control beside the
  // question - they are already being asked "did you take your breaks?", and a
  // separate box would ask the same person the same thing twice on the same day,
  // writing to two tables. Saying no IS the violation, so the reason belongs on
  // it. Mánu 2026-08-14.
  //
  // The sentence comes from `employeeQuestion`, which already writes five of
  // them with the counts right - a missed lunch, one ten, neither of two, one of
  // two taken, a late meal - so nothing new is worded here.
  const renderReason = ({ q, v }) => {
    if (!owesReason(q, v)) return null;
    const said = reasonOf(q);
    const already = reasonAlready(q);
    const ask = employeeQuestion(
      q.kind === "mealLate"
        ? { kind: "meal-late" }
        : {
          kind: q.row?.part === "meal" ? "meal" : "rest",
          missingCount: q.row?.part === "meal" ? 1 : Math.max(1, (q.needs || []).length),
          takenCount: 0,
        },
      { lateMinutes: q.row?.lateMinutes ?? null },
    );
    // tried to leave the day with the box still empty
    const stillNeeded = !said && !!done?.attemptedOn?.(q.date);
    return (
      /* HIS MISSED LAYOUT, 2026-09-08: the why as its own section under a
         hairline - heading, the day named in the line under it, the label
         and the box. The engine's own placeholder stays; the precise ask
         sentence lives on in the sheet's record. */
      <div className="mt-6 border-t border-sep pt-6">
        <p className="text-base font-medium tracking-tight text-foreground">
          Why did you miss your {partWord(q)}?
        </p>
        <p className="mt-1 text-[13px] text-muted">
          Tell us what happened on {dayLong(q.date)}.
        </p>
        <label htmlFor={`reason-${q.id}`} className="mt-5 block text-[13px] font-medium text-foreground">Your reason</label>
        <textarea
          id={`reason-${q.id}`}
          rows={2}
          value={reasons[q.id] ?? already ?? ""}
          onChange={(e) => setReasons((r) => ({ ...r, [q.id]: e.target.value }))}
          placeholder={ask.placeholder}
          className={`mt-2 min-h-[5.5rem] w-full rounded-[9px] border bg-fill px-3 py-3 text-base text-foreground placeholder:text-faint focus:outline-2 focus:-outline-offset-1 focus:outline-brand sm:text-sm ${
            stillNeeded ? "border-amber-400 ring-1 ring-amber-400" : "border-border"
          }`}
        />
        {stillNeeded ? (
          <p className="mt-2 flex items-start gap-2 text-[13px] text-amber-700 dark:text-amber-300">
            <CircleAlert size={15} strokeWidth={1.8} aria-hidden="true" className="mt-0.5 flex-none" />
            {reasonStillNeeded(q)}
          </p>
        ) : !said && !(reasons[q.id] ?? "").trim() ? (
          <p className="mt-1.5 text-[12.5px] text-muted">
            Add a reason to complete this answer. It goes at the bottom of your timesheet.
          </p>
        ) : already ? (
          /* WHERE THE WORDS IN THE BOX CAME FROM. Without this an answer they
             gave on another question about the same day looks like something we
             filled in for them, which is the one thing a reason must not look
             like. Editing it replaces it; there is only ever one per day per
             break, however many questions ask about that day. */
          <p className="mt-1.5 text-[12.5px] text-muted">
            This is what you told us for {dayLong(q.date)} already. Change it here if it is not right.
          </p>
        ) : null}
      </div>
    );
  };

  const renderTimes = ({ q, v }) => {
    if ((v !== "yes" && v !== "partial") || !(q.needs || []).length) return null;
    const partial = v === "partial";
    const one = q.needs.length === 1 || partial;
    const oneWord = q.row?.part === "meal" ? "meal break" : one ? "break" : "breaks";
    const windows = q.needs.length === 1 ? (q.needs[0].window || []) : [];
    const stillOwed = !partial && q.needs.some((n) => !minutesAt(q, n));
    // tried to leave the day with a time still missing or wrong - every box on
    // a "took it", at least one on a partial
    const timeMissing = partial
      ? !q.needs.some((n) => minutesAt(q, n)) || q.needs.some((n) => minutesAt(q, n) && badTime(q, n))
      : q.needs.some((n) => !minutesAt(q, n) || badTime(q, n));
    const stillNeeded = timeMissing && !!done?.attemptedOn?.(q.date);
    return (
      /* HIS FOLLOW-UP LAYOUT, 2026-09-08: a section under a hairline - the
         question as its heading (no date; the day pane's heading names it),
         the worked spans, OUR loose-time boxes exactly as they were (his
         call), the fit-within sentence, then the two helper lines. */
      <div className="mt-6 border-t border-sep pt-6">
        <p className="text-base font-medium tracking-tight text-foreground">
          When did you take your {oneWord}?
        </p>
        {partial && (
          <p className="mt-1 text-[13px] text-muted">
            Fill in the {q.needs.length === 2 ? "one" : "ones"} you did get and leave the rest
            blank. The record will say which you had.
          </p>
        )}
        {/* the Worked spans line came off 2026-09-08, his call - the calendar
            above already draws every punched stretch, and the fit-within
            sentence below is the constraint that decides the answer (the
            window is a SUBSET of the worked day, so nothing binding is
            lost). */}
        {(q.needs[0]?.known || []).length > 0 && (
          <p className="mt-1 text-xs text-muted">
            Already on record:{" "}
            {q.needs[0].known.map((k, i) => (
              <span key={k.from}>
                {i > 0 ? ", " : ""}
                <b className="font-mono text-foreground">{k.from}</b>
                {/* saying WHERE it came from, or the card looks like it always
                    held a time the employee only just gave it */}
                {k.corrected ? " (as you corrected it above)" : ""}
              </span>
            ))}
            .
          </p>
        )}
        <div className="mt-5 space-y-2">
          {q.needs.map((need) => {
            const raw = rawAt(q, need.slot);
            const mins = minutesAt(q, need);
            const bad = badTime(q, need);
            return (
              <div key={need.slot} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] bg-fill px-3 py-4 sm:px-4">
                <span className="min-w-20 flex-1">
                  <label
                    htmlFor={`t-${q.id}-${need.slot}`}
                    className="block text-sm font-semibold text-foreground"
                  >
                    {/* "Start time", his call - a two-slot day keeps the
                        engine's labels so the boxes stay tellable apart */}
                    {q.needs.length === 1 ? "Start time" : need.label}
                  </label>
                  <span className="block text-[13px] text-muted">
                    {/* `mins` is "HH:MM", so the end is computed in minutes and
                        folded back - string + number was printing "01:3110" */}
                    {mins
                      ? need.minutes
                        ? `${formatTimeDisplay(mins)} – ${formatTimeDisplay(addMinutes(mins, need.minutes))}`
                        : formatTimeDisplay(mins)
                      : need.minutes ? `${need.minutes} minutes` : ""}
                  </span>
                </span>
                <input
                  id={`t-${q.id}-${need.slot}`}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={pending}
                  value={raw || (need.prefill && !(q.id in times && need.slot in (times[q.id] || {})) ? need.prefill : raw)}
                  onChange={(e) => setAt(q, need.slot, e.target.value)}
                  className={`w-32 rounded-[9px] border bg-surface px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-faint focus:outline-2 focus:-outline-offset-1 focus:outline-brand ${
                    bad ? "border-rose-400"
                      : mins ? "border-emerald-400/80"
                        : stillNeeded ? "border-amber-400 ring-1 ring-amber-400" : "border-border"
                  }`}
                />
                {false && need.suggest && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setAt(q, need.slot, need.suggest)}
                    className="rounded-full border border-dashed border-border-strong px-3 py-1 text-xs text-brand transition hover:border-solid"
                  >
                    use {need.suggest}
                  </button>
                )}
                <span className={`empty:hidden w-full text-xs ${bad ? "text-rose-600 dark:text-rose-400" : "text-muted"}`}>
                  {bad === "outside"
                    ? "that is not inside any shift you worked that day"
                    : bad === "window"
                      ? `that has to be inside ${(need.window || []).join(" or ")}`
                      // a lunch outside its gaps: the hint already names them.
                      // one box keeps it in the line under the card, below
                      : bad === "lunch"
                        ? q.needs.length === 1 ? null : need.hint
                        : mins ? null : q.needs.length === 1 ? null : need.hint}
                </span>
              </div>
            );
          })}
        </div>
        {/* the constraint as a sentence under the box when there is one slot -
            with two slots each row keeps its own inline hint above */}
        {q.needs.length === 1 && (
          windows.length > 0 ? (
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Your break must fit within{" "}
              {windows.map((w, i) => (
                <span key={w}>
                  {i > 0 ? " or " : ""}
                  <b className="font-medium tabular-nums text-foreground">{w}</b>
                </span>
              ))}
              .
            </p>
          ) : q.needs[0].hint ? (
            // red while the time typed sits outside the gaps it names
            <p className={`mt-2 text-[13px] ${badTime(q, q.needs[0]) === "lunch" ? "text-rose-600 dark:text-rose-400" : "text-muted"}`}>
              {q.needs[0].hint}
            </p>
          ) : null
        )}
        {/* WHAT IS STILL MISSING, in amber, once somebody has tried to leave the
            day without it - and the quiet line before that */}
        {stillNeeded ? (
          <p className="mt-3 flex items-start gap-2 text-[13px] text-amber-700 dark:text-amber-300">
            <Clock3 size={15} strokeWidth={1.8} aria-hidden="true" className="mt-0.5 flex-none" />
            {timeStillNeeded(q)}
          </p>
        ) : stillOwed || q.needs.some((n) => badTime(q, n)) ? (
          <p className="mt-6 text-xs text-muted">Enter the start time to complete this answer.</p>
        ) : null}
      </div>
    );
  };

  // SAVE ANSWER, UNDER THE ANSWER. Only once it is complete and not already on
  // record - see `completeQ` and `dirtyQ` - and a saved answer being taken off
  // gets its own sentence and button instead, because undoing an answer is not
  // giving one. A refusal shows under the answer it was about.
  const renderSave = ({ q, v }) => {
    if (waiting?.has?.(q.id)) return null;
    const saving = savingIds.has(q.id);
    const refused = err?.ids?.has?.(q.id) ? <Refusal err={err} /> : null;
    if (!v && onRecord(q) != null && dirtyQ(q)) {
      return (
        <div className="mt-5 rounded-xl bg-fill p-3.5">
          <p className="text-sm text-muted">
            This goes back to unanswered, and your timesheet goes back to what it said before. You can answer it again any time.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => saveQs([q])}
            className="mt-2.5 rounded-[9px] border border-border-strong px-4 py-2 text-[13.5px] font-semibold text-foreground disabled:opacity-50"
          >
            {saving ? "Saving…" : "Take it off"}
          </button>
          {refused}
        </div>
      );
    }
    if (!dirtyQ(q) || !completeQ(q, v)) return refused;
    return (
      <div className="mt-5">
        <button
          type="button"
          disabled={pending}
          onClick={() => saveQs([q])}
          className="rounded-[9px] bg-brand px-4 py-2 text-[13.5px] font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-50 max-sm:w-full max-sm:py-3"
        >
          {saving ? "Saving…" : "Save answer"}
        </button>
        {refused}
      </div>
    );
  };

  // A SAVED ANSWER, FOLDED TO ITS ONE LINE: what they said, Change this to open
  // it again, and the line every saved answer carries.
  const renderSaved = ({ q, v }) => (
    <div className="mt-4 rounded-xl bg-fill px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="flex min-w-0 items-center gap-2 text-[15px] font-medium text-foreground">
          <CircleCheck size={16} strokeWidth={1.8} aria-hidden="true" className="flex-none text-emerald-500" />
          {sayOf(q, v)}
        </span>
        <button
          type="button"
          onClick={() => setEditing((e) => new Set(e).add(q.id))}
          className="rounded-[9px] px-2 py-1 text-[13px] font-medium text-muted transition-colors hover:bg-fill focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
        >
          Change this
        </button>
      </div>
      <p className="mt-1 pl-6 text-xs text-muted">Saved. You can change it any time before you sign.</p>
    </div>
  );

  // one entry per DAY, carrying its one or two decisions. The card stays a list
  // of days; only a day short both grows a second row.
  //
  // KEYED ON THE DATE, NOT ON THE ONE BEFORE IT. This merged with the PREVIOUS
  // entry only, which assumed a day's two questions always arrive together -
  // and `list` is not in date order. An answered question sorts after every
  // open one, so a day short both a lunch and its tens splits the moment ONE of
  // them is answered: Uribe's 07/28 sat at index 6 with its meal and index 12
  // with its rest.
  //
  // Two entries with one date is two <li> keyed "07/28/26", which React warns
  // about and may duplicate or drop on the next update - and the day rendered
  // as two separate rows instead of the one row reading "2 to answer", which is
  // what every other doubled day shows. Found 2026-08-25 on his own sheet.
  const byDay = [];
  const dayAt = new Map();
  for (const item of chosen) {
    const at = dayAt.get(item.q.date);
    if (at != null) byDay[at].items.push(item);
    else {
      dayAt.set(item.q.date, byDay.length);
      byDay.push({ date: item.q.date, hours: item.q.row?.hours, items: [item] });
    }
  }

  return (
    <BatchCtx.Provider
      value={{
        renderToggle, renderTimes, renderReason, renderSave, renderSaved, isSettled,
        missingLabel, noRoom, titleFor, partWord, byDay, list, copy,
        blockedOn,
        summaryFor,
      }}
    >
      {/* each day's answers started and not saved, reported up so the day's
          Save and next can save them in one write */}
      {byDay.map(({ date }) => (
        <PendingReporter
          key={date}
          id={`batch|${date}`}
          date={date}
          state={dayState(date)}
          save={() => saveDay(date)}
        />
      ))}
      {children}
    </BatchCtx.Provider>
  );
}

// THE DAY ROWS. `dates` narrows them to one day so "Day by day" can put each
// day's decision beside that day's calendar; left out, every day renders in one
// list, which is what the "All questions" card has always shown.
export function BatchDays({ dates }) {
  const ctx = useContext(BatchCtx);
  if (!ctx) return null;
  const {
    renderToggle, renderTimes, renderReason, renderSave, renderSaved, isSettled, missingLabel, noRoom, titleFor,
  } = ctx;
  const byDay = dates ? ctx.byDay.filter((d) => dates.includes(d.date)) : ctx.byDay;
  if (!byDay.length) return null;

  return (
    <>
      {/* NO "SAME ANSWER FOR EVERY DAY" ANY MORE. Mánu 2026-08-10 asked for it to
          go, so each day is answered deliberately. Worth remembering what it
          actually removed: "took them all" never skipped the times, so it cost
          the honest path almost nothing - but "missed them all" was a single tap
          to the full premium, and that is now nine to thirteen. The friction
          landed on the answer that pays people, which was raised before it was
          built and is his call. */}
      <ul className="mt-2 divide-y divide-sep">
        {byDay.map(({ date, items }) => (
          /* ONE TITLED SECTION PER DECISION, his design 2026-09-08: the kind
             as the heading ("Rest break"), the finding under it, the
             segmented answer on the right, the follow-ups below. A day short
             both a lunch and its tens is two sections in the same li.
             ANCHORED, so the missing-times warning can send somebody here.
             Digits only: "07/16/26" carries slashes, not valid in an id. */
          <li key={date} id={dayAnchorId(date)} className="scroll-mt-24">
            {items.map((item) => {
              const { q } = item;
              // on record and not being changed: the one line and Change this
              const settled = isSettled(q);
              return (
                <div key={q.id} className="border-t border-sep py-6 first:border-t-0 first:pt-3 last:pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-4">
                    <div className="min-w-0">
                      <p className="text-[22px] font-semibold leading-tight tracking-tight text-foreground">
                        {titleFor(q)}
                      </p>
                      <p className="mt-1 text-[13px] text-muted">{missingLabel(q)}.</p>
                      {/* WHY THERE IS NO CONTROL, next to the finding rather
                          than stranded in the control's slot. */}
                      {noRoom(q) && !settled && (
                        <p className="mt-0.5 text-[13px] text-muted">
                          There is no gap in this day long enough to have taken one.
                        </p>
                      )}
                    </div>
                    {!settled && renderToggle({ item })}
                  </div>
                  {settled ? renderSaved(item) : (
                    <>
                      {renderTimes(item)}
                      {renderReason(item)}
                      {renderSave(item)}
                    </>
                  )}
                </div>
              );
            })}
          </li>
        ))}
      </ul>
    </>
  );
}

// "13:31" + 10 -> "13:41", for reading a break's span back
const addMinutes = (hhmm, add) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const t = h * 60 + m + (add || 0);
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

// and the long form for a sentence: "Thursday, July 16"
const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const dayLong = (date) => {
  const [m, d, y] = String(date || "").split("/").map(Number);
  if (!m || !d || !y) return date;
  const at = new Date(2000 + y, m - 1, d);
  return `${DAY_FULL[at.getDay()]}, ${MONTH_FULL[m - 1]} ${d}`;
};

// WHERE A DAY ROW LIVES IN THE BATCHED CARD. Digits only - "07/16/26" carries
// slashes, which are not valid in an id.
const dayAnchorId = (date) => `break-day-${String(date || "").replace(/[^0-9]/g, "")}`;

export default function TimesheetQuestion({
  token, questions, answers, partials, answerTimes, choices, waiting, disturbs, standing, submitAction,
  terse,
  // the reasons already written for this period, by finding key, so no card asks
  // twice for one day's break - see `saidAlready` in OneQuestion
  reasonsOnRecord = null,
}) {
  const list = questions || [];
  if (!list.length) return null;
  const head = list[0];
  const c = copyFor(head, standing);
  if (!c) return null;

  const allAnswered = list.every((q) => answers?.[q.id]);
  const anyDeclined = list.some((q) => answers?.[q.id] === "declined");
  // amber while we are still asking, RED once an answer has put money on, plain
  // once every answer has left the figures alone. This had the last two the
  // wrong way round: a card where somebody reported twelve missed breaks went
  // green, which reads as "all settled, nothing owed".
  const tone = !allAnswered
    ? "amber-tint-card shadow-sm night:ring-1 night:ring-border"
    : anyDeclined
      ? "bg-rose-500/10 shadow-sm night:ring-1 night:ring-border"
      : "bg-surface shadow-sm night:ring-1 night:ring-border";
  // a BATCH kind is answered day by day and committed in one go - see BatchCard.
  const batched = !!head.batch;
  // more than one question in a card means each one is its own pay decision and
  // gets its own date heading and its own confirm
  const perDay = !batched && list.length > 1;

  if (batched) {
    return (
      <div className={`mt-5 rounded-xl p-5 ${tone}`}>
        {c.title && <p className="text-base font-semibold text-foreground">{c.title}</p>}
        {c.body && <p className="mt-2 text-sm leading-relaxed text-muted">{c.body}</p>}
        {/* `answerTimes` matters as much as `answers` here. Without it the
            card cannot tell a day that was answered and SAVED from one that
            was never filled in, and asks for the times again - see `savedAt`. */}
        <BatchProvider
          partials={partials}
          waiting={waiting}
          token={token}
          list={list}
          answers={answers}
          answerTimes={answerTimes}
          standing={standing}
          submitAction={submitAction}
          reasonsOnRecord={reasonsOnRecord}
          copy={c}
        >
          <BatchDays />
        </BatchProvider>
      </div>
    );
  }

  // THE SIMPLE VIEW NAMES THE FAULT AND STOPS. Mánu 2026-08-11: "we don't have
  // to over explain for the day by day view because this is the simple view. It
  // can just say rest taken after shift time. Correct? Then I'll fix it."
  //
  // So no body, no evidence block, no footnote and no reasoning under the
  // options - the day's own calendar is sitting beside this saying where the
  // break landed, which is what the paragraph was for. The dates stay when the
  // card covers more than the day it is filed under, because a question that
  // silently answers for two other days should say so. Everything it writes is
  // identical to the long card; only the words around it are gone.
  if (terse) {
    return (
      <div className="mt-3 border-l-2 border-amber-400/70 pl-3.5 dark:border-amber-600/60">
        <p className="text-sm font-semibold text-foreground">{c.short || c.title}</p>
        {c.dates?.length > 1 && (
          <p className="mt-1 font-mono text-xs text-muted">{c.dates.join("  ")}</p>
        )}
        {/* WHAT IT LOOKS LIKE, AND WHAT WE MADE OF IT. Two lines rather than the
            long card's paragraphs, but the same pair of facts - a question that
            asks you to confirm a time has to show you the time. Our own reading
            is marked, because "we think" is a proposal and the record is not. */}
        {head.kind === "duplicateDay" ? (
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            The {head.row.copies === 2 ? "two" : head.row.copies} entries add up to <span className={reviewStyles.hours}>{Number(head.row.hours).toFixed(2)} hours</span>.
            {" "}Worked once, this shift is <span className={reviewStyles.hours}>{Number(head.row.single).toFixed(2)} hours</span>.
          </p>
        ) : c.facts?.length > 0 && (
          <dl className="mt-1.5 space-y-0.5">
            {c.facts.map((f) => (
              <div key={`${f.label}-${f.value}`} className="flex gap-2 text-xs leading-5">
                <dt className="w-24 flex-none text-muted">{f.label}</dt>
                <dd
                  className={`font-mono ${
                    f.ours ? "font-semibold text-foreground" : "text-foreground"
                  }`}
                >
                  {f.value}
                  {f.aside && (
                    <span className="ml-2 font-sans font-semibold text-rose-700 dark:text-rose-400">
                      {f.aside}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {c.rule && (
          <p className="mt-1.5 text-xs leading-5 text-muted">{c.rule}</p>
        )}
        {/* THE QUESTION ITSELF, where a card puts one to them in so many
            words, set as the thing being answered rather than as a note */}
        {c.ask && (
          <p className="mt-2 text-sm font-semibold leading-snug text-foreground">{c.ask}</p>
        )}
        <div className={perDay ? "mt-2" : ""}>
          {list.map((q) => (
            <OneQuestion
              key={q.id}
              token={token}
              q={q}
              answer={answers?.[q.id] || null}
              answerHasTimes={!!partials?.[q.id]}
              answerTimes={answerTimes?.[q.id] || null}
              savedChoice={choices?.[q.id] || null}
              locked={waiting?.has?.(q.id)}
              disturbCount={(disturbs?.[q.id] || []).length}
              standing={standing}
              submitAction={submitAction}
              reasonsOnRecord={reasonsOnRecord}
              showDate={perDay}
              terse
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`mt-5 rounded-xl p-5 ${tone}`}>
      <p className="text-base font-semibold text-foreground">{c.title}</p>
      {/* THE EXPLANATION IS FOR SOMEBODY DECIDING. Once they have, it is just
          height between them and the rest of their timesheet - and the answered
          card below carries "Change this" to bring the question back. */}
      {!perDay && !allAnswered && <p className="mt-2 text-sm leading-relaxed text-muted">{c.body}</p>}
      {/* THE RULE, on the long card as well as the terse one. Same sentence in
          both, so somebody switching views is not told two different things
          about the same day. */}
      {c.rule && !allAnswered && (
        <p className="mt-2 text-sm leading-relaxed text-muted">{c.rule}</p>
      )}
      {c.ask && !allAnswered && (
        <p className="mt-2 text-sm font-semibold leading-snug text-foreground">{c.ask}</p>
      )}
      {perDay && (
        <p className="mt-2 text-sm leading-relaxed text-muted">
          There {list.length === 2 ? "are two of these" : `are ${list.length} of these`} on your
          timesheet. Each one is a separate day and a separate hour, so they are asked one at a
          time.
        </p>
      )}

      {c.dates && !allAnswered && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {c.dates.map((d) => (
            <span
              key={d}
              className="rounded-md border border-border-strong bg-surface-2 px-2 py-1 font-mono text-xs text-muted"
            >
              {d}
            </span>
          ))}
        </div>
      )}

      {c.evidence && !perDay && !allAnswered && (
        <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3 font-mono text-xs leading-relaxed text-muted">
          {c.evidence.map((line, i) => <p key={i}>{line}</p>)}
        </div>
      )}

      <div className={perDay ? "mt-4" : ""}>
        {list.map((q) => (
          <OneQuestion
            key={q.id}
            token={token}
            q={q}
            answer={answers?.[q.id] || null}
            answerHasTimes={!!partials?.[q.id]}
            answerTimes={answerTimes?.[q.id] || null}
            savedChoice={choices?.[q.id] || null}
            locked={waiting?.has?.(q.id)}
            disturbCount={(disturbs?.[q.id] || []).length}
            standing={standing}
            submitAction={submitAction}
            reasonsOnRecord={reasonsOnRecord}
            showDate={perDay}
          />
        ))}
      </div>

      {!allAnswered && <p className="mt-3 border-l-2 border-border-strong pl-3 text-sm text-muted">{c.footnote}</p>}
    </div>
  );
}
