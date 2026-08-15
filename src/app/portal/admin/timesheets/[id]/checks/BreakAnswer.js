"use client";

// WHAT DID THEY SAY?
//
// The card already names both outcomes in its own words: "No meal punched on a
// day that requires one. If they took it, it needs punching in QuickSolve." So
// there are two answers, and they behave oppositely on the next export.
//
// CONFIRM NOT TAKEN IS A CLOSER, NOT A WAIT. If they genuinely did not take it
// there is nothing to punch, so the finding will still be on that day on every
// upload for the rest of the period. It has to read as settled, or it nags
// daily about something already answered.
//
// The reason is optional HERE and not optional overall: leaving it blank moves
// the question to the employee, whose timesheet does not generate until they
// answer it. Nothing can be pre-filled - none of the four QSP exports carries a
// reason for a missed break.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import { setBreakAnswer } from "./flag-actions";
import { HEARD_VIA, answerOptionsFor, answerSummary, stillMissing } from "@/lib/timesheet/break-answers";
import { useReadOnly } from "../ReadOnly";

export default function BreakAnswer({
  batchId, personKey, findingKey, date = null, kind = "meal", answer = null,
  // HOW MANY THE DAY IS SHORT. A meal is always one; a rest violation reads
  // "0 of 2 recorded" and the answers have to span that - they may have taken
  // neither, or one of the two.
  missing = 1, label = null,
}) {
  // A REPLACED UPLOAD IS READ ONLY. The server refuses every write on one
  // regardless - this only stops the click being wasted, and says why.
  const readOnly = useReadOnly();

  const [asking, setAsking] = useState(null);
  const [reason, setReason] = useState("");
  const [via, setVia] = useState("phone");
  const [err, setErr] = useState(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const write = (opt, why = null) =>
    start(async () => {
      setErr(null);
      const res = await setBreakAnswer({
        batchId, personKey, findingKey, date, kind,
        answer: opt ? opt.answer : null,
        takenCount: opt ? opt.takenCount : null,
        missingCount: missing,
        reason: why,
        via,
      });
      if (res?.ok) { setAsking(null); setReason(""); router.refresh(); }
      // the refusal explains itself - see superseded.js. Showing "superseded"
      // instead would be a code where a sentence was already written.
      else setErr(res?.say || res?.error || "failed");
    });

  // ALREADY ANSWERED
  if (answer && !asking) {
    const left = stillMissing(answer);
    const meta = {
      settled: answerSummary(answer),
      chip: left
        ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300"
        : "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800/70 dark:bg-sky-950/40 dark:text-sky-300",
    };
    return (
      <div className="mt-3 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${meta?.chip || ""}`}>
            {left ? "\u2713 " : ""}{meta.settled}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface-2 px-2.5 py-1 text-[11.5px] font-medium text-muted">
            <Avatar name={answer.byName} image={answer.byImage} size={16} />
            {answer.byName}{answer.via ? ` · by ${answer.via}` : ""}
          </span>
          {left > 0 && !answer.reason && (
            <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11.5px] font-semibold text-amber-800 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-300">
              ⚠ no reason on record
            </span>
          )}
        </div>

        {answer.reason && (
          <p className="mt-2 border-l-[3px] border-emerald-300 pl-3 text-sm italic text-muted">
            &ldquo;{answer.reason}&rdquo;
            {answer.confirmedAt && <span className="ml-1 not-italic font-semibold text-emerald-700 dark:text-emerald-400">· confirmed by them</span>}
          </p>
        )}

        <p className="mt-2 max-w-[78ch] text-xs text-muted">
          {left > 0 ? (
            answer.reason
              ? <><b className="text-foreground">Nothing to fix in QuickSolve</b>, so this stays on every future upload and is never counted as an outstanding change.</>
              : <><b className="text-foreground">They will be asked for the reason themselves</b> and their timesheet will not generate until they give one.</>
          ) : (
            <>The next upload is the evidence. We cannot change their schedule, so it is theirs to do.</>
          )}
        </p>

        <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold">
          <button type="button" onClick={() => { setAsking("not-taken"); setReason(answer.reason || ""); }} className="text-brand">
            {answer.reason ? "Change the reason" : "Add the reason"}
          </button>
          <button type="button" disabled={pending} onClick={() => write(null)} className="text-muted hover:text-foreground disabled:opacity-60">
            Undo this answer
          </button>
        </div>
        {err && <p className="mt-1.5 text-xs text-rose-700 dark:text-rose-400">Could not save: {err}</p>}
      </div>
    );
  }

  // ASKING WHY
  if (asking) {
    return (
      <div className="mt-3 border-t border-border pt-3">
        <p className="text-xs font-semibold text-muted">
          {asking.takenCount ? `They took ${asking.takenCount} of ${missing}. Why not the rest?` : "Confirming they did not take it. Why not?"}
        </p>
        <textarea
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Optional. If you leave this blank they will be asked for it themselves."
          className="mt-2 w-full rounded-lg border border-border-strong bg-surface px-2.5 py-2 text-sm text-foreground"
        />
        <p className="mt-1.5 text-xs text-muted">
          Nothing to pre-fill. QuickSolve has no field for why a break was missed, so this
          only ever comes from what they tell us or what they write on their timesheet
          review page.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Heard by</span>
          {HEARD_VIA.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setVia(v.key)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                via === v.key
                  ? "border-brand bg-surface-2 text-foreground"
                  : "border-border-strong text-muted hover:text-foreground"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => write(asking, reason)}
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button type="button" disabled={pending} onClick={() => setAsking(null)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition hover:text-foreground disabled:opacity-60">
            Cancel
          </button>
        </div>
        {err && <p className="mt-1.5 text-xs text-rose-700 dark:text-rose-400">Could not save: {err}</p>}
      </div>
    );
  }

  // NOT ANSWERED YET
  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="text-xs font-semibold text-muted">
        What did they say{label ? ` about the ${label.toLowerCase()}` : ""}?
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {answerOptionsFor({ kind, missing }).map((opt) => (
          <button
            key={opt.key}
            type="button"
            disabled={pending || !!readOnly}
            title={readOnly ? "This upload has been replaced. Answer it on the current one." : undefined}
            // an option that still leaves something untaken has to collect a
            // reason for the part they missed; one that accounts for all of them
            // has nothing to explain and writes straight away
            onClick={() => (opt.asksReason ? setAsking(opt) : write(opt))}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition disabled:opacity-45 ${
              opt.tone === "green"
                ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
            }`}
          >
            {pending ? "Saving\u2026" : opt.label}
          </button>
        ))}
      </div>
      {err && <p className="mt-1.5 text-xs text-rose-700 dark:text-rose-400">Could not save: {err}</p>}
    </div>
  );
}
