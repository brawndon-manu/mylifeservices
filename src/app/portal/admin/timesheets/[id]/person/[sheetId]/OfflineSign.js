"use client";

import { useState } from "react";
import DatePicker from "@/components/DatePicker";
import { useRouter } from "next/navigation";

// RECORD A SIGNATURE THAT CAME BACK OUTSIDE THE PORTAL.
//
// People sign the PDF and email it, and until this existed there was nowhere to
// say so. That mattered on the money rather than the paperwork: an employee's
// answers only come off the payroll figure once a signature covers them, so a
// sheet signed on paper reads as unanswered. One returned PDF was worth four
// premium hours.
//
// IT ASKS FOR THE FILE. Optional, because a signature sometimes arrives as a
// photo, but a record with no artefact behind it is a claim rather than
// evidence - so the copy says what is missing rather than hiding it.
const ERRORS = {
  already: "This sheet is already signed.",
  disputed: "They have reported a problem with this sheet, so it cannot be signed yet.",
  norender: "This sheet does not generate, so there is nothing to have signed.",
  noname: "Type the name as it appears on the signature.",
  baddate: "That date could not be read.",
  toobig: "That file is too large. 8MB is the limit.",
  noblob: "File storage is not configured, so the copy cannot be kept.",
  store: "The file could not be stored. Nothing was recorded.",
  superseded: "This upload has been replaced. Record it on the current one.",
  auth: "Only a SUPER can record a signature.",
};

export default function OfflineSign({ action, timesheetId, sourceName, disabled = false }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [name, setName] = useState(sourceName || "");
  const [when, setWhen] = useState("");
  const [how, setHow] = useState("returned by email");

  if (disabled) return null;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    const fd = new FormData(e.currentTarget);
    const res = await action(timesheetId, fd);
    setBusy(false);
    if (res?.ok === false) { setErr(res.error || "failed"); return; }
    setOpen(false);
    router.refresh();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
      >
        Record a signature they sent back &rarr;
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 rounded-xl border border-border-strong bg-surface-2 p-4">
      <p className="text-sm font-semibold text-foreground">
        Record a signature received outside the portal
      </p>
      <p className="mt-1 text-xs text-muted">
        For a sheet they signed on the PDF and sent back. Their answers stay as they are;
        this records that the signature exists, so their hours settle on the payroll report.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted">
          Name as signed
          <input
            name="signedName" value={name} onChange={(e) => setName(e.target.value)}
            maxLength={120} disabled={busy} required
            className="mt-1 block w-full rounded-md border border-border-strong bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-brand"
          />
        </label>
        <label className="text-xs text-muted">
          {/* the date on THEIR signature, not today - see the note in the action */}
          Date they signed
          <DatePicker
            name="signedOn" value={when} onChange={setWhen}
            inputClassName="mt-1 block w-full rounded-md border border-border-strong bg-background px-2 py-1.5 pr-10 text-sm text-foreground outline-none focus:border-brand"
          />
          <span className="mt-1 block text-[11px] text-faint">Leave blank for today.</span>
        </label>
        <label className="text-xs text-muted sm:col-span-2">
          How it arrived
          <input
            name="how" value={how} onChange={(e) => setHow(e.target.value)}
            maxLength={200} disabled={busy}
            className="mt-1 block w-full rounded-md border border-border-strong bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-brand"
          />
        </label>
        <label className="text-xs text-muted sm:col-span-2">
          The signed copy (PDF)
          <input
            name="file" type="file" accept="application/pdf" disabled={busy}
            className="mt-1 block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-border-strong file:bg-surface file:px-2 file:py-1 file:text-xs file:text-foreground"
          />
          <span className="mt-1 block text-[11px] text-faint">
            Optional, but without it the record says signed with nothing behind it.
          </span>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="submit" disabled={busy}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Recording…" : "Record the signature"}
        </button>
        <button type="button" onClick={() => { setOpen(false); setErr(null); }} disabled={busy}
          className="rounded-lg border border-border-strong px-3 py-2 text-sm text-muted">
          Cancel
        </button>
        {err && (
          <span className="text-xs font-medium text-rose-600 dark:text-rose-400">
            {ERRORS[err] || "That did not record. Try again."}
          </span>
        )}
      </div>
    </form>
  );
}
