"use client";

// wraps the existing portal FormFiller so signing a timesheet works exactly
// like signing any other form: the PDF renders with its AcroForm fields
// overlaid, the signature box opens a draw pad, and the filled bytes are built
// in the browser. only the submit target differs (a timesheet row, not a
// FormSubmission), so we adapt the payload here rather than fork the filler.
import { useRef, useState } from "react";
import FormFiller from "@/app/portal/forms/[id]/fill/FormFiller";

const f2 = (n) => (Math.round((n || 0) * 100) / 100).toFixed(2);

export default function TimesheetSigner({
  token, fileUrl, title, submitAction,
  // how many questions this person has left alone, and the penalty pay already
  // on their sheet. Both are theirs, not the batch's.
  unansweredOptional = 0,
  premiumOnSheet = 0,
}) {
  // THE CONFIRMATION IS REASSURANCE, NOT A WARNING, and that is the whole point
  // of it existing after the 2026-08-11 flip. Before the flip, signing with
  // questions open meant giving up pay, so the panel had to be a warning and
  // every question blocked the signature anyway. Now ignoring them is the SAFE
  // choice - the pay is already on the sheet and only an answer can take it off -
  // so somebody who reaches the signer with twelve cards untouched has done
  // nothing wrong and should be told so plainly.
  //
  // It intercepts at submit rather than sitting above the document: this is the
  // one moment the sentence is worth reading, and a panel further up the page is
  // scrolled past long before anybody draws a signature.
  const [asking, setAsking] = useState(false);
  const gate = useRef(null);

  // FormFiller calls submitAction({ formId, pdfBase64, ... }); the timesheet
  // action wants { token, pdfBase64, signedName }. It awaits the result, so
  // holding the promise here is what lets the panel sit in the middle without
  // FormFiller needing to know about it.
  const submit = async (payload) => {
    if (unansweredOptional > 0) {
      setAsking(true);
      const go = await new Promise((resolve) => { gate.current = resolve; });
      setAsking(false);
      gate.current = null;
      // a recognised code, so the filler says "nothing has been submitted"
      // rather than "couldn't send"
      if (!go) return { ok: false, error: "cancelled" };
    }
    return submitAction({
      token,
      pdfBase64: payload.pdfBase64,
      signedName: payload.employeeName || null,
    });
  };

  return (
    <div className="mt-6">
      <FormFiller
        fileUrl={fileUrl}
        title={title}
        formId={token}
        submitAction={submit}
        reviewTeam={{ recipientLabel: "payroll", recipients: [], ccNames: [] }}
        signIntro="Check the hours and breaks below, sign at the bottom, then submit. Your signed copy goes to payroll and is kept on file."
        signMode
      />

      {asking && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sign-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <p id="sign-confirm-title" className="text-lg font-semibold text-foreground">
              Ready to sign?
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              You have{" "}
              <b className="text-foreground">
                {unansweredOptional} {unansweredOptional === 1 ? "question" : "questions"}
              </b>{" "}
              unanswered. That is fine.
            </p>

            {/* THE TWO FIGURES PULLED OUT. "12 questions" and "12.00 hours" in
                one sentence read as the same number, and one of them is
                somebody's pay. */}
            {premiumOnSheet > 0 && (
              <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-muted">Break penalty pay included</span>
                  <span className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                    {f2(premiumOnSheet)} hrs
                  </span>
                </div>
              </div>
            )}

            <p className="mt-4 text-sm leading-relaxed text-muted">
              Signing now accepts your timesheet exactly as it is
              {premiumOnSheet > 0 ? ", including the break pay already on it" : ""}.{" "}
              <b className="text-foreground">Nothing will be taken off.</b>
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => gate.current?.(true)}
                className="rounded-lg bg-brand-light px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
              >
                Sign and submit
              </button>
              <button
                type="button"
                onClick={() => gate.current?.(false)}
                className="rounded-lg border border-border-strong px-4 py-2.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
              >
                Go back and answer them
              </button>
            </div>

            <p className="mt-4 border-t border-border pt-3 text-xs text-muted">
              The questions only ever take pay off, so leaving them is the safe choice.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
