"use client";

// the roster's "Send to staff by email" nudge, with a site-styled confirm modal
// (not the native browser confirm). when everyone has already responded/acked
// there's no one to nudge, so instead we point to "Send by email" above (which
// lets you resend to specific people).
import { useState } from "react";

function MailIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

export default function AckEmailAction({ postId, send, notYetCount, isMeeting }) {
  const [open, setOpen] = useState(false);
  const verb = isMeeting ? "responded" : "acknowledged";
  const noun = notYetCount === 1 ? "person" : "people";

  // everyone's done - nothing to nudge. guide them to the resend dialog above.
  if (notYetCount === 0) {
    return (
      <p className="text-xs leading-relaxed text-muted sm:max-w-[17rem] sm:text-right">
        Everyone has {verb}. To send it out again, use{" "}
        <span className="font-medium text-foreground">Send by email</span> above and
        choose who gets it.
      </p>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md border border-border-strong px-3 py-2 text-sm font-medium text-foreground transition hover:bg-surface-3"
      >
        <MailIcon className="h-4 w-4" />
        Send to staff by email
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border-strong bg-surface p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-foreground">
              Nudge the {notYetCount} who haven&apos;t {verb} yet?
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              We&apos;ll email just the{" "}
              <span className="font-semibold text-foreground">
                {notYetCount} {noun}
              </span>{" "}
              who haven&apos;t {verb}, with a one-click{" "}
              {isMeeting ? "link to respond" : "link to acknowledge"}. Anyone who
              already has won&apos;t be emailed again.
            </p>
            <form
              action={send.bind(null, postId)}
              className="mt-5 flex justify-end gap-2"
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-muted transition hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-brand-light px-4 py-2 text-sm font-bold text-white transition hover:bg-brand"
              >
                Send to {notYetCount} {noun}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
