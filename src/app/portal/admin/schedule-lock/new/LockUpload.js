"use client";

import { useActionState, useRef, useState, startTransition } from "react";
import { uploadPresigned } from "@vercel/blob/client";
import DatePicker from "@/components/DatePicker";
import { SCHEDULE_LOCK_SLOTS, slotForFilename, knownExport } from "@/lib/timesheet/upload-slots";
import { fileNameRange, scheduleNameMonth } from "@/lib/timesheet/schedule-lock-names";
import { uploadScheduleLock } from "../actions";
import audit from "../../audit/audit.module.css";
import styles from "../lock.module.css";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const LABELS = {
  schedule: "Employee Schedules export (PDF)",
  notes: "DSN (Employee Detailed Daily Service Notes) (.pdf) - optional",
  serviceNotes: "Employee Service Notes (.xls) - optional",
  scheduleNotes: "Employee Schedule Notes (.xls) - optional",
  mileage: "Mileage Detail Report (.xls) - optional",
  clock: "QSClock Time and Attendance (.xls) - optional",
};
const ACCEPT = { schedule: "application/pdf,.pdf", notes: "application/pdf,.pdf" };
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const short = (d) => (d ? d.slice(0, 5) : "");

// module scope: the id is only a path prefix for this upload's files, and an
// impure value minted in render would differ between server and browser
function mintUploadId() {
  return globalThis.crypto?.randomUUID?.() || `u${Date.now()}${Math.random().toString(36).slice(2)}`;
}

// the form. Every export goes browser-to-Blob the moment it is picked, like
// the audit's; the button then sends only where each one landed.
export default function LockUpload({ today, locks, blobUpload }) {
  const [result, formAction, pending] = useActionState(uploadScheduleLock, null);
  const formRef = useRef(null);
  const idRef = useRef("");
  const controllers = useRef({});
  // slot -> the transfer in flight, resolving to where the file landed (or null)
  const inFlight = useRef({});
  const [picked, setPicked] = useState({}); // slot -> { name, size }
  const [sending, setSending] = useState({}); // slot -> percent
  const [refs, setRefs] = useState({}); // slot -> { url, name, size }
  const [failed, setFailed] = useState({}); // slot -> true
  const [leftOut, setLeftOut] = useState([]);
  const [unplaced, setUnplaced] = useState([]);
  const [over, setOver] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [sendError, setSendError] = useState(null);

  const uploadId = () => (idRef.current ||= mintUploadId());

  function send(slot, file) {
    const p = transfer(slot, file);
    inFlight.current[slot] = p;
    return p;
  }

  async function transfer(slot, file) {
    controllers.current[slot]?.abort();
    setRefs((p) => { const n = { ...p }; delete n[slot]; return n; });
    setFailed((p) => { const n = { ...p }; delete n[slot]; return n; });
    if (!file) {
      setPicked((p) => { const n = { ...p }; delete n[slot]; return n; });
      return null;
    }
    setPicked((p) => ({ ...p, [slot]: { name: file.name, size: file.size } }));
    if (!blobUpload) return null;
    const ctrl = new AbortController();
    controllers.current[slot] = ctrl;
    setSending((p) => ({ ...p, [slot]: 0 }));
    try {
      const blob = await uploadPresigned(`timesheets/src/${uploadId()}/lock-${slot}-${file.name}`, file, {
        access: "private",
        handleUploadUrl: "/portal/admin/timesheets/blob-upload",
        contentType: file.type || undefined,
        multipart: file.size > 5 * 1024 * 1024,
        abortSignal: ctrl.signal,
        onUploadProgress: ({ percentage }) => {
          if (!ctrl.signal.aborted) setSending((p) => ({ ...p, [slot]: Math.round(percentage) }));
        },
      });
      if (ctrl.signal.aborted) return null;
      const ref = { url: blob.url, name: file.name, size: file.size };
      setRefs((p) => ({ ...p, [slot]: ref }));
      return ref;
    } catch (err) {
      if (ctrl.signal.aborted) return null;
      console.error("blob upload failed:", err);
      setFailed((p) => ({ ...p, [slot]: true }));
      return null;
    } finally {
      if (!ctrl.signal.aborted) setSending((p) => { const n = { ...p }; delete n[slot]; return n; });
    }
  }

  // a drop lands every export at once; what the lock does not read is named
  function place(files) {
    const left = [];
    const lost = [];
    for (const file of files) {
      const slot = slotForFilename(file.name, SCHEDULE_LOCK_SLOTS);
      const input = slot ? formRef.current?.querySelector(`#lock-${slot}`) : null;
      if (!input) {
        (knownExport(file.name) ? left : lost).push(file.name);
        continue;
      }
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    setLeftOut(left);
    setUnplaced(lost);
  }

  // the month off the schedule's own name, and whether it is locked yet
  const monthKey = picked.schedule ? scheduleNameMonth(picked.schedule.name) : null;
  const lock = monthKey ? locks[monthKey] : null;
  const monthName = monthKey ? `${MONTHS[Number(monthKey.slice(5)) - 1]} ${monthKey.slice(0, 4)}` : null;
  // the default days to lock: the month up to yesterday
  const defaults = (() => {
    if (!monthKey) return null;
    const [y, m] = monthKey.split("-").map(Number);
    const first = `${monthKey}-01`;
    const last = `${monthKey}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
    const t = new Date(`${today}T12:00:00`);
    t.setDate(t.getDate() - 1);
    const yesterday = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    return { from: first, to: yesterday < last ? yesterday : last };
  })();

  // the button waits for whatever is still going up, retries what failed, and
  // then sends only where each file landed
  async function onSubmit(e) {
    e.preventDefault();
    setSendError(null);
    const form = formRef.current;
    if (!picked.schedule) {
      setSendError("The Employee Schedules export is required.");
      return;
    }
    setWaiting(true);
    const slots = Object.keys(picked);
    const landed = await Promise.all(slots.map((slot) => {
      if (failed[slot]) return send(slot, form?.querySelector(`#lock-${slot}`)?.files?.[0] || null);
      return refs[slot] || inFlight.current[slot] || null;
    }));
    setWaiting(false);
    if (landed.some((r) => !r)) {
      setSendError("A file didn't finish uploading. Nothing was saved - press the button to try again.");
      return;
    }
    const fd = new FormData(form);
    for (const x of SCHEDULE_LOCK_SLOTS) fd.delete(x.id);
    fd.set("blobs", JSON.stringify(Object.fromEntries(slots.map((slot, i) => [slot, landed[i]]))));
    startTransition(() => formAction(fd));
  }

  const busy = waiting || pending;

  return (
    <div>
      <details className={audit.uploadGuide} open>
        <summary>Which exports do I need?</summary>
        <p>Employee Schedules (PDF) is the one it needs. The DSN (PDF), Employee Service Notes (.xls), Employee Schedule Notes (.xls), the Mileage Detail Report (.xls) and QSClock Time and Attendance (.xls) add the notes, the miles and the clock check. The audit&apos;s whole set can be dropped here too: what this page does not read is left out.</p>
        <p>The first upload of a month locks the days you pick. Every later upload is checked against that lock and the changes you approved since, and each change waits for you to approve it or mark it unauthorized.</p>
      </details>
      <form
        ref={formRef}
        onSubmit={onSubmit}
        className={audit.upload}
        style={{ marginTop: 22 }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer?.files?.length) place([...e.dataTransfer.files]); }}
      >
        <p className={styles.drop} data-over={over ? "true" : "false"}>Drag the exports onto this form together - each lands in its slot by its filename.</p>
        {unplaced.length > 0 && <p className={styles.formError}>Not one of the exports, so it was not placed: {unplaced.join(", ")}</p>}

        {monthKey && lock && (
          <p className={styles.lockLine}><b>{monthName} is locked</b> from the {lock.at} upload, {short(lock.from)} to {short(lock.to)}. This upload is checked against it.</p>
        )}
        {monthKey && !lock && defaults && (
          <div className={styles.dates}>
            <h3>Days to check</h3>
            <p style={{ marginTop: 4 }}>Nothing is locked for {monthName} yet. This upload locks the days below.</p>
            <div className={styles.dateRow}>
              <label>From<DatePicker key={`f-${monthKey}`} name="from" defaultValue={defaults.from} inputClassName={styles.dateInput} /></label>
              <label>To<DatePicker key={`t-${monthKey}`} name="to" defaultValue={defaults.to} inputClassName={styles.dateInput} /></label>
            </div>
            <p>The schedule is checked on these days. The notes, the miles and the clock are checked only on the days their own exports cover, which QSP puts in their file names.</p>
          </div>
        )}

        {SCHEDULE_LOCK_SLOTS.map(({ id }) => {
          const p = picked[id];
          const range = p && id !== "schedule" ? fileNameRange(p.name) : null;
          const state = sending[id] != null
            ? `Uploading ${p?.name}... ${sending[id]}%`
            : failed[id]
              ? `${p?.name} didn't upload. Press the button to try again.`
              : p
                ? `${refs[id] ? "Uploaded" : "Selected"}: ${p.name} (${mb(p.size)})${range ? ` · covers ${short(range.from)} to ${short(range.to)}` : ""}`
                : "Nothing selected yet.";
          return (
            <div key={id} className={styles.file}>
              <label htmlFor={`lock-${id}`}>{LABELS[id]} {id === "schedule" && <i>*</i>}</label>
              <input
                id={`lock-${id}`}
                name={id}
                type="file"
                accept={ACCEPT[id] || ".xls,application/vnd.ms-excel"}
                onChange={(e) => send(id, e.target.files?.[0] || null)}
              />
              <p className={styles.fileState} data-ok={p && !failed[id] ? "true" : "false"}>{state}</p>
            </div>
          );
        })}
        {leftOut.length > 0 && <p className={styles.skip}><b>Left out, not read here:</b> {leftOut.join(", ")}</p>}
        {(sendError || result?.error) && <p role="alert" className={styles.formError}>{sendError || result.error}</p>}
        <button type="submit" disabled={busy} className={styles.go}>
          {waiting ? "Finishing the uploads..." : pending ? "Reading and checking..." : "Upload and check"}
        </button>
      </form>
    </div>
  );
}
