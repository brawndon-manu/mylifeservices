"use client";

// upload form with a pending state - parsing + rendering 60 PDFs takes a while,
// and without feedback people click the button twice.
//
// both file rows are built by the same component on purpose. the schedule input
// originally had a pair of conditional siblings toggling around it that the
// timesheet input didn't, and selections on it wouldn't stick - so they are kept
// structurally identical and the status line is always present rather than
// appearing and disappearing.
import { useActionState, useEffect, useRef, useState } from "react";
import UploadProgress from "./UploadProgress";
import UploadDone from "./UploadDone";

function FileRow({ id, label, path, hint, selected, onPick, tone, accept = "application/pdf,.pdf" }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-muted">
        {label} <span className="text-rose-600">*</span>
      </label>
      {/* where it lives in QSP. the whole point of writing these down is that
          somebody other than Mánu can pull a pay period, so the path gets its
          own line rather than being buried in the sentence. */}
      {path && (
        <p className="mt-1.5 inline-block rounded border border-border-strong bg-surface-3 px-2 py-1 font-mono text-[11px] leading-none text-foreground">
          {path}
        </p>
      )}
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
      <input
        id={id}
        name={id}
        type="file"
        accept={accept}
        required
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

export default function UploadForm({ action, aside }) {
  // the action returns instead of redirecting, so the finished screen can be
  // shown before the batch page takes over. errors still redirect back here.
  const [result, formAction] = useActionState(
    async (_prev, formData) => action(formData),
    null,
  );
  const [name, setName] = useState("");
  const [schedName, setSchedName] = useState("");
  const [clockName, setClockName] = useState("");
  const [restsName, setRestsName] = useState("");
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const formRef = useRef(null);
  // this upload's id, so the page can poll for its progress while the action is
  // still running. Only ever a lookup suffix - the server namespaces it under
  // the uploader's own account, so it grants nothing on its own.
  //
  // Minted in the submit handler rather than during render or in an effect:
  // a random value invented while rendering differs between the server's HTML
  // and the client's, and neither of those places is where side effects belong.
  // The hidden field is left uncontrolled and written directly, so the value is
  // on the element before the action reads the form.
  const [uploadId, setUploadId] = useState("");
  const idFieldRef = useRef(null);

  // what to show in place of the pickers once they are hidden
  const sourceFiles = [
    { role: "Timesheet", kind: "pdf", name },
    { role: "Schedule", kind: "pdf", name: schedName },
    { role: "Clock", kind: "xls", name: clockName },
    { role: "Rest breaks", kind: "xls", name: restsName },
  ];

  // elapsed time, started when the upload does and frozen once it lands
  useEffect(() => {
    if (!busy || result?.ok) return;
    const t = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [busy, result?.ok]);

  // read the DOM rather than trust state - if a selection ever fails to stick
  // again, this is what will disagree and show it
  function onSubmit(e) {
    const f = formRef.current;
    for (const [id, what] of [["schedule", "Employee Schedules"], ["clock", "QSClock Time and Attendance"], ["rests", "Rest Periods"]]) {
      const el = f?.querySelector(`#${id}`);
      if (el && el.files.length === 0) {
        e.preventDefault();
        window.alert(`The ${what} export is required. Without all four, the premium hours can't be evidenced.`);
        return;
      }
    }

    // if any of this fails the upload still runs - it just runs without a
    // counter, which is exactly how it behaved before
    const id =
      globalThis.crypto?.randomUUID?.() ||
      `u${Date.now()}${Math.random().toString(36).slice(2)}`;
    if (idFieldRef.current) idFieldRef.current.value = id;
    setUploadId(id);
    setBusy(true);
  }

  // One column. A two-column split was tried and Mánu didn't like it - the page
  // is a short set of instructions and a form, and stacking them is the honest
  // shape of that. Everything sits at one width so nothing dangles short of
  // anything else, which was the original complaint.
  //
  // The instructions still disappear once a run starts: they've done their job
  // by then, and the waiting screen should be the whole screen.
  return (
    <div>
      {!busy && <div className="mb-8">{aside}</div>}

      <form ref={formRef} action={formAction} onSubmit={onSubmit}>
        <input ref={idFieldRef} type="hidden" name="uploadId" />

      {/* the pickers go away once it starts. four "Browse…" buttons that can't
          be used are noise on a screen you are waiting on - the files reappear
          as documents inside the progress panel instead. `hidden` rather than
          unmounted, so the inputs stay in the form and the submission keeps
          its files. */}
      <div className={busy ? "hidden" : "rounded-xl border border-border bg-surface p-6 sm:p-8"}>
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
      <FileRow
        id="file"
        label="QSP Simple Timesheet export (PDF)"
        path="Reports → Timesheets"
        tone="primary"
        hint="The hours themselves. Every corrected timesheet is generated from this one."
        selected={name}
        onPick={(e) => setName(e.target.files?.[0]?.name || "")}
      />

      <FileRow
        id="schedule"
        label="Employee Schedules export (PDF)"
        path="Scheduling → Reports → Print/Email Schedules"
        hint="Report type: Employee. Pick the month the pay period falls in. Checked against the timesheet day by day, and it catches a punch typed into the wrong box."
        selected={schedName}
        onPick={(e) => setSchedName(e.target.files?.[0]?.name || "")}
      />

      <FileRow
        id="clock"
        label="QSClock Time and Attendance report (.xls)"
        path="Scheduling → Reports → Shift Audit → QSClock Time and Attendance"
        accept=".xls,application/vnd.ms-excel"
        hint="Says which days were actually clocked and which were typed in afterwards, which is what decides whether a premium can be signed off."
        selected={clockName}
        onPick={(e) => setClockName(e.target.files?.[0]?.name || "")}
      />

      <FileRow
        id="rests"
        label="Rest Periods Report (.xls)"
        path="Reports → Rest Periods Report"
        accept=".xls,application/vnd.ms-excel"
        hint="QSP's own record of which rest breaks were taken. Rest premiums are the bigger half of the total, and nothing else we have can speak to them."
        selected={restsName}
        onPick={(e) => setRestsName(e.target.files?.[0]?.name || "")}
      />
        </div>
        <button
          type="submit"
          className="mt-7 w-full rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
        >
          Upload and generate
        </button>
      </div>
        {busy && !result?.ok && (
          <UploadProgress uploadId={uploadId} seconds={seconds} files={sourceFiles} />
        )}
        {result?.ok && (
          <UploadDone href={result.href} summary={result.summary} seconds={seconds} files={sourceFiles} />
        )}
      </form>
    </div>
  );
}
