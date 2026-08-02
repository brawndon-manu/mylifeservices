"use client";

// management sign-off. the employee's copy is already flattened by the time it
// gets here, so there's no form field left to fill - the signature is drawn
// here and stamped onto the approval line server-side.
import { useState } from "react";
import { useRouter } from "next/navigation";
import SignaturePad from "@/app/portal/forms/[id]/fill/SignaturePad";

const ERRORS = {
  auth: "You don't have permission to approve this.",
  notsigned: "The employee hasn't signed this yet.",
  already: "This has already been approved.",
  nosignature: "Draw your signature first.",
  nofile: "Couldn't load the signed timesheet.",
  norect:
    "This timesheet was generated before sign-off existed, so there's nowhere to place the signature. Re-upload the pay period to regenerate it.",
  stamp: "Couldn't add the signature to the PDF. Try again.",
  store: "Couldn't save the approved copy. Try again.",
};

export default function ApproveSigner({ timesheetId, fileUrl, submitAction, backHref }) {
  const router = useRouter();
  const [signing, setSigning] = useState(false);
  const [sig, setSig] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    if (!sig) { setErr(ERRORS.nosignature); return; }
    setBusy(true);
    setErr(null);
    try {
      const res = await submitAction({ timesheetId, signatureDataUrl: sig });
      if (res?.ok) {
        router.push(backHref);
        router.refresh();
      } else {
        setErr(ERRORS[res?.error] || "Couldn't approve. Try again.");
      }
    } catch {
      setErr("Couldn't approve. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6">
      <object
        data={fileUrl}
        type="application/pdf"
        className="h-[60vh] w-full rounded-lg border border-border bg-surface-2"
        aria-label="The signed timesheet"
      >
        <p className="p-4 text-sm text-muted">
          <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-brand">
            Open the signed timesheet
          </a>{" "}
          to review it.
        </p>
      </object>

      <div className="mt-5 rounded-xl border border-border bg-surface p-5">
        <p className="text-sm font-medium text-foreground">Your approval signature</p>
        <p className="mt-1 text-xs text-muted">
          This is added to the approval line on the employee&apos;s signed copy.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setSigning(true)}
            className="flex h-16 w-56 items-center justify-center rounded-md border border-dashed border-brand-light/60 bg-background transition hover:bg-brand-light/5"
          >
            {sig ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sig} alt="Your signature" className="max-h-14 max-w-full" />
            ) : (
              <span className="text-sm font-medium text-brand-light">Tap to sign</span>
            )}
          </button>
          {sig && (
            <button
              type="button"
              onClick={() => setSig(null)}
              className="text-xs font-medium text-muted transition hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>

        {err && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{err}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={busy || !sig}
          className="mt-5 rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "Approving…" : "Approve & sign off"}
        </button>
      </div>

      {signing && (
        <SignaturePad
          onClose={() => setSigning(false)}
          onSave={(data) => {
            setSig(data);
            setSigning(false);
          }}
        />
      )}
    </div>
  );
}
