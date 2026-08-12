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
import { parseLooseTime, formatTimeDisplay } from "@/lib/loose-time";
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
        title: "One question before you sign",
        short: "Rest break time looks mis-entered",
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
        yes: {
          label: "Yes, that is when I took it",
          why: "You stopped for about ten minutes around then. Change the time below if it was not exactly that.",
        },
        no: { label: "I did not take it at all", why: "You worked through that time." },
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
        // what was logged, and the shift it was logged against - the two things
        // somebody needs to see before saying whether that is when they took it
        facts: (q.row.detail || []).slice(0, 2).flatMap((x) => [
          { label: "Logged at", value: `${x.wasFrom} to ${x.wasTo}` },
          ...(x.service ? [{ label: "Your shift", value: x.service }] : []),
        ]),
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
        // was not a mistake" and it is the answer that ADDS them. The labels say
        // what happened rather than yes/no, because the question above them is
        // "was that a mistake?" and a bare "Yes" would answer it backwards.
        yes: {
          label: "No - I did take it then",
          why: "That was a real break, recorded at the time it happened.",
        },
        no: {
          label: "Yes, the time was entered wrong",
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
        yesEffect: <>We will record that you took your break at that time.</>,
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
          facts: [
            { label: "Your schedule has", value: "a lunch that day" },
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

    default:
      return null;
  }
}

// GREEN IS "NOTHING CHANGES", RED IS "MONEY MOVES", and it used to be the other
// way round by accident: "yes" lit up brand blue and "no" lit up emerald, so
// telling us you missed twelve breaks turned the card green. Mánu 2026-08-09.
// Same language the timesheet itself uses - green for a settled day, red for
// one that owes something.
function Choice({ on, tone, label, why, onClick, busy }) {
  const ring = on
    ? tone === "yes"
      ? "border-2 border-emerald-500 bg-emerald-500/10"
      : "border-2 border-rose-500 bg-rose-500/10"
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
            on
              ? tone === "yes"
                ? "border-emerald-500 bg-emerald-500"
                : "border-rose-500 bg-rose-500"
              : "border-border-strong"
          }`}
        />
        {label}
      </span>
      {why && <span className="mt-1.5 block pl-5.5 text-xs text-muted">{why}</span>}
    </button>
  );
}

// one question inside the card: the choices, the optional typed time, and the
// confirm panel that has to be got past before anything is written
function OneQuestion({
  token, q, answer, answerHasTimes, answerTimes, savedChoice, locked, disturbCount,
  standing, submitAction, showDate, terse,
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


  // WHAT THE COLLAPSED CARD SHOWS: the answer in their own words, and the times
  // they gave paired back to the dates they belong to. `statedBreaks` carries a
  // slot but not a date, so the dates come from `q.needs` - the same list the
  // boxes were built from, which is what keeps them in step.
  const chosenLabel =
    shown === "yes" ? c.yes.label
      : shown === "no" ? c.no.label
        : shown === c.third?.value ? c.third.label
          : "Answered";
  const statedPairs = (answerTimes || [])
    .map((b) => {
      const need = (q.needs || []).find((n) => n.slot === b.slot);
      return need?.date ? { slot: b.slot, date: need.date, from: b.from } : null;
    })
    .filter(Boolean);

  function commit() {
    if (!proposed || timeBlocked) return;
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
      });
      if (!res?.ok) setErr(res?.error || "failed");
      else { setProposed(null); setAt(""); setSlotAt({}); setEditing(false); router.refresh(); }
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
        <Choice
          on={shown === "yes"}
          tone="yes"
          busy={pending}
          label={c.yes.label}
          why={!answered && !terse ? c.yes.why : null}
          onClick={() => pick("yes")}
        />
        <Choice
          on={shown === "no"}
          tone="no"
          busy={pending}
          label={c.no.label}
          why={!answered && !terse ? c.no.why : null}
          onClick={() => pick("no")}
        />
        {c.third && (
          <Choice
            on={shown === c.third.value}
            tone="no"
            busy={pending}
            label={c.third.label}
            why={!answered && !terse ? c.third.why : null}
            onClick={() => pick(c.third.value)}
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
                      placeholder="e.g. 230 or 2:30pm"
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
                placeholder="e.g. 230 or 2:30pm"
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

      {/* the panel takes the colour of the answer it is about to write, so the
          last thing somebody reads before committing is the same green or red
          they just clicked. */}
      {proposed && (
        <div className={`mt-3 rounded-lg border-2 p-4 ${
          proposed.choice === "yes"
            ? "border-emerald-500 bg-emerald-500/10"
            : proposed.choice === null
              ? "border-border-strong bg-surface-2"
              : "border-rose-500 bg-rose-500/10"
        }`}>
          <p className="text-base font-semibold text-foreground">
            {proposed.choice === null ? "Take your answer off?" : "Are you sure you want to confirm?"}
          </p>
          <div className="mt-2 space-y-1.5 text-sm text-muted">
            <p>
              {proposed.choice === "yes" ? c.yesEffect
                : proposed.choice === "no" ? c.noEffect
                  : proposed.choice === c.third?.value ? c.thirdEffect
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
                proposed.choice === "yes" ? "bg-emerald-600"
                  : proposed.choice === null ? "bg-brand" : "bg-rose-600"
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
      {err && (
        <p className="mt-3 text-sm font-semibold text-rose-700 dark:text-rose-400">
          {err === "already"
            ? "This timesheet is already signed, so it cannot be changed."
            // PREVIEW REFUSES EVERY WRITE ON PURPOSE - see `refuse` in page.js,
            // which is what stops a test click landing on a real person's record.
            // It came back as the generic failure, so the one person who ever
            // sees it was told to refresh and try again, which cannot work: the
            // block is the point, not a fault.
            : err === "preview"
              ? "Preview only - nothing is saved from this view. Open the employee's own link to answer for real."
              : err === "badtime"
                ? "That time didn't look right. Pick a time on this day, with at least ten minutes left before midnight."
                : "That didn't save. Refresh the page and try again."}
        </p>
      )}
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
}) {
  // the caller may hand the copy in (the "All questions" card already computed
  // it to pick the card tone) or leave it to be derived here
  const copy = copyProp || copyFor(list[0], standing) || {};
  // see the note in OneQuestion - the figures at the top of the page are server
  // rendered, so an answer that does not refresh the tree leaves them stale
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState(null);
  const [picked, setPicked] = useState({});
  // { [questionId]: { [slot]: "raw text the person typed" } }
  const [times, setTimes] = useState({});
  const [confirming, setConfirming] = useState(false);

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
  const valueFor = (q) => (q.id in picked ? picked[q.id] : savedValue(q));

  const rawAt = (q, slot) => times[q.id]?.[slot] ?? "";
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
  // EVERY DAY ANSWERED "took them" OWES ITS TIMES. Mánu 2026-08-10: required,
  // "because we need a record of this". A day answered "missed them" owes none -
  // there is nothing to say when about.
  const missingTimes = list.reduce((n, q) => {
    const v = valueFor(q);
    if (v === "yes") {
      return n + (q.needs || []).filter((need) => !minutesAt(q, need) || badTime(q, need)).length;
    }
    // A PARTIAL OWES AT LEAST ONE TIME, not all of them. They are telling us
    // they got some of their tens and not the others, so the blanks are the
    // point - what we cannot accept is a partial with nothing filled in at all.
    if (v === "partial") {
      return n + ((q.needs || []).some((need) => minutesAt(q, need)) ? 0 : 1);
    }
    return n;
  }, 0);

  const chosen = list.map((q) => ({ q, v: waiting?.has?.(q.id) ? null : valueFor(q) }));
  // A PARTIAL COUNTS AS MISSED FOR THE MONEY. One hour per workday on which a
  // rest period was not provided, per UPS v. Superior Court - so one of two
  // tens is exactly as much premium as none of two. What differs is the record,
  // and the time they give for the one they did get.
  const missed = chosen.filter((x) => x.v === "no" || x.v === "partial");
  const took = chosen.filter((x) => x.v === "yes");
  const undecided = chosen.filter((x) => !x.v);
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
        })),
      });
      if (!res?.ok) setErr(res?.error || "failed");
      else { setConfirming(false); setPicked({}); setTimes({}); router.refresh(); }
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
  const WORDS = ["no", "one", "two", "three", "four", "five"];
  const count = (n) => WORDS[n] || String(n);
  const missingLabel = (q) => {
    const owed = (q.needs || []).length;
    const have = (q.needs?.[0]?.known || []).length;
    const total = owed + have;
    if (q.row?.part === "meal") return "No meal break recorded";
    if (!owed) return "Rest break";
    if (have > 0) return `Rest break - ${count(owed)} of ${count(total)} missing`;
    return total > 1 ? `No rest breaks recorded - ${count(total)} owed` : "No rest break recorded";
  };

  // WHAT IF THEY ONLY TOOK ONE OF THE TWO? Mánu 2026-08-11. It was yes-or-no,
  // so somebody who got one ten and worked through the other had to claim they
  // missed both or took both - and neither is true.
  //
  // The money does not change: one hour per workday on which a rest period was
  // not provided, so one of two is the same premium as none of two. What was
  // wrong was the RECORD, and the time for the ten they did get.
  const owedOn = (q) => (q.row?.part === "rest" ? (q.needs || []).length : 1);
  const optionsFor = (q) => (owedOn(q) >= 2 ? ["yes", "partial", "no"] : ["yes", "no"]);
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
    ) : (
    <span className="flex overflow-hidden rounded-lg border border-border-strong">
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
          className={`px-3.5 py-1.5 text-sm font-semibold transition disabled:opacity-50 ${
            i > 0 ? "border-l border-border-strong" : ""
          } ${
            v === opt
              ? opt === "yes"
                ? "bg-emerald-600 text-white"
                : opt === "partial"
                  ? "bg-amber-500 text-white"
                  : "bg-rose-600 text-white"
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
                  placeholder="e.g. 115 or 1:15p"
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
  const byDay = [];
  for (const item of chosen) {
    const last = byDay[byDay.length - 1];
    if (last && last.date === item.q.date) last.items.push(item);
    else byDay.push({ date: item.q.date, hours: item.q.row?.hours, items: [item] });
  }

  return (
    <BatchCtx.Provider
      value={{
        renderToggle, renderTimes, missingLabel, byDay, list, copy,
        pending, err, confirming, setConfirming, commit,
        dirty, missingTimes, undecided, missed, took, hours, base, answeredAll,
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
  const { renderToggle, renderTimes, missingLabel } = ctx;
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
          <li key={date} className="py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <span className="min-w-0">
                <span className="font-mono text-sm text-foreground">{date}</span>
                <span className="ml-3 text-xs text-muted">
                  {items.length === 1 ? `${missingLabel(items[0].q)} · ` : ""}
                  {hours} hrs worked
                </span>
                {items.length > 1 && (
                  <span className="ml-2 rounded-full border border-border-strong px-2 py-0.5 text-[11px] text-muted">
                    2 to answer
                  </span>
                )}
              </span>
              {items.length === 1 && renderToggle({ item: items[0] })}
            </div>
            {items.length > 1 &&
              items.map((item) => (
                <div
                  key={item.q.id}
                  className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-l-2 border-border py-1 pl-3"
                >
                  <span className="text-sm text-foreground">{missingLabel(item.q)}</span>
                  {renderToggle({ item })}
                </div>
              ))}
            {/* keyed on a Fragment, whose type is a module constant - keying on
                `renderTimes` itself would put the JSX type back in the tree and
                bring the remount with it */}
            {items.map(({ q, v }) => (
              <Fragment key={`t-${q.id}`}>{renderTimes({ q, v })}</Fragment>
            ))}
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
    dirty, missingTimes, undecided, missed, took, hours, base, answeredAll,
  } = ctx;

  return (
    <>
      {!confirming && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            // NEVER GREYED OUT. Mánu 2026-08-12. It used to disable itself with
            // nothing changed or a time still blank, so the one control on the
            // page looked broken while the reason sat somewhere else on screen.
            // Only an in-flight save disables it now.
            disabled={pending}
            onClick={() => setConfirming(true)}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-40"
          >
            {answeredAll && !dirty.length ? "Answered" : "Save my answers"}
          </button>
          {undecided.length > 0 && (
            <span className="text-sm text-muted">
              {/* not "days" any more - one day can carry two answers */}
              {undecided.length} still to answer.
            </span>
          )}
        </div>
      )}

      {/* SAYING YOU TOOK A BREAK IS ONLY HALF THE ANSWER. The record is the
          thing that was missing, so a day claimed without a time is not a day
          that has been answered. */}
      {!confirming && missingTimes > 0 && (
        <p className="mt-3 rounded-lg border border-amber-500/60 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          <b>{missingTimes} {missingTimes === 1 ? "time" : "times"} still to fill in.</b>{" "}
          Nothing is submitted until every day you answered &ldquo;took them&rdquo; says when.
        </p>
      )}

      {confirming && (
        <div
          className={`mt-3 rounded-lg border-2 p-4 ${
            missed.length
              ? "border-rose-500 bg-rose-500/10"
              : "border-emerald-500 bg-emerald-500/10"
          }`}
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
                missed.length ? "bg-rose-600" : "bg-emerald-600"
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

      {err && (
        <p className="mt-3 text-sm font-semibold text-rose-700 dark:text-rose-400">
          {err === "already"
            ? "This timesheet is already signed, so it cannot be changed."
            // PREVIEW REFUSES EVERY WRITE ON PURPOSE - see `refuse` in page.js,
            // which is what stops a test click landing on a real person's record.
            // It came back as the generic failure, so the one person who ever
            // sees it was told to refresh and try again, which cannot work: the
            // block is the point, not a fault.
            : err === "preview"
              ? "Preview only - nothing is saved from this view. Open the employee's own link to answer for real."
              : "That didn't save. Refresh the page and try again."}
        </p>
      )}

      {copy.footnote && (
        <p className="mt-3 border-l-2 border-border-strong pl-3 text-sm text-muted">
          {copy.footnote}
        </p>
      )}
    </>
  );
}

export default function TimesheetQuestion({
  token, questions, answers, partials, answerTimes, choices, waiting, disturbs, standing, submitAction,
  terse,
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
        <BatchProvider
          partials={partials}
          waiting={waiting}
          token={token}
          list={list}
          answers={answers}
          standing={standing}
          submitAction={submitAction}
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
            showDate={perDay}
          />
        ))}
      </div>

      {!allAnswered && <p className="mt-3 border-l-2 border-border-strong pl-3 text-sm text-muted">{c.footnote}</p>}
    </div>
  );
}
