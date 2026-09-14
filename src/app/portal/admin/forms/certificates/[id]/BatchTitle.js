"use client";

// THE NAME ON A RUN, EDITED WHERE IT IS READ - Mánu 2026-09-13: "can i have
// option to rename". The builder takes a title from the uploaded file name, so
// a run ends up listed as "BLANK HIPPA Omnibus Rule 13" unless it was typed
// over at the time.
//
// Saved only when it is saved. Enter commits and Escape puts the old one back;
// clicking away does neither, because this writes to the record rather than to
// a field on a form that has not been sent yet.
//
// NO FORM ELEMENT HERE ON PURPOSE. A press before hydration on a form with no
// action navigates, the maintenance proxy answers, and the edit is gone.
import { useState } from "react";
import { Pencil } from "lucide-react";

const ERRORS = {
  notitle: "Give the certificate a name.",
  save: "The new name could not be saved.",
};

export default function BatchTitle({ batchId, title, action }) {
  const [name, setName] = useState(title);
  const [draft, setDraft] = useState(title);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function open() {
    setDraft(name);
    setError("");
    setEditing(true);
  }

  function close() {
    setError("");
    setEditing(false);
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    let res;
    try {
      res = await action(batchId, draft);
    } catch {
      res = { ok: false, error: "save" };
    }
    setBusy(false);
    if (!res?.ok) {
      setError(ERRORS[res?.error] || ERRORS.save);
      return;
    }
    setName(res.title);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="mt-4 flex items-start gap-1.5">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{name}</h1>
        <button
          type="button"
          onClick={open}
          aria-label="Rename"
          title="Rename"
          className="mt-1.5 rounded-md p-1.5 text-muted transition hover:bg-surface-3 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Pencil aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
        }}
        aria-label="What this certificate is for"
        className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-3xl font-semibold tracking-tight text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="rounded-md bg-brand px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={close}
          className="rounded-md border border-border-strong px-3.5 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
        >
          Cancel
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
