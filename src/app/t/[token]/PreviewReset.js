"use client";

// PUTTING ONE PERSON'S QUESTIONS BACK, FROM THEIR OWN PAGE.
//
// Mánu 2026-08-12: "I meant to reset page. When you open up someone's time sheet
// corrections."
//
// The testing loop is: open somebody's page, work through what it asks, see what
// it did, put it back, go again. The batch reset serves a different need - it
// starts a whole period over - and using it to retry one person means resetting
// fifty-eight other people to do it.
//
// It sits in the preview banner rather than at the bottom with the send button
// because the two are opposite in kind: sending is the one thing this tab does
// FOR the employee, and resetting is the one thing it does TO them.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetTimesheetAnswers } from "@/app/portal/admin/timesheets/actions";

export default function PreviewReset({ timesheetId, name, answers = 0, reasons = 0, signed }) {
  // ONE NUMBER FOR WHAT IT ACTUALLY REMOVES. Question answers and the reasons
  // they typed live in two tables and the button only ever counted one of them.
  const total = answers + reasons;
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  if (!open) {
    return (
      <div className="mt-3 border-t border-amber-300 pt-3 dark:border-amber-800">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-amber-400 px-3 py-1.5 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/40"
        >
          {total > 0 ? `Undo their ${total} answer${total === 1 ? "" : "s"}` : "Put this sheet back"}
        </button>
        {err && (
          <p className="mt-1.5 text-xs text-rose-700 dark:text-rose-400">
            Could not reset: {err}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-amber-300 pt-3 dark:border-amber-800">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
        {total > 0
          ? `Delete ${name}'s ${total} answer${total === 1 ? "" : "s"}?`
          : `Rebuild ${name}'s sheet from the upload?`}
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-amber-800 dark:text-amber-300">
        <li>Their sheet goes back to the figures the upload produced.</li>
        {reasons > 0 && (
          /* WHOSE WORDS GO AND WHOSE STAY. A reason a reviewer took off a phone
             call is not the employee's to delete and not this button's either,
             so it keeps its sentence and loses only their tick - which puts it
             back to being a question for them. */
          <li>
            Anything <b>they</b> wrote about a missed break goes. A reason{" "}
            <b>we</b> recorded stays, and goes back to waiting on them to check it.
          </li>
        )}
        {signed && (
          <li>
            <b>Their signature goes too</b> &mdash; a rebuild un-signs, because
            the signed copy quotes figures that are about to change.
          </li>
        )}
        <li>Nobody else on the batch is touched.</li>
      </ul>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await resetTimesheetAnswers(timesheetId);
              if (res?.ok) {
                setOpen(false);
                // the page is built from the sheet that just changed, so it has
                // to be re-fetched rather than left showing the old questions
                router.refresh();
              } else {
                setErr(res?.error || "failed");
                setOpen(false);
              }
            })
          }
          className="rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-amber-800 disabled:opacity-60"
        >
          {pending ? "Resetting…" : "Yes, reset it"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setOpen(false)}
          className="rounded-lg border border-amber-400 px-3 py-1.5 text-sm font-medium text-amber-900 transition hover:bg-amber-100 disabled:opacity-60 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/40"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
