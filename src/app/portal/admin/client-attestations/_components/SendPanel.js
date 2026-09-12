"use client";

// SEND ALL: every unsigned client on the month, to every checked destination.
// The per-row Send button handles single clients; this is the monthly round.
//
// Destinations are checkboxes - a round can go to the field supervisors AND the
// assigned staff AND a typed address in one press. Each row gets one email per
// destination that resolves for it; anything that does not resolve is reported
// by name.
import { useState } from "react";
import DatePicker from "@/components/DatePicker";
import { useFormStatus } from "react-dom";

function Go({ label }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Sending…" : label}
    </button>
  );
}

const ERRORS = {
  target: "No destination checked.",
  noemail: "The Other address is not an email address.",
  nobatch: "This month is no longer here.",
};

const LABELS = {
  supervisor: "each client's field supervisor",
  staff: "assigned staff",
  client: "the client",
  other: "the typed address",
};

export default function SendPanel({ counts, mode = null, action }) {
  const [picked, setPicked] = useState({ supervisor: true, staff: false, client: false, other: false });
  const [customEmail, setCustomEmail] = useState("");
  const [onlyUnsent, setOnlyUnsent] = useState(true);
  const [result, setResult] = useState(null);
  const [open, setOpen] = useState(false);
  // THE PRESS THAT SENDS IS NOT THE PRESS THAT OPENS - Mánu 2026-09-12, after
  // asking who Send all goes to. There was no confirmation at all: the panel
  // opened on one click and sent on the next, and with "Assigned staff" ticked
  // that second click is 217 emails to 50 people. Email is not undoable, which
  // is the case where an are-you-sure is the right answer rather than an Undo.
  const [confirming, setConfirming] = useState(false);

  const rows = onlyUnsent ? counts.unsent : counts.unsigned;
  const chosen = Object.keys(picked).filter((k) => picked[k]);
  const destinations = chosen.map((k) => LABELS[k]).join(", ");

  // how many emails this press actually sends, per destination, counted off
  // the same set the send will walk. A destination that resolves for nobody
  // says so rather than being left out.
  const resolves = counts.resolves?.[onlyUnsent ? "unsent" : "unsigned"] || null;
  const perDestination = chosen.map((k) => ({ key: k, label: LABELS[k], n: resolves ? resolves[k] : null }));
  const total = perDestination.reduce((a, d) => a + (d.n ?? 0), 0);

  const toggle = (k) => {
    setConfirming(false);
    setPicked((p) => ({ ...p, [k]: !p[k] }));
  };

  return (
    <div className="mt-6 rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Send all</p>
          <p className="mt-1 text-sm text-muted">
            {counts.unsent > 0
              ? `${counts.unsent} of ${counts.all} not yet sent.`
              : "Everything unsigned has been sent at least once."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={counts.unsigned === 0}
          className="rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand disabled:opacity-50"
        >
          {open ? "Cancel" : `Send all (${rows})`}
        </button>
      </div>

      {open && (
        <form
          action={async (fd) => {
            const r = await action(fd);
            setResult(r);
          }}
          className="mt-5 space-y-5"
        >
          <fieldset>
            <legend className="text-sm font-semibold text-foreground">Destinations</legend>
            <div className="mt-2 space-y-2">
              <Choice
                checked={picked.supervisor}
                onChange={() => toggle("supervisor")}
                value="supervisor"
                label="Each client's field supervisor"
                hint={
                  counts.unrouted > 0
                    ? `Full form. ${counts.unrouted} of ${counts.all} clients have no supervisor and are skipped.`
                    : "Full form. Every client has a supervisor assigned."
                }
              />
              <Choice
                checked={picked.staff}
                onChange={() => toggle("staff")}
                value="staff"
                label="Assigned staff"
                hint="The client's signature fields only - the client signs off the staff member's email."
              />
              <Choice
                checked={picked.client}
                onChange={() => toggle("client")}
                value="client"
                label="Client"
                hint="Client emails are not stored, so every client under this destination is reported as skipped. Per-client sends with a typed address are on each row."
              />
              <Choice
                checked={picked.other}
                onChange={() => toggle("other")}
                value="other"
                label="Other"
                hint="Full form, one typed address."
              >
                {picked.other && (
                  <input
                    name="customEmail"
                    type="email"
                    value={customEmail}
                    onChange={(e) => { setConfirming(false); setCustomEmail(e.target.value); }}
                    placeholder="Email address"
                    className="mt-2 w-full max-w-sm rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground"
                  />
                )}
              </Choice>
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold text-foreground">Needed by (optional)</span>
              <DatePicker
                name="dueAt"
                inputClassName="mt-1.5 w-full rounded-md border border-border-strong bg-surface px-3 py-2 pr-10 text-sm text-foreground"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-foreground">Note (optional)</span>
              <input
                type="text"
                name="message"
                maxLength={300}
                className="mt-1.5 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground"
              />
            </label>
          </div>

          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              name="onlyUnsent"
              checked={onlyUnsent}
              onChange={(e) => { setConfirming(false); setOnlyUnsent(e.target.checked); }}
              className="mt-0.5"
            />
            <span className="text-sm text-muted">
              Only clients not yet sent. Unticked, everything unsigned goes again.
            </span>
          </label>

          {/* THE COUNT THAT MATTERS IS EMAILS, NOT CLIENTS. This line used to
              read "239 clients to: each client's field supervisor" when the
              press sent 6, because 233 of them have nobody to send to. */}
          <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm text-muted">
            {chosen.length === 0 ? (
              <>No destination checked.</>
            ) : (
              <>
                <b className="text-foreground">{total}</b>{" "}
                {total === 1 ? "email" : "emails"} from{" "}
                <b className="text-foreground">{rows}</b>{" "}
                {rows === 1 ? "client" : "clients"}, to{" "}
                <b className="text-foreground">{destinations}</b>.
                {perDestination.some((d) => d.n === 0) && (
                  <>
                    {" "}
                    {perDestination
                      .filter((d) => d.n === 0)
                      .map((d) => `Nothing resolves for ${d.label}.`)
                      .join(" ")}
                  </>
                )}
                {rows - (resolves?.supervisor ?? rows) > 0 && picked.supervisor && (
                  <> {rows - resolves.supervisor} have no supervisor and are skipped.</>
                )}
              </>
            )}
          </div>

          {!confirming ? (
            <button
              type="button"
              disabled={chosen.length === 0}
              onClick={() => setConfirming(true)}
              className="rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </button>
          ) : (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
              <p className="text-sm font-semibold text-foreground">
                {total === 1 ? "Send 1 email?" : `Send ${total} emails?`}
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {perDestination.map((d) => (
                  <li key={d.key}>
                    {d.n === null ? "?" : d.n} to {d.label}
                    {d.n === 0 ? " - nobody to send to" : ""}
                  </li>
                ))}
              </ul>
              {mode && (
                <p className="mt-2.5 text-sm text-foreground">
                  {mode.live
                    ? "These go to the real addresses."
                    : `These come to ${mode.recipients.join(", ")} instead. Nothing reaches anyone else.`}
                </p>
              )}
              <p className="mt-2.5 text-sm text-muted">This cannot be taken back.</p>
              <div className="mt-3 flex gap-2">
                <Go label={total === 1 ? "Send 1 email" : `Send ${total} emails`} />
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-md border border-border-strong px-4 py-2 text-sm font-medium text-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </form>
      )}

      {result && (
        <div className="mt-5 rounded-lg border border-border bg-surface-2 p-4 text-sm">
          {result.ok ? (
            <>
              <p className="font-semibold text-foreground">
                Sent {result.sent} {result.sent === 1 ? "email" : "emails"}.
              </p>
              {result.skipped?.length > 0 && (
                <p className="mt-2 text-muted">
                  Skipped: {result.skipped.slice(0, 10).join(", ")}
                  {result.skipped.length > 10 ? `, and ${result.skipped.length - 10} more` : ""}
                </p>
              )}
              {result.failed?.length > 0 && (
                <p className="mt-2 text-rose-700 dark:text-rose-400">
                  {result.failed.length} failed: {result.failed.slice(0, 5).join(", ")}
                </p>
              )}
            </>
          ) : (
            <p className="text-rose-700 dark:text-rose-400">
              Nothing was sent. {ERRORS[result.error] || result.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Choice({ checked, onChange, value, label, hint, children }) {
  return (
    <label className="block rounded-lg border border-border p-3 transition hover:bg-surface-2">
      <span className="flex items-start gap-2.5">
        <input
          type="checkbox"
          name="target"
          value={value}
          checked={checked}
          onChange={onChange}
          className="mt-1"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">{label}</span>
          {hint && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{hint}</span>}
          {children}
        </span>
      </span>
    </label>
  );
}
