"use client";

// THE THREE EMAILS, RENDERED.
//
// Every variant is built on the server by the same two functions that build the
// ones we send, with the same two subject functions, so nothing here can drift
// from what goes out without the preview drifting with it. This component only
// picks between them.
//
// IN AN IFRAME, deliberately. An email is a document with its own inline
// styles, on a white background, and dropping that markup into the portal would
// let the two sets of styles argue - which would mean the preview showed
// something no mail client ever renders.
import { useState } from "react";

const TOGGLE_LABEL = {
  test: "Test mode",
  withMessage: "With a message",
  withDue: "With a due date",
  oneItem: "One problem only",
};

const TOGGLE_WHY = {
  test: "The banner in the body and the [TEST -> address] prefix on the subject. The one email state nobody can see without actually sending one.",
  withMessage: "The note payroll typed on the send screen.",
  withDue: "The orange \"please sign it by\" line.",
  oneItem: "The table with a single row, which is the common case.",
};

export default function EmailStage({ emails }) {
  const keys = Object.keys(emails);
  const [picked, setPicked] = useState(keys[0]);
  const [flags, setFlags] = useState({ test: false, withMessage: false, withDue: true, oneItem: false });

  const email = emails[picked];
  // the key is the toggle values in the order the email declares them, which is
  // how the server keyed the variants it built
  const stateKey = email.toggles.map((t) => (flags[t] ? 1 : 0)).join("");
  const shown = email.states[stateKey];

  return (
    <div className="grid gap-0 lg:grid-cols-[264px_minmax(0,1fr)]">
      <div className="border-b border-border pb-4 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
        <p className="px-2 pb-3 text-[11px] font-bold uppercase tracking-widest text-faint">
          The three emails
        </p>
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setPicked(k)}
            className={`mb-1 block w-full rounded-lg border px-3 py-2 text-left transition ${
              picked === k
                ? "border-border-strong bg-surface text-foreground"
                : "border-transparent text-muted hover:bg-surface-2"
            }`}
          >
            <span className="block text-[13px] font-semibold">{emails[k].name}</span>
            <span className="mt-0.5 block text-[11px] text-faint">{emails[k].goesTo}</span>
          </button>
        ))}
      </div>

      <div className="min-w-0 px-0 pt-5 lg:px-6 lg:pt-0">
        <div className="flex flex-wrap gap-2">
          {email.toggles.map((t) => (
            <button
              key={t}
              type="button"
              title={TOGGLE_WHY[t]}
              onClick={() => setFlags((f) => ({ ...f, [t]: !f[t] }))}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
                flags[t]
                  ? "border-brand bg-brand/15 text-brand-dark dark:text-brand-light"
                  : "border-border-strong bg-surface-2 text-muted hover:border-brand hover:text-brand"
              }`}
            >
              {TOGGLE_LABEL[t] || t}
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-border-strong bg-surface-2 p-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-faint">Subject</p>
          <p className="mt-1.5 break-words font-mono text-sm font-semibold text-foreground">
            {shown.subject}
          </p>
        </div>

        <iframe
          key={`${picked}-${stateKey}`}
          title={`${email.name} preview`}
          srcDoc={shown.html}
          sandbox=""
          className="mt-4 h-[560px] w-full rounded-xl border border-border-strong bg-white"
        />

        {picked === "reminder" && (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            The body is the same as the Timesheet to review.{" "}
            <code>buildTimesheetEmailHtml</code> takes no <code>isResend</code> - only the subject
            changes, which is what stops Gmail collapsing the repeat behind &ldquo;Show trimmed
            content&rdquo;. Flip between the two in the rail and nothing above moves.
          </p>
        )}
        {picked === "alert" && flags.test && (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            The test subject and the live subject do not say the same thing - &ldquo;reported a
            timesheet problem&rdquo; against &ldquo;reported a problem with their timesheet&rdquo;.
            That is how it has always been, and it is left alone here: a preview whose job is to
            show what goes out must not quietly tidy what goes out.
          </p>
        )}

        <p className="mt-3 font-mono text-[11px] text-faint">
          {picked === "alert" ? "buildCorrectionAlertHtml() · correctionAlertSubject()" : "buildTimesheetEmailHtml() · timesheetSubject()"}
        </p>
      </div>
    </div>
  );
}
