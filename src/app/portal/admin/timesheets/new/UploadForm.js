"use client";

// upload form with a pending state - parsing + rendering 60 PDFs takes a while,
// and without feedback people click the button twice.
import { useState } from "react";

export default function UploadForm({ action }) {
  const [name, setName] = useState("");
  const [schedName, setSchedName] = useState("");
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

      {/* the second record. punch data gets typed into the wrong boxes and there
          is no way to catch that from the punches alone - two sources
          disagreeing is the only reliable signal. */}
      <label htmlFor="schedule" className="mt-6 block text-sm font-medium text-muted">
        Employee Schedules export (PDF){" "}
        <span className="font-normal text-faint">- strongly recommended</span>
      </label>
      <p className="mt-1 text-xs text-muted">
        Checked against the timesheet day by day. This is what catches a punch
        typed into the wrong box, which the timesheet on its own cannot show.
      </p>
      <input
        id="schedule"
        name="schedule"
        type="file"
        accept="application/pdf,.pdf"
        onChange={(e) => setSchedName(e.target.files?.[0]?.name || "")}
        className="mt-2 block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-surface-3 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-foreground hover:file:bg-surface-2"
      />
      {schedName && <p className="mt-2 text-xs text-muted">Selected: {schedName}</p>}
      {!schedName && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          Without it the hours can only be checked against themselves.
        </p>
      )}

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
