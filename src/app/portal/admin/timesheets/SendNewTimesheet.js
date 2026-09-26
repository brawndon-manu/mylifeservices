"use client";

import { useEffect, useState, useTransition } from "react";
import { sendDecidedTimesheet } from "@/app/portal/admin/timesheets/actions";

// SEND THEM THEIR NEW TIMESHEET (2026-09-26). after the last decision on a
// sheet the desk and Live ask before anybody is emailed - the decision used to
// email the person on its own. `send` is what that decision produced: their
// name, the email's own title and sentence (shown here so the office sees
// exactly what goes), and the signed handle sendDecidedTimesheet takes. Not
// now sends nothing; their portal bell has rung either way.
const ERRORS = {
  expired: "This was open too long to send from here. Send it from the batch page instead.",
  norecipient: "There's no email address on their account, so nothing was sent.",
};

export default function SendNewTimesheet({ send, onClose }) {
  const [pending, start] = useTransition();
  const [sentTo, setSentTo] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !pending && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  const go = () =>
    start(async () => {
      setError(null);
      try {
        const res = await sendDecidedTimesheet(send.token);
        if (res?.ok) setSentTo(res.sentTo);
        else setError(ERRORS[res?.error] || "That didn't send. Try again.");
      } catch {
        setError("That didn't send. Try again.");
      }
    });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-new-timesheet"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-xl night:ring-1 night:ring-border">
        <p id="send-new-timesheet" className="text-lg font-semibold text-foreground">
          Send {send.name} their new timesheet?
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Every report on it is decided. They&apos;ll get this email, with a link to their timesheet:
        </p>
        <div className="mt-3 rounded-lg bg-fill px-3.5 py-3">
          <p className="text-sm font-semibold text-foreground">{send.title}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">{send.plain}</p>
        </div>
        {sentTo && <p role="status" className="mt-3 text-sm text-foreground">Sent to {sentTo}.</p>}
        {error && <p role="alert" className="mt-3 text-sm text-rose-700 dark:text-rose-400">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {sentTo ? (
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-[9px] bg-fill px-4 py-2 text-[13.5px] font-medium text-foreground transition hover:bg-surface-2"
            >
              Done
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                className="min-h-[44px] rounded-[9px] px-4 py-2 text-[13.5px] font-medium text-muted transition-colors hover:bg-fill disabled:opacity-60"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={go}
                disabled={pending}
                className="min-h-[44px] rounded-[9px] bg-brand px-4 py-2 text-[13.5px] font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60"
              >
                {pending ? "Sending…" : "Send it"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
