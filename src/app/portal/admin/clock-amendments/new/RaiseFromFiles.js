"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import PersonPicker from "./PersonPicker";
import { AmendmentFigures } from "@/components/clock-amendment/AmendmentCard";
import { startingTimes, missingPunchText, firstLast, asksStart, asksEnd } from "@/lib/clock-amendment/rules";
import { tidyTime, anchorOf } from "@/lib/clock-amendment/typed-time";

// RAISING ONE FROM THE DAY'S TWO FILES.
//
// Somebody rings the office about a punch they missed. The office drops that
// day's clock export and service notes on this screen, reads them in, takes
// down what it was told on the call under the shift they named, and sends the
// form. Nothing is typed that a file already says.
//
// EVERY SHIFT WITH A MISSING PUNCH IS LISTED, because the export holds the
// whole day and a busy day has several. A form goes out for each one the
// office fills in; the rest are left alone. There is no tick box to explain:
// filled in means sent.
//
// WHAT HAPPENED IS TAKEN DOWN HERE, ON THE CALL, in their words - not picked
// from a list. It is not the last word: the form the person who was there gets
// prints it as "you told the office" and asks them to confirm or correct it
// before they sign. Both versions are kept, and a correction shows on the
// document.
const ERRORS = {
  auth: "You do not have access to raise one of these.",
  noclock: "The clock export is needed. The service notes are optional, but they are the strongest thing on the form.",
  read: "One of the files could not be read.",
  nopicks: "Fill in at least one shift.",
  noaccount: "No account matches this name, so there is nobody to send it to.",
  reason: "Say what they told you happened.",
  times: "The missing time is needed, as a time of day.",
  who: "Pick who it is going to.",
  gone: "That shift is no longer in the file.",
  failed: "Something went wrong. Please try again.",
};

const field =
  "min-h-[44px] w-full rounded-[9px] border border-border-strong bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-brand";
const lbl = "block text-[12.5px] font-medium text-muted";

// which slot a file belongs in, by what it is
const slotOf = (file) => (/\.xls$/i.test(file.name) ? "clock" : /\.pdf$/i.test(file.name) ? "notes" : null);

// one of the two slots a dropped file lands in
function Slot({ label, file, onClear }) {
  return (
    <div className="flex min-h-[44px] items-center gap-3 rounded-[9px] border border-border bg-background px-3 py-2">
      <span className="w-28 shrink-0 text-[12px] font-medium text-muted">{label}</span>
      {file ? (
        <>
          <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{file.name}</span>
          <button type="button" onClick={onClear} className="shrink-0 rounded px-2 py-1 text-[11.5px] text-muted transition hover:bg-fill">Clear</button>
        </>
      ) : (
        <span className="text-[13px] text-faint">not here yet</span>
      )}
    </div>
  );
}

// the shape the shared figures read, built from what the reader found
const recordOf = (c) => ({
  shiftDate: c.facts.date,
  scheduledIn: c.facts.scheduledIn,
  scheduledOut: c.facts.scheduledOut,
  clockedIn: c.facts.clockedIn,
  clockedOut: c.facts.clockedOut,
  clockRow: c.shift,
  note: c.note,
});

export default function RaiseFromFiles({ read, raise, search }) {
  const picker = useRef(null);
  const [files, setFiles] = useState({ clock: null, notes: null });
  const [unplaced, setUnplaced] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [found, setFound] = useState(null);
  const [picks, setPicks] = useState({});
  const [testOnly, setTestOnly] = useState(false);
  const [done, setDone] = useState(null);
  const [err, setErr] = useState(null);
  const [pending, start] = useTransition();

  // both files can land at once, dropped or picked together; each goes to its
  // slot by its type, and anything else is named rather than silently dropped
  const place = (list) => {
    const next = { ...files };
    const odd = [];
    for (const f of list) {
      const slot = slotOf(f);
      if (slot) next[slot] = f;
      else odd.push(f.name);
    }
    setFiles(next);
    setUnplaced(odd);
    setFound(null);
    setDone(null);
    setErr(null);
  };

  const clearSlot = (slot) => { setFiles((f) => ({ ...f, [slot]: null })); setFound(null); };

  // the two files ride up with every request: they are small and the browser
  // already holds them, so nothing has to be parked between the two steps
  const filesForm = () => {
    const fd = new FormData();
    if (files.clock) fd.append("clock", files.clock);
    if (files.notes) fd.append("notes", files.notes);
    return fd;
  };

  const readFiles = () => {
    setErr(null);
    setDone(null);
    start(async () => {
      const res = await read(filesForm());
      if (!res?.ok) {
        setErr((ERRORS[res?.error] || ERRORS.failed) + (res?.detail ? ` (${res.detail})` : ""));
        setFound(null);
        return;
      }
      setFound(res);
      const init = {};
      for (const c of res.candidates) {
        // what the times start at: their own note, then the schedule, for a
        // punch that is missing or late; the clock itself for a punch that
        // only lacks a location
        const asRecord = recordOf(c);
        const s = startingTimes({ ...asRecord, dsnStart: c.note?.start, dsnEnd: c.note?.end });
        const asksIn = asksStart(asRecord);
        const asksOut = asksEnd(asRecord);
        init[c.key] = {
          reasonText: "",
          actualIn: asksIn ? (s.in || "") : "",
          actualOut: asksOut ? (s.out || "") : "",
          recipientId: c.account?.id || "",
        };
      }
      setPicks(init);
    });
  };

  const set = (key, patch) => setPicks((p) => ({ ...p, [key]: { ...p[key], ...patch } }));
  // filled in means sent
  const chosen = found ? found.candidates.filter((c) => c.account && picks[c.key]?.reasonText?.trim()) : [];

  const send = () => {
    setErr(null);
    start(async () => {
      const fd = filesForm();
      fd.append("picks", JSON.stringify(chosen.map((c) => ({ key: c.key, ...picks[c.key] }))));
      if (testOnly) fd.append("testOnly", "1");
      const res = await raise(fd);
      if (!res?.ok) { setErr(ERRORS[res?.error] || ERRORS.failed); return; }
      setDone(res.results);
    });
  };

  return (
    <div className="mt-7 space-y-7">
      <div
        className={`rounded-xl border bg-surface p-5 transition-colors ${dragging ? "border-brand" : "border-border"}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer?.files?.length) place([...e.dataTransfer.files]);
        }}
      >
        <h2 className="text-[13px] font-semibold text-foreground">The day&apos;s files</h2>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
          The QSClock Time and Attendance report and the Employee Detailed Daily Service Notes for the day.
          The export says which shifts have a missing punch; the notes say what was written about the visit.
        </p>
        <p className="mt-4 rounded-lg border border-dashed border-border-strong px-3 py-2 text-xs text-muted">
          Drag both files onto this card together. Each lands in its slot by what it is.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Slot label="Clock export" file={files.clock} onClear={() => clearSlot("clock")} />
          <Slot label="Service notes" file={files.notes} onClear={() => clearSlot("notes")} />
        </div>
        {unplaced.length > 0 && (
          <p className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">
            Not an .xls or a .pdf, so it was not placed: {unplaced.join(", ")}
          </p>
        )}
        <input
          ref={picker}
          type="file"
          multiple
          accept=".xls,.pdf,application/vnd.ms-excel,application/pdf"
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) place([...e.target.files]); e.target.value = ""; }}
        />
        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
          {found && (
            <p className="mr-auto text-[12px] text-muted">
              {found.shifts} {found.shifts === 1 ? "shift" : "shifts"} on the export, {found.notes} {found.notes === 1 ? "note" : "notes"}.{" "}
              <b className="text-foreground">{found.candidates.length} with a missing punch, a late clock-in or no location.</b>
              {found.underFloor > 0 && ` ${found.underFloor} clocked in under five minutes late and ${found.underFloor === 1 ? "is" : "are"} not listed.`}
            </p>
          )}
          <button
            type="button"
            onClick={() => picker.current?.click()}
            className="min-h-[44px] rounded-[9px] border border-border-strong bg-fill px-4 py-2.5 text-[13.5px] font-medium text-foreground transition hover:bg-surface-2"
          >
            Choose the files
          </button>
          <button
            type="button"
            disabled={pending || !files.clock}
            onClick={readFiles}
            className="min-h-[44px] rounded-[9px] bg-brand px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
          >
            {pending && !found ? "Reading…" : found ? "Read them again" : "Read the files"}
          </button>
        </div>
      </div>

      {found && found.candidates.length === 0 && (
        <p className="rounded-xl border border-border bg-surface px-5 py-6 text-center text-sm text-muted">
          Every shift on this export has both punches. Nothing to raise.
        </p>
      )}

      {found && found.candidates.length > 1 && (
        <p className="text-[12.5px] leading-relaxed text-muted">
          {found.candidates.length} shifts on this day have a missing punch, a late clock-in or no location. Fill in the
          one somebody rang about; a form goes out for each one filled in, and the rest are left alone.
        </p>
      )}

      {found && found.candidates.map((c) => {
        const p = picks[c.key] || {};
        const who = c.account?.label || firstLast(c.facts.staffName);
        const inAnchor = anchorOf(c.facts.scheduledIn);
        const outAnchor = anchorOf(c.facts.scheduledOut);
        const filled = !!p.reasonText?.trim();
        const asksIn = asksStart(recordOf(c));
        const asksOut = asksEnd(recordOf(c));
        return (
          <article key={c.key} className={`rounded-xl border bg-surface p-5 sm:p-6 ${filled ? "border-brand" : "border-border"}`}>
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 text-base font-semibold text-foreground">{who}</span>
              <span className="shrink-0 text-sm tabular-nums text-muted">{c.facts.date}</span>
            </div>
            <p className="mt-0.5 text-sm">
              <span className="font-semibold text-foreground">{firstLast(c.facts.client) || "no client on the booking"}</span>
              {c.facts.service && <span className="ml-3 text-muted">{c.facts.service}</span>}
            </p>

            <AmendmentFigures a={recordOf(c)} />

            {!c.account ? (
              <p className="mt-4 rounded-[9px] border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-700 dark:text-rose-300">
                No account matches &ldquo;{c.facts.staffName}&rdquo;, so there is nobody to send this to. Check the spelling on their account.
              </p>
            ) : (
              <div className="mt-4 space-y-4 border-t border-border pt-4">
                <p className="text-[12px] leading-relaxed text-muted">
                  What they told you on the phone. They will see it as &ldquo;you told the office&rdquo;, confirm or
                  correct it, and sign.
                </p>
                <div>
                  <label className={lbl} htmlFor={`words-${c.key}`}>What they said happened</label>
                  <textarea
                    id={`words-${c.key}`} rows={3} value={p.reasonText || ""}
                    onChange={(e) => set(c.key, { reasonText: e.target.value })}
                    placeholder={`Why they ${missingPunchText({ clockRow: c.shift })}, in their words.`}
                    className="mt-1.5 min-h-[84px] w-full rounded-[9px] border border-border-strong bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-brand"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid grid-cols-2 gap-4">
                    {asksIn && (
                      <div>
                        <label className={lbl} htmlFor={`in-${c.key}`}>Service started</label>
                        <input
                          id={`in-${c.key}`} value={p.actualIn || ""} inputMode="numeric"
                          onChange={(e) => set(c.key, { actualIn: e.target.value })}
                          onBlur={(e) => set(c.key, { actualIn: tidyTime(e.target.value, inAnchor) })}
                          placeholder="9:00 AM" className={`mt-1.5 ${field} tabular-nums`}
                        />
                      </div>
                    )}
                    {asksOut && (
                      <div>
                        <label className={lbl} htmlFor={`out-${c.key}`}>Service ended</label>
                        <input
                          id={`out-${c.key}`} value={p.actualOut || ""} inputMode="numeric"
                          onChange={(e) => set(c.key, { actualOut: e.target.value })}
                          onBlur={(e) => set(c.key, { actualOut: tidyTime(e.target.value, outAnchor) })}
                          placeholder="1:00 PM" className={`mt-1.5 ${field} tabular-nums`}
                        />
                      </div>
                    )}
                  </div>
                  <PersonPicker
                    name={`recipient-${c.key}`}
                    label="Send it to"
                    hint="Them, or the supervisor who was there."
                    search={search}
                    initial={c.account}
                    onPick={(r) => set(c.key, { recipientId: r?.id || "" })}
                  />
                </div>
              </div>
            )}
          </article>
        );
      })}

      {found && found.candidates.length > 0 && !done && (
        <div className="rounded-xl border border-border bg-surface p-5">
          <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-foreground">
            <input type="checkbox" checked={testOnly} onChange={(e) => setTestOnly(e.target.checked)} className="h-4 w-4 accent-brand" />
            <span>
              <b className="font-semibold">Test run.</b>{" "}
              <span className="text-muted">Everything goes to your own inbox and the rows are marked as a rehearsal, kept out of every count and deletable.</span>
            </span>
          </label>
          {err && (
            <p className="mt-3 rounded-[9px] border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-700 dark:text-rose-300">{err}</p>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
            <p className="mr-auto text-[11.5px] text-faint">
              {chosen.length === 0
                ? "Nothing filled in yet."
                : found.candidates.length > 1
                  ? `${chosen.length} of ${found.candidates.length} filled in; ${chosen.length === 1 ? "one form" : `${chosen.length} forms`} will be sent.`
                  : "1 form will be sent."}
            </p>
            <button
              type="button"
              disabled={pending || chosen.length === 0}
              onClick={send}
              className="min-h-[44px] rounded-[9px] bg-brand px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Sending…" : chosen.length === 1 ? "Send the form" : `Send ${chosen.length} forms`}
            </button>
          </div>
        </div>
      )}

      {!found && err && (
        <p className="rounded-[9px] border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-700 dark:text-rose-300">{err}</p>
      )}

      {done && (
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-[13px] font-semibold text-foreground">Sent</h2>
          <ul className="mt-3 divide-y divide-sep">
            {done.map((r) => (
              <li key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[13px]">
                <span className="font-semibold text-foreground">{r.who}</span>
                {r.ok && r.sent && (
                  <span className={r.redirected ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-400"}>
                    {r.redirected ? `Test send, redirected to ${r.sentTo}` : `Sent to ${r.sentTo}`}
                  </span>
                )}
                {r.ok && !r.sent && <span className="text-rose-700 dark:text-rose-300">Raised, but the email did not go ({r.error}). Send it from the queue.</span>}
                {!r.ok && <span className="text-rose-700 dark:text-rose-300">{ERRORS[r.error] || ERRORS.failed}</span>}
                {r.id && <Link href={`/portal/admin/clock-amendments/${r.id}`} className="ml-auto text-[12.5px] font-semibold text-brand underline underline-offset-4">Open</Link>}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end">
            <Link href="/portal/admin/clock-amendments" className="text-[13px] font-semibold text-brand underline underline-offset-4">Back to the queue</Link>
          </div>
        </div>
      )}
    </div>
  );
}
