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
  // WHETHER THE SIGN CONTROLS SHOW. The document itself always does now - the
  // people who cannot sign yet are exactly the people being asked to check
  // something on it, so hiding it from them was backwards.
  canSign = true,
  blocking = 0,
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

  // A GATED SHEET IS SHOWN, NOT SIGNED - and that takes BOTH of these props.
  //
  // `signMode={false}` alone was wrong: FormFiller then renders its own "Submit
  // to review team" button whenever `reviewTeam` is set, wired to the same
  // action, so somebody with an unanswered mandatory question could submit
  // anyway and the gate would have been decoration. Dropping `reviewTeam` too
  // is what leaves no submit path at all.
  //
  // A plain <object> embed was the first attempt and is worse: Chrome would not
  // render it here and mobile browsers routinely refuse inline PDFs, which is
  // most of the staff. FormFiller's pdf.js viewer already works everywhere, so
  // the document is drawn by the same code either way.
  const gated = !canSign;

  return (
    <div className="mt-6">
      <FormFiller
        fileUrl={fileUrl}
        title={title}
        formId={token}
        submitAction={submit}
        reviewTeam={gated ? null : { recipientLabel: "payroll", recipients: [], ccNames: [] }}
        signIntro={
          gated
            ? `This is your timesheet as it stands right now, and it updates every time you answer a question above. You can sign it once the ${blocking === 1 ? "question" : `${blocking} questions`} marked as needed ${blocking === 1 ? "has" : "have"} an answer.`
            : "Check the hours and breaks below, sign at the bottom, then submit. Your signed copy goes to payroll and is kept on file."
        }
        signMode={!gated}
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

            {/* THE PREMIUM FIGURE, THE "NOTHING WILL BE TAKEN OFF" LINE AND THE
                "the questions only ever take pay off" footer all came out
                2026-08-12 at Mánu's instruction. What is left is the count of
                unanswered questions, that it is fine to leave them, and the two
                buttons. The dialog talks about answering, not about pay. */}
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

          </div>
        </div>
      )}
    </div>
  );
}
