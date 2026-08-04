"use client";

// upload form with a pending state - parsing + rendering 60 PDFs takes a while,
// and without feedback people click the button twice.
//
// both file rows are built by the same component on purpose. the schedule input
// originally had a pair of conditional siblings toggling around it that the
// timesheet input didn't, and selections on it wouldn't stick - so they are kept
// structurally identical and the status line is always present rather than
// appearing and disappearing.
import { useRef, useState } from "react";

function FileRow({ id, label, required, hint, selected, onPick, tone }) {
  return (
    <div className={required ? "" : "mt-6"}>
      <label htmlFor={id} className="block text-sm font-medium text-muted">
        {label}{" "}
        {required ? (
          <span className="text-rose-600">*</span>
        ) : (
          <span className="font-normal text-faint">- strongly recommended</span>
        )}
      </label>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      <input
        id={id}
        name={id}
        type="file"
        accept="application/pdf,.pdf"
        required={required}
        onChange={onPick}
        className={`mt-2 block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-semibold ${
          tone === "primary"
            ? "file:bg-brand-light file:text-white hover:file:bg-brand"
            : "file:bg-surface-3 file:text-foreground hover:file:bg-surface-2"
        }`}
      />
      <p
        className={`mt-2 text-xs ${
          selected ? "font-medium text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"
        }`}
      >
        {selected ? `Selected: ${selected}` : "Nothing selected yet."}
      </p>
    </div>
  );
}

export default function UploadForm({ action }) {
  const [name, setName] = useState("");
  const [schedName, setSchedName] = useState("");
  const [busy, setBusy] = useState(false);
  const formRef = useRef(null);

  // read the DOM rather than trust state - if a selection ever fails to stick
  // again, this is what will disagree and show it
  function onSubmit(e) {
    const f = formRef.current;
    const sched = f?.querySelector("#schedule");
    if (sched && sched.files.length === 0) {
      const go = window.confirm(
        "No Employee Schedules PDF is attached.\n\nWithout it the hours can only be checked against themselves, and a punch typed into the wrong box stays invisible.\n\nUpload anyway?",
      );
      if (!go) {
        e.preventDefault();
        return;
      }
    }
    setBusy(true);
  }

  return (
    <form ref={formRef} action={action} onSubmit={onSubmit}>
      <FileRow
        id="file"
        label="QSP Simple Timesheet export (PDF)"
        required
        tone="primary"
        selected={name}
        onPick={(e) => setName(e.target.files?.[0]?.name || "")}
      />

      <FileRow
        id="schedule"
        label="Employee Schedules export (PDF)"
        hint="Checked against the timesheet day by day. This is what catches a punch typed into the wrong box, which the timesheet on its own cannot show."
        selected={schedName}
        onPick={(e) => setSchedName(e.target.files?.[0]?.name || "")}
      />

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
