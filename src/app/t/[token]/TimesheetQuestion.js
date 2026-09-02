"use client";

// The questions an employee answers before they can sign.
//
// ONE CARD PER KIND, not per row. April Martinez has eleven identical entries
// and eleven cards would be unusable; a kind that is one habit gets one card
// with its dates listed. A kind where each day is a separate hour of somebody's
// money gets one card with a row PER DAY - Hernadez's two thirty minute
// entries, answered separately inside the same card. Mánu 2026-08-09.
//
// NOTHING IS PRE-SELECTED and NOTHING SUBMITS ON THE FIRST CLICK. Every answer
// stages, then a confirm panel spells out what it will do. That was already
// true of the rest-repair card and it is more true here, because two of these
// five arrive with the correction already applied and declining is what moves
// the money.
//
// COLOUR CARRIES THE SAME MEANING AS THE SHEET: amber while we are still asking,
// green once an answer has left the figures alone, plain once it has not.
import { createContext, useContext, useEffect, useState, useTransition, Fragment } from "react";
import { useRouter } from "next/navigation";
import { parseLooseTime, formatTimeDisplay, spokenTime } from "@/lib/loose-time";
// the five sentences, already written and already counting correctly - see the
// note on `renderReason`. Client-safe: break-answers.js imports nothing.
import {
  employeeQuestion, reasonOwedOn, reasonSlotFor, breakFindingKey,
} from "@/lib/timesheet/break-answers";
import { useStagedPublisher } from "./StagedTimes";

// THE BATCH ANSWER, SHARED SO ITS ROWS CAN BE SPLIT ACROSS THE PAGE.
//
// A batched kind is many days answered separately and committed ONCE - see
// BatchProvider. "Day by day" needs each of those days to sit beside its own
// calendar, which means the rows can no longer live inside one card, but they
// still have to share one set of staged answers and one confirm. So the state
// moved up into a provider and the two pieces that draw it - BatchDays and
// BatchConfirm - read it from here.
//
// Both views mount exactly one provider, so there is still one staged answer
// and one commit however the rows are arranged.
const BatchCtx = createContext(null);

// DAYS SOMEBODY HAS FINISHED WITH.
//
// This started inside `BatchProvider`, which meant only a day carrying a batched
// breaks question could ever be marked done - a day whose only item was a Misc
// question, a late lunch or an off-clock rest had no way to be closed at all.
// Mánu 2026-08-15: all cards need it. So it owns its own context, wrapping every
// day rather than only the batched ones.
//
// STILL NOT A SAVE. A plain card writes on its own confirm; the batched card
// writes once at the bottom. This is neither - it is the person saying they are
// through with the day, which collapses it and lets the panel count it.
const DayDoneCtx = createContext(null);

export function DayDoneProvider({ children }) {
  const [ready, setReady] = useState(() => new Set());
  return (
    <DayDoneCtx.Provider
      value={{
        ready,
        readyOn: (date) => ready.has(date),
        markReady: (date) => setReady((r) => new Set(r).add(date)),
        unmarkReady: (date) => setReady((r) => { const n = new Set(r); n.delete(date); return n; }),
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
export function DayDoneButton({ date, plainBlocked = false }) {
  const done = useContext(DayDoneCtx);
  const batch = useContext(BatchCtx);
  if (!done) return null;
  if (done.readyOn(date)) return null;
  const hasBatchRow = !!batch?.byDay?.some?.((d) => d.date === date);
  const blocked = plainBlocked || (hasBatchRow && batch.blockedOn(date));
  if (blocked) {
    return (
      <p className="mt-3 text-xs text-muted">Answer everything on this day to finish with it.</p>
    );
  }
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => done.markReady(date)}
        className="rounded-lg border border-border-strong bg-surface-2 px-3 py-1.5 text-sm font-semibold text-foreground transition hover:border-brand hover:text-brand"
      >
        Done with this day
      </button>
    </div>
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

    // THE SCHEDULE BOOKED A LUNCH TOO SHORT TO BE ONE.
    //
    // Mánu 2026-08-26: "for the short lunches it should be counted the same way
    // lunches are counted when they are overlapping." So this is `mealInShift`
    // with one fact swapped - there the block sat inside a shift, here it is
    // simply not long enough - and it carries the same single option for the
    // same reason: there is no second true answer to give.
    //
    // IT DOES NOT ACCUSE THEM OF ANYTHING. The roster is what was short. The
    // rule line says so before the option does.
    case "mealShort":
      return {
        title: "Your meal break is booked for less than thirty minutes",
        short: "Meal booked under thirty minutes",
        rule: q.row?.eaten
          ? "A meal break has to be thirty minutes clear of work. Your "
            + `${q.row?.service || "shift"} runs ${q.row?.eaten} minutes into this one, which `
            + `leaves ${q.row?.minutes}. Your schedule needs the two moved apart.`
          : "A meal break has to be thirty minutes. Your schedule books this one for "
            + `${q.row?.minutes} minutes, so it is not a meal break. Your schedule needs it `
            + "lengthened.",
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
            <br /><br />
            A meal break has to be thirty minutes clear of work, so this one is not a break you
            could have taken. What needs fixing is the schedule.
          </>
        ),
        // ONE OPTION, exactly like the booked-inside-a-shift card above.
        no: {
          label: "I understand, I did not get a meal break that day",
          why: "Your record says the meal break was missed, with your reason on it.",
        },
        noEffect: <>Your record says the meal break was missed, with your reason on it.</>,
      };

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
  reported: "You have told us something is wrong with this timesheet, so it is with payroll and answers are on hold.",
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
    <div className="mt-3 rounded-lg border border-rose-400/70 bg-rose-500/10 p-3">
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

function Choice({ on, tone, label, why, note, onClick, busy }) {
  // ONE COLOUR FOR EVERY OPTION, 2026-08-14. Green for yes and red for no was
  // deliberate - the same language the timesheet itself uses, green for a
  // settled day and red for one that owes something - and it was reversed
  // because telling us you missed twelve breaks turned the card green.
  //
  // It goes because the colour is an OPINION about the answer, shown before
  // anybody has finished giving it. `tone` is still passed and still says
  // which is which; nothing reads it here any more.
  const ring = on
    ? "border-2 border-brand bg-brand/10"
    : "border border-border-strong bg-surface-2 hover:border-brand";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={on}
      className={`flex-1 basis-60 rounded-lg p-3 text-left transition disabled:opacity-60 ${ring}`}
    >
      <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span
          aria-hidden="true"
          className={`h-3.5 w-3.5 flex-none rounded-full border-2 ${
            on ? "border-brand bg-brand" : "border-border-strong"
          }`}
        />
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

  const answered = answer === "accepted" || answer === "declined";
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
  // EVERY slot has to be readable, not just the first. Each one is a separate
  // day's break and the sheet redraws all of them.
  const timeBlocked = timeRequired
    ? slots.some((need) => !slotMin(need))
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

  function commit() {
    if (!proposed || timeBlocked || reasonBlocked || blockBlocked) return;
    setErr(null);
    start(async () => {
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
      if (!res?.ok) setErr(res || { error: "failed" });
      else { setProposed(null); setAt(""); setSlotAt({}); setReason(null); setBlock(""); setEditing(false); router.refresh(); }
    });
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
            {answer === "accepted" ? "thank you." : "your timesheet has been rebuilt."}
          </p>
          {/* what is still theirs to do once the answer is in - see `afterYes` */}
          {answer === "accepted" && c.afterYes && (
            <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-700/70 dark:bg-amber-950/30">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                {c.afterYes.title}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-amber-800 dark:text-amber-300">
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
            <div className="mt-2 rounded-lg border-2 border-amber-500 bg-amber-500/10 p-3">
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
      <div className="mt-3 flex flex-wrap gap-2.5">
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
        <div className="mt-3 rounded-lg border border-border-strong bg-surface-2 p-3">
          <p className="text-sm font-semibold text-foreground">{c.timeLabel}</p>
          <p className="mt-1 text-xs text-muted">
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
                      placeholder="e.g. 331 for 3:31"
                      className={`w-36 rounded-lg border bg-surface px-3 py-2 text-sm text-foreground ${
                        mins ? "border-emerald-500" : raw.trim() ? "border-rose-500" : "border-amber-500/70"
                      }`}
                    />
                    {!mins && need.suggest && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setSlotAt((t) => ({ ...t, [need.slot]: need.suggest }))}
                        className="rounded-lg border border-border-strong px-3 py-2 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
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
                          className="rounded-lg border border-border-strong px-3 py-2 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
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
                placeholder="e.g. 331 for 3:31"
                className={`w-40 rounded-lg border bg-surface px-3 py-2 text-sm text-foreground ${
                  at.trim() && !typedHHMM ? "border-rose-500" : "border-border-strong"
                }`}
              />
              {suggestion && !at.trim() && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setAt(suggestion)}
                  className="rounded-lg border border-border-strong px-3 py-2 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
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
        <div className="mt-3 rounded-lg border border-border-strong bg-surface-2 p-3">
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
            className={`mt-2 w-48 rounded-lg border bg-surface px-3 py-2 text-sm text-foreground ${
              block.trim() ? "border-emerald-500" : "border-amber-500/70"
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
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-700/70 dark:bg-amber-950/30">
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
              This is what you told us for {q.date} already. Change it here if it is not right.
            </p>
          ) : null}
        </div>
      )}

      {/* the panel takes the colour of the answer it is about to write, so the
          last thing somebody reads before committing is the same green or red
          they just clicked. */}
      {proposed && (
        <div className={`mt-3 rounded-lg border-2 p-4 ${
          // one colour whichever way they answered - see the note on `Choice`.
          // Taking an answer OFF keeps its own grey, because that is not an
          // answer, it is undoing one.
          proposed.choice === null
            ? "border-border-strong bg-surface-2"
            : "border-brand bg-brand/10"
        }`}>
          <p className="text-base font-semibold text-foreground">
            {proposed.choice === null ? "Take your answer off?" : "Are you sure you want to confirm?"}
          </p>
          <div className="mt-2 space-y-1.5 text-sm text-muted">
            <p>
              {proposed.choice === "yes" ? c.yesEffect
                : proposed.choice === "no" ? c.noEffect
                  : proposed.choice === c.third?.value ? c.thirdEffect
                    : proposed.choice === c.fourth?.value ? c.fourthEffect
                      : <>This goes back to unanswered, and your timesheet goes back to what it said before. You can answer it again any time.</>}
            </p>
            {needsTime && !slots.length && typedHHMM && (
              <p>
                The sheet will show <b className="text-foreground">{formatTimeDisplay(typedHHMM)}</b>,
                and say it came from you rather than from the break record.
              </p>
            )}
            {needsTime && slots.length > 0 && !timeBlocked && (
              <p>
                Your sheet will show{" "}
                {slots.map((need, i) => (
                  <span key={need.slot}>
                    {i > 0 ? ", " : ""}
                    <b className="text-foreground">{need.date} at {formatTimeDisplay(slotMin(need))}</b>
                  </span>
                ))}
                , and say the times came from you rather than from the break record.
              </p>
            )}
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
            {timeBlocked && (
              <p className="font-semibold text-rose-600 dark:text-rose-400">
                {slots.length > 0
                  ? `Put a time in for ${slots.filter((n) => !slotMin(n)).map((n) => n.date).join(", ")} above first.`
                  : timeRequired && !at.trim()
                    ? "Put the time in above first."
                    : "That time cannot be read - check it above."}
              </p>
            )}
            <p className="text-xs">You can change your answer any time before you sign.</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2.5">
            <button
              type="button"
              disabled={pending || timeBlocked}
              onClick={commit}
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                "bg-brand"
              }`}
            >
              {proposed.choice === null ? "Take it off" : "Yes, confirm"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setProposed(null)}
              className="rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-foreground disabled:opacity-50"
            >
              Go back
            </button>
          </div>
        </div>
      )}

      {pending && <p className="mt-3 text-sm text-muted">Saving your answer…</p>}
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
export function DayShell({ date, hours, summary = null, children }) {
  const done = useContext(DayDoneCtx);
  const ctx = useContext(BatchCtx);
  if (!done?.readyOn?.(date)) return children;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <span className="min-w-0">
        <span className="font-mono text-sm font-semibold text-foreground">{date}</span>
        <span className="ml-3 text-sm text-emerald-700 dark:text-emerald-400">
          {[ctx?.summaryFor?.(date), summary].filter(Boolean).join(" · ") || "Answered"}
        </span>
        {hours != null && (
          <span className="ml-3 text-xs text-muted">{hours} hrs</span>
        )}
      </span>
      <button
        type="button"
        onClick={() => done.unmarkReady(date)}
        className="rounded-lg border border-border-strong px-3 py-1 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
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
  const [err, setErr] = useState(null);
  const [picked, setPicked] = useState({});
  // WHY THEY MISSED IT, one per question. Required on a "no" - Mánu 2026-08-14 -
  // because a "no" IS the violation and the why is the one half no QSP export
  // has a field for. Leaving the whole question alone is still fine and still
  // keeps the pay; this only bites once somebody says they missed something.
  const [reasons, setReasons] = useState({});
  // { [questionId]: { [slot]: "raw text the person typed" } }
  const [times, setTimes] = useState({});
  const [confirming, setConfirming] = useState(false);
  // DAYS THEY HAVE FINISHED WITH.
  //
  // NOT A SAVE. The card still commits every day in one write at the end - see
  // the note on `batch` in the engine, and Ford, who that design exists for.
  // This is the person saying "I am done with this one", which collapses the day
  // and lets the panel at the top count it.
  //
  // The distinction matters and the page says it out loud: a ready day is typed
  // in, a saved one is on record, and the confirm at the bottom is what moves
  // one to the other.
  const [ready, setReady] = useState(() => new Set());

  const base = standing?.charged || 0;
  const answeredAll = list.every((q) => answers?.[q.id]);
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
    return q.id in picked ? picked[q.id] : savedValue(q);
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
  const min = (t) => parseLooseTime(t, { assumeWorkday: true });
  const badTime = (q, need) => {
    if (need.kindOf !== "rest") return null;
    const m = minutesAt(q, need);
    if (m == null) return null;
    const spans = (need.shifts || [])
      .map((x) => x.split("-"))
      .map(([a, b]) => [min(a), min(b)])
      .filter(([a, b]) => a != null && b != null);
    if (spans.length && !spans.some(([a, b]) => m >= a && m + (need.minutes || 10) <= b)) {
      return "outside";
    }
    const windows = (need.window || [])
      .map((x) => x.split("-"))
      .map(([a, b]) => [min(a), min(b)])
      .filter(([a, b]) => a != null && b != null);
    if (windows.length && !windows.some(([a, b]) => m >= a && m + (need.minutes || 10) <= b)) {
      return "window";
    }
    return null;
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
  const missingReasons = list.reduce(
    (n, q) => n + (owesReason(q, valueFor(q)) && !reasonOf(q) ? 1 : 0),
    0,
  );

  // EVERY DAY ANSWERED "took them" OWES ITS TIMES. Mánu 2026-08-10: required,
  // "because we need a record of this". A day answered "missed them" owes none -
  // there is nothing to say when about.
  // AND WHICH DAYS THEY ARE ON, which is the whole difference between a warning
  // and an instruction.
  //
  // This counted and stopped. Mánu 2026-08-17 answered every day on his own
  // sheet, pressed save, and got "12 times still to fill in" with no way to
  // find one of them - on a card that can run to thirteen days. The single-card
  // version of this warning has named its dates all along ("Put a time in for
  // 07/20 above first"); the BATCHED one, the only one where hunting is
  // actually hard, was the one that did not.
  //
  // A Map keyed on the date, so two missing tens on one day are one place to go
  // rather than two identical chips.
  const missingByDate = new Map();
  const noteMissing = (date) => {
    if (!date) return;
    missingByDate.set(date, (missingByDate.get(date) || 0) + 1);
  };
  for (const q of list) {
    const v = valueFor(q);
    if (v === "yes") {
      for (const need of q.needs || []) {
        if (!minutesAt(q, need) || badTime(q, need)) noteMissing(need.date || q.date);
      }
    } else if (v === "partial") {
      // A PARTIAL OWES AT LEAST ONE TIME, not all of them. They are telling us
      // they got some of their tens and not the others, so the blanks are the
      // point - what we cannot accept is a partial with nothing filled in at all.
      if (!(q.needs || []).some((need) => minutesAt(q, need))) noteMissing(q.date);
    }
  }
  const missingTimes = [...missingByDate.values()].reduce((n, x) => n + x, 0);
  const missingTimeDates = [...missingByDate.keys()];

  const chosen = list.map((q) => ({ q, v: waiting?.has?.(q.id) ? null : valueFor(q) }));
  // A PARTIAL COUNTS AS MISSED FOR THE MONEY. One hour per workday on which a
  // rest period was not provided, per UPS v. Superior Court - so one of two
  // tens is exactly as much premium as none of two. What differs is the record,
  // and the time they give for the one they did get.
  const missed = chosen.filter((x) => x.v === "no" || x.v === "partial");
  const took = chosen.filter((x) => x.v === "yes");
  const undecided = chosen.filter((x) => !x.v);
  // WHAT A FINISHED DAY SAYS ON ITS ONE LINE. The answer in their words, plus
  // any time they gave, so a collapsed day is still checkable at a glance.
  const summaryFor = (date) => chosen
    .filter(({ q }) => q.date === date && q.v !== null)
    .map(({ q, v }) => {
      const said = v ? label(q, v) : null;
      if (!said) return null;
      const times = (q.needs || []).map((need) => rawAt(q, need.slot)).filter(Boolean);
      return times.length ? `${said}, ${times.join(", ")}` : said;
    })
    .filter(Boolean)
    .join(" · ");
  // a day can only be finished with once every question on it has an answer and
  // whatever that answer owes - the same tests the confirm applies to the whole
  const blockedOn = (date) => chosen
    .filter(({ q }) => q.date === date)
    .some(({ q, v }) => !v
      || ((v === "yes" || v === "partial") && (q.needs || []).some((n) => !minutesAt(q, n) || badTime(q, n)))
      || (owesReason(q, v) && !reasonOf(q)));
  const hours = missed.reduce((n, x) => n + (x.q.movesOnDecline || 0), 0);
  // only the days whose answer differs from what is already stored need writing.
  // A CLEARED ONE COUNTS AS A CHANGE - unclicking a saved answer has to be able
  // to take it off the record, or the box unhighlights and nothing happens.
  const dirty = chosen.filter(({ q, v }) => v !== savedValue(q));
  const cleared = dirty.filter(({ v }) => !v);

  function commit() {
    setErr(null);
    start(async () => {
      const res = await submitAction({
        token,
        batch: chosen.filter((x) => x.v || dirty.includes(x)).map(({ q, v }) => ({
          id: q.id,
          // null means "take my answer off the record" - see the clear branch
          // in answerTimesheetQuestion
          choice: v,
          // sent as HH:MM, the one shape the server parses. A day answered
          // "missed them" sends none - there is nothing to say when about.
          // a "missed them" sends none - there is nothing to say when about. A
          // partial sends only the slots they actually filled in.
          times:
            (v === "yes" || v === "partial") && q.needs?.length
              ? Object.fromEntries(
                  q.needs
                    .map((need) => [need.slot, minutesAt(q, need)])
                    .filter(([, m]) => m),
                )
              : null,
          // WHY, on the answer that IS the violation. Sent only on a "no": a
          // "yes" has nothing to explain, and a partial is telling us about the
          // tens they DID get. The server re-checks this against the question it
          // re-derives, so a browser that skipped the box still cannot save one.
          reason: owesReason(q, v) ? reasonOf(q) || null : null,
        })),
      });
      if (!res?.ok) setErr(res || { error: "failed" });
      else { setConfirming(false); setPicked({}); setTimes({}); setReasons({}); router.refresh(); }
    });
  }

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
    // FULL WIDTH AND 44px ON A PHONE. This pair is the whole point of the page
    // and it was 32px tall with the two answers a few pixels apart, which is a
    // mis-tap on a screen where the two answers mean opposite things. Unchanged
    // above sm, where a pointer is doing the work.
    <span className="flex w-full overflow-hidden rounded-lg border border-border-strong sm:w-auto">
      {optionsFor(q).map((opt, i) => (
        <button
          key={opt}
          type="button"
          disabled={pending}
          aria-pressed={v === opt}
          onClick={() => {
            setConfirming(false);
            setPicked((p) => ({ ...p, [q.id]: (q.id in p ? p[q.id] : savedValue(q)) === opt ? null : opt }));
          }}
          className={`min-h-11 flex-1 px-3.5 py-1.5 text-sm font-semibold transition disabled:opacity-50 sm:min-h-0 sm:flex-none ${
            i > 0 ? "border-l border-border-strong" : ""
          } ${
            // one colour, like the options above - see the note on `Choice`
            v === opt
              ? "bg-brand text-white"
              : "bg-surface-2 text-muted hover:bg-surface hover:text-foreground"
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
    return (
      <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-700/70 dark:bg-amber-950/30">
        <p className="text-sm font-semibold text-foreground">{ask.ask}</p>
        <textarea
          rows={2}
          value={reasons[q.id] ?? already ?? ""}
          onChange={(e) => setReasons((r) => ({ ...r, [q.id]: e.target.value }))}
          placeholder={ask.placeholder}
          className="mt-2 min-h-[5.5rem] w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-foreground sm:min-h-0"
        />
        {!said ? (
          <p className="mt-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
            Needed before this can be saved. It goes at the bottom of your timesheet.
          </p>
        ) : already ? (
          /* WHERE THE WORDS IN THE BOX CAME FROM. Without this an answer they
             gave on another question about the same day looks like something we
             filled in for them, which is the one thing a reason must not look
             like. Editing it replaces it; there is only ever one per day per
             break, however many questions ask about that day. */
          <p className="mt-1.5 text-xs text-muted">
            This is what you told us for {q.date} already. Change it here if it is not right.
          </p>
        ) : null}
      </div>
    );
  };

  const renderTimes = ({ q, v }) => {
    if ((v !== "yes" && v !== "partial") || !(q.needs || []).length) return null;
    const partial = v === "partial";
    return (
      <div className="mt-2 w-full rounded-lg border border-border-strong bg-surface-2 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-faint">
          When did you take {q.needs.length === 1 || partial ? "it" : "them"} on {q.date}?
        </p>
        {partial && (
          <p className="mt-1 text-xs text-muted">
            Fill in the {q.needs.length === 2 ? "one" : "ones"} you did get and leave the rest
            blank. The record will say which you had.
          </p>
        )}
        {/* THEIR OWN SHIFTS, not the gaps between them. Mánu 2026-08-11: a rest
            has to sit inside a service, so offering the unscheduled gap was
            proposing the very thing the card above penalises. */}
        {(q.needs[0]?.shifts || []).length > 0 && (
          <p className="mt-1.5 text-xs text-muted">
            You worked{" "}
            <b className="font-mono text-foreground">{q.needs[0].shifts.join("  ")}</b> that day.
          </p>
        )}
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
        <div className="mt-2 space-y-2">
          {q.needs.map((need) => {
            const raw = rawAt(q, need.slot);
            const mins = minutesAt(q, need);
            const bad = badTime(q, need);
            return (
              <div key={need.slot} className="flex flex-wrap items-center gap-2.5">
                <label htmlFor={`t-${q.id}-${need.slot}`} className="w-28 text-sm text-foreground">
                  {need.label}
                </label>
                <input
                  id={`t-${q.id}-${need.slot}`}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={pending}
                  value={raw || (need.prefill && !(q.id in times && need.slot in (times[q.id] || {})) ? need.prefill : raw)}
                  onChange={(e) => { setConfirming(false); setAt(q, need.slot, e.target.value); }}
                  placeholder="e.g. 115 for 1:15"
                  className={`w-32 rounded-lg border bg-surface px-3 py-1.5 text-sm text-foreground ${
                    bad ? "border-rose-500"
                      : mins ? "border-emerald-500"
                        : partial ? "border-border-strong" : "border-amber-500/70"
                  }`}
                />
                {false && need.suggest && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => { setConfirming(false); setAt(q, need.slot, need.suggest); }}
                    className="rounded-full border border-dashed border-border-strong px-3 py-1 text-xs text-brand transition hover:border-solid"
                  >
                    use {need.suggest}
                  </button>
                )}
                <span className={`text-xs ${bad ? "text-rose-600 dark:text-rose-400" : "text-muted"}`}>
                  {bad === "outside"
                    ? "that is not inside any shift you worked that day"
                    : bad === "window"
                      ? `that has to be inside ${(need.window || []).join(" or ")}`
                      : mins && raw.trim() ? `reads as ${formatTimeDisplay(mins)}` : need.hint}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

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
        renderToggle, renderTimes, renderReason, missingLabel, noRoom, byDay, list, copy,
        pending, err, confirming, setConfirming, commit,
        dirty, missingTimes, missingTimeDates, missingReasons, undecided, missed, took, hours, base, answeredAll,
        ready,
        readyOn: (date) => ready.has(date),
        blockedOn,
        summaryFor,
        markReady: (date) => setReady((r) => new Set(r).add(date)),
        unmarkReady: (date) => setReady((r) => { const n = new Set(r); n.delete(date); return n; }),
      }}
    >
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
  const { renderToggle, renderTimes, renderReason, missingLabel, noRoom } = ctx;
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
      <ul className="mt-3 divide-y divide-border">
        {byDay.map(({ date, hours, items }) => (
          /* NO ROW TINT. A red wash across the whole line was louder than the
             answer it was reporting and ran past the words it belonged to. The
             segment itself carries the colour. */
          /* ANCHORED, so the missing-times warning can send somebody here.
             Digits only: "07/16/26" carries slashes, not valid in an id.
             scroll-mt-24 keeps the row clear of the header when jumped to. */
          <li key={date} id={dayAnchorId(date)} className="scroll-mt-24 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <span className="min-w-0">
                <span className="font-mono text-sm text-foreground">{date}</span>
                <span className="ml-3 text-xs text-muted">
                  {items.length === 1 ? `${missingLabel(items[0].q)} · ` : ""}
                  {hours} hrs worked
                </span>
                {/* WHY THERE IS NO CONTROL, next to the finding rather than in
                    the slot the control would have used. `justify-between`
                    pushes that slot to the far right, which is right for a
                    segmented toggle and wrong for a sentence: it left the
                    explanation stranded at the other end of a wide row from the
                    thing it explains, and out of line with every other row. */}
                {items.length === 1 && noRoom(items[0].q) && (
                  <span className="ml-3 text-xs text-muted">
                    there is no gap in this day long enough to have taken one
                  </span>
                )}
                {items.length > 1 && (
                  <span className="ml-2 rounded-full border border-border-strong px-2 py-0.5 text-[11px] text-muted">
                    2 to answer
                  </span>
                )}
              </span>
              {items.length === 1 && renderToggle({ item: items[0] })}
            </div>
            {/* UNDER THE FLAG IT BELONGS TO, NOT UNDER THE LIST.
                A day short both a lunch and its tens has two rows, and the time
                and reason boxes for BOTH were rendered after BOTH toggles - so
                the lunch's reason box appeared below the rest question, and on a
                day where both were answered you got two identical "Can you tell
                us why?" boxes stacked with nothing saying which was which.
                Each row now carries its own. */}
            {items.length > 1 &&
              items.map((item) => (
                <div
                  key={item.q.id}
                  className="mt-2 border-l-2 border-border py-1 pl-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <span className="min-w-0 text-sm text-foreground">
                      {missingLabel(item.q)}
                      {noRoom(item.q) && (
                        <span className="ml-3 text-xs text-muted">
                          there is no gap in this day long enough to have taken one
                        </span>
                      )}
                    </span>
                    {renderToggle({ item })}
                  </div>
                  {renderTimes(item)}
                  {renderReason(item)}
                </div>
              ))}
            {/* the single-decision day keeps its toggle up on the header row, so
                its boxes follow directly under it and there is nothing to move */}
            {items.length === 1 && (
              <Fragment key={`t-${items[0].q.id}`}>
                {renderTimes(items[0])}
                {renderReason(items[0])}
              </Fragment>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

// THE ONE CONFIRM FOR THE WHOLE BATCH, wherever its rows ended up. Rendered once
// per provider: after the list in "All questions", after the last day in "Day by
// day". It still spells out the total before anything is written.
export function BatchConfirm() {
  const ctx = useContext(BatchCtx);
  if (!ctx) return null;
  const {
    list, copy, pending, err, confirming, setConfirming, commit,
    dirty, missingTimes, missingTimeDates, missingReasons, undecided, missed, took, hours, base, answeredAll,
    ready, byDay,
  } = ctx;
  // HOW MANY DAYS THEY HAVE FINISHED WITH, and how many are left.
  //
  // The button was the only thing on the page that knew nothing about a day
  // being marked done, so somebody could collapse twelve of thirteen days and
  // still be looking at a control that said the same thing it said at the start.
  // Counted off the days this card actually holds, so a day marked ready and
  // then re-opened stops counting on its own.
  const days = (byDay || []).map((d) => d.date);
  const readyCount = days.filter((d) => ready?.has?.(d)).length;
  const leftCount = days.length - readyCount;

  return (
    <>
      {!confirming && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            // EVERY DAY NEEDS AN ANSWER BEFORE ANY OF THEM SAVES, 2026-08-14.
            //
            // This was NEVER GREYED OUT, and that was a deliberate call on
            // 2026-08-12: it used to disable itself with nothing changed or a
            // time still blank, so the one control on the page looked broken
            // while the reason sat somewhere else on screen.
            //
            // The reason survives the reversal, so the shape does too. It blocks
            // - nothing is written while a day is still open - but the block
            // SAYS SO, in the line below and in the label, rather than the
            // button going dead with the explanation somewhere off screen. That
            // is the same treatment the missing times and missing reasons get,
            // which is the family this now belongs to.
            disabled={pending}
            onClick={() => { if (!undecided.length) setConfirming(true); }}
            aria-disabled={undecided.length > 0}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-40"
          >
            {/* THE BUTTON NAMES ITS ACTION. It carried the count for a while
                and that made three tellings of one fact on one row - the label,
                the line beside it and the panel under it. The count belongs in
                the sentence that also says what it stops. */}
            {answeredAll && !dirty.length ? "Answered" : "Save my answers"}
          </button>
          {/* WHAT PRESSING IT WOULD ACTUALLY PUT ON RECORD. Ready is typed in
              and collapsed, not saved - this is the one control that turns the
              first into the second, so it is the one that has to say how many
              are waiting on it. */}
          {readyCount > 0 && (
            <span className="text-sm text-muted">
              <b className="text-foreground">
                {readyCount === 1 ? "1 day ready" : `${readyCount} days ready`}
              </b>
              {leftCount > 0
                ? ` · ${leftCount} still open`
                : " · nothing else on this card"}
            </span>
          )}
        </div>
      )}

      {/* SAYING YOU TOOK A BREAK IS ONLY HALF THE ANSWER. The record is the
          thing that was missing, so a day claimed without a time is not a day
          that has been answered. */}
      {!confirming && missingTimes > 0 && (
        <div className="mt-3 rounded-lg border border-amber-500/60 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          {/* THE SENTENCE IS UNCHANGED, word for word. What was missing was not
              wording, it was WHERE - so the days are added under it rather than
              the text being rewritten. */}
          <p>
            <b>{missingTimes} {missingTimes === 1 ? "time" : "times"} still to fill in.</b>{" "}
            Nothing is submitted until every day you answered &ldquo;took them&rdquo; says when.
          </p>
          {/* ONE CHIP PER DAY, not per missing time: two blank tens on one day
              are one place to go, and two identical chips would just be a
              second thing to try. Scrolls rather than jumps, and centres the
              row, because a day landed under the sticky header reads as the
              link having done nothing. */}
          {missingTimeDates.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-1.5">
              {missingTimeDates.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    const el = document.getElementById(dayAnchorId(d));
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                  className="rounded-full border border-amber-500/60 px-2.5 py-1 font-mono text-xs font-semibold text-amber-900 transition hover:bg-amber-500/20 dark:text-amber-200"
                >
                  {d}
                </button>
              ))}
            </p>
          )}
        </div>
      )}

      {/* NOTHING SAVES WHILE A DAY IS STILL OPEN. The card commits every one of
          its days in a single write - that is what makes it one card and not
          thirteen - so a half-answered set is not a partial save, it is a set
          somebody has not finished. */}
      {!confirming && undecided.length > 0 && (
        <p className="mt-3 rounded-lg border border-amber-500/60 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          {/* IT COUNTS ANSWERS, NOT DAYS AND NOT TIME LEFT.
              The wording before this put a number in front of the word day, and
              it was read as a number of days REMAINING - there is no due date on
              any of this. The word was wrong for a second reason too, which the
              line beside the button had already noted: one date can carry two
              answers, a meal and its rests.
              Worded to avoid the old phrase rather than quoting it, because the
              test below reads this file as text and a comment containing it
              counts as another telling. */}
          <b>
            {undecided.length === 1
              ? "One question here still needs an answer."
              : `${undecided.length} questions here still need an answer.`}
          </b>{" "}
          They are saved together, so none of them is recorded until all of them
          have one.
        </p>
      )}

      {/* AND SAYING YOU MISSED ONE IS ONLY HALF TOO. The why is the one half no
          QSP export has a field for, so a day claimed as missed without it
          records the violation and cannot say what caused it. Same shape and
          same place as the times warning above, because it is the same rule
          pointed at the other answer. */}
      {!confirming && missingReasons > 0 && (
        <p className="mt-3 rounded-lg border border-amber-500/60 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          <b>
            {missingReasons} {missingReasons === 1 ? "reason" : "reasons"} still to write.
          </b>{" "}
          Nothing is submitted until every day that needs one has it.
        </p>
      )}

      {confirming && (
        <div
          className="mt-3 rounded-lg border-2 border-brand bg-brand/10 p-4"
        >
          <p className="text-base font-semibold text-foreground">Are you sure you want to confirm?</p>
          <div className="mt-2 space-y-1.5 text-sm text-muted">
            {/* EVERY TALLY AND EVERY FIGURE CAME OUT 2026-08-12, at Mánu's
                instruction: the days-missed count, the penalty arithmetic
                ("N hours of penalty pay go onto your timesheet, taking it from
                X to Y"), the line about the times going on as their own record,
                and the warning that unanswered days block signing - which is no
                longer true in any case, since the sheet is signable at any time.
                What is left is a plain confirm. */}
            <p className="text-xs">You can change your answer any time before you sign.</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2.5">
            <button
              type="button"
              disabled={pending}
              onClick={commit}
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                // one colour, like the options - see the note on `Choice`
                "bg-brand"
              }`}
            >
              Yes, confirm
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-muted"
            >
              Go back
            </button>
          </div>
        </div>
      )}

      {err && <Refusal err={err} />}

      {copy.footnote && (
        <p className="mt-3 border-l-2 border-border-strong pl-3 text-sm text-muted">
          {copy.footnote}
        </p>
      )}
    </>
  );
}

// WHERE A DAY ROW LIVES IN THE BATCHED CARD, so the missing-times warning can
// send somebody to it. Digits only - "07/16/26" carries slashes, which are not
// valid in an id.
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
    ? "border-2 border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30"
    : anyDeclined
      ? "border-2 border-rose-400 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30"
      : "border border-border-strong bg-surface-2";
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
          <BatchConfirm />
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
      <div className="mt-3 border-l-2 border-amber-400 pl-3 dark:border-amber-700">
        <p className="text-sm font-semibold text-foreground">{c.short || c.title}</p>
        {c.dates?.length > 1 && (
          <p className="mt-1 font-mono text-xs text-muted">{c.dates.join("  ")}</p>
        )}
        {/* WHAT IT LOOKS LIKE, AND WHAT WE MADE OF IT. Two lines rather than the
            long card's paragraphs, but the same pair of facts - a question that
            asks you to confirm a time has to show you the time. Our own reading
            is marked, because "we think" is a proposal and the record is not. */}
        {c.facts?.length > 0 && (
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
