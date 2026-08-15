"use client";

// THE WHOLE CHAIN, END TO END, WRITING NOTHING.
//
// Answer, save, generate, sign, submit, confirmation. Every step is the real
// component; the only thing swapped is what happens when a button is pressed.
//
// IT EXISTS BECAUSE THE REAL PAGE CANNOT BE WALKED. `?preview=1` replaces every
// action with a refusal - deliberately, so a stray click cannot land on a real
// person's record - so on a preview tab "Yes, confirm" saves nothing, Generate
// never appears and there is nothing to sign. The only other way to record the
// flow is to open somebody's live link and actually write to their timesheet.
//
// So this walks it against the fabricated sheet. The PDF is real, rendered by
// `renderSheet` from the fixture; the signature pad is the real FormFiller; and
// the submit returns ok without a database anywhere near it.
import { useState } from "react";
import TimesheetSigner from "@/app/t/[token]/TimesheetSigner";

const STEPS = [
  { key: "asked", label: "Questions open" },
  { key: "saved", label: "Answers saved" },
  { key: "generated", label: "Sheet generated" },
  { key: "signed", label: "Signed and sent" },
];

export default function SheetStage({ period, standing }) {
  const [step, setStep] = useState("asked");
  const [reasons, setReasons] = useState(true);
  const [optional, setOptional] = useState(0);
  // THE ON/OFF FOR THE GATE ITSELF. On the real page the document is not drawn
  // until they ask for it; this is where both halves of that can be looked at
  // without answering fifteen cards first.
  const [gateSheet, setGateSheet] = useState(true);

  const at = STEPS.findIndex((s) => s.key === step);
  // the fake submit. FormFiller awaits it and shows its own success on ok, so
  // returning it is what carries the demo into the last panel.
  const submit = async () => {
    setStep("signed");
    return { ok: true };
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {STEPS.map((s, i) => (
          <span
            key={s.key}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              i < at
                ? "border-brand/40 bg-brand/10 text-brand-dark dark:text-brand-light"
                : i === at
                  ? "border-brand bg-brand text-white"
                  : "border-border-strong bg-surface-2 text-faint"
            }`}
          >
            {i + 1}. {s.label}
          </span>
        ))}
        <button
          type="button"
          onClick={() => { setStep("asked"); setOptional(0); }}
          className="ml-auto rounded-lg border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
        >
          Start again
        </button>
      </div>

      {/* STEP 1 - the questions are answered on the other tab; this is the
          button that closes them off. Shown as its own step because in the demo
          it is what makes Generate appear. */}
      {step === "asked" && (
        <div className="mt-5 rounded-xl border border-border bg-surface-2 p-5">
          <p className="text-sm text-muted">
            Answer the cards on <b className="text-foreground">Timesheet review page</b> first, then
            this is the button at the bottom of them.
          </p>
          <button
            type="button"
            onClick={() => setStep("saved")}
            className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
          >
            Save my answers
          </button>
        </div>
      )}

      {/* STEP 2 - the sheet is rebuilt from the answers. On the real page this
          is the moment `rebuildSheetFor` runs and `pdfUrl` is nulled, because
          the document is rendered on demand from `data` rather than stored. */}
      {step === "saved" && (
        <div className="mt-5 rounded-xl border border-border bg-surface-2 p-5">
          <p className="text-sm font-semibold text-foreground">Your answers are saved.</p>
          <p className="mt-1 text-sm text-muted">
            Your timesheet is put together from them. Nothing is stored - the document is built
            when you ask for it.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setStep("generated")}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
            >
              Generate my timesheet
            </button>
            <Toggle on={reasons} onClick={() => setReasons((v) => !v)}>
              Break reasons on the sheet
            </Toggle>
            <Toggle on={optional > 0} onClick={() => setOptional(optional > 0 ? 0 : 12)}>
              The &ldquo;ready to sign?&rdquo; popup
            </Toggle>
            <Toggle on={gateSheet} onClick={() => setGateSheet((v) => !v)}>
              Hide the sheet until Generate
            </Toggle>
          </div>
        </div>
      )}

      {/* STEP 3 - the real document and the real signature pad. */}
      {step === "generated" && (
        <div className="mt-5">
          <p className="text-sm text-muted">
            The document as they open it. Sign at the bottom and submit - the submit is a local
            function that records nothing and sends nothing.
          </p>
          <TimesheetSigner
            key={`sheet-${reasons ? 1 : 0}-${optional}-${gateSheet ? 1 : 0}`}
            token="tests-fixture"
            fileUrl={`/portal/admin/tests/pdf?reasons=${reasons ? 1 : 0}`}
            title={`tests-fixture-${period.replace(/[^\w]+/g, "-")}`}
            submitAction={submit}
            unansweredOptional={optional}
            premiumOnSheet={standing.charged}
            canSign
            blocking={0}
            requireGenerate={gateSheet}
          />
        </div>
      )}

      {/* STEP 4 - what they see once it is in. The wording follows the real
          page's signed panel, which is the one an employee lands on. */}
      {step === "signed" && (
        <div className="mt-5 rounded-xl border border-emerald-300/60 bg-emerald-50 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            Signed - thank you.
          </p>
          <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-200/80">
            Payroll has your copy - nothing else to do. The signed PDF is stored against the
            timesheet and the people who run payroll are told it came in.
          </p>
          <p className="mt-3 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            Nothing was stored and nobody was emailed. This is the panel, not the send.
          </p>
        </div>
      )}
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
