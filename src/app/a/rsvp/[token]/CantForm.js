"use client";

import { useState } from "react";
import { submitRsvpCant } from "../actions";

// the "can't make it" form on the /a/rsvp landing. single/flat meetings just ask
// for a reason (required, admins-only); a series shows a checklist of which
// series they can't attend + an optional reason. no login - the signed token is
// carried in the form as the credential.
export default function CantForm({ token, isSeries, series = [], title }) {
  const [checked, setChecked] = useState({});
  const [reason, setReason] = useState("");
  const anyChecked = series.some((s) => checked[s.id]);
  const canSubmit = isSeries ? anyChecked : reason.trim().length > 0;

  return (
    <form
      action={submitRsvpCant.bind(null, token)}
      className="w-full max-w-md rounded-2xl border border-border-strong bg-surface p-6 text-left shadow-sm"
    >
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        {isSeries ? "Which can't you attend?" : "Sorry you can't make it"}
      </h1>
      <p className="mt-1.5 text-sm text-muted">
        <span className="font-medium text-foreground">&ldquo;{title}&rdquo;</span>
      </p>

      {isSeries ? (
        <>
          <p className="mt-4 text-sm text-muted">Check the series you can&apos;t attend:</p>
          <div className="mt-2 space-y-2">
            {series.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground"
              >
                <input
                  type="checkbox"
                  name="cantSeries"
                  value={s.id}
                  checked={!!checked[s.id]}
                  onChange={(e) => setChecked((p) => ({ ...p, [s.id]: e.target.checked }))}
                  className="h-4 w-4 accent-rose-600"
                />
                <span>{s.label}</span>
              </label>
            ))}
          </div>
          <label className="mt-4 block text-sm font-medium text-foreground">
            Reason <span className="font-normal text-faint">(optional)</span>
          </label>
        </>
      ) : (
        <label className="mt-4 block text-sm font-medium text-foreground">
          Let us know why
        </label>
      )}

      <textarea
        name="reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        required={!isSeries}
        rows={3}
        placeholder="Only admins can see this."
        className="mt-1.5 w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-sm text-foreground placeholder:text-faint focus:border-brand focus:outline-none"
      />
      {!isSeries && (
        <p className="mt-1 text-xs text-faint">A reason is required. Only admins can see it.</p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="mt-4 w-full rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
      >
        {isSeries ? "Send" : "Send"}
      </button>
      <p className="mt-3 text-center text-xs text-faint">No login needed.</p>
    </form>
  );
}
