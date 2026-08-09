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
import { useState, useTransition } from "react";

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
  const q = question;

  function choose(accept) {
    setErr(null);
    start(async () => {
      const res = await submitAction({ token, date: q.date, out: q.out, accept });
      if (!res?.ok) setErr(res?.error || "failed");
    });
  }

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
            <b className="text-foreground">{q.repair.from} to {q.repair.to}</b>, a normal{" "}
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
            What we think: out <b>{q.repair.from === q.out ? q.out : q.out}</b> · in{" "}
            <b>{q.repair.to}</b> = {q.repair.minutes} min
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2.5">
        <Choice
          on={answer === "accepted"}
          tone="yes"
          busy={pending}
          label="Yes, I took that break"
          why={!answered ? "You stopped for about ten minutes around then." : null}
          onClick={() => choose(true)}
        />
        <Choice
          on={answer === "declined"}
          tone="no"
          busy={pending}
          label="No, I did not take it"
          why={!answered ? "You worked through. Nothing changes and the premium stays." : null}
          onClick={() => choose(false)}
        />
      </div>

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
            : "That didn't save. Refresh the page and try again."}
        </p>
      )}
    </div>
  );
}
