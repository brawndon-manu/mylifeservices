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

export default function SendPanel({ counts, action }) {
  const [picked, setPicked] = useState({ supervisor: true, staff: false, client: false, other: false });
  const [customEmail, setCustomEmail] = useState("");
  const [onlyUnsent, setOnlyUnsent] = useState(true);
  const [result, setResult] = useState(null);
  const [open, setOpen] = useState(false);

  const rows = onlyUnsent ? counts.unsent : counts.unsigned;
  const chosen = Object.keys(picked).filter((k) => picked[k]);
  const destinations = chosen.map((k) => LABELS[k]).join(", ");

  const toggle = (k) => setPicked((p) => ({ ...p, [k]: !p[k] }));

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
                    onChange={(e) => setCustomEmail(e.target.value)}
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
              onChange={(e) => setOnlyUnsent(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-sm text-muted">
              Only clients not yet sent. Unticked, everything unsigned goes again.
            </span>
          </label>

          <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm text-muted">
            {chosen.length === 0 ? (
              <>No destination checked.</>
            ) : (
              <>
                <b className="text-foreground">{rows}</b>{" "}
                {rows === 1 ? "client" : "clients"} to:{" "}
                <b className="text-foreground">{destinations}</b>.
              </>
            )}
          </div>

          <Go label="Send" />
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
