"use client";

// THE UPLOAD FORM, AS A CLIENT COMPONENT PURELY SO IT CAN SAY SOMETHING.
//
// It was a plain server-action form, and pressing the button with no file
// picked did nothing anybody could see: the browser's own `required` bubble is
// easy to miss, and a month of schedules then takes a long time to build with
// no sign the button was even pressed. Both of those read as "it's broken".
//
// AND THEN IT STILL DID - Mánu 2026-09-12, on a 240-client month: "its stuck
// here". The button said "Building the forms..." and "this takes a few
// seconds", which was wrong by an order of magnitude, so a working upload and
// a dead one looked identical. It now carries an id the server writes progress
// against, and the panel below polls it for a real count.
import { useEffect, useRef, useState } from "react";
import BuildProgress from "./BuildProgress";

// Module scope on purpose: Date.now and Math.random are impure, and a value
// invented during render differs between the server's HTML and the client's.
function mintUploadId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `u${Date.now()}${Math.random().toString(36).slice(2)}`
  );
}

export default function UploadForm({ action }) {
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [uploadId, setUploadId] = useState("");
  const idFieldRef = useRef(null);

  // elapsed time, started when the upload does
  useEffect(() => {
    if (!busy) return undefined;
    const t = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  // ONE PRESS, ONE MONTH. Pressing again while it runs builds a SECOND batch of
  // the same month - 240 more rows and 240 more stored PDFs - which is exactly
  // what somebody does when a screen looks stuck. The button is disabled for
  // the whole run and the pickers go with it.
  function onSubmit() {
    const id = mintUploadId();
    if (idFieldRef.current) idFieldRef.current.value = id;
    setUploadId(id);
    setBusy(true);
  }

  return (
    <form action={action} onSubmit={onSubmit} className="mt-8 space-y-6">
      <input ref={idFieldRef} type="hidden" name="uploadId" />

      <div className={busy ? "hidden" : "rounded-xl border border-border bg-surface p-5"}>
        <label htmlFor="file" className="block text-sm font-semibold text-foreground">
          Client Schedules export (PDF)
        </label>
        <input
          id="file"
          name="file"
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setPicked(f ? { name: f.name, size: f.size } : null);
          }}
          className="mt-3 block w-full text-sm text-muted file:mr-4 file:rounded-md file:border-0 file:bg-brand-light file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand"
        />
        {picked && (
          <p className="mt-3 text-sm text-foreground">
            <b>{picked.name}</b>{" "}
            <span className="text-muted">
              ({(picked.size / 1024 / 1024).toFixed(1)} MB)
            </span>
          </p>
        )}
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Every page is read for the client&apos;s name, the month, and each
          scheduled visit with the day it falls on. Nothing is emailed by
          uploading - the forms are generated and stored, and who collects each
          signature is decided afterwards.
        </p>
      </div>

      {busy ? (
        <>
          {picked && (
            <p className="text-sm text-foreground">
              <b>{picked.name}</b>{" "}
              <span className="text-muted">
                ({(picked.size / 1024 / 1024).toFixed(1)} MB)
              </span>
            </p>
          )}
          <BuildProgress uploadId={uploadId} seconds={seconds} />
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!picked}
            className="rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            Upload and build the forms
          </button>
          {!picked && <span className="text-sm text-muted">Pick the PDF first.</span>}
        </div>
      )}
    </form>
  );
}
