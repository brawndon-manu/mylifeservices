import { parseLooseTime } from "@/lib/loose-time";
import DayCalendar from "./DayCalendar";
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
export default function DayByDay({
  days, groups, token, answers, partials, answerTimes,
  waiting, disturbs, standing, submitAction,
}) {
  // there is exactly one batch value in the engine - `nothingDocumented` - so
  // one provider covers it and the contexts never nest
  const batched = groups.find((g) => g[0]?.batch) || null;
  const plain = groups.filter((g) => !g[0]?.batch);
  const batchDates = new Set(batched ? batched.map((q) => q.date) : []);

  const order = new Map(days.map((d, i) => [d.date, i]));
  const datesOf = (q) => q.dates || (q.date ? [q.date] : []);

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

  const restsByDate = new Map();
  for (const group of groups) {
    for (const q of group) {
      const known = (q.needs || []).find((n) => n.kindOf === "rest")?.known;
      if (!known?.length || !q.date || restsByDate.has(q.date)) continue;
      const placed = known
        .map((k) => ({ min: toMinutes(k.from), corrected: k.corrected }))
        .filter((k) => k.min != null);
      if (placed.length) restsByDate.set(q.date, placed);
    }
  }

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
      key={group[0].kind}
      token={token}
      questions={group}
      answers={answers}
      partials={partials}
      answerTimes={answerTimes}
      waiting={waiting}
      disturbs={disturbs}
      standing={standing}
      submitAction={submitAction}
    />
  );

  const list = (
    <ol className="mt-4 space-y-4">
      {days.map((day) => {
        const mine = anchored.get(day.date) || [];
        const elsewhere = alsoAsked.get(day.date) || [];
        const asks = batchDates.has(day.date) || mine.length > 0;
        return (
          <li
            key={day.date}
            className={`rounded-xl border bg-surface p-4 sm:p-5 ${
              asks ? "border-amber-400 dark:border-amber-700" : "border-border"
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="font-mono text-sm font-semibold text-foreground">{day.date}</h3>
              <p className="text-sm text-muted">
                {(Math.round((day.paidHours || 0) * 100) / 100).toFixed(2)} hrs
              </p>
            </div>

            {/* the picture beside the question on a wide screen, above it on a
                phone - so the day is still in front of you while you answer */}
            <div className="mt-3 gap-5 sm:flex sm:items-start">
              <div className="shrink-0 sm:w-52">
                <DayCalendar day={day} rests={restsByDate.get(day.date) || []} />
              </div>
              <div className="mt-4 min-w-0 flex-1 sm:mt-0">
                {/* THE HOUR-MOVING QUESTION FIRST, THEN THE BREAKS ROW.
                    A locked row says "waiting on the question above", and the
                    question it waits on is a plain card - so drawing the batch
                    row first would put the blocker BELOW the row pointing at it
                    whenever both land on the same day. Ordering it this way also
                    matches what has to happen: the answer that re-derives the
                    day is given before the premium question that reads it. */}
                {mine.map(card)}
                {batchDates.has(day.date) && <BatchDays dates={[day.date]} />}
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

  return (
    <div className="mt-5">
      {undated.length > 0 && <div className="mb-6">{undated.map(card)}</div>}

      {batched ? (
        <BatchProvider
          token={token}
          list={batched}
          answers={answers}
          partials={partials}
          waiting={waiting}
          standing={standing}
          submitAction={submitAction}
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
  );
}
