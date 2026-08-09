"use client";

// The one question an employee is asked before signing, when the Rest Periods
// Report holds an entry for them that cannot be read and a single mis-picked
// field would explain it.
//
// NOTHING IS PRE-SELECTED and there is no default. Answering "yes" takes an
// hour of premium pay off their sheet, so it has to be chosen rather than
// accepted by inaction - an unanswered question leaves the premium in place.
// "If you are not sure, say no" is the engine's own rule said out loud: we pay
// rather than assume, and the honest answer from someone who cannot remember a
// ten minute break three weeks ago is the one that costs us.
//
// NOTHING SUBMITS ON THE FIRST CLICK. Every answer, including "no", goes through
// a confirm step that spells out what it will do, because all three change what
// the person is about to attest to. Mánu 2026-08-09.
import { useState, useTransition } from "react";
import { parseLooseTime, formatTimeDisplay } from "@/lib/loose-time";

function Choice({ on, tone, label, why, onClick, busy }) {
  const ring = on
    ? tone === "yes"
      ? "border-2 border-brand-light bg-brand-light/10"
      : "border-2 border-emerald-500 bg-emerald-500/10"
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
                ? "border-brand-light bg-brand-light"
                : "border-emerald-500 bg-emerald-500"
              : "border-border-strong"
          }`}
        />
        {label}
      </span>
      {why && <span className="mt-1.5 block pl-5.5 text-xs text-muted">{why}</span>}
    </button>
  );
}

export default function RestRepairQuestion({ token, question, premiumHours, answer, submitAction }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState(null);
  const [picking, setPicking] = useState(false);
  const [at, setAt] = useState("");
  // what they have chosen but not yet confirmed: { accept, at } or null
  const [proposed, setProposed] = useState(null);
  const q = question;

  // typed, not picked. A dropdown of every minute in the day was worse than the
  // problem: they know the time, they just need somewhere to put it.
  const typedHHMM = parseLooseTime(at, { assumeWorkday: true });

  function commit() {
    if (!proposed) return;
    setErr(null);
    start(async () => {
      const res = await submitAction({
        token, date: q.date, out: q.out, accept: proposed.accept, at: proposed.at,
      });
      if (!res?.ok) setErr(res?.error || "failed");
      else { setProposed(null); setPicking(false); }
    });
  }

  // `repair.from` and `repair.to` are the OLD and NEW value of the ONE field
  // that was mis-picked, not a time range. Printing them as "{from} to {to}"
  // read as "it was meant to be 11:30 PM to 11:30 AM" - a break running through
  // the night, in the sentence that explains why we want to take an hour of
  // premium off somebody. The corrected pair has to be rebuilt from which field
  // moved, and `field` is "out" or "in".
  const fixedOut = q.repair.field === "out" ? q.repair.to : q.out;
  const fixedIn = q.repair.field === "out" ? q.in : q.repair.to;

  const answered = answer === "accepted" || answer === "declined";
  const tone = !answered
    ? "border-2 border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30"
    : answer === "declined"
      ? "border-2 border-emerald-400 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
      : "border border-border-strong bg-surface-2";

  return (
    <div className={`mt-5 rounded-xl p-5 ${tone}`}>
      {!answered && (
        <>
          <p className="text-base font-semibold text-foreground">One question before you sign</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            On <b className="text-foreground">{q.date}</b> the break record has your rest break
            entered as <b className="text-foreground">{q.out || "(blank)"} to {q.in || "(blank)"}</b>,
            which cannot be read. We think somebody picked the wrong time and it was meant to be{" "}
            <b className="text-foreground">{fixedOut} to {fixedIn}</b>, a normal{" "}
            {q.repair.minutes} minute break.
          </p>
        </>
      )}
      {answered && (
        <p
          className={`text-base font-semibold ${
            answer === "declined" ? "text-emerald-800 dark:text-emerald-300" : "text-foreground"
          }`}
        >
          {answer === "declined"
            ? "Thank you. Nothing changed."
            : `Recorded: you took a rest break on ${q.date}`}
        </p>
      )}
      {answered && (
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {answer === "declined" ? (
            <>
              You told us you did not take a rest break on{" "}
              <b className="text-foreground">{q.date}</b>, so the hour stays on your timesheet.
              Payroll will get the entry fixed so it does not come up again.
            </>
          ) : (
            <>
              Your break premium is now{" "}
              <b className="text-foreground">{premiumHours.toFixed(2)} hours</b>. The timesheet
              below has been redrawn with that change, so what you sign matches what you told us.
              Change your mind by picking the other answer before you sign.
            </>
          )}
        </p>
      )}

      {!answered && (
        <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3 font-mono text-xs leading-relaxed text-muted">
          <p>
            What the record has: out <b className="text-foreground">{q.out || "(blank)"}</b> · in{" "}
            <b className="text-foreground">{q.in || "(blank)"}</b>
          </p>
          {/* the printed total is rounded, so the arithmetic is shown rather
              than a number appearing from nowhere */}
          <p>{q.derivation}, which is not a break</p>
          <p className="text-emerald-700 dark:text-emerald-400">
            What we think: out <b>{fixedOut}</b> · in <b>{fixedIn}</b> ={" "}
            {q.repair.minutes} min
          </p>
        </div>
      )}

      {/* A STAGED CHOICE HAS TO LOOK CHOSEN. These keyed off `answer`, which is
          the SAVED value, so clicking yes or no lit nothing up until after it
          was written - while the third option used local state and did light up.
          Three buttons, two behaviours. */}
      <div className="mt-4 flex flex-wrap gap-2.5">
        <Choice
          on={answer === "accepted" || (proposed?.accept === true && !proposed.at)}
          tone="yes"
          busy={pending}
          label="Yes, I took that break"
          why={!answered ? "You stopped for about ten minutes around then." : null}
          onClick={() => { setPicking(false); setProposed({ accept: true }); }}
        />
        <Choice
          on={answer === "declined" || proposed?.accept === false}
          tone="no"
          busy={pending}
          label="No, I did not take it"
          why={!answered ? "You worked through. Nothing changes and the premium stays." : null}
          onClick={() => { setPicking(false); setProposed({ accept: false }); }}
        />
        {!answered && (
          <Choice
            on={picking || !!proposed?.at}
            tone="yes"
            busy={pending}
            label="Yes, but at a different time"
            why="The time above is our guess. Tell us when you actually stopped."
            onClick={() => { setProposed(null); setPicking((p) => !p); }}
          />
        )}
      </div>

      {/* OUR PROPOSED TIME IS A GUESS and it can be the wrong ten minutes on a
          day the break really happened. Without this the only honest answer
          left was "no", which keeps a premium the person may not be owed. */}
      {picking && !answered && (
        <div className="mt-3 rounded-lg border border-border-strong bg-surface-2 p-3">
          <label htmlFor="rest-at" className="block text-sm font-semibold text-foreground">
            What time did your break start on {q.date}?
          </label>
          <p className="mt-1 text-xs text-muted">
            Ten minutes from whenever you say. If it falls outside the hours you were
            clocked in for, those ten minutes get PAID and added to your day.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
            {/* TYPED, NOT PICKED. The native time control put a scrolling column
                of every hour and minute over the question. They know the time.
                "9", "900", "9am", "1230" all work; with no am/pm, 7 to 11 is
                morning and 12 to 6 is afternoon. */}
            <input
              id="rest-at"
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
              onClick={() => setProposed({ accept: true, at: typedHHMM })}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Save that time
            </button>
          </div>
        </div>
      )}

      {/* THE CONFIRM STEP. All three answers change what they are about to
          attest to, so none of them commits on one click - the panel says what
          will happen and they can go back. */}
      {proposed && !answered && (
        <div className="mt-3 rounded-lg border-2 border-brand-light bg-brand-light/10 p-4">
          <p className="text-base font-semibold text-foreground">
            Are you sure you want to confirm?
          </p>
          <div className="mt-2 space-y-1.5 text-sm text-muted">
            {proposed.accept ? (
              <>
                <p>
                  Your timesheet will record a rest break on{" "}
                  <b className="text-foreground">{q.date}</b> at{" "}
                  <b className="text-foreground">
                    {proposed.at ? formatTimeDisplay(proposed.at) : fixedOut}
                  </b>
                  , lasting ten minutes.
                </p>
                <p>
                  Your break premium goes from{" "}
                  <b className="text-foreground">{premiumHours.toFixed(2)} hours</b> to{" "}
                  <b className="text-foreground">{(premiumHours - 1).toFixed(2)} hours</b>.
                </p>
                {proposed.at && (
                  <p>
                    The sheet will show that time, and say it came from you rather than
                    from the break record.
                  </p>
                )}
              </>
            ) : (
              <>
                <p>
                  Your timesheet will record that you did <b className="text-foreground">not</b>{" "}
                  take a rest break on <b className="text-foreground">{q.date}</b>.
                </p>
                <p>
                  Your break premium stays at{" "}
                  <b className="text-foreground">{premiumHours.toFixed(2)} hours</b>. Nothing
                  about your pay changes.
                </p>
              </>
            )}
            <p className="text-xs">You can change your answer any time before you sign.</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2.5">
            <button
              type="button"
              disabled={pending}
              onClick={commit}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
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

      {!answered && (
        <p className="mt-3 border-l-2 border-border-strong pl-3 text-sm text-muted">
          <b className="text-foreground">Answering &ldquo;yes&rdquo; lowers your break premium by
          one hour</b>, from {premiumHours.toFixed(2)} to {(premiumHours - 1).toFixed(2)}, because a
          break you were given and took is not owed a penalty. If you are not sure, say no. We would
          rather pay it than assume it.
        </p>
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
