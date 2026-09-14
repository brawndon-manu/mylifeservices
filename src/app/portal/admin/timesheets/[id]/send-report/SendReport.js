"use client";

// ONE BUTTON, BUT IT SAYS WHO IT IS FOR FIRST - Mánu 2026-09-14 asked for "a
// click of a button". This is that click, with the recipients and the files
// named above it rather than hidden in the code, because the one thing worse
// than two clicks is payroll figures reaching an inbox nobody expected.
//
// NOT A SUBMIT BUTTON. No form, no action on one, so a press before hydration
// would navigate and the maintenance proxy would answer it.
import { useState } from "react";

const ERRORS = {
  gone: "That pay period is no longer here.",
  nomail: "Email is not configured, so nothing was sent.",
  notfinal: "This period is not closed yet.",
  send: "The email could not be sent. Nothing went out.",
  toobig: "The reports came to more than an inbox will take. Nothing was sent.",
};

export default function SendReport({ batchId, preview, action }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState("");
  const [parts, setParts] = useState([]);
  const [asking, setAsking] = useState(false);

  async function go(anyway) {
    if (busy) return;
    setError(""); setParts([]);
    setBusy(true);
    let res;
    try {
      res = await action(batchId, { anyway });
    } catch {
      res = { ok: false, error: "send" };
    }
    setBusy(false);
    if (!res?.ok) {
      if (res?.error === "notfinal") { setAsking(true); return; }
      if (res?.error === "part") { setError("Some of the reports could not be built, so nothing was sent."); setParts(res.missing || []); return; }
      setError(ERRORS[res?.error] || ERRORS.send);
      return;
    }
    setAsking(false);
    setDone(res);
  }

  if (done) {
    return (
      <div className="mt-6 rounded-xl border border-border bg-surface p-5">
        <p className="text-sm font-semibold text-foreground">
          {done.redirected ? "Sent to you, not to David." : `Sent to ${done.to.join(", ")}`}
        </p>
        {done.redirected && (
          <p className="mt-1 text-sm text-muted">
            This is not the live site, so the email went to your own inbox with the
            intended address in its subject.
          </p>
        )}
        {!done.redirected && done.cc?.length > 0 && (
          <p className="mt-1 text-sm text-muted">Copied to {done.cc.join(", ")}.</p>
        )}
        <ul className="mt-3 space-y-1 text-sm text-muted">
          {done.files.map((f) => (
            <li key={f.filename}>{f.label} · {Math.round(f.bytes / 1024)} KB</li>
          ))}
          <li>{done.signed} signed timesheets, as a link</li>
        </ul>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-xl border border-border bg-surface p-5">
      <p className="text-sm font-semibold text-foreground">
        To {preview.to.name} <span className="font-normal text-muted">({preview.to.email})</span>
      </p>
      <p className="mt-1 text-sm text-muted">
        Copy to {preview.cc.map((c) => `${c.name} (${c.email})`).join(", ")}
      </p>
      <ul className="mt-4 space-y-1 text-sm text-muted">
        <li>Payout report, as a PDF</li>
        <li>Payroll workbook, as an Excel file</li>
        <li>Payout figures, as a CSV</li>
        <li>Break penalty hours, as a PDF</li>
        <li>
          {preview.signed} of {preview.sheets} signed timesheets, as a link. They are
          too large to attach.
        </li>
      </ul>

      {!preview.locked && (
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/25 dark:text-amber-200">
          This period is not closed, so these figures can still change. The email
          says so too.
        </p>
      )}

      {asking ? (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/25">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Send it before the period is closed?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => go(true)}
              className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send it anyway"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setAsking(false)}
              className="rounded-md border border-border-strong px-4 py-2 text-sm font-medium text-muted disabled:opacity-50"
            >
              Not yet
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => go(false)}
          className="mt-5 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? "Building and sending…" : "Send the payroll reports"}
        </button>
      )}

      {error && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      {parts.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-rose-600 dark:text-rose-400">
          {parts.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
    </div>
  );
}
