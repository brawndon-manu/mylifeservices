"use client";

// The day-program upload with the same live panel the MLS upload has - the
// ring, the steps, the just-finished ticker. Mánu 2026-08-31: "produce the
// same animation that we have currently for the MLS timesheets ... but for the
// day program uploads." One panel, two stage lists: UploadProgress is shared
// and takes DP_STAGES here.
import { useEffect, useRef, useState } from "react";
// the same drop-everything behavior the MLS upload has, against this form's
// own four pickers
import { DP_UPLOAD_SLOTS, placeDroppedFiles } from "@/lib/timesheet/upload-slots";
import { DP_STAGES } from "@/lib/timesheet-stages";
import UploadProgress from "@/app/portal/admin/timesheets/new/UploadProgress";
import PartialPick from "./PartialPick";

// module scope for the same reason the MLS form keeps it there: the id is only
// a lookup suffix for the progress poll, and it must be minted somewhere the
// compiler is not entitled to re-run.
function mintUploadId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `u${Date.now()}${Math.random().toString(36).slice(2)}`
  );
}

export default function UploadForm({ action }) {
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [names, setNames] = useState({});
  const [uploadId, setUploadId] = useState("");
  const idFieldRef = useRef(null);
  const formRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  // what a drop could not place - named, never silently ignored
  const [unplaced, setUnplaced] = useState([]);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  function onSubmit() {
    const id = mintUploadId();
    if (idFieldRef.current) idFieldRef.current.value = id;
    setUploadId(id);
    setSeconds(0);
    setBusy(true);
  }

  const pick = (id) => (e) => setNames((n) => ({ ...n, [id]: e.target.files?.[0]?.name || "" }));

  const sourceFiles = [
    { role: "Timesheet", kind: "pdf", name: names.timesheet },
    { role: "Rest breaks", kind: "xls", name: names.rests },
    { role: "Schedule", kind: "pdf", name: names.schedule },
    { role: "Mileage", kind: "xls", name: names.mileage },
  ];

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={onSubmit}
      className={`mt-8 space-y-4 rounded-xl ${dragging ? "outline outline-2 outline-brand" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer?.files?.length) {
          setUnplaced(placeDroppedFiles(formRef.current, [...e.dataTransfer.files], DP_UPLOAD_SLOTS));
        }
      }}
    >
      <input ref={idFieldRef} type="hidden" name="uploadId" />
      <p className="rounded-lg border border-dashed border-border-strong px-3 py-2 text-xs text-muted">
        Drag the exports onto this form together - each lands in its slot by
        its filename. Picking them one at a time works the same as before.
      </p>
      {unplaced.length > 0 && (
        <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
          Not one of the four exports, so it was not placed: {unplaced.join(", ")}
        </p>
      )}
      <FilePick
        id="timesheet"
        label="Simple Timesheet (.pdf)"
        hint="QSP > Reports > Timesheets. Hours, punches and overtime all come from here."
        accept=".pdf,application/pdf"
        required
        onPick={pick("timesheet")}
      />
      <FilePick
        id="rests"
        label="Rest Periods Report (.xls)"
        hint="Straight from QSP. Both layouts read, so an edited copy with second-break columns filled in still works - but you don't need to fill anything in. Rest breaks, the second breaks named in schedule notes, and the reasons staff give all come from here."
        accept=".xls,application/vnd.ms-excel"
        required
        onPick={pick("rests")}
      />
      <FilePick
        id="schedule"
        label="Employee Schedules (.pdf) - optional"
        hint="The month's schedule export. Gives every sheet the shift cross-check the MLS batches get."
        accept=".pdf,application/pdf"
        onPick={pick("schedule")}
      />
      <FilePick
        id="mileage"
        label="Employee Mileage Tracking Report (.xls) - optional"
        hint="QSP > Reports > Employee Mileage Tracking. The day program has no payroll report to carry a mileage column, so this is the only place miles come from. Leave it out and the sheet says nothing about mileage, rather than printing a 0.00 nobody should have to attest to."
        accept=".xls,application/vnd.ms-excel"
        onPick={pick("mileage")}
      />
      {/* deliberately last: the upload refuses a file holding days nobody
          has worked, and this is the way past that check, so it should read
          like what it is rather than an ordinary option. */}
      <PartialPick />
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand disabled:opacity-60"
      >
        Upload and analyze
      </button>
      {busy && <UploadProgress uploadId={uploadId} seconds={seconds} files={sourceFiles} stages={DP_STAGES} />}
    </form>
  );
}

function FilePick({ id, label, hint, accept, required, onPick }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <p className="mt-0.5 text-xs leading-relaxed text-muted">{hint}</p>
      <input
        id={id}
        name={id}
        type="file"
        required={required}
        accept={accept}
        onChange={onPick}
        className="mt-3 block w-full text-sm text-muted file:mr-4 file:rounded-md file:border-0 file:bg-brand-light file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand"
      />
    </div>
  );
}
