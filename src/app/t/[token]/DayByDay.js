import { parseLooseTime } from "@/lib/loose-time";
import { movesHours } from "@/lib/timesheet/questions";
import DayCalendar from "./DayCalendar";
import BreakReason from "./BreakReason";
import { StagedTimesProvider } from "./StagedTimes";
import TimesheetQuestion, {
  BatchProvider,
  BatchDays,
  BatchConfirm,
  BatchHeading,
} from "./TimesheetQuestion";

// THE PAY PERIOD, ONE DAY AT A TIME, with each day drawn on a time axis and its
// questions beside it. The "Day by day" half of the view switch.
//
// It asks NOTHING NEW. Every decision here is the same component, the same
// staged answer and the same row in the database as the other view - this file
// only decides what order things come in and what picture sits next to them.
//
// TWO KINDS OF CARD END UP HERE, and they arrive differently:
//
//   * The BATCHED kind - "we could not find some of your breaks on record" - is
//     one question per day committed in a single go, and it is the one 53 of 59
//     people get. Its rows are split across the days they belong to, sharing one
//     staged answer through BatchProvider, with one confirm at the end. Left
//     whole it would put twelve days of questions onto whichever day came
//     first, which is the wall this view exists to get rid of.
//
//   * Everything else is a card in its own right. A card covering several days
//     is shown ONCE, on the first day it touches, and the later days say where
//     it went - rendering it under each of its dates would put three copies of
//     one question on the page, each able to answer for all three.

// A ROW THE SOURCE STILL HOLDS WRONG, ON THE RIGHT WHERE THE WORK IS.
//
// The calendar marks it amber and the chip above the column quotes what the
// record says, and neither is where somebody looks for what to DO. The right
// column is the list of things this day needs; a fix that only ever appears as a
// colour is a fix nobody is being asked for.
//
// DELIBERATELY NOT A QUESTION. There is nothing to answer - a row reading out
// 12:10p, in 12p is unambiguous, the engine already reads it the right way round
// and already counts the break. What is left is an instruction, so it says what
// the record holds, what it was read as, and what to change it to.
//
// AND IT SAYS NOTHING IS OWED, because the amber would otherwise read as money.
function NeedsFixing({ items }) {
  if (!items.length) return null;
  const clock = (m) => {
    const h = Math.floor(m / 60), x = h % 12 === 0 ? 12 : h % 12, mm = m % 60;
    return `${x}${mm ? `:${String(mm).padStart(2, "0")}` : ""}${h < 12 ? "a" : "p"}`;
  };
  return (
    <div className="mb-3 rounded-xl border border-amber-400/70 bg-amber-50 p-4 dark:border-amber-600/60 dark:bg-amber-950/30">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
        {items.length === 1
          ? "One thing to fix in QuickSolve"
          : `${items.length} things to fix in QuickSolve`}
      </p>
      <ul className="mt-2 space-y-2.5">
        {items.map((b, i) => (
          <li key={`fix-${b.min}-${i}`} className="text-sm">
            <div className="grid gap-x-3 gap-y-0.5 sm:grid-cols-[128px_minmax(0,1fr)]">
              <span className="text-amber-800/80 dark:text-amber-300/80">QuickSolve has</span>
              <span className="font-mono font-semibold text-amber-900 dark:text-amber-200">
                {b.recorded?.from} to {b.recorded?.to}
              </span>
              <span className="text-amber-800/80 dark:text-amber-300/80">Change it to</span>
              <span className="font-mono font-semibold text-emerald-800 dark:text-emerald-300">
                {clock(b.min)} to {clock(b.min + (b.minutes || 10))}
              </span>
            </div>
            {b.recorded?.why && (
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                {b.recorded.why} - so the entry reads as a break that ends before it starts.
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function DayByDay({
  days, groups, token, answers, partials, answerTimes, choices,
  waiting, disturbs, standing, submitAction, scheduled = {}, restsOnRecord = {},
  // WHY A BREAK WAS NOT TAKEN - one per violation, on the day it happened.
  //
  // These rendered as a single lump above the signer, attached to nothing: a
  // reason about the 4th sat under a reason about the 11th with no picture and
  // no day between them. They belong beside the day they are about, which is
  // also where the admin control sits on All employees, so the two screens read
  // the same way round.
  breakAsks = [], breakAction,
  // the reasons already written for this period, by finding key. Two questions
  // can be about one day's rests and they share a row, so this is what stops the
  // second card asking for a sentence the first already collected.
  reasonsOnRecord = null,
}) {
  // there is exactly one batch value in the engine - `nothingDocumented` - so
  // one provider covers it and the contexts never nest
  const batched = groups.find((g) => g[0]?.batch) || null;
  const plain = groups.filter((g) => !g[0]?.batch);
  const batchDates = new Set(batched ? batched.map((q) => q.date) : []);

  const order = new Map(days.map((d, i) => [d.date, i]));
  const datesOf = (q) => q.dates || (q.date ? [q.date] : []);

  // THE REASONS, BY THE DAY THEY ARE ABOUT. A `findingKey` carries its own date
  // - see `breakFindingKey` - so the row already knows and nothing here parses
  // one out of the string.
  const asksByDate = new Map();
  for (const a of breakAsks) {
    if (!a?.date) continue;
    if (!asksByDate.has(a.date)) asksByDate.set(a.date, []);
    asksByDate.get(a.date).push(a);
  }
  // ANYTHING WHOSE DAY IS NOT ON THIS SHEET STILL HAS TO BE SEEN. A break answer
  // is keyed on the PERIOD, so it outlives the upload it was taken against - and
  // a re-upload that drops a day would otherwise make the question about it
  // silently stop being asked rather than fail. These go above the list.
  const dayDates = new Set((days || []).map((d) => d.date));
  const orphanAsks = breakAsks.filter((a) => !a?.date || !dayDates.has(a.date));

  // THE REST PERIODS ACTUALLY ON RECORD, per day, so the calendar can draw those
  // and only those. The engine already worked them out - `needs[].known` is what
  // it matched to this person's own name, and it is the same list the question
  // shows as "already on record" - so this reads its answer rather than matching
  // report rows a second time and risking a different one.
  // `parseLooseTime` hands back "HH:MM", not a number of minutes - the axis
  // needs minutes, and testing the string for finiteness silently threw every
  // real rest away.
  const toMinutes = (raw) => {
    const t = parseLooseTime(raw, { assumeWorkday: true });
    if (!t) return null;
    const [h, m] = t.split(":").map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  };

  // THE REPORT'S OWN ROWS FIRST, matched to this person on the server, and the
  // question's `known` list only where a date has none.
  //
  // `known` was the only source until 2026-08-12 and it has a hole in it: it
  // lives on a question, so a day with nothing left to ask carries no times at
  // all. His 07/30 records a rest, asks nothing, and drew nothing. The rows
  // cover every day; the questions add back anything the employee has since
  // CORRECTED, which the report cannot know about.
  const restsByDate = new Map(
    Object.entries(restsOnRecord).map(([date, list]) => [date, list.map((r) => ({ ...r }))]),
  );
  for (const group of groups) {
    for (const q of group) {
      const known = (q.needs || []).find((n) => n.kindOf === "rest")?.known;
      if (!known?.length || !q.date) continue;
      const placed = known
        .map((k) => ({ min: toMinutes(k.from), corrected: k.corrected }))
        .filter((k) => k.min != null);
      if (!placed.length) continue;
      // a corrected time supersedes the row it corrects, so these win outright
      if (placed.some((p) => p.corrected) || !restsByDate.has(q.date)) {
        restsByDate.set(q.date, placed);
      }
    }
  }

  // WHAT WE THINK A MIS-ENTERED BREAK WAS, drawn where we think it was.
  //
  // Mánu 2026-08-12: "there's what it looks like, and we put our estimate."
  // Dinley 08/07 is the case that makes it matter - the report has a rest from
  // 11:00 AM to 11:10 PM, twelve hours long, and the engine reads it as the IN
  // time picked as PM. The card now says what the record holds and what we make
  // of it, but the calendar beside it drew neither: the bad row is not counted
  // so it is not on record, and the repair is only a proposal. The picture and
  // the question looked like they were about different days.
  //
  // Drawn like a half-typed answer rather than like a fact, because that is what
  // it is - a reading somebody still has to confirm.
  //
  // NOT WHERE THE ROW IS ALREADY DRAWN THERE. Since `drawnRest` started placing
  // a repaired row at its CORRECTED time, the record and the proposal are the
  // same ten minutes: Martinez 07/23 drew "Rest (corrected) 3:50p-4p" and "We
  // think 3:50p-4p" in two lanes beside each other, both truncated to make room
  // for the other, on a day that has one break. The applied correction is the
  // better block - it is what the signed sheet draws - so the guess gives way.
  //
  // AND IT IS NOT ONLY THE REPAIR THAT HAS ONE. `q.proposed` is set by
  // `buildQuestions` on `repair` alone, so a ten logged off the clock - which
  // names an in-shift time in its own card text, "inside your 10:30a-1p shift
  // that would be 12:50p" - drew nothing at all. 27 of those across the two
  // batches: the record is on the picture, our reading of it was not, which is
  // the same gap as the repair's with the two halves swapped over. Every one of
  // them lands inside a shift by construction, so none of them can widen the
  // axis.
  const proposalsByDate = new Map();
  const propose = (date, min, minutes) => {
    if (min == null || !date) return;
    if ((restsByDate.get(date) || []).some((r) => r.min === min)) return;
    const list = proposalsByDate.get(date) || [];
    // a day carrying two off-clock rows can propose the same minute twice
    if (list.some((p) => p.min === min)) return;
    list.push({ min, minutes: minutes || 10, kind: "rest" });
    proposalsByDate.set(date, list);
  };
  for (const group of groups) {
    for (const q of group) {
      propose(q.date, toMinutes(q.proposed?.from), q.row?.minutes);
      // one per recorded row, each on the day it belongs to - a card can cover
      // more than one ten and they do not share a suggested time
      for (const x of q.row?.detail || []) {
        propose(x.date || q.date, toMinutes(x.from), x.minutes);
      }
    }
  }

  // THE HOURS WE HAVE ON FILE, NOT THE HOURS AN ANSWER COULD REACH.
  //
  // A ten logged outside a shift is paid at face value, so the engine's figure
  // for Uribe 07/28 is 6.17 - and putting that at the top of the card, above a
  // question about whether the ten happened, advertises what the generous answer
  // is worth. Mánu 2026-08-12: "if they see a higher number that's there, there
  // will be incentive for them to be... yep. That's when I took it so they can
  // get those extra ten minutes paid. that's why we're just asking the way we
  // are."
  //
  // So the card shows the figure BEFORE the addition until they confirm it, and
  // only then does 6.00 become 6.17. THIS IS THE CORRECTIONS VIEW ONLY - the
  // stored figure, the payroll total and the signed sheet are all untouched, and
  // silence still resolves to paid exactly as it did. What changes is what the
  // screen leads with while somebody is deciding.
  const moverFor = (date) =>
    groups.flat().find((q) => movesHours(q.kind) && (q.dates || [q.date]).includes(date)) || null;

  const onFile = (day) => {
    const added = day.addedHours || 0;
    if (!added) return day.paidHours || 0;
    const q = moverFor(day.date);
    const confirmed = q && answers?.[q.id] === "yes";
    return confirmed ? day.paidHours || 0 : (day.paidHours || 0) - added;
  };

  // whether this date's breaks row is still waiting on the ten above it. Reads
  // `waiting` from `dependencyGate` rather than re-deciding, so the row that
  // hides here is exactly the row the server would have refused.
  const gatedOn = (date) =>
    (batched || []).some((q) => q.date === date && waiting?.has?.(q.id));

  const anchored = new Map();   // date -> [group]
  const alsoAsked = new Map();  // date -> [anchor date]
  const undated = [];           // questions about the sheet, not about a day

  for (const group of plain) {
    const dates = [...new Set(group.flatMap(datesOf))]
      .filter((d) => order.has(d))
      .sort((a, b) => order.get(a) - order.get(b));
    if (!dates.length) {
      undated.push(group);
      continue;
    }
    const [anchor, ...rest] = dates;
    if (!anchored.has(anchor)) anchored.set(anchor, []);
    anchored.get(anchor).push(group);
    for (const d of rest) {
      if (!alsoAsked.has(d)) alsoAsked.set(d, []);
      alsoAsked.get(d).push(anchor);
    }
  }

  // TERSE IN HERE. The long explanation belongs to "All questions"; this view
  // names the fault and shows the same options, with the day's calendar beside
  // it doing the explaining.
  const card = (group) => (
    <TimesheetQuestion
      terse
      /* the card's own id, not its kind. A kind is one card only while it emits
         one question - `repair` is one per out-time - and two children keyed
         "repair" is a duplicate React warns about and may drop. */
      key={group[0].id || group[0].kind}
      token={token}
      questions={group}
      answers={answers}
      partials={partials}
      answerTimes={answerTimes}
      choices={choices}
      waiting={waiting}
      disturbs={disturbs}
      standing={standing}
      submitAction={submitAction}
      reasonsOnRecord={reasonsOnRecord}
    />
  );

  const list = (
    <ol className="mt-4 space-y-4">
      {days.map((day) => {
        const mine = anchored.get(day.date) || [];
        const elsewhere = alsoAsked.get(day.date) || [];
        const asks = batchDates.has(day.date) || mine.length > 0
          || (asksByDate.get(day.date) || []).length > 0
          // a day whose only item is a fix still has something on it
          || (restsByDate.get(day.date) || []).some((b) => b.attention);
        return (
          <li
            key={day.date}
            className={`rounded-xl border bg-surface p-4 sm:p-5 ${
              asks ? "border-amber-400 dark:border-amber-700" : "border-border"
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="font-mono text-sm font-semibold text-foreground">{day.date}</h3>
              {/* WHAT THE MISC TIME ON THIS DAY TURNED OUT TO BE.
                  Once a reviewer or the employee has said, the day should say it
                  too: a block sitting on the calendar labelled only "Misc" is
                  the question, not the answer. "worked" is deliberately absent -
                  that answer puts the time back into the day and every figure
                  already moved to match, so a label would be describing the
                  ordinary state of the sheet.
                  NO PAY LANGUAGE. This is the employee's own page, so it names
                  the kind of time and stops. */}
              {(day.miscKind === "pto" || day.miscKind === "sick") && (
                <p className="rounded-md border border-sky-300 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800 dark:border-sky-800/70 dark:bg-sky-950/40 dark:text-sky-300">
                  {day.miscKind === "pto" ? "Misc PTO" : "Misc Sick Pay"}
                </p>
              )}
              <p className="text-sm text-muted">
                {(Math.round(onFile(day) * 100) / 100).toFixed(2)} hrs
              </p>
            </div>

            {/* the picture beside the question on a wide screen, above it on a
                phone - so the day is still in front of you while you answer */}
            <div className="mt-3 gap-5 sm:flex sm:items-start">
              {/* WIDENED TWICE. w-52 truncated every label to "Res..." as soon
                  as two breaks shared a lane, and w-64 was still tight.

                  THE CEILING IS THE ANSWER OPTIONS, not the calendar. The card
                  caps at max-w-5xl, so there is about 916px of content; the
                  three-outcome cards are `basis-60` and need ~492px to stay two
                  to a row rather than stacking. 384px here left 512px, which
                  cleared it - and anything wider started costing the questions
                  more than it gave the picture.

                  THE PAGE PAID FOR THE THIRD WIDENING. Mánu 2026-08-12: "let's
                  extend the width of the calendar in the time sheet views
                  because for the overlaps, I can't see what kind of service it
                  is." Taking the extra 64px off the questions would have stacked
                  them, so `page.js` went to max-w-6xl instead - about 1104px of
                  content, which leaves the options 636px and breaks nothing. The
                  ceiling this note describes still holds; the budget grew. */}
              <div className="shrink-0 sm:w-80 lg:w-[28rem]">
                <DayCalendar
                  day={day}
                  rests={restsByDate.get(day.date) || []}
                  scheduled={scheduled[day.date] || []}
                  proposed={proposalsByDate.get(day.date) || []}
                />
              </div>
              <div className="mt-4 min-w-0 flex-1 sm:mt-0">
                {/* THE HOUR-MOVING QUESTION FIRST, THEN THE BREAKS ROW.
                    A locked row says "waiting on the question above", and the
                    question it waits on is a plain card - so drawing the batch
                    row first would put the blocker BELOW the row pointing at it
                    whenever both land on the same day. Ordering it this way also
                    matches what has to happen: the answer that re-derives the
                    day is given before the premium question that reads it. */}
                {/* WHAT THIS DAY NEEDS CHANGING AT SOURCE, above the questions.
                    It is not a question and it does not wait on one, so it goes
                    first - and the amber on the calendar beside it now has a
                    sentence to point at. */}
                <NeedsFixing items={(restsByDate.get(day.date) || []).filter((b) => b.attention)} />
                {mine.map(card)}
                {/* THE DOMINO. A day's breaks row only exists because the ten
                    above it pushed the day past six hours - which owes a lunch
                    and a second rest that a 6.00 day does not. Until that is
                    confirmed the entitlement is hypothetical, so the row is not
                    shown at all rather than shown greyed out saying "waiting".
                    Mánu 2026-08-12: "That should only appear once they answer
                    the question in that same card... then another part opens up
                    ... Domino effect."

                    Answering the other way needs nothing here: declining moves
                    the day back to 6.00 and `reentitle` stops generating these
                    questions at all, so they never come back. */}
                {batchDates.has(day.date) && !gatedOn(day.date) && (
                  <BatchDays dates={[day.date]} />
                )}
                {(asksByDate.get(day.date) || []).map((ask) => (
                  <BreakReason
                    key={ask.findingKey}
                    token={token}
                    ask={ask}
                    submitAction={breakAction}
                  />
                ))}
                {!asks &&
                  (elsewhere.length > 0 ? (
                    <p className="text-sm text-muted">
                      Asked with{" "}
                      <span className="font-mono text-foreground">{elsewhere[0]}</span>
                      {elsewhere.length > 1 ? " and the days above" : ""} - answering it there
                      covers this day too.
                    </p>
                  ) : (
                    <p className="text-sm text-muted">Nothing to check on this day.</p>
                  ))}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );

  // the calendars and the answer boxes are cousins in this tree, not parent and
  // child, so the half-typed time gets to them through here
  return (
    <StagedTimesProvider>
    <div className="mt-5">
      {undated.length > 0 && <div className="mb-6">{undated.map(card)}</div>}

      {/* a reason whose day is not on this sheet - see `orphanAsks`. Above the
          list rather than hidden, because the alternative is a question that
          silently stops being asked. */}
      {orphanAsks.length > 0 && (
        <div className="mb-6">
          {orphanAsks.map((ask) => (
            <BreakReason key={ask.findingKey} token={token} ask={ask} submitAction={breakAction} />
          ))}
        </div>
      )}

      {batched ? (
        <BatchProvider
          token={token}
          list={batched}
          answers={answers}
          partials={partials}
          waiting={waiting}
          standing={standing}
          submitAction={submitAction}
          reasonsOnRecord={reasonsOnRecord}
        >
          {/* the explanation once, at the top, rather than on each of the twelve
              days it covers */}
          <BatchHeading
            question={batched[0]}
            standing={standing}
            className="rounded-xl border-2 border-amber-400 bg-amber-50 p-5 dark:border-amber-700 dark:bg-amber-950/30"
          />
          {list}
          {/* ONE CONFIRM FOR ALL OF THEM, after the last day - the same single
              commit the other view makes. */}
          <div className="mt-5 rounded-xl border border-border-strong bg-surface-2 p-5">
            <BatchConfirm />
          </div>
        </BatchProvider>
      ) : (
        list
      )}
    </div>
    </StagedTimesProvider>
  );
}
