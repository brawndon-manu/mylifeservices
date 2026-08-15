"use client";

// EVERY SCENARIO CARD ON THE TIMESHEET REVIEW PAGE, CLICKABLE, WRITING NOTHING.
//
// The cards are the real components handed the real questions. The only thing
// swapped is the action behind the buttons: instead of `answerTimesheetQuestion`
// they get `pretendAnswer` below, which records what it was handed in this tab
// and returns `{ ok: true }`.
//
// WHY THE STATE LIVES HERE AND NOT ON THE SERVER. Every card calls
// `router.refresh()` after a successful answer. Against a fixture the server
// rebuilds the same nine days, so an answer held server-side would revert the
// instant it was given - the card would flash answered and undo itself. Holding
// it in this component is what makes the page clickable rather than a gallery.
//
// AND WHY THIS EXISTS AT ALL. `?preview=1` opens a real person's page and then
// refuses every write, so no control on it can be seen in its pressed state.
// The half that matters - what the answer does to the record - is exactly the
// half it withholds.
// DayByDay IS A SERVER COMPONENT ON THE REVIEW PAGE and a client one here,
// because the state the cards read has to live above them and that state is
// client state. What follows it into the browser is `movesHours`, and behind
// that questions.js -> rests.js -> xls.js. Checked before relying on it: no
// node builtins anywhere in that chain, and xls.js touches `Buffer` only inside
// functions this page never calls, so it loads and sits there. The cost is
// bundle weight on one gated admin route, which is the cheaper of the two
// prices - the other was reshaping a component that works.
import { useMemo, useState } from "react";
import DayByDay from "@/app/t/[token]/DayByDay";
import { BREAK_ASKS } from "./fixture-asks";
import TimesheetQuestion from "@/app/t/[token]/TimesheetQuestion";

// minutes past midnight -> "1:15p", the sheet's only time format. Copied rather
// than imported: the server's own `shortClock` sits inside a "use server" file.
const clock = (min) => {
  const h24 = Math.floor(min / 60);
  const mm = min % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}${mm ? `:${String(mm).padStart(2, "0")}` : ""}${h24 < 12 ? "a" : "p"}`;
};
const fromHHMM = (raw) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(raw || "").trim());
  return m ? clock(Number(m[1]) * 60 + Number(m[2])) : null;
};

const KIND_LABEL = {
  repair: "Rest break time looks mis-entered",
  restNoTimes: "Break recorded with no times",
  restIsMealLength: "Break long enough to be a meal",
  restOutsideScheduled: "Ten logged outside your shift",
  restTooLongOffClock: "Break too long to be a rest",
  miscTime: "Time on your schedule marked as Misc",
  shortMealRest: "Meal block read as your rest break",
  nothingDocumentedMeal: "Nothing documented - the lunch",
  nothingDocumentedRest: "Nothing documented - the tens",
  mealLate: "Lunch started late",
};

export default function ScenarioStage({ board }) {
  const [selected, setSelected] = useState(board.rail[0]?.kind ?? null);
  const [view, setView] = useState("simple");
  const [answers, setAnswers] = useState({});
  const [choices, setChoices] = useState({});
  const [partials, setPartials] = useState({});
  const [answerTimes, setAnswerTimes] = useState({});
  const [log, setLog] = useState([]);
  const [showAsks, setShowAsks] = useState(true);

  // the reason cards write nothing either. Same shape as the real action's
  // return so BreakReason behaves exactly as it does on the review page.
  const pretendReason = async ({ findingKey, agree, text }) => {
    if (!agree && !String(text || "").trim()) return { ok: false, error: "empty" };
    setLog((l) => [{
      id: findingKey, kind: "break reason", date: findingKey.split("-").slice(2).join("-"),
      choice: agree ? "agreed with ours" : "gave their own",
      status: "confirmed", stated: [], patch: null, reason: text || null,
    }, ...l].slice(0, 12));
    return { ok: true };
  };

  const groups = board.groups;
  // a kind can be several cards - `repair` is one per out-time - so selecting a
  // rail row shows every group that holds it rather than the first
  const shown = selected === "all"
    ? groups
    : (board.rail.find((r) => r.kind === selected)?.indexes || []).map((i) => groups[i]);
  const shownDates = useMemo(
    () => new Set(shown.flatMap((g) => g.flatMap((q) => q.dates || [q.date])).filter(Boolean)),
    [shown],
  );
  const days = selected === "all" ? board.days : board.days.filter((d) => shownDates.has(d.date));

  function reset() {
    setAnswers({}); setChoices({}); setPartials({}); setAnswerTimes({}); setLog([]);
  }

  // THE FAKE ACTION. Same two payload shapes the real one takes - a single
  // answer, and the `batch` array the grouped card sends - and the same rules
  // about what each choice settles as, so the card comes back in the state a
  // real answer would have left it in.
  //
  //   yes                 -> accepted
  //   no / notaken /
  //   wrongone / partial  -> declined. A partial is a decline that KEEPS its
  //                          times, which is what makes it show as "took one"
  //                          instead of "missed them" - see `partials`.
  //   null                -> the answer comes back off the record
  //
  // `resolutionNote` is the one thing missing: the server builds it with
  // `resolutionFor`, which lives inside the "use server" file and cannot be
  // imported here. Everything else below is what would have been written.
  async function pretendAnswer(payload) {
    const list = Array.isArray(payload?.batch)
      ? payload.batch.map((b) => ({
        id: b?.id, choice: b?.choice, at: b?.at ?? null, times: b?.times || null,
        reason: b?.reason ?? null,
      }))
      : [{
        id: payload?.id, choice: payload?.choice, at: payload?.at ?? null,
        times: payload?.times || null, reason: payload?.reason ?? null,
      }];

    const byId = new Map(groups.flat().map((q) => [q.id, q]));
    const rows = [];

    for (const a of list) {
      const q = byId.get(a.id);
      if (!q) continue;

      if (a.choice == null) {
        setAnswers((s) => { const n = { ...s }; delete n[a.id]; return n; });
        setChoices((s) => { const n = { ...s }; delete n[a.id]; return n; });
        setPartials((s) => { const n = { ...s }; delete n[a.id]; return n; });
        setAnswerTimes((s) => { const n = { ...s }; delete n[a.id]; return n; });
        rows.push({ id: a.id, kind: q.kind, deleted: true });
        continue;
      }

      const status = a.choice === "yes" ? "accepted" : "declined";
      // times are only kept on the answer that actually asks for them, exactly
      // as the server decides it: `needsOn` names which choice carries the
      // boxes, and a partial rides on the "yes" slot list while settling as a
      // decline
      const timeChoice = a.choice === "partial" ? "yes" : a.choice;
      const stated =
        (q.needs?.length && (q.needsOn || "yes") === timeChoice)
          ? q.needs
            .map((need) => {
              const from = fromHHMM(a.times?.[need.slot]) || (a.at ? fromHHMM(a.at) : null);
              return from
                ? { slot: need.slot, kindOf: need.kindOf, minutes: need.minutes, from,
                    date: need.date ?? null, replaces: need.replaces ?? null, source: "typed" }
                : null;
            })
            .filter(Boolean)
          : [];

      setAnswers((s) => ({ ...s, [a.id]: status }));
      setChoices((s) => ({ ...s, [a.id]: a.choice }));
      if (stated.length) {
        setAnswerTimes((s) => ({ ...s, [a.id]: stated }));
        // a decline that still carries times is a partial, which is the only
        // thing that separates "I got one of my two" from "I got neither"
        if (status === "declined") setPartials((s) => ({ ...s, [a.id]: true }));
      } else {
        setAnswerTimes((s) => { const n = { ...s }; delete n[a.id]; return n; });
        setPartials((s) => { const n = { ...s }; delete n[a.id]; return n; });
      }

      rows.push({
        id: a.id, kind: q.kind, date: q.date || (q.dates || []).join(", "),
        choice: a.choice, status, stated,
        patch: board.patches?.[a.id]?.[a.choice] ?? null,
        // the SECOND row a "no" now writes - a TimesheetBreakAnswer under the
        // key the admin control shares. The readout shows it because it is the
        // half nobody has ever seen written: the table is at 0 rows.
        reason: a.reason || null,
      });
    }

    setLog((l) => [...rows, ...l].slice(0, 12));
    return { ok: true };
  }

  return (
    <div className="grid gap-0 lg:grid-cols-[264px_minmax(0,1fr)]">
      <Rail
        rail={board.rail}
        groups={groups}
        selected={selected}
        onSelect={setSelected}
        answers={answers}
        waiting={board.deps.waiting}
      />

      <div className="min-w-0 px-0 pt-5 lg:px-6 lg:pt-0">
        <div className="flex flex-wrap items-center gap-2">
          <Toggle on={view === "simple"} onClick={() => setView("simple")}>Day by day</Toggle>
          <Toggle on={view === "detailed"} onClick={() => setView("detailed")}>All questions</Toggle>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
          <Toggle on={selected === "all"} onClick={() => setSelected(selected === "all" ? 0 : "all")}>
            Everything at once
          </Toggle>
          <Toggle on={showAsks} onClick={() => setShowAsks((v) => !v)}>
            Reasons on their days
          </Toggle>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
          >
            Reset every answer
          </button>
        </div>

        <div className="mt-5">
          {view === "simple" ? (
            <DayByDay
              days={days}
              groups={shown}
              scheduled={board.scheduled}
              restsOnRecord={board.restsOnRecord}
              token="tests-fixture"
              answers={answers}
              partials={partials}
              answerTimes={answerTimes}
              choices={choices}
              waiting={board.deps.waiting}
              disturbs={board.deps.disturbs}
              standing={board.standing}
              submitAction={pretendAnswer}
              // the reasons, on the days they are about - the same prop the
              // review page passes. Filtered with the rest of the stage, so
              // picking one kind does not leave another day's reason stranded
              // beside it.
              breakAsks={showAsks ? BREAK_ASKS : []}
              breakAction={pretendReason}
            />
          ) : (
            shown.map((group) => (
              <TimesheetQuestion
                key={group[0].id}
                token="tests-fixture"
                questions={group}
                answers={answers}
                partials={partials}
                answerTimes={answerTimes}
                choices={choices}
                waiting={board.deps.waiting}
                disturbs={board.deps.disturbs}
                standing={board.standing}
                submitAction={pretendAnswer}
              />
            ))
          )}
        </div>

        <Readout log={log} onClear={() => setLog([])} />
      </div>
    </div>
  );
}

function Rail({ rail, groups, selected, onSelect, answers, waiting }) {
  // per kind, for the same reason `railRows` counts per kind: two rows can point
  // at one card, and "3 answered" on both of them would be one answer counted
  // twice
  const answeredIn = (row) =>
    row.indexes.flatMap((i) => groups[i]).filter((q) => q.kind === row.kind && answers[q.id]).length;
  return (
    <div className="border-b border-border pb-4 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
      <p className="px-2 pb-3 text-[11px] font-bold uppercase tracking-widest text-faint">
        {rail.length} kinds · {groups.reduce((n, g) => n + g.length, 0)} questions
      </p>
      {rail.map((row, i) => {
        const on = selected === row.kind;
        const done = answeredIn(row);
        const held = row.indexes
          .flatMap((i) => groups[i])
          .some((q) => q.kind === row.kind && waiting?.has?.(q.id));
        return (
          <button
            key={row.kind}
            type="button"
            disabled={!row.cards}
            onClick={() => onSelect(row.kind)}
            className={`mb-1 block w-full rounded-lg border px-3 py-2 text-left transition ${
              on
                ? "border-border-strong bg-surface text-foreground"
                : "border-transparent text-muted hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent"
            }`}
          >
            <span className="block text-[13px] font-semibold">{KIND_LABEL[row.kind] || row.kind}</span>
            <span className="mt-0.5 block font-mono text-[11px] text-faint">{row.kind}</span>
            <span className="mt-0.5 block text-[11px] text-faint">
              {!row.cards ? (
                <b className="text-rose-600 dark:text-rose-400">the fixture stopped producing this</b>
              ) : (
                <>
                  {row.count} {row.count === 1 ? "question" : "questions"}
                  {row.cards > 1 && <> in {row.cards} cards</>}
                  {row.shared && <> · shares a card</>}
                  {done > 0 && <> · <b className="text-emerald-700 dark:text-emerald-400">{done} answered</b></>}
                  {held && <> · <b className="text-amber-700 dark:text-amber-400">waiting</b></>}
                </>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Toggle({ on, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
        on
          ? "border-brand bg-brand/15 text-brand-dark dark:text-brand-light"
          : "border-border-strong bg-surface-2 text-muted hover:border-brand hover:text-brand"
      }`}
    >
      {children}
    </button>
  );
}

// WHAT THE PRESS WOULD HAVE WRITTEN. The row that would have gone into
// `TimesheetCorrection`, the times it would have carried, and the override
// patch `patchesFor` returns for that answer - which is the figure the sheet
// would rebuild from. None of it leaves this tab.
function Readout({ log, onClear }) {
  return (
    <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface-2 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-faint">
          What the press would have written · held in this tab, sent nowhere
        </p>
        {log.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-semibold text-muted transition hover:text-brand"
          >
            Clear
          </button>
        )}
      </div>

      {log.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          Answer a card above and the row it would have written appears here.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {log.map((r, i) => (
            <li key={`${r.id}-${i}`} className="rounded-lg border border-border bg-surface p-3">
              <p className="font-mono text-xs text-faint">
                {r.kind} · {r.date}
              </p>
              {r.deleted ? (
                <p className="mt-1 text-sm font-semibold text-rose-700 dark:text-rose-400">
                  the answer comes back off the record
                </p>
              ) : (
                <>
                  <p className="mt-1 text-sm text-foreground">
                    <span className="text-muted">choice</span>{" "}
                    <b className="font-mono">{r.choice}</b>
                    <span className="ml-3 text-muted">status</span>{" "}
                    <b className={`font-mono ${r.status === "accepted" ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>
                      {r.status}
                    </b>
                  </p>
                  {r.stated?.length > 0 && (
                    <p className="mt-1 font-mono text-xs text-muted">
                      statedBreaks: {r.stated.map((b) => `${b.slot} ${b.from}`).join(" · ")}
                    </p>
                  )}
                  {r.reason && (
                    <p className="mt-1 font-mono text-xs text-emerald-700 dark:text-emerald-400">
                      + TimesheetBreakAnswer · answer &ldquo;not-taken&rdquo; · reason &ldquo;{r.reason}&rdquo;
                    </p>
                  )}
                  <p className="mt-1 font-mono text-xs text-muted">
                    patchesFor: {r.patch && Object.keys(r.patch).length
                      ? JSON.stringify(r.patch)
                      : "{} - this answer moves no figure"}
                  </p>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-faint">
        The one field missing is <code>resolutionNote</code>, which the server builds inside
        its own action file and cannot be reached from a browser.
      </p>
    </div>
  );
}
