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
import { useState, useTransition } from "react";
import { parseLooseTime, formatTimeDisplay } from "@/lib/loose-time";

const r2 = (n) => Math.round((n || 0) * 100) / 100;

// what each kind asks, and what each answer means. Kept as data so the wording
// can be read in one place rather than chased through six branches of JSX.
//
// EVERY ONE OF THESE REVERSED ON 2026-08-11. `standing.charged` is the penalty
// pay actually on the sheet, and after the flip that is EVERY fault the reports
// show. So the sheet arrives carrying the money, and an answer can only take it
// off: "yes I took my break" removes an hour, "no I missed it" agrees with what
// the sheet already says and changes nothing.
//
// The old copy said the opposite in every card - "nothing is charged for this
// day right now", "saying no is what adds an hour" - and all of it sat above a
// signature. There is no half-way version of this file.
function copyFor(q, standing) {
  const base = standing?.charged || 0;
  const prem = (n) => `${r2(n).toFixed(2)} hours`;
  // saying YES is what takes pay off now. Saying no leaves the sheet alone.
  // `q.moves` is negative and already knows whether this day owes anything.
  const off = Math.abs(q.moves || 0);
  const leftIfYes = () => prem(Math.max(0, base - off));
  switch (q.kind) {
    case "repair":
      return {
        title: "One question before you sign",
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
        yes: { label: "Yes, I took that break", why: "You stopped for about ten minutes around then." },
        no: { label: "No, I did not take it", why: "You worked through. Your penalty pay stays as it is." },
        timeLabel: `What time did your break start on ${q.date}?`,
        yesEffect: off > 0
          ? <>Your penalty pay goes from <b>{prem(base)}</b> to <b>{leftIfYes()}</b>.</>
          : <>Nothing changes. Your penalty pay stays at <b>{prem(base)}</b>.</>,
        noEffect: <>Nothing changes. Your penalty pay stays at <b>{prem(base)}</b>.</>,
        footnote: (
          <>
            <b>This day is already paid a penalty.</b>{" "}
            {off > 0
              ? <>Saying you took the break is what removes it, taking your penalty pay from {prem(base)} to {leftIfYes()}. Only say yes if you really did stop.</>
              : <>Neither answer changes your pay. We are asking so the record is right.</>}
          </>
        ),
      };

    case "restIsMealLength":
      return {
        title: "Was this your meal break?",
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
        no: { label: "No, that was a rest break", why: "You did not get a meal that day. Your penalty pay stays as it is." },
        yesEffect: off > 0
          ? <>Your penalty pay goes from <b>{prem(base)}</b> to <b>{leftIfYes()}</b>.</>
          : <>Nothing changes. Your penalty pay stays at <b>{prem(base)}</b>.</>,
        noEffect: <>Nothing changes. Your penalty pay stays at <b>{prem(base)}</b>.</>,
        footnote: (
          <>
            <b>This day is being paid for a missed meal.</b>{" "}
            {off > 0
              ? <>Telling us the thirty minutes WAS your meal is what removes it, taking your penalty pay from {prem(base)} to {leftIfYes()}.</>
              : <>Neither answer changes your pay. We are asking so the record is right.</>}
          </>
        ),
      };

    case "restNoTimes":
      return {
        title: "Did you take this break?",
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
            <b>{q.row.taken} of {q.row.owed}</b> rest breaks that day
            {off > 0
              ? <> and pays you an hour of penalty pay for the shortfall.</>
              : <>, so the break is counted and no penalty is owed. What is missing is the time.</>}
          </>
        ),
        evidence: [
          "Rest entry: no start, no end",
          `Your punches: ${(q.row.punches || []).join(" | ") || "none recorded"}`,
          `Hours paid that day: ${q.row.hours} · rest breaks owed: ${q.row.owed}`,
        ],
        yes: { label: "Yes, I took it", why: "Somebody logged it without the times." },
        no: { label: "No, I did not take it", why: "You worked through. Your penalty pay stays as it is." },
        timeLabel: `What time did your break start on ${q.date}?`,
        yesEffect: off > 0
          ? <>Your penalty pay goes from <b>{prem(base)}</b> to <b>{leftIfYes()}</b>.</>
          : <>Your record gets the time on it. Your pay does not change either way.</>,
        noEffect: <>Nothing changes. Your penalty pay stays at <b>{prem(base)}</b>.</>,
        footnote: off > 0
          ? (
            <>
              <b>This day is already paid a penalty.</b> Saying you took the break is what removes
              it, taking your penalty pay from {prem(base)} to {leftIfYes()}.
            </>
          )
          : (
            <>
              <b>Neither answer costs you anything.</b> The break is already counted - what is
              missing is the time it started, so the record can say when.
            </>
          ),
      };

    case "restOutsideShift":
      return {
        title: "One of your breaks is logged outside your shift",
        body: (
          <>
            On <b>{q.row.days} {q.row.days === 1 ? "day" : "days"}</b> the break record has your
            rest break at a time <b>outside the shifts you were rostered for</b>. We have paid
            those <b>{q.row.minutes} minutes</b> as time you were on a break off the clock, so
            they are on your timesheet already.
            <br /><br />
            <b>Is that right?</b> If the time was just entered wrongly and you were not actually
            on a break then, tell us and we will take them back off.
          </>
        ),
        dates: q.dates,
        yes: {
          label: "The time was entered wrong",
          why: "You were not on a break then. The minutes come back off.",
        },
        no: {
          label: "No, I really did take it then",
          why: "You took your break off the clock. The minutes stay on your sheet.",
        },
        yesEffect: (
          <>
            <b>{r2(off).toFixed(2)} hours</b> come off your timesheet, along with any overtime
            they created. Your sheet will be rebuilt.
          </>
        ),
        noEffect: <>Nothing changes. Your hours stay as they are on the timesheet below.</>,
        footnote: (
          <>
            <b>The minutes are already on your sheet</b>, so leaving this alone costs you nothing.
            Only say the time was wrong if you really were not on a break then.
          </>
        ),
      };

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
      return {
        title: "We could not find your breaks on record",
        body: (
          <>
            On <b>{q.row.days} {q.row.days === 1 ? "day" : "days"}</b> we cannot find a ten minute
            rest period{q.row.mealDays > 0 ? " or a meal break" : ""} recorded for you. Rather than
            assume you took them, we have <b>paid you the penalty</b> for every one - it is on the
            timesheet below.
            <br /><br />
            <b>Did you actually take them?</b> Answer each day below. If you did take a break and
            simply did not write it down, say so and that hour comes off. If you are not sure,
            leave it - nothing is taken off unless you tell us to.
          </>
        ),
        yes: {
          label: "Yes, I took my breaks",
          why: "You took them and just did not write them down. That hour comes off.",
        },
        no: {
          label: "No, I missed them",
          why: "You worked through. The penalty pay stays on your sheet.",
        },
        yesEffect: <>Your penalty pay goes from <b>{prem(base)}</b> to <b>{leftIfYes()}</b>.</>,
        noEffect: <>Nothing changes. Your penalty pay stays at <b>{prem(base)}</b>.</>,
        footnote: (
          <>
            <b>You are legally entitled to these breaks</b>, and to be paid a penalty if you did
            not get them. That pay is already on your sheet, so you lose nothing by ignoring this.
            Only say you took a break if you really did.
          </>
        ),
      };

    // A BREAK TOO LONG TO BE A REST, ON A DAY WHOSE LUNCH IS ACCOUNTED FOR.
    // Hatt 07/20: sixty minutes logged while clocked out between two shifts,
    // with her lunch already rostered at noon. Before 2026-08-10 the row was
    // thrown away, she lost the rest credit, and nobody asked her anything.
    case "restTooLongOffClock":
      return {
        title: "One of your breaks does not look like a break",
        body: (
          <>
            On <b>{q.date}</b> a break is recorded from <b>{q.row.from}</b> to <b>{q.row.to}</b>,
            which is <b>{q.row.minutes} minutes</b>. A rest break is ten minutes and your lunch
            that day is already accounted for
            {q.row.onClock ? "" : ", and you were clocked out at the time"}.
            <br /><br />
            We have left it as it is and <b>changed nothing</b> about your hours or your pay.
            We would just like to know what it was, so the record is right.
          </>
        ),
        yes: {
          label: "That was a real break I took",
          why: "We will note it as a break you took. Your hours do not change.",
        },
        no: {
          label: "That looks like a mistake",
          why: "We will note it as a mis-entry so payroll knows to ignore it.",
        },
        yesEffect: <>Nothing changes. Your hours and your penalty pay stay exactly as they are.</>,
        noEffect: <>Nothing changes. Your hours and your penalty pay stay exactly as they are.</>,
        footnote: (
          <>
            <b>Neither answer costs you anything.</b> This one is about the record, not the money -
            it is here because throwing the entry away without asking would be us deciding what
            happened on your day.
          </>
        ),
      };

    // THE ONE MÁNU RULED ON HIMSELF, and all three rows were his: "those 10
    // minutes were documented outside of a shift in between a time with no
    // scheduling so its time added." It used to move the break and withhold the
    // minutes without asking. Now the minutes are paid and the move is what
    // needs his say-so.
    case "restAtServiceEdge":
      return {
        title: "One of your breaks sits right on the edge of your shift",
        body: (
          <>
            On <b>{q.row.days} {q.row.days === 1 ? "day" : "days"}</b> your rest break is logged{" "}
            <b>immediately outside the shift it was filed under</b> - starting exactly as it ended,
            or ending exactly as it began. We have taken that at face value and{" "}
            <b>paid you the {q.row.minutes} minutes</b> as a break you took off the clock.
            <br /><br />
            <b>Or did you mean it to be inside your shift?</b> If the break really happened during
            the shift and was logged against its edge by mistake, tell us and we will move it there.
          </>
        ),
        dates: q.dates,
        evidence: (q.row.detail || []).slice(0, 6).map(
          (x) => `${x.date}: logged ${x.wasFrom}-${x.wasTo}, service ${x.service} - inside would be ${x.from}-${x.to}`,
        ),
        yes: {
          label: "It should have been inside my shift",
          why: "We move it inside the shift, and the extra minutes come back off.",
        },
        no: {
          label: "No, I took it outside my shift",
          why: "The minutes stay paid, and we flag the entry for payroll.",
        },
        yesEffect: (
          <>
            <b>{r2(off).toFixed(2)} hours</b> come off your timesheet, along with any overtime they
            created. Your sheet will be rebuilt.
          </>
        ),
        noEffect: (
          <>
            Nothing changes. Your hours stay as they are, and payroll gets told the break is being
            logged against the wrong shift in QSClock.
          </>
        ),
        footnote: (
          <>
            <b>The minutes are already paid</b>, so leaving this alone costs you nothing. Only say
            it belonged inside your shift if that is what actually happened.
          </>
        ),
      };

    case "shortMealRest":
      return {
        title: "We read a meal block as your rest break. Is that right?",
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
          why: "The credit comes off, and any premium it cleared goes back on.",
        },
        yesEffect: <>Nothing changes. Your timesheet stays as it is below.</>,
        noEffect: q.movesOnDecline > 0
          ? <>Your break premium goes back up by <b>{r2(q.movesOnDecline).toFixed(2)} hours</b>, and your sheet will be rebuilt.</>
          : <>Your record is corrected. Your pay does not change either way.</>,
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
function OneQuestion({ token, q, answer, standing, submitAction, showDate }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState(null);
  const [picking, setPicking] = useState(false);
  const [at, setAt] = useState("");
  const [proposed, setProposed] = useState(null);
  const c = copyFor(q, standing);
  if (!c) return null;

  const answered = answer === "accepted" || answer === "declined";
  const typedHHMM = parseLooseTime(at, { assumeWorkday: true });

  function commit() {
    if (!proposed) return;
    setErr(null);
    start(async () => {
      const res = await submitAction({
        token, id: q.id, choice: proposed.choice, at: proposed.at,
      });
      if (!res?.ok) setErr(res?.error || "failed");
      else { setProposed(null); setPicking(false); }
    });
  }

  return (
    <div className={showDate ? "mt-4 border-t border-border pt-4 first:mt-0 first:border-0 first:pt-0" : ""}>
      {showDate && <p className="text-sm font-semibold text-foreground">{q.date}</p>}

      {answered ? (
        <p className="mt-1 text-sm text-muted">
          <b className="text-foreground">
            {answer === "accepted" ? "Confirmed" : "You told us no"}
          </b>
          {" - "}
          {answer === "accepted" ? "thank you." : "your timesheet has been rebuilt."}{" "}
          You can change this any time before you sign.
        </p>
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

      <div className="mt-3 flex flex-wrap gap-2.5">
        <Choice
          on={answer === "accepted" || (proposed?.choice === "yes" && !proposed.at)}
          tone="yes"
          busy={pending}
          label={c.yes.label}
          why={!answered ? c.yes.why : null}
          onClick={() => { setPicking(false); setProposed({ choice: "yes" }); }}
        />
        <Choice
          on={answer === "declined" || proposed?.choice === "no"}
          tone="no"
          busy={pending}
          label={c.no.label}
          why={!answered ? c.no.why : null}
          onClick={() => { setPicking(false); setProposed({ choice: "no" }); }}
        />
        {q.canGiveTime && !answered && (
          <Choice
            on={picking || !!proposed?.at}
            tone="yes"
            busy={pending}
            label="Yes, but at a different time"
            why="Tell us when you actually stopped."
            onClick={() => { setProposed(null); setPicking((p) => !p); }}
          />
        )}
      </div>

      {picking && !answered && (
        <div className="mt-3 rounded-lg border border-border-strong bg-surface-2 p-3">
          <label htmlFor={`at-${q.id}`} className="block text-sm font-semibold text-foreground">
            {c.timeLabel}
          </label>
          <p className="mt-1 text-xs text-muted">
            Ten minutes from whenever you say. If it falls outside the hours you were clocked in
            for, those ten minutes get PAID and added to your day.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
            <input
              id={`at-${q.id}`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={at}
              onChange={(e) => setAt(e.target.value)}
              placeholder="e.g. 230 or 2:30pm"
              className="w-40 rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-foreground"
            />
            <span className="text-sm text-muted">
              {at.trim()
                ? typedHHMM
                  ? <>reads as <b className="text-foreground">{formatTimeDisplay(typedHHMM)}</b></>
                  : <span className="text-rose-600 dark:text-rose-400">not a time we can read</span>
                : null}
            </span>
            <button
              type="button"
              disabled={pending || !typedHHMM}
              onClick={() => setProposed({ choice: "yes", at: typedHHMM })}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Save that time
            </button>
          </div>
        </div>
      )}

      {/* the panel takes the colour of the answer it is about to write, so the
          last thing somebody reads before committing is the same green or red
          they just clicked. */}
      {proposed && !answered && (
        <div className={`mt-3 rounded-lg border-2 p-4 ${
          proposed.choice === "yes"
            ? "border-emerald-500 bg-emerald-500/10"
            : "border-rose-500 bg-rose-500/10"
        }`}>
          <p className="text-base font-semibold text-foreground">Are you sure you want to confirm?</p>
          <div className="mt-2 space-y-1.5 text-sm text-muted">
            <p>{proposed.choice === "yes" ? c.yesEffect : c.noEffect}</p>
            {proposed.at && (
              <p>
                The sheet will show <b className="text-foreground">{formatTimeDisplay(proposed.at)}</b>,
                and say it came from you rather than from the break record.
              </p>
            )}
            <p className="text-xs">You can change your answer any time before you sign.</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2.5">
            <button
              type="button"
              disabled={pending}
              onClick={commit}
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                proposed.choice === "yes" ? "bg-emerald-600" : "bg-rose-600"
              }`}
            >
              Yes, confirm
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
function BatchCard({ token, list, answers, standing, submitAction, copy }) {
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
  const valueFor = (q) =>
    picked[q.id] ?? (answers?.[q.id] === "accepted" ? "yes" : answers?.[q.id] === "declined" ? "no" : null);

  const rawAt = (q, slot) => times[q.id]?.[slot] ?? "";
  const setAt = (q, slot, v) =>
    setTimes((t) => ({ ...t, [q.id]: { ...(t[q.id] || {}), [slot]: v } }));
  // a slot is satisfied by anything the loose parser can read - "115", "1:15p",
  // "1.15 pm" - or by the schedule time it arrived pre-filled with
  const minutesAt = (q, need) => {
    const raw = rawAt(q, need.slot);
    if (raw.trim()) return parseLooseTime(raw, { assumeWorkday: true });
    return need.prefill ? parseLooseTime(need.prefill, { assumeWorkday: true }) : null;
  };
  // EVERY DAY ANSWERED "took them" OWES ITS TIMES. Mánu 2026-08-10: required,
  // "because we need a record of this". A day answered "missed them" owes none -
  // there is nothing to say when about.
  const missingTimes = list.reduce((n, q) => {
    if (valueFor(q) !== "yes") return n;
    return n + (q.needs || []).filter((need) => !minutesAt(q, need)).length;
  }, 0);

  const chosen = list.map((q) => ({ q, v: valueFor(q) }));
  const missed = chosen.filter((x) => x.v === "no");
  const took = chosen.filter((x) => x.v === "yes");
  const undecided = chosen.filter((x) => !x.v);
  const hours = missed.reduce((n, x) => n + (x.q.movesOnDecline || 0), 0);
  // only the days whose answer differs from what is already stored need writing
  const dirty = chosen.filter(
    ({ q, v }) =>
      v && v !== (answers?.[q.id] === "accepted" ? "yes" : answers?.[q.id] === "declined" ? "no" : null),
  );

  function commit() {
    setErr(null);
    start(async () => {
      const res = await submitAction({
        token,
        batch: chosen.filter((x) => x.v).map(({ q, v }) => ({
          id: q.id,
          choice: v,
          // sent as HH:MM, the one shape the server parses. A day answered
          // "missed them" sends none - there is nothing to say when about.
          times:
            v === "yes" && q.needs?.length
              ? Object.fromEntries(
                  q.needs
                    .map((need) => [need.slot, minutesAt(q, need)])
                    .filter(([, m]) => m),
                )
              : null,
        })),
      });
      if (!res?.ok) setErr(res?.error || "failed");
      else { setConfirming(false); setPicked({}); setTimes({}); }
    });
  }

  // WHICH BREAK THIS ROW IS ABOUT. Since the split, a question owns one part of
  // one day, so the label names the part rather than the day's whole set.
  const partName = (q) =>
    q.row?.part === "meal" ? "Lunch break" : q.row?.part === "rest" ? "Rest breaks" : null;
  const label = (q, v) =>
    q.row?.part === "meal"
      ? (v === "yes" ? "Took it" : "Missed it")
      : (v === "yes" ? "Took them" : "Missed them");

  // the yes/no pair for one decision. Lifted out of the row markup when the
  // split arrived, because a day can now show two of them.
  const Toggle = ({ item: { q, v } }) => (
    <span className="flex overflow-hidden rounded-lg border border-border-strong">
      {["yes", "no"].map((opt) => (
        <button
          key={opt}
          type="button"
          disabled={pending}
          aria-pressed={v === opt}
          onClick={() => {
            setConfirming(false);
            setPicked((p) => ({ ...p, [q.id]: opt }));
          }}
          className={`px-3.5 py-1.5 text-sm font-semibold transition disabled:opacity-50 ${
            v === opt
              ? opt === "yes"
                ? "bg-emerald-500/15 text-emerald-700 ring-2 ring-inset ring-emerald-500 dark:text-emerald-300"
                : "bg-rose-500/15 text-rose-700 ring-2 ring-inset ring-rose-500 dark:text-rose-300"
              : "bg-surface-2 text-muted hover:text-foreground"
          }`}
        >
          {label(q, opt)}
        </button>
      ))}
    </span>
  );

  // the times a "took them" owes. Now scoped to ONE part, so a both-day answered
  // "took my lunch, missed my tens" asks for one time and not three.
  const TimesFor = ({ q, v }) => {
    if (v !== "yes" || !(q.needs || []).length) return null;
    return (
      <div className="mt-2 w-full rounded-lg border border-border-strong bg-surface-2 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-faint">
          When did you take {q.needs.length === 1 ? "it" : "them"} on {q.date}?
        </p>
        <div className="mt-2 space-y-2">
          {q.needs.map((need) => {
            const raw = rawAt(q, need.slot);
            const mins = minutesAt(q, need);
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
                    mins ? "border-emerald-500" : "border-amber-500/70"
                  }`}
                />
                {!mins && need.suggest && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => { setConfirming(false); setAt(q, need.slot, need.suggest); }}
                    className="rounded-full border border-dashed border-border-strong px-3 py-1 text-xs text-brand transition hover:border-solid"
                  >
                    use {need.suggest}
                  </button>
                )}
                <span className="text-xs text-muted">
                  {mins && raw.trim() ? `reads as ${formatTimeDisplay(mins)}` : need.hint}
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
          <li
            key={date}
            className={`py-2.5 ${items.every((x) => x.v === "no") ? "bg-rose-500/5" : ""}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <span className="min-w-0">
                <span className="font-mono text-sm text-foreground">{date}</span>
                <span className="ml-3 text-xs text-muted">
                  {items.length === 1
                    ? `${items[0].q.row?.part === "meal" ? "meal break" : "rest break"} · `
                    : ""}
                  {hours} hrs worked
                </span>
                {items.length > 1 && (
                  <span className="ml-2 rounded-full border border-border-strong px-2 py-0.5 text-[11px] text-muted">
                    2 to answer
                  </span>
                )}
              </span>
              {items.length === 1 && <Toggle item={items[0]} />}
            </div>
            {items.length > 1 &&
              items.map((item) => (
                <div
                  key={item.q.id}
                  className={`mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-l-2 border-border py-1 pl-3 ${
                    item.v === "no" ? "bg-rose-500/10" : ""
                  }`}
                >
                  <span className="text-sm text-foreground">{partName(item.q)}</span>
                  <Toggle item={item} />
                </div>
              ))}
            {items.map(({ q, v }) => (
              <TimesFor key={`t-${q.id}`} q={q} v={v} />
            ))}
          </li>
        ))}
      </ul>

      {!confirming && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending || !dirty.length || missingTimes > 0}
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
            {missed.length ? (
              <>
                <p>
                  You are telling us you missed breaks on{" "}
                  <b className="text-foreground">
                    {missed.length} of {list.length} {list.length === 1 ? "day" : "days"}
                  </b>
                  {took.length ? `, and took them on the other ${took.length}` : ""}.
                </p>
                <p>
                  <b className="text-foreground">{r2(hours).toFixed(2)} hours</b> of penalty pay go
                  onto your timesheet, taking it from{" "}
                  <b className="text-foreground">{r2(base).toFixed(2)} hours</b> to{" "}
                  <b className="text-foreground">{r2(base + hours).toFixed(2)} hours</b> - one hour
                  for a missed meal and one for missed rest breaks on each day. Your sheet will be
                  rebuilt.
                </p>
              </>
            ) : (
              <>
                <p>
                  You are telling us you took your breaks on{" "}
                  <b className="text-foreground">
                    all {took.length} {took.length === 1 ? "day" : "days"}
                  </b>{" "}
                  and simply did not write them down.
                </p>
                <p>
                  Nothing changes. Your penalty pay stays at{" "}
                  <b className="text-foreground">{r2(base).toFixed(2)} hours</b>.
                </p>
              </>
            )}
            {took.length > 0 && (
              <p>
                The times you gave go onto your timesheet as your own record of those breaks.
              </p>
            )}
            {undecided.length > 0 && (
              <p className="text-amber-700 dark:text-amber-400">
                {undecided.length} {undecided.length === 1 ? "day is" : "days are"} still unanswered
                and will stay that way. You cannot sign until every day has an answer.
              </p>
            )}
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
  token, questions, answers, standing, submitAction,
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
        <p className="text-base font-semibold text-foreground">{c.title}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">{c.body}</p>
        <BatchCard
          token={token}
          list={list}
          answers={answers}
          standing={standing}
          submitAction={submitAction}
          copy={c}
        />
      </div>
    );
  }

  return (
    <div className={`mt-5 rounded-xl p-5 ${tone}`}>
      <p className="text-base font-semibold text-foreground">{c.title}</p>
      {!perDay && <p className="mt-2 text-sm leading-relaxed text-muted">{c.body}</p>}
      {perDay && (
        <p className="mt-2 text-sm leading-relaxed text-muted">
          There {list.length === 2 ? "are two of these" : `are ${list.length} of these`} on your
          timesheet. Each one is a separate day and a separate hour, so they are asked one at a
          time.
        </p>
      )}

      {c.dates && (
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
