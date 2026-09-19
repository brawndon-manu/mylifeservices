"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tidyTime, anchorOf } from "@/lib/clock-amendment/typed-time";

// THE OFFICE'S THREE BUTTONS: approve and send, remind, and (on a rehearsal
// only) delete. Approval asks for a word when the claim was flagged, and for
// the fix made in QSClock, because backing that fix up is what the form is for.
const ERRORS = {
  auth: "You do not have access to do that.",
  notfound: "This amendment is gone.",
  approved: "Already approved.",
  notready: "Not ready: it needs the staff signature and the client half signed or explained.",
  note: "Say why you are accepting it despite the flags.",
  qsptime: "The corrected clock-out time could not be read.",
  document: "The document could not be built.",
  signed: "They have already signed, so there is nothing to remind them of.",
  who: "There is nobody to send it to.",
  real: "Only a rehearsal can be deleted.",
  config: "Email is not configured here.",
  send: "The email did not go.",
  failed: "Something went wrong. Please try again.",
};

const field =
  "min-h-[44px] w-full rounded-[9px] border border-border-strong bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-brand";
const lbl = "block text-[12.5px] font-medium text-muted";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function ApproveForm({ id, ready, flagged, defaultTo, unsigned, testOnly, approve, chase, remove }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState(null);
  const [note, setNote] = useState("");
  const [qspTo, setQspTo] = useState(defaultTo || "");
  const [qspOn, setQspOn] = useState(today());
  const [result, setResult] = useState(null);
  const [armed, setArmed] = useState(false);

  const run = (fn, after) =>
    start(async () => {
      const res = await fn();
      if (res?.ok) { setErr(null); after?.(res); router.refresh(); }
      else setErr(ERRORS[res?.error] || ERRORS.failed);
    });

  return (
    <div className="space-y-4">
      {ready && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(() => approve(id, fd), (res) => setResult(res));
          }}
          className="rounded-xl border border-border bg-surface p-5"
        >
          <h2 className="text-[13px] font-semibold text-foreground">Approve</h2>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
            Your name goes on the document, it is kept on the record, and a copy is emailed to the office and to the staff member.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className={lbl} htmlFor="qspFixedTo">Clock-out corrected in QSClock to</label>
              <input
                id="qspFixedTo" name="qspFixedTo" value={qspTo}
                onChange={(e) => setQspTo(e.target.value)}
                // "7" reads as the time they signed for would have it
                onBlur={(e) => setQspTo(tidyTime(e.target.value, anchorOf(defaultTo)))}
                placeholder="6:30 PM" className={`mt-1.5 ${field} tabular-nums`}
              />
            </div>
            <div>
              <label className={lbl} htmlFor="qspFixedAt">On</label>
              <input id="qspFixedAt" name="qspFixedAt" type="date" value={qspOn} onChange={(e) => setQspOn(e.target.value)} className={`mt-1.5 ${field} tabular-nums`} />
            </div>
          </div>
          <div className="mt-4">
            <label className={lbl} htmlFor="approvalNote">
              {flagged ? "Why you are accepting it despite the flags" : "A note for the record (optional)"}
            </label>
            <textarea id="approvalNote" name="approvalNote" rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={`mt-1.5 min-h-[64px] w-full rounded-[9px] border border-border-strong bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-brand`} />
          </div>
          {err && <p className="mt-3 rounded-[9px] border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-700 dark:text-rose-300">{err}</p>}
          <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
            <a href={`/portal/admin/clock-amendments/${id}/pdf`} target="_blank" rel="noopener" className="mr-auto text-[13px] font-semibold text-brand underline underline-offset-4">
              Read the document first
            </a>
            <button type="submit" disabled={pending} className="min-h-[44px] rounded-[9px] bg-brand px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60">
              {pending ? "Approving…" : "Approve and send"}
            </button>
          </div>
        </form>
      )}

      {result && (
        <p className={`rounded-[9px] border px-4 py-3 text-[13px] ${result.sent ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200" : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200"}`}>
          {result.sent
            ? result.redirected ? `Approved. Test send, redirected to ${result.sentTo}.` : `Approved and emailed to ${result.sentTo}.`
            : `Approved and kept, but the email did not go (${result.error}).`}
        </p>
      )}

      {unsigned && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-5">
          <p className="mr-auto text-[13px] text-muted">They have not signed yet.</p>
          {err && !ready && <p className="w-full text-[13px] text-rose-700 dark:text-rose-300">{err}</p>}
          <button type="button" disabled={pending} onClick={() => run(() => chase(id))} className="min-h-[44px] rounded-[9px] border border-border-strong bg-fill px-4 py-2 text-[13.5px] font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-60">
            {pending ? "Sending…" : "Send a reminder"}
          </button>
        </div>
      )}

      {testOnly && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-5">
          <p className="mr-auto text-[13px] text-amber-800 dark:text-amber-200">This is a rehearsal. It is kept out of every count.</p>
          {!armed ? (
            <button type="button" onClick={() => setArmed(true)} className="min-h-[44px] rounded-[9px] px-4 py-2 text-[13.5px] font-medium text-rose-700 transition hover:bg-rose-500/10 dark:text-rose-300">
              Delete this rehearsal
            </button>
          ) : (
            <>
              <button type="button" onClick={() => setArmed(false)} className="min-h-[44px] rounded-[9px] px-4 py-2 text-[13.5px] font-medium text-muted transition hover:bg-fill">Keep it</button>
              <button type="button" disabled={pending} onClick={() => run(() => remove(id), () => router.push("/portal/admin/clock-amendments"))} className="min-h-[44px] rounded-[9px] bg-rose-700 px-4 py-2 text-[13.5px] font-semibold text-white shadow-sm transition hover:bg-rose-800 disabled:opacity-60">
                {pending ? "Deleting…" : "Yes, delete it"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
