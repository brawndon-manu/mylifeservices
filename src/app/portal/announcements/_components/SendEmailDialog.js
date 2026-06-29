"use client";

// "Send by email" dialog for an announcement. Supervisor+ opens it from the
// announcement, picks an audience (Everyone, or one/more job titles incl.
// Tester), and the bound server action emails the changelog-style email from
// announcements@. when the announcement requires acknowledgment, each email
// carries that person's one-click ack link (handled server-side).
import { useState } from "react";
import AudiencePicker from "./AudiencePicker";

export default function SendEmailDialog({
  action,
  title,
  requireAck,
  fromAddress,
  staffByTitle = {},
  everyoneTotal = null,
  defaultEveryone = true,
  defaultTitles = [],
  defaultUserIds = [],
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium text-muted transition hover:bg-surface-3 hover:text-foreground"
      >
        <MailIcon className="h-4 w-4" /> Send by email
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
        >
          <form
            action={action}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Send by email</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-muted transition hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3 border-b border-border pb-2">
                <span className="text-muted">From</span>
                <span className="text-foreground">{fromAddress}</span>
              </div>
              <div className="flex justify-between gap-3 border-b border-border pb-2">
                <span className="shrink-0 text-muted">Subject</span>
                <span className="text-right text-foreground">
                  {requireAck && (
                    <span className="text-rose-600">Acknowledgment required: </span>
                  )}
                  {title}
                </span>
              </div>
            </div>

            <p className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Send to
            </p>

            <AudiencePicker
              everyoneName="everyone"
              titlesName="titles"
              userIdsName="userIds"
              staffByTitle={staffByTitle}
              everyoneTotal={everyoneTotal}
              defaultEveryone={defaultEveryone}
              defaultTitles={defaultTitles}
              defaultUserIds={defaultUserIds}
            />

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-border-strong px-4 py-1.5 text-sm font-medium text-muted transition hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-md bg-brand-light px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
              >
                Send email
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

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
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}
