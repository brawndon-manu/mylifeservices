"use client";

// upload form with a pending state - parsing + rendering 60 PDFs takes a while,
// and without feedback people click the button twice.
//
// both file rows are built by the same component on purpose. the schedule input
// originally had a pair of conditional siblings toggling around it that the
// timesheet input didn't, and selections on it wouldn't stick - so they are kept
// structurally identical and the status line is always present rather than
// appearing and disappearing.
import { useActionState, useEffect, useRef, useState, startTransition } from "react";
// browser-to-Blob uploads, so eight exports never ride one 30MB request -
// Vercel caps a serverless body at 4.5MB and the big exports blow past it
import { upload } from "@vercel/blob/client";
import { placeDroppedFiles } from "@/lib/timesheet/upload-slots";
import DatePicker from "@/components/DatePicker";
import UploadProgress from "./UploadProgress";
import UploadDone from "./UploadDone";

// Server Actions cap the whole request, and every export goes up as one. A
// 24MB corrected-timesheet PDF sitting in the same Downloads folder as the QSP
// export is very easy to pick by mistake, and until now that produced a 500
// with a stack trace and no clue which file was too big.
//
// Vercel caps a serverless request body at 4.5MB whatever this is set to, so
// the number here is the real ceiling for an upload done in production. It is
// higher locally, which is why uploads have been run from localhost.
//
// RAISED FROM 5MB ON 2026-08-27, because the Employee Service Notes export is
// 21.8MB on its own - QSP writes it as one worksheet per staff member per
// client and the file is mostly formatting. Eight exports for 08/16-08/27 come
// to 26.9MB, so a 5MB total would refuse every real upload.
//
// The wrong-file check moved rather than went: the file that gets picked by
// mistake is a PDF, so the three PDF pickers keep a ceiling of their own. The
// QSP timesheet is around 0.9MB, the schedule 0.6MB and a fortnight of service
// notes 2.7MB; a corrected timesheet is twenty.
// 48, not 50: the config's two 50mb layers need a little multipart headroom.
// A full MONTH of exports (Mánu's August audit copy, 2026-09-04) is 42.5MB -
// the fortnightly eight were 26.9MB - and anything this size only ever
// uploads from localhost, where the 4.5MB Vercel request cap does not apply.
const BODY_LIMIT_MB = 48;
const PDF_LIMIT_MB = 10;
const PDF_PICKERS = ["file", "file2", "schedule", "notes"];
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// what each picker is called when an alert has to name one
const LABELS = {
  file: "timesheet",
  schedule: "schedule",
  payroll: "payroll",
  rests: "rest breaks",
  clock: "clocking",
  notes: "service notes",
  serviceNotes: "service notes",
  scheduleNotes: "schedule notes",
};

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

// `optional` exists because the QSClock export came back optional on
// 2026-08-22 and this row hardcoded both the asterisk and `required` - so an
// "optional" field silently refused to let the form submit at all. Every other
// caller is genuinely required and passes nothing.
function FileRow({ id, label, selected, size, onPick, tone, optional = false, accept = "application/pdf,.pdf", sendingPct = null }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-muted">
        {label} {optional ? null : <span className="text-rose-600">*</span>}
      </label>
      <input
        id={id}
        name={id}
        type="file"
        accept={accept}
        required={!optional}
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
        {sendingPct != null
          ? `Uploading ${selected}... ${sendingPct}%`
          : selected ? `Selected: ${selected}${size ? ` (${mb(size)})` : ""}` : "Nothing selected yet."}
      </p>
    </div>
  );
}

// `audit` is the Audit page's lane: same form, same action, minus the payroll
// and rest-break pickers - those two feed payroll surfaces the audit never
// reads. The action sees audit=1 and lands the batch flagged auditOnly.
export default function UploadForm({ action, aside, into = null, blobUpload = false, audit = false }) {
  // the action returns instead of redirecting, so the finished screen can be
  // shown before the batch page takes over. errors still redirect back here.
  const [result, formAction] = useActionState(
    async (_prev, formData) => action(formData),
    null,
  );
  const [name, setName] = useState("");
  const [name2, setName2] = useState("");
  const [schedName, setSchedName] = useState("");
  const [payrollName, setPayrollName] = useState("");
  const [restsName, setRestsName] = useState("");
  const [clockName, setClockName] = useState("");
  const [notesName, setNotesName] = useState("");
  const [serviceNotesName, setServiceNotesName] = useState("");
  const [scheduleNotesName, setScheduleNotesName] = useState("");
  // the partial-period box, held in state only so the date range can be revealed
  // under it - the value the action reads is the checkbox's own
  const [partial, setPartial] = useState(false);
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
  // browser-to-Blob phase: slot -> percent while the exports are going up,
  // null when nothing is. The pickers stay on screen through it so each row
  // can show its own file moving.
  const [sending, setSending] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [sendError, setSendError] = useState(null);
  // what a drop could not place - named, because a silently ignored file
  // reads as an upload that lost it
  const [unplaced, setUnplaced] = useState([]);

  // what to show in place of the pickers once they are hidden
  const sourceFiles = [
    { role: "Timesheet", kind: "pdf", name },
    ...(audit && name2 ? [{ role: "Timesheet 2", kind: "pdf", name: name2 }] : []),
    { role: "Schedule", kind: "pdf", name: schedName },
    ...(audit
      ? []
      : [
          { role: "Payroll", kind: "xls", name: payrollName },
          { role: "Rest breaks", kind: "xls", name: restsName },
        ]),
    { role: "Clocking", kind: "xls", name: clockName },
    { role: "Service notes", kind: "pdf", name: notesName },
    { role: "Service notes", kind: "xls", name: serviceNotesName },
    { role: "Schedule notes", kind: "xls", name: scheduleNotesName },
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
    const requiredRows = audit
      ? [["schedule", "Employee Schedules"]]
      : [["schedule", "Employee Schedules"], ["payroll", "Simple Payroll Processing Report"], ["rests", "Rest Periods Report"]];
    for (const [id, what] of requiredRows) {
      const el = f?.querySelector(`#${id}`);
      if (el && el.files.length === 0) {
        e.preventDefault();
        window.alert(
          audit
            ? `The ${what} export is required. Without it, no shift can be lined up against its booking.`
            : `The ${what} export is required. Without all four, the premium hours can't be evidenced.`,
        );
        return;
      }
    }

    // stop it here rather than let the server reject the body. the message
    // names the biggest file, because the mistake is nearly always one wrong
    // pick rather than four large exports.
    // A PDF far bigger than its export has ever been is the wrong file, and
    // saying so names it instead of leaving the total to be worked out.
    const fatPdf = PDF_PICKERS.find((k) => (sizes[k] || 0) > PDF_LIMIT_MB * 1024 * 1024);
    if (fatPdf) {
      e.preventDefault();
      window.alert(
        `The ${LABELS[fatPdf]} PDF is ${mb(sizes[fatPdf])}, and the QSP exports run to a few megabytes.\n\n` +
        `A corrected timesheet runs to 20 MB and lives in the same folder. Check it is the right file.`,
      );
      return;
    }
    if (overLimit) {
      e.preventDefault();
      const biggest = Object.entries(sizes).sort((a, b) => b[1] - a[1])[0];
      window.alert(
        `These come to ${mb(totalBytes)} and the limit is ${BODY_LIMIT_MB} MB.\n\n` +
        `The largest is the ${LABELS[biggest[0]] || biggest[0]} file at ${mb(biggest[1])}.`,
      );
      return;
    }

    // if any of this fails the upload still runs - it just runs without a
    // counter, which is exactly how it behaved before
    const id = mintUploadId();
    if (idFieldRef.current) idFieldRef.current.value = id;
    setUploadId(id);

    // THE BIG BYTES GO BROWSER-TO-BLOB, then a small request carries the URLs.
    // One POST holding eight exports runs to 30MB+; Vercel refuses a serverless
    // body over 4.5MB, so the old direct path could only ever work from
    // localhost. With no blob store configured the direct path still runs.
    if (blobUpload) {
      e.preventDefault();
      sendViaBlob(f, id);
      return;
    }
    setBusy(true);
  }

  async function sendViaBlob(form, id) {
    setSendError(null);
    const slots = ["file", "schedule", "payroll", "rests", "clock", "notes", "serviceNotes", "scheduleNotes"];
    const picked = slots
      .map((slot) => ({ slot, file: form.querySelector(`#${slot}`)?.files?.[0] || null }))
      .filter((p) => p.file);
    setSending(Object.fromEntries(picked.map((p) => [p.slot, 0])));
    const refs = {};
    try {
      for (const { slot, file } of picked) {
        const blob = await upload(`timesheets/src/${id}/${slot}-${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/portal/admin/timesheets/blob-upload",
          contentType: file.type || undefined,
          // split-and-retry for the big exports; the service notes alone is 27MB
          multipart: file.size > 5 * 1024 * 1024,
          onUploadProgress: ({ percentage }) =>
            setSending((prev) => ({ ...(prev || {}), [slot]: Math.round(percentage) })),
        });
        refs[slot] = { url: blob.url, name: file.name, size: file.size };
      }
    } catch (err) {
      console.error("blob upload failed:", err);
      setSending(null);
      setSendError("A file didn't finish uploading. Nothing was generated - try again.");
      return;
    }

    // the small request: everything the form holds EXCEPT the files, plus the
    // references to where their bytes already are
    const fd = new FormData(form);
    for (const { slot } of picked) fd.delete(slot);
    fd.set("blobs", JSON.stringify(refs));
    setSending(null);
    setBusy(true);
    startTransition(() => formAction(fd));
  }

  // A DROP LANDS EVERY EXPORT AT ONCE - the shared placer, so this form and
  // the day program's behave identically. Picking one at a time still works.
  function placeDropped(fileList) {
    setUnplaced(placeDroppedFiles(formRef.current, fileList));
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
        {/* which batch this upload corrects, when it corrects one. Read by
            `uploadBatch`, which runs every parse and check the same way and
            differs only in the write. */}
        {into ? <input type="hidden" name="into" value={into} /> : null}
        {/* the audit lane. Read by `uploadBatch`: payroll and rests optional,
            the batch lands flagged auditOnly, the finished screen is the
            Audit page. */}
        {audit ? <input type="hidden" name="audit" value="1" /> : null}

      {/* the pickers go away once it starts. four "Browse…" buttons that can't
          be used are noise on a screen you are waiting on - the files reappear
          as documents inside the progress panel instead. `hidden` rather than
          unmounted, so the inputs stay in the form and the submission keeps
          its files. */}
      <div
        className={busy ? "hidden" : `rounded-xl border bg-surface p-6 sm:p-8 ${dragging ? "border-brand" : "border-border"}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer?.files?.length) placeDropped([...e.dataTransfer.files]);
        }}
      >
        <p className="mb-5 rounded-lg border border-dashed border-border-strong px-3 py-2 text-xs text-muted">
          Drag the exports onto this form together - each lands in its slot by
          its filename. Picking them one at a time works the same as before.
        </p>
        {unplaced.length > 0 && (
          <p className="mb-4 text-xs font-semibold text-rose-600 dark:text-rose-400">
            Not one of the {audit ? "seven" : "eight"} exports, so it was not placed: {unplaced.join(", ")}
          </p>
        )}
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
      <FileRow
        id="file"
        sendingPct={sending ? sending.file ?? null : null}
        label="QSP Simple Timesheet export (PDF)"
        tone="primary"
        selected={name}
        size={sizes.file || 0}
        onPick={(e) => {
          setName(e.target.files?.[0]?.name || "");
          setSizes((p) => ({ ...p, file: e.target.files?.[0]?.size || 0 }));
        }}
      />

      {audit && (
        <FileRow
          id="file2"
          sendingPct={sending ? sending.file2 ?? null : null}
          label="Second Simple Timesheet (PDF) - optional. A month audit takes two, one per pay period"
          optional
          selected={name2}
          size={sizes.file2 || 0}
          onPick={(e) => {
            setName2(e.target.files?.[0]?.name || "");
            setSizes((p) => ({ ...p, file2: e.target.files?.[0]?.size || 0 }));
          }}
        />
      )}

      <FileRow
        id="schedule"
        sendingPct={sending ? sending.schedule ?? null : null}
        label="Employee Schedules export (PDF)"
        selected={schedName}
        size={sizes.schedule || 0}
        onPick={(e) => {
          setSchedName(e.target.files?.[0]?.name || "");
          setSizes((p) => ({ ...p, schedule: e.target.files?.[0]?.size || 0 }));
        }}
      />

      {!audit && (<>
      <FileRow
        id="payroll"
        sendingPct={sending ? sending.payroll ?? null : null}
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
        sendingPct={sending ? sending.rests ?? null : null}
        label="Rest Periods Report (.xls)"
        accept=".xls,application/vnd.ms-excel"
        selected={restsName}
        size={sizes.rests || 0}
        onPick={(e) => {
          setRestsName(e.target.files?.[0]?.name || "");
          setSizes((p) => ({ ...p, rests: e.target.files?.[0]?.size || 0 }));
        }}
      />
      </>)}

      {/* BACK AFTER 2026-08-06, and optional, 2026-08-22. It was dropped when
          the export set was cut to three; it returns for monitoring only -
          who did not clock, who clocked with no location captured, how long a
          shift actually ran. It still grades how well a premium is evidenced,
          which is the one thing clock data has always been allowed to move,
          and it still changes no hour and no figure. */}
      <FileRow
        id="clock"
        sendingPct={sending ? sending.clock ?? null : null}
        optional
        label="QSClock Time and Attendance (.xls) - optional"
        accept=".xls,application/vnd.ms-excel"
        selected={clockName}
        size={sizes.clock || 0}
        onPick={(e) => {
          setClockName(e.target.files?.[0]?.name || "");
          setSizes((p) => ({ ...p, clock: e.target.files?.[0]?.size || 0 }));
        }}
      />

      {/* THE THREE NOTES EXPORTS, 2026-08-27. They feed the Audit screen and
          touch no hour and no premium, so all three are optional exactly as the
          clock export is.

          BOTH SERVICE NOTES REPORTS, because they are two places a note gets
          written and which one a person uses follows their job. Field
          Supervisors do not file DSNs; Independent Living
          Instructors mostly do. On 08/16-08/27 the PDF documents 660 of 862
          billable service shifts, the .xls 192, the two together 793. */}
      <FileRow
        id="notes"
        sendingPct={sending ? sending.notes ?? null : null}
        optional
        label="DSN (Employee Detailed Daily Service Notes) (.pdf) - optional"
        selected={notesName}
        size={sizes.notes || 0}
        onPick={(e) => {
          setNotesName(e.target.files?.[0]?.name || "");
          setSizes((p) => ({ ...p, notes: e.target.files?.[0]?.size || 0 }));
        }}
      />

      <FileRow
        id="serviceNotes"
        sendingPct={sending ? sending.serviceNotes ?? null : null}
        optional
        label="Employee Service Notes (.xls) - optional"
        accept=".xls,application/vnd.ms-excel"
        selected={serviceNotesName}
        size={sizes.serviceNotes || 0}
        onPick={(e) => {
          setServiceNotesName(e.target.files?.[0]?.name || "");
          setSizes((p) => ({ ...p, serviceNotes: e.target.files?.[0]?.size || 0 }));
        }}
      />

      <FileRow
        id="scheduleNotes"
        sendingPct={sending ? sending.scheduleNotes ?? null : null}
        optional
        label="Employee Schedule Notes (.xls) - optional"
        accept=".xls,application/vnd.ms-excel"
        selected={scheduleNotesName}
        size={sizes.scheduleNotes || 0}
        onPick={(e) => {
          setScheduleNotesName(e.target.files?.[0]?.name || "");
          setSizes((p) => ({ ...p, scheduleNotes: e.target.files?.[0]?.size || 0 }));
        }}
      />
        </div>
        {/* TESTING A PERIOD THAT IS STILL RUNNING. Deliberately plain and
            deliberately last: the upload refuses a file holding days nobody has
            worked, and this is the way past that check, so it should read like
            what it is rather than an ordinary option. */}
        <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/25">
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              name="partial"
              checked={partial}
              onChange={(e) => setPartial(e.target.checked)}
              className="mt-0.5 h-4 w-4 flex-none accent-amber-600"
            />
            <span className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">
              <span className="font-semibold">Testing: partial pay period.</span>{" "}
              Keep only the days in the range below and drop the rest. The batch
              is marked partial, and any workweek cut off part-way through has
              provisional overtime.
            </span>
          </label>

          {/* THE RANGE HAS TO BE TYPED. QSP returns the whole pay period
              whatever range it was asked for, so the file cannot say what was
              wanted and the only record of it is this. */}
          {partial && (
            <div className="mt-3 border-t border-amber-300 pt-3 dark:border-amber-800">
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs font-medium text-amber-900 dark:text-amber-200">
                  <span className="block">Keep days from</span>
                  <DatePicker
                    name="partialFrom"
                    inputClassName="mt-1 w-40 rounded border border-amber-400 bg-surface px-2 py-1 pr-10 font-mono text-xs text-foreground dark:border-amber-700"
                  />
                </label>
                <label className="text-xs font-medium text-amber-900 dark:text-amber-200">
                  <span className="block">to</span>
                  <DatePicker
                    name="partialTo"
                    inputClassName="mt-1 w-40 rounded border border-amber-400 bg-surface px-2 py-1 pr-10 font-mono text-xs text-foreground dark:border-amber-700"
                  />
                </label>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                Leave either blank for no limit at that end. Days after today are
                always dropped whatever you pick here - QSP prints shifts nobody
                has worked yet exactly like real ones.
              </p>
            </div>
          )}
        </div>

        {totalBytes > 0 && (
          <p className={`mt-5 text-xs ${overLimit ? "font-semibold text-rose-600 dark:text-rose-400" : "text-muted"}`}>
            {mb(totalBytes)} selected
            {overLimit
              ? ` - over the ${BODY_LIMIT_MB} MB limit, so this will be refused before it uploads.`
              : ` of a ${BODY_LIMIT_MB} MB limit.`}
          </p>
        )}
        {sendError && (
          <p className="mt-5 text-sm font-semibold text-rose-600 dark:text-rose-400">{sendError}</p>
        )}
        <button
          type="submit"
          disabled={!!sending}
          className="mt-7 w-full rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand disabled:opacity-60"
        >
          {sending ? "Uploading the files..." : "Upload and generate"}
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
