"use client";

// FILE A SIGNED COPY THAT CAME BACK ON PAPER. The dialog takes the scan, the
// name on the signature, and the date it was signed; the row flips to Signed
// with the file stored and the filer on record.
import { useState } from "react";
import DatePicker from "@/components/DatePicker";
import { useRouter } from "next/navigation";

const ERRORS = {
  gone: "This row no longer exists.",
  already: "Already signed.",
  noname: "Enter the name as signed.",
  baddate: "That date could not be read.",
  nofile: "Attach the signed copy. The stored document is the record.",
  notpdf: "The signed copy needs to be a PDF. A phone scan can be saved as one.",
  toobig: "That file is over the 8MB limit.",
  noblob: "File storage is not configured.",
  store: "The file could not be stored. Nothing was recorded.",
};

export default function PaperSignButton({ attestation, action }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const res = await action(attestation.id, fd);
    setBusy(false);
    if (!res?.ok) {
      setErr(res?.error || "failed");
      return;
    }
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setErr(null);
          setOpen(true);
        }}
        title="Record a signed paper copy"
        className="whitespace-nowrap rounded-md border border-border-strong px-3 py-1 text-xs font-medium text-muted transition hover:border-brand hover:text-brand"
      >
        Record
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <form
            onSubmit={submit}
            role="dialog"
            aria-modal="true"
            aria-label={`Record signed copy for ${attestation.clientName}`}
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 text-left shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-semibold tracking-tight text-foreground">
              {attestation.clientName}
            </p>
            <p className="mt-0.5 text-sm text-muted">
              For a form signed on paper. The scan is stored and the row counts
              as signed.
            </p>

            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="font-medium text-foreground">Signed by</span>
                <input
                  name="signedName"
                  required
                  maxLength={120}
                  disabled={busy}
                  placeholder="Name as signed"
                  className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-foreground">Date signed</span>
                <DatePicker
                  name="signedOn"
                  inputClassName="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 pr-10 text-sm text-foreground"
                />
                <span className="mt-1 block text-xs text-faint">
                  The date on the signature. Blank is today.
                </span>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-foreground">The signed copy (PDF)</span>
                <input
                  name="file"
                  type="file"
                  accept="application/pdf,.pdf"
                  required
                  disabled={busy}
                  className="mt-1 block w-full text-sm text-muted file:mr-3 file:rounded-md file:border file:border-border-strong file:bg-surface file:px-2 file:py-1 file:text-xs file:text-foreground"
                />
              </label>
            </div>

            {err && (
              <p className="mt-3 text-sm text-rose-700 dark:text-rose-400">
                {ERRORS[err] || "That did not record. Try again."}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="rounded-md border border-border-strong px-3.5 py-1.5 text-sm font-medium text-muted transition hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-brand-light px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand disabled:opacity-50"
              >
                {busy ? "Recording…" : "Record"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
