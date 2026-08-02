"use client";

// upload form with a pending state - parsing + rendering 60 PDFs takes a while,
// and without feedback people click the button twice.
import { useState } from "react";

export default function UploadForm({ action }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form action={action} onSubmit={() => setBusy(true)}>
      <label htmlFor="file" className="block text-sm font-medium text-muted">
        QSP Simple Timesheet export (PDF) <span className="text-rose-600">*</span>
      </label>
      <input
        id="file"
        name="file"
        type="file"
        accept="application/pdf,.pdf"
        required
        onChange={(e) => setName(e.target.files?.[0]?.name || "")}
        className="mt-2 block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-brand-light file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-brand"
      />
      {name && <p className="mt-2 text-xs text-muted">Selected: {name}</p>}

      <button
        type="submit"
        disabled={busy}
        className="mt-6 w-full rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand disabled:opacity-60 sm:w-auto"
      >
        {busy ? "Reading the export - this can take a minute…" : "Upload and generate"}
      </button>
      {busy && (
        <p className="mt-3 text-xs text-muted">
          Parsing every employee and rendering their corrected timesheet. Don&apos;t
          close this tab.
        </p>
      )}
    </form>
  );
}
