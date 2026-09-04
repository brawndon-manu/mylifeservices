"use client";

// ONE SESSION'S CONCLUDE - Mánu 2026-09-04: "dont we need one per session?"
// Lives where the roll call lives. The dialog states what the press does
// before it does it: who gets marked absent, and which emails go out.
import { useState } from "react";
import { concludeSession } from "@/app/portal/announcements/actions";

export default function ConcludeSession({
  postId, optionId, sessionName, present, unmarked, concluded, attestationTitle,
}) {
  const [open, setOpen] = useState(false);
  if (concluded) {
    return (
      <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        Session concluded.
      </p>
    );
  }
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-border-strong px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-brand hover:text-brand"
      >
        Conclude this session
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl">
            <p className="text-base font-semibold text-foreground">
              Conclude {sessionName}?
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {unmarked > 0
                ? `${unmarked} ${unmarked === 1 ? "person" : "people"} with no roll call mark ${unmarked === 1 ? "is" : "are"} marked absent. `
                : ""}
              {attestationTitle
                ? `Everyone present gets ${attestationTitle} to sign; anyone who already signed gets an attendance confirmation instead.`
                : "Everyone present gets an attendance confirmation."}{" "}
              Everyone absent gets an email saying so, and their replies go to
              the meeting author.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-border-strong px-4 py-2 text-sm font-medium text-muted"
              >
                Cancel
              </button>
              <form action={concludeSession.bind(null, postId, optionId)}>
                <button
                  type="submit"
                  className="rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand"
                >
                  Conclude this session
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
