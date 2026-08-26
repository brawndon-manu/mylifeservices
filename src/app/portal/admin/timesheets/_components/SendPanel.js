"use client";

// send-everyone panel: one message + one deadline applied to the whole batch.
// deliberately requires a confirm, since this is the button that mails every
// employee their own payroll document.
import { useState } from "react";
import DatePicker from "@/components/DatePicker";

export default function SendPanel({
  batchId, readyToSend, alreadySent, send, live,
  // SHUT UNTIL THE PERIOD IS ATTESTED FINAL. See batch-state.js: the data
  // reaching the last day is a precondition, not permission - the schedule
  // locks at 8pm and no export records that it happened.
  blocked = false, blockedWhy = null,
}) {
  const [open, setOpen] = useState(false);
  // the override is deliberate rather than absent: a wall with no door means
  // somebody eventually needs one at 6pm on payroll day and has to edit the
  // database to get it. Two clicks and it says out loud what is being ignored.
  const [override, setOverride] = useState(false);
  const shut = blocked && !override;

  if (readyToSend === 0 && alreadySent === 0) return null;

  return (
    <div className="mt-6 rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Send to everyone</p>
          <p className="mt-1 text-sm text-muted">
            {readyToSend > 0
              ? `${readyToSend} matched timesheet${readyToSend === 1 ? "" : "s"} ready to go out.`
              : "Everyone matched has already been sent."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={readyToSend === 0 || shut}
          title={shut ? blockedWhy || undefined : undefined}
          className="rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand disabled:opacity-50"
        >
          {open ? "Cancel" : `Send all (${readyToSend})`}
        </button>
      </div>

      {shut && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {blockedWhy || "This pay period is not finished yet."}
          </p>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
            Mark the period final above once the schedule is locked, and this opens
            on its own.
          </p>
          <button
            type="button"
            onClick={() => setOverride(true)}
            className="mt-2 text-xs font-semibold text-amber-900 underline underline-offset-2 dark:text-amber-200"
          >
            Send anyway, before the period is closed
          </button>
        </div>
      )}

      {blocked && override && (
        <p className="mt-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm font-semibold text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          Sending an unfinished pay period. {blockedWhy}
        </p>
      )}

      {open && (
        <form
          action={send.bind(null, batchId)}
          onSubmit={(e) => {
            const what = live
              ? `This will EMAIL ${readyToSend} employees their real timesheets. Continue?`
              : `Send ${readyToSend} timesheets? (test mode - all redirected to you)`;
            if (!window.confirm(what)) return e.preventDefault();
            // THE SECOND WARNING, and only on the override. The first asks about
            // scale; this one asks about the thing being overridden, by name, so
            // it cannot be clicked through on muscle memory.
            if (blocked && override
              && !window.confirm(`${blockedWhy}

Send anyway?`)) e.preventDefault();
          }}
          className="mt-4 space-y-4 border-t border-border pt-4"
        >
          <div>
            <label htmlFor="message" className="block text-sm font-medium text-muted">
              Message <span className="text-faint">(optional)</span>
            </label>
            <textarea
              id="message"
              name="message"
              rows={3}
              maxLength={2000}
              placeholder="Anything staff should know before they sign…"
              className="mt-1.5 w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-sm text-foreground placeholder:text-faint focus:border-brand focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="dueAt" className="block text-sm font-medium text-muted">
              Sign by <span className="text-faint">(optional)</span>
            </label>
            <DatePicker
              id="dueAt"
              name="dueAt"
              inputClassName="mt-1.5 w-full rounded-lg border border-border-strong bg-background px-3 py-2 pr-10 text-sm text-foreground focus:border-brand focus:outline-none"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="resend" className="h-4 w-4 accent-brand" />
            Also resend to people who already got it
          </label>
          <button
            type="submit"
            className="rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
          >
            {live ? "Send for real" : "Send (test)"}
          </button>
        </form>
      )}
    </div>
  );
}
