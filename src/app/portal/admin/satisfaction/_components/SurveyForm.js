"use client";

// THE SURVEY, ASKED ON SCREEN. Every question and option below comes from
// satisfaction.js - the same module the PDF prints from - so what is asked and
// what is printed cannot drift apart. Nothing is required except who is
// completing it: that answer is capped per client (one each, two for Other),
// so a survey that names nobody could never be counted.
//
// EVERY ANSWER IS KEPT AS IT IS GIVEN - Mánu 2026-08-31: "make sure its saved
// as you click each option in case someone leaves the page and comes back to
// it." Each click and keystroke writes the whole form to this browser's local
// storage; coming back to this client restores it. The draft is cleared by
// the list page's saved banner - after the save is CONFIRMED, not when the
// button is pressed, so a save that dies in transit still leaves the answers
// here.
import { useEffect, useRef, useState } from "react";
import DatePicker from "@/components/DatePicker";
import {
  COMPLETING_LABEL,
  COMPLETING_OPTIONS,
  COMPLETING_CAPS,
  completingOptionOpen,
  PROGRAM_LABEL,
  PROGRAM_OPTIONS,
  INTRO,
  RATING_HEAD,
  GRID_QUESTIONS,
  CHOICES_HEADING,
  CHOICE_QUESTIONS,
  FEEDBACK_HEADING,
  FEEDBACK_QUESTIONS,
  OVERALL_HEADING,
  OVERALL_OPTIONS,
  COMMENTS_LABEL,
} from "@/lib/client-reports/satisfaction";

const draftKey = (clientId) => `mls-survey-draft:${clientId}`;

export default function SurveyForm({ clientId, todayIso, action, tally }) {
  const [busy, setBusy] = useState(false);
  const [completedBy, setCompletedBy] = useState("");
  const [program, setProgram] = useState("");
  // the restored draft, if one was left behind; also keys the DatePicker so a
  // restored date actually shows
  const [draft, setDraft] = useState(null);
  const formRef = useRef(null);

  // RESTORE, once, on arrival. Radios and textareas are uncontrolled, so the
  // draft is applied straight to the DOM; the two conditional "Other" inputs
  // mount after their state is set and pick their value up from `draft`.
  useEffect(() => {
    let d = null;
    try {
      d = JSON.parse(localStorage.getItem(draftKey(clientId)) || "null");
    } catch {
      // storage unavailable - the form still works, it just can't remember
    }
    if (!d || typeof d !== "object" || !formRef.current) return;
    for (const [name, value] of Object.entries(d)) {
      if (typeof value !== "string") continue;
      for (const el of formRef.current.querySelectorAll(`[name="${CSS.escape(name)}"]`)) {
        if (el.type === "radio") {
          // never re-tick an option that has been taken since the draft was left
          if (el.value === value && !el.disabled) el.checked = true;
        } else if (el.tagName === "TEXTAREA") {
          el.value = value;
        }
      }
    }
    if (d.completedBy) setCompletedBy(d.completedBy);
    if (d.program) setProgram(d.program);
    setDraft(d);
  }, [clientId]);

  // PERSIST the whole form. Fires on every change and keystroke; the timeout
  // catches the DatePicker, whose hidden input is updated by React after the
  // calendar click rather than by a bubbling DOM event.
  const persist = () => {
    const form = formRef.current;
    if (!form) return;
    setTimeout(() => {
      const out = {};
      for (const [k, v] of new FormData(form).entries()) {
        // $ACTION_* is Next's own bookkeeping, not an answer
        if (k !== "clientId" && !k.startsWith("$ACTION") && typeof v === "string") out[k] = v;
      }
      try {
        localStorage.setItem(draftKey(clientId), JSON.stringify(out));
      } catch {
        // storage unavailable - nothing to do
      }
    }, 60);
  };

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={() => setBusy(true)}
      onChange={persist}
      onInput={persist}
      onClick={persist}
      className="mt-8 space-y-6"
    >
      <input type="hidden" name="clientId" value={clientId} />

      <Card>
        <p className="text-sm font-semibold text-foreground">{COMPLETING_LABEL}</p>
        <div className="mt-3 space-y-2.5">
          {COMPLETING_OPTIONS.map((opt) => {
            const used = tally?.[opt] || 0;
            const open = completingOptionOpen(opt, tally);
            return (
              <div key={opt} className="flex flex-wrap items-center gap-2.5">
                <Radio
                  name="completedBy"
                  value={opt}
                  label={opt}
                  onPick={setCompletedBy}
                  disabled={!open}
                  required
                />
                {used > 0 && (
                  <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs font-medium text-muted">
                    {COMPLETING_CAPS[opt] > 1
                      ? `${used} of ${COMPLETING_CAPS[opt]} on file`
                      : "on file"}
                  </span>
                )}
              </div>
            );
          })}
          {completedBy === "Other" && (
            <input
              type="text"
              name="completedByOther"
              defaultValue={draft?.completedByOther || ""}
              placeholder="Who completed it"
              className="ml-7 block w-full max-w-xs rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-faint focus:border-brand focus:outline-none"
            />
          )}
        </div>

        <p className="mt-6 text-sm font-semibold text-foreground">{PROGRAM_LABEL}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2.5">
          {PROGRAM_OPTIONS.map((opt) => (
            <Radio key={opt} name="program" value={opt} label={opt} onPick={setProgram} />
          ))}
          {program === "Other" && (
            <input
              type="text"
              name="programOther"
              defaultValue={draft?.programOther || ""}
              placeholder="Which program"
              className="block w-full max-w-xs rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-faint focus:border-brand focus:outline-none"
            />
          )}
        </div>

        <div className="mt-6 max-w-xs">
          <DatePicker
            key={draft?.date || "fresh"}
            label="Date"
            name="date"
            defaultValue={draft?.date || todayIso}
          />
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-foreground">{INTRO}</h2>
        <div className="mt-2 divide-y divide-border">
          {GRID_QUESTIONS.map((q, i) => (
            <div key={q} className="py-3.5">
              <p className="text-sm text-foreground">
                {i + 1}. {q}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
                {RATING_HEAD.map((opt) => (
                  <Radio key={opt} name={`q${i + 1}`} value={opt} label={opt} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-foreground">{CHOICES_HEADING}</h2>
        <div className="mt-2 divide-y divide-border">
          {CHOICE_QUESTIONS.map((c, i) => (
            <div key={c.q} className="py-3.5">
              <p className="text-sm text-foreground">{c.q}</p>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
                {c.options.map((opt) => (
                  <Radio key={opt} name={`c${i + 1}`} value={opt} label={opt} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-foreground">{FEEDBACK_HEADING}</h2>
        <div className="mt-2 space-y-5">
          {FEEDBACK_QUESTIONS.map((q, i) => (
            <div key={q}>
              <label htmlFor={`f${i + 1}`} className="block text-sm text-foreground">
                {q}
              </label>
              <textarea
                id={`f${i + 1}`}
                name={`f${i + 1}`}
                rows={3}
                className="mt-2 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none"
              />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-foreground">{OVERALL_HEADING}</h2>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2.5">
          {OVERALL_OPTIONS.map((opt) => (
            <Radio key={opt} name="overall" value={opt} label={opt} />
          ))}
        </div>

        <label htmlFor="comments" className="mt-6 block text-sm font-semibold text-foreground">
          {COMMENTS_LABEL}
        </label>
        <textarea
          id="comments"
          name="comments"
          rows={3}
          className="mt-2 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none"
        />
      </Card>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save survey"}
        </button>
        <p className="text-xs text-muted">
          Answers keep themselves on this device until the survey is saved. Any
          question can be left blank - blank answers print as unticked boxes.
        </p>
      </div>
    </form>
  );
}

function Card({ children }) {
  return <div className="rounded-xl border border-border bg-surface p-5 sm:p-6">{children}</div>;
}

function Radio({ name, value, label, onPick, disabled, required }) {
  return (
    <label
      className={`flex items-center gap-2.5 text-sm ${
        disabled ? "cursor-not-allowed text-faint" : "cursor-pointer text-foreground"
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        disabled={disabled}
        required={required}
        onChange={onPick ? () => onPick(value) : undefined}
        className="h-4 w-4 accent-brand disabled:opacity-40"
      />
      {label}
    </label>
  );
}
