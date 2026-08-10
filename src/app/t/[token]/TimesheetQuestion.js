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
// can be read in one place rather than chased through five branches of JSX.
// `standing` is what premiumStanding() returns for this person: `charged` is
// the penalty pay actually on the sheet, `assumed` is what we assumed away and
// have not charged. THE BASELINE IS `charged`, and that is the correction of
// 2026-08-09 late - every one of these used to quote the stored
// ignoring-assumptions column and describe "yes" as taking an hour OFF a sheet
// that was never carrying it.
function copyFor(q, standing) {
  const base = standing?.charged || 0;
  const prem = (n) => `${r2(n).toFixed(2)} hours`;
  // saying NO is what puts an hour on now. Saying yes leaves the sheet alone.
  const owedIfNo = (n = 1) => prem(base + n);
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
        no: { label: "No, I did not take it", why: "You worked through, so an hour of penalty pay goes on." },
        timeLabel: `What time did your break start on ${q.date}?`,
        yesEffect: <>Nothing changes. Your penalty pay stays at <b>{prem(base)}</b>.</>,
        noEffect: <>Your penalty pay goes from <b>{prem(base)}</b> to <b>{owedIfNo()}</b>.</>,
        footnote: (
          <>
            <b>Nothing is charged for this day right now.</b> Saying no is what adds an hour, taking
            your penalty pay from {prem(base)} to {owedIfNo()}. Say no if you did not get the break -
            nobody will be annoyed about it.
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
        no: { label: "No, that was a rest break", why: "Nothing changes and the premium stays." },
        yesEffect: <>Nothing changes. Your penalty pay stays at <b>{prem(base)}</b>.</>,
        noEffect: <>Your penalty pay goes from <b>{prem(base)}</b> to <b>{owedIfNo()}</b>.</>,
        footnote: (
          <>
            <b>Nothing is charged for this day right now</b> - we assumed the thirty minutes was
            your meal. Saying it was not is what adds an hour, taking your penalty pay from{" "}
            {prem(base)} to {owedIfNo()}.
          </>
        ),
      };

    case "restNoTimes":
      return {
        title: "Did you take this break?",
        body: (
          <>
            On <b>{q.date}</b> the break record has a rest break for you with <b>no times on it</b>.
            We cannot tell when it was, or whether it happened. Your timesheet currently says you
            took <b>{q.row.taken} of {q.row.owed}</b> rest breaks that day and pays you an hour
            for it.
          </>
        ),
        evidence: [
          "Rest entry: no start, no end",
          `Your punches: ${(q.row.punches || []).join(" | ") || "none recorded"}`,
          `Hours paid that day: ${q.row.hours} · rest breaks owed: ${q.row.owed}`,
        ],
        yes: { label: "Yes, I took it", why: "Somebody logged it without the times. No penalty is owed." },
        no: { label: "No, I did not take it", why: "You worked through. Nothing changes and the premium stays." },
        timeLabel: `What time did your break start on ${q.date}?`,
        yesEffect: <>Nothing changes. Your penalty pay stays at <b>{prem(base)}</b>.</>,
        noEffect: <>Your penalty pay goes from <b>{prem(base)}</b> to <b>{owedIfNo()}</b>.</>,
        footnote: (
          <>
            <b>Nothing is charged for this day right now.</b> Saying no is what adds an hour, taking
            your penalty pay from {prem(base)} to {owedIfNo()}.
          </>
        ),
      };

    case "restOutsideShift":
      return {
        title: "We corrected a break time. Is that right?",
        body: (
          <>
            On <b>{q.row.days} {q.row.days === 1 ? "day" : "days"}</b> the break record has your
            rest break at a time <b>outside the shifts you were rostered for</b>. We have read
            that as the time being entered wrongly rather than as extra minutes worked, so those{" "}
            <b>{q.row.minutes} minutes</b> have <b>not</b> been added to your hours. Your break
            still counts and no premium is owed.
          </>
        ),
        dates: q.dates,
        yes: { label: "Yes, the time was entered wrong", why: "Our correction stands. Nothing more changes." },
        no: {
          label: "No, I really did take it then",
          why: "You took your break before clocking in. Those minutes are owed and go back on.",
        },
        yesEffect: <>Nothing changes. Your hours stay as they are on the timesheet below.</>,
        noEffect: (
          <>
            <b>{r2(q.movesOnDecline).toFixed(2)} hours</b> go back onto your timesheet, and any
            overtime they create comes with them. Your sheet will be rebuilt.
          </>
        ),
        footnote: (
          <>
            <b>We already made this change</b>, so confirming it changes nothing. Say no if you
            really did take that break at the time recorded, and the minutes go back on.
          </>
        ),
      };

    // ONE QUESTION PER DAY NOW, rendered as one card by BatchCard. The copy
    // here is the card's heading, so it describes the whole set; the per-day
    // wording lives in the rows.
    case "nothingDocumented":
      return {
        title: "We could not find your breaks on record",
        body: (
          <>
            On <b>{q.row.days} {q.row.days === 1 ? "day" : "days"}</b> we cannot find a ten minute
            rest period{q.row.mealDays > 0 ? " or a meal break" : ""} recorded for you. Because
            you set your own schedule and agreed to put your breaks on it, we have assumed you
            took them and have <b>not</b> added any penalty pay.
            <br /><br />
            <b>Is that right?</b> Answer each day below. If a day was too busy and you missed
            them, say so and you will be paid for it.
          </>
        ),
        yes: { label: "Yes, I took my breaks", why: "You took them and just did not write them down. Nothing changes." },
        no: { label: "No, I missed them", why: "You worked through. You are owed penalty pay and it goes on your sheet." },
        yesEffect: <>Nothing changes. Your penalty pay stays at <b>{prem(base)}</b>.</>,
        noEffect: <>Your penalty pay goes from <b>{prem(base)}</b> to <b>{owedIfNo(q.movesOnDecline)}</b>.</>,
        footnote: (
          <>
            <b>You are legally entitled to these breaks</b>, and to be paid a penalty if you did
            not get them. Nothing is charged for them right now, so saying you missed one is what
            puts the pay on. Nobody will be annoyed about it.
          </>
        ),
      };

    case "restSnappedToShift":
      return {
        title: "We moved a break time. Is that right?",
        body: (
          <>
            On <b>{q.row.days} {q.row.days === 1 ? "day" : "days"}</b> your rest break is recorded
            starting <b>right as your shift ended</b>, which would put it after you clocked out. We
            have read that as the break being logged a few minutes late rather than taken off the
            clock, and moved it to the ten minutes <b>before</b> your shift ended. Those{" "}
            <b>{q.row.minutes} minutes</b> are <b>not</b> added to your hours.
          </>
        ),
        dates: q.dates,
        evidence: (q.row.detail || []).slice(0, 6).map(
          (x) => `${x.date}: recorded ${x.wasFrom}-${x.wasTo} -> read as ${x.from}-${x.to}`,
        ),
        yes: { label: "Yes, I took it before my shift ended", why: "Our correction stands. Nothing more changes." },
        no: {
          label: "No, I took it after I clocked out",
          why: "The minutes are owed and go back on, and we flag the entry for payroll.",
        },
        yesEffect: <>Nothing changes. Your hours stay as they are on the timesheet below.</>,
        noEffect: (
          <>
            <b>{r2(q.movesOnDecline).toFixed(2)} hours</b> go back onto your timesheet, along with
            any overtime they create. Your sheet will be rebuilt, and payroll gets told the break
            is being clocked at the wrong time.
          </>
        ),
        footnote: (
          <>
            <b>We already made this change</b>, so confirming it changes nothing. Say no if you
            really did take your break after clocking out, and the minutes go back on.
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
  const [confirming, setConfirming] = useState(false);

  const base = standing?.charged || 0;
  const answeredAll = list.every((q) => answers?.[q.id]);
  // an answer already on record shows as the current setting, so changing your
  // mind is editing what you said rather than starting again
  const valueFor = (q) =>
    picked[q.id] ?? (answers?.[q.id] === "accepted" ? "yes" : answers?.[q.id] === "declined" ? "no" : null);

  const setAll = (choice) =>
    setPicked(Object.fromEntries(list.map((q) => [q.id, choice])));

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
        batch: chosen.filter((x) => x.v).map(({ q, v }) => ({ id: q.id, choice: v })),
      });
      if (!res?.ok) setErr(res?.error || "failed");
      else { setConfirming(false); setPicked({}); }
    });
  }

  const label = (q, v) =>
    q.row.meal && q.row.rest
      ? (v === "yes" ? "Took them" : "Missed them")
      : (v === "yes" ? "Took it" : "Missed it");

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2.5 rounded-lg border border-border-strong bg-surface-2 p-3">
        <span className="text-sm text-muted">Same answer for every day:</span>
        <button
          type="button"
          disabled={pending}
          onClick={() => { setConfirming(false); setAll("yes"); }}
          className="rounded-lg border border-emerald-500 px-3 py-1.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-500/10 disabled:opacity-50 dark:text-emerald-300"
        >
          Yes, I took them all
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => { setConfirming(false); setAll("no"); }}
          className="rounded-lg border border-rose-500 px-3 py-1.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-300"
        >
          No, I missed them all
        </button>
      </div>

      <ul className="mt-3 divide-y divide-border">
        {chosen.map(({ q, v }) => (
          <li
            key={q.id}
            className={`flex flex-wrap items-center justify-between gap-3 py-2.5 ${
              v === "no" ? "bg-rose-500/5" : ""
            }`}
          >
            <span className="min-w-0">
              <span className="font-mono text-sm text-foreground">{q.date}</span>
              <span className="ml-3 text-xs text-muted">
                {q.row.meal && q.row.rest
                  ? "meal + rest breaks"
                  : q.row.meal ? "meal break" : "rest break"}
                {" · "}{q.row.hours} hrs worked
              </span>
            </span>
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
          </li>
        ))}
      </ul>

      {!confirming && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending || !dirty.length}
            onClick={() => setConfirming(true)}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-40"
          >
            {answeredAll && !dirty.length ? "Answered" : "Save my answers"}
          </button>
          {undecided.length > 0 && (
            <span className="text-sm text-muted">
              {undecided.length} {undecided.length === 1 ? "day" : "days"} still to answer.
            </span>
          )}
        </div>
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
