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

// Server Actions cap the whole request, and the four exports go up as one. A
// 24MB corrected-timesheet PDF sitting in the same Downloads folder as the QSP
// export is very easy to pick by mistake, and until now that produced a 500
// with a stack trace and no clue which file was too big.
//
// Vercel caps a serverless request body at 4.5MB whatever this is set to, so
// the number here is the real ceiling for an upload done in production. It is
// higher locally, which is why uploads have been run from localhost.
const BODY_LIMIT_MB = 5;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// Module scope on purpose. Date.now and Math.random are impure, and once the
// submit handler started reading render-scope values the React compiler began
// treating it as render code and rejecting them. The id is only a lookup suffix
// for the progress poll, so where it is minted does not matter - but it has to
// be somewhere the compiler is not entitled to re-run.
function mintUploadId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `u${Date.now()}${Math.random().toString(36).slice(2)}`
  );
}

function FileRow({ id, label, selected, size, onPick, tone, accept = "application/pdf,.pdf" }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-muted">
        {label} <span className="text-rose-600">*</span>
      </label>
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
        {selected ? `Selected: ${selected}${size ? ` (${mb(size)})` : ""}` : "Nothing selected yet."}
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
  const [payrollName, setPayrollName] = useState("");
  const [restsName, setRestsName] = useState("");
  // bytes per picker, so the form can add them up before it sends anything
  const [sizes, setSizes] = useState({});
  const totalBytes = Object.values(sizes).reduce((n, b) => n + b, 0);
  const overLimit = totalBytes > BODY_LIMIT_MB * 1024 * 1024;
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
    { role: "Payroll", kind: "xls", name: payrollName },
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
    for (const [id, what] of [["schedule", "Employee Schedules"], ["payroll", "Simple Payroll Processing Report"], ["rests", "Rest Periods Report"]]) {
      const el = f?.querySelector(`#${id}`);
      if (el && el.files.length === 0) {
        e.preventDefault();
        window.alert(`The ${what} export is required. Without all four, the premium hours can't be evidenced.`);
        return;
      }
    }

    // stop it here rather than let the server reject the body. the message
    // names the biggest file, because the mistake is nearly always one wrong
    // pick rather than four large exports.
    if (overLimit) {
      e.preventDefault();
      const biggest = Object.entries(sizes).sort((a, b) => b[1] - a[1])[0];
      const label = { file: "timesheet", schedule: "schedule", payroll: "payroll", rests: "rest breaks" };
      window.alert(
        `Those four come to ${mb(totalBytes)} and the limit is ${BODY_LIMIT_MB} MB.\n\n` +
        `The largest is the ${label[biggest[0]] || biggest[0]} file at ${mb(biggest[1])}. ` +
        `Check it is the QSP export and not a corrected timesheet - those run to 20 MB and live in the same folder.`,
      );
      return;
    }

    // if any of this fails the upload still runs - it just runs without a
    // counter, which is exactly how it behaved before
    const id = mintUploadId();
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
        tone="primary"
        selected={name}
        size={sizes.file || 0}
        onPick={(e) => {
          setName(e.target.files?.[0]?.name || "");
          setSizes((p) => ({ ...p, file: e.target.files?.[0]?.size || 0 }));
        }}
      />

      <FileRow
        id="schedule"
        label="Employee Schedules export (PDF)"
        selected={schedName}
        size={sizes.schedule || 0}
        onPick={(e) => {
          setSchedName(e.target.files?.[0]?.name || "");
          setSizes((p) => ({ ...p, schedule: e.target.files?.[0]?.size || 0 }));
        }}
      />

      <FileRow
        id="payroll"
        label="Simple Payroll Processing Report (.xls)"
        accept=".xls,application/vnd.ms-excel"
        selected={payrollName}
        size={sizes.payroll || 0}
        onPick={(e) => {
          setPayrollName(e.target.files?.[0]?.name || "");
          setSizes((p) => ({ ...p, payroll: e.target.files?.[0]?.size || 0 }));
        }}
      />

      <FileRow
        id="rests"
        label="Rest Periods Report (.xls)"
        accept=".xls,application/vnd.ms-excel"
        selected={restsName}
        size={sizes.rests || 0}
        onPick={(e) => {
          setRestsName(e.target.files?.[0]?.name || "");
          setSizes((p) => ({ ...p, rests: e.target.files?.[0]?.size || 0 }));
        }}
      />
        </div>
        {totalBytes > 0 && (
          <p className={`mt-5 text-xs ${overLimit ? "font-semibold text-rose-600 dark:text-rose-400" : "text-muted"}`}>
            {mb(totalBytes)} selected
            {overLimit
              ? ` - over the ${BODY_LIMIT_MB} MB limit, so this will be refused before it uploads.`
              : ` of a ${BODY_LIMIT_MB} MB limit.`}
          </p>
        )}
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
