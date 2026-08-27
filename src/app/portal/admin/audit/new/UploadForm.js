"use client";

// The notes export runs to nearly two thousand pages and takes a few seconds to
// read, so the button says what is happening rather than sitting there looking
// broken.
import { useState } from "react";
import { useFormStatus } from "react-dom";

function Submit({ picked }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || !picked}
      className="mt-6 rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Reading the notes…" : "Upload"}
    </button>
  );
}

export default function UploadForm({ action }) {
  const [name, setName] = useState("");
  const [size, setSize] = useState(0);

  return (
    <form action={action} className="mt-8">
      <label htmlFor="file" className="block text-sm font-medium text-muted">
        Employee Detailed Daily Service Notes (PDF) <span className="text-rose-600">*</span>
      </label>
      <input
        id="file"
        name="file"
        type="file"
        accept="application/pdf,.pdf"
        onChange={(e) => {
          setName(e.target.files?.[0]?.name || "");
          setSize(e.target.files?.[0]?.size || 0);
        }}
        className="mt-2 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground file:mr-3 file:rounded file:border-0 file:bg-surface-3 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
      />
      {name && (
        <p className="mt-2 text-xs text-faint">
          {name} · {(size / 1024 / 1024).toFixed(1)} MB
        </p>
      )}
      <Submit picked={!!name} />
    </form>
  );
}
