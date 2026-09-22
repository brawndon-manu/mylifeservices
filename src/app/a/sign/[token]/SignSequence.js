"use client";

// ONE LINK, SEVERAL DOCUMENTS. The September 2026 training series asks for
// two attestations from the same announcement, and the emailed "Review and
// sign" button is one link. So the page hands this the documents still owed,
// in order, and this walks through them: sign one, submit it, and the next
// takes its place, with what is done and what is left said plainly above.
//
// Each document is the same FormFiller the single-form page has always shown,
// so the prefilled name, the dated boxes, the signature pad and the submit
// gate are exactly the ones they were. Only the walk is new. A post with one
// form never shows the walk at all.
import { useState } from "react";
import FormFiller from "@/app/portal/forms/[id]/fill/FormFiller";

export default function SignSequence({
  // the documents still owed: { id, title, fileUrl, reviewTeam, requireAll }
  forms,
  // titles already signed on an earlier visit, so the list reads whole
  doneTitles = [],
  signerName,
  submitAction,
  onOpened = null,
}) {
  const [index, setIndex] = useState(0);
  // the current document has been submitted; the walk waits for "Continue" so
  // a copy can be downloaded first
  const [sentCurrent, setSentCurrent] = useState(false);
  const current = forms[index] || null;
  const total = doneTitles.length + forms.length;
  const titles = [...doneTitles, ...forms.map((f) => f.title)];
  const position = doneTitles.length + index + 1;
  const last = index + 1 >= forms.length;

  function next() {
    setIndex((i) => i + 1);
    setSentCurrent(false);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="mt-6">
      {total > 1 && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">
            Document {position} of {total}
          </p>
          <ol className="mt-2 space-y-1.5">
            {titles.map((title, i) => {
              const done = i < doneTitles.length + index || (i === position - 1 && sentCurrent);
              const active = i === position - 1 && !sentCurrent;
              return (
                <li key={title + i} className="flex items-center gap-2 text-sm">
                  <span
                    aria-hidden
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                      done
                        ? "bg-emerald-600 text-white"
                        : active
                          ? "bg-brand text-white"
                          : "bg-surface-3 text-muted"
                    }`}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <span className={done ? "text-muted line-through" : active ? "font-medium text-foreground" : "text-muted"}>
                    {title}
                  </span>
                  {done && <span className="text-xs text-emerald-700 dark:text-emerald-300">signed</span>}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {current && (
        <FormFiller
          key={current.id}
          fileUrl={current.fileUrl}
          title={current.title}
          formId={current.id}
          reviewTeam={current.reviewTeam}
          signMode
          requireAll={!!current.requireAll}
          // the link was cut for exactly this account, so the name box starts
          // filled rather than asking for something the token already carries
          signerName={signerName}
          // the open is recorded once, when the first document is drawn
          onOpened={index === 0 ? onOpened : null}
          signIntro={`Read the material, then complete and sign "${current.title}". Your signed copy goes to HR and is kept on file.`}
          submitAction={submitAction}
          onSubmitted={() => setSentCurrent(true)}
        />
      )}

      {current && sentCurrent && !last && (
        <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-5 dark:border-sky-900/50 dark:bg-sky-950/30">
          <p className="text-sm font-semibold text-sky-900 dark:text-sky-200">
            {position} of {total} signed. One more to go.
          </p>
          <p className="mt-1 text-sm text-sky-800 dark:text-sky-200/80">
            Next: &ldquo;{forms[index + 1].title}&rdquo;. Download a copy of this one above
            first if you want one.
          </p>
          <button
            type="button"
            onClick={next}
            className="mt-3 inline-flex items-center rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
          >
            Continue to the next document
          </button>
        </div>
      )}

      {current && sentCurrent && last && total > 1 && (
        <div className="mt-5 rounded-xl border border-emerald-300/60 bg-emerald-50 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            All {total} signed. Thank you.
          </p>
          <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-200/80">
            HR has every copy. There is nothing else to do.
          </p>
        </div>
      )}
    </div>
  );
}
