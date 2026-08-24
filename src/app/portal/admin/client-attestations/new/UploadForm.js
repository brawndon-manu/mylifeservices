"use client";

// THE UPLOAD FORM, AS A CLIENT COMPONENT PURELY SO IT CAN SAY SOMETHING.
//
// It was a plain server-action form, and pressing the button with no file
// picked did nothing anybody could see: the browser's own `required` bubble is
// easy to miss, and a month of schedules then takes several seconds to build
// with no sign the button was even pressed. Both of those read as "it's broken".
//
// So: the button says what it is waiting for, the chosen file is named back, and
// the pending state is explicit. Nothing about what gets uploaded changed.
import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";

function Submit({ ready }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={!ready || pending}
        className="rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Building the forms…" : "Upload and build the forms"}
      </button>
      {!ready && !pending && (
        <span className="text-sm text-muted">Pick the PDF first.</span>
      )}
      {pending && (
        <span className="text-sm text-muted">
          Reading every page and drawing a form for each client. This takes a few
          seconds for a full month - don&apos;t close the tab.
        </span>
      )}
    </div>
  );
}

export default function UploadForm({ action }) {
  const [picked, setPicked] = useState(null);
  const inputRef = useRef(null);

  return (
    <form action={action} className="mt-8 space-y-6">
      <div className="rounded-xl border border-border bg-surface p-5">
        <label htmlFor="file" className="block text-sm font-semibold text-foreground">
          Client Schedules export (PDF)
        </label>
        <input
          ref={inputRef}
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

      <Submit ready={!!picked} />
    </form>
  );
}
