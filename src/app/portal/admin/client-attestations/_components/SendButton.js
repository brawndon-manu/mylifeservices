"use client";

// THE SEND BUTTON ON ONE ROW. Opens a dialog naming the four places this
// client's form can go; the two assigned ones show who they resolve to, the
// other two take a typed address. Client emails are not stored, so a send to
// the client is a typed address every time.
import { useState } from "react";

const KINDS = [
  { key: "supervisor", label: "Assigned field supervisor" },
  { key: "staff", label: "Assigned staff" },
  { key: "client", label: "Client" },
  { key: "other", label: "Other" },
];

const ERRORS = {
  target: "No recipient selected.",
  norow: "This row no longer exists.",
  signed: "Already signed. A signed form is not re-sent.",
  noform: "No stored form on this row.",
  nosupervisor: "No field supervisor is assigned to this client's staff.",
  nostaff: "No staff account is matched to this client.",
  noemail: "Enter an email address.",
  clientsigned: "The client's signature is on file. The remaining fields are the supervisor's - send their link instead.",
  config: "Email is not configured on this server.",
  norecipient: "No address to send to.",
};

export default function SendButton({
  attestation, // { id, clientName, sentAt, supervisorName, staffName }
  testInbox, // null when live, otherwise where every send actually goes
  action, // sendAttestationOne bound to nothing; called with (id, formData)
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(
    attestation.supervisorName ? "supervisor" : attestation.staffName ? "staff" : "client",
  );
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const needsEmail = kind === "client" || kind === "other";

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    const fd = new FormData();
    fd.set("target", kind);
    if (needsEmail) fd.set("email", email);
    const r = await action(attestation.id, fd);
    setBusy(false);
    setResult(r);
    if (r?.ok) setTimeout(() => setOpen(false), 1600);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setResult(null);
          setOpen(true);
        }}
        className="rounded-md bg-brand-light px-3 py-1 text-xs font-semibold text-white transition hover:bg-brand"
      >
        {attestation.sentAt ? "Resend" : "Send"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Send ${attestation.clientName}`}
            // text-left explicitly: the dialog is rendered inside the row's right-
            // aligned cell and would inherit its alignment
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 text-left shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-semibold tracking-tight text-foreground">
              {attestation.clientName}
            </p>
            <p className="mt-0.5 text-sm text-muted">
              The form goes out as a PDF attachment with a link to sign in the
              browser.
            </p>

            {testInbox && (
              <p className="mt-3 rounded-lg border border-emerald-400/50 bg-emerald-50 p-2.5 text-xs text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-950/30 dark:text-emerald-200">
                Test mode. Every send goes to {testInbox}.
              </p>
            )}

            <form onSubmit={submit} className="mt-4 space-y-2">
              {KINDS.map((k) => {
                const resolved =
                  k.key === "supervisor"
                    ? attestation.supervisorName
                    : k.key === "staff"
                      ? attestation.staffName
                      : null;
                const dead =
                  (k.key === "supervisor" && !attestation.supervisorName) ||
                  (k.key === "staff" && !attestation.staffName);
                return (
                  <label
                    key={k.key}
                    className={`flex items-start gap-2.5 rounded-lg border border-border p-2.5 ${
                      dead ? "opacity-50" : "hover:bg-surface-2"
                    }`}
                  >
                    <input
                      type="radio"
                      name="kind"
                      value={k.key}
                      checked={kind === k.key}
                      disabled={dead}
                      onChange={() => setKind(k.key)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0 text-sm">
                      <span className="font-medium text-foreground">{k.label}</span>
                      {resolved && <span className="text-muted"> · {resolved}</span>}
                      {dead && (
                        <span className="block text-xs text-muted">None assigned</span>
                      )}
                    </span>
                  </label>
                );
              })}

              {needsEmail && (
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground"
                />
              )}

              {result && !result.ok && (
                <p className="text-sm text-rose-700 dark:text-rose-400">
                  {ERRORS[result.error] || result.error}
                </p>
              )}
              {result?.ok && (
                <p className="text-sm text-emerald-700 dark:text-emerald-400">
                  Sent to {result.to}
                  {result.redirected ? ` (meant for ${result.intendedEmail})` : ""}.
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
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
                  disabled={busy || (needsEmail && !email)}
                  className="rounded-md bg-brand-light px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand disabled:opacity-50"
                >
                  {busy ? "Sending…" : "Send"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
