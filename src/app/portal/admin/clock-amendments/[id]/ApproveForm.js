"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tidyTime, anchorOf } from "@/lib/clock-amendment/typed-time";
import PersonPicker from "../new/PersonPicker";
import { searchPeople } from "../actions";

// THE OFFICE'S THREE BUTTONS: approve and send, remind, and (on a rehearsal
// only) delete. Approval asks for a word when the claim was flagged, and for
// the correction made in the clock system, because backing that correction
// up is what the form is for. Which correction depends on the case: the
// clock-in for a late or missing clock-in, the clock-out for a missing
// clock-out, both when neither punch went in, and none when only the location
// was missing.
const ERRORS = {
  auth: "You do not have access to do that.",
  notfound: "This amendment is gone.",
  approved: "Already approved.",
  notready: "Not ready: it needs the staff signature and the client half signed or explained.",
  note: "Say why you are accepting it despite the flags.",
  qsptime: "A corrected time could not be read.",
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

// what the rehearsal box can be told when a send or a reset is refused
const REHEARSAL_ERRORS = {
  real: "Only a rehearsal can be sent around or reset.",
  who: "That person has no email on file.",
  email: "Pick a person on the roster or type an address.",
  approved: "It has been approved; reset it first to send it again.",
};

export default function ApproveForm({
  id, ready, flagged, fix = { in: false, out: false }, defaultIn = "", defaultTo = "",
  unsigned, neverSent = false, testOnly, approve, chase, remove, sendTo = null, reset = null, lastSent = null,
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState(null);
  const [note, setNote] = useState("");
  const [qspIn, setQspIn] = useState(defaultIn || "");
  const [qspTo, setQspTo] = useState(defaultTo || "");
  const [qspOn, setQspOn] = useState(today());
  const [result, setResult] = useState(null);
  const [armed, setArmed] = useState(false);
  // the rehearsal box: who to send it to, and the reset's own are-you-sure
  const [pick, setPick] = useState(null);
  const [email, setEmail] = useState("");
  const [sentMsg, setSentMsg] = useState(null);
  const [resetArmed, setResetArmed] = useState(false);
  const [rErr, setRErr] = useState(null);

  const run = (fn, after) =>
    start(async () => {
      const res = await fn();
      if (res?.ok) { setErr(null); after?.(res); router.refresh(); }
      else setErr(ERRORS[res?.error] || ERRORS.failed);
    });

  // the rehearsal controls report in their own box, never in the approval's
  const runRehearsal = (fn, after) =>
    start(async () => {
      const res = await fn();
      if (res?.ok) { setRErr(null); after?.(res); router.refresh(); }
      else setRErr(REHEARSAL_ERRORS[res?.error] || ERRORS[res?.error] || ERRORS.failed);
    });

  const anyFix = fix.in || fix.out;

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
          {anyFix ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {fix.in && (
                <div>
                  <label className={lbl} htmlFor="qspFixedIn">Clock-in corrected in QSClock to</label>
                  <input
                    id="qspFixedIn" name="qspFixedIn" value={qspIn}
                    onChange={(e) => setQspIn(e.target.value)}
                    // "7" reads as the time they signed for would have it
                    onBlur={(e) => setQspIn(tidyTime(e.target.value, anchorOf(defaultIn)))}
                    placeholder={defaultIn || "9:00 AM"} className={`mt-1.5 ${field} tabular-nums`}
                  />
                </div>
              )}
              {fix.out && (
                <div>
                  <label className={lbl} htmlFor="qspFixedTo">Clock-out corrected in QSClock to</label>
                  <input
                    id="qspFixedTo" name="qspFixedTo" value={qspTo}
                    onChange={(e) => setQspTo(e.target.value)}
                    onBlur={(e) => setQspTo(tidyTime(e.target.value, anchorOf(defaultTo)))}
                    placeholder={defaultTo || "1:00 PM"} className={`mt-1.5 ${field} tabular-nums`}
                  />
                </div>
              )}
              <div>
                <label className={lbl} htmlFor="qspFixedAt">On</label>
                <input id="qspFixedAt" name="qspFixedAt" type="date" value={qspOn} onChange={(e) => setQspOn(e.target.value)} className={`mt-1.5 ${field} tabular-nums`} />
              </div>
            </div>
          ) : (
            <p className="mt-4 rounded-[9px] border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-muted">
              The punches stand as recorded. Nothing to correct in QSClock; this record supplies the location.
            </p>
          )}
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
          <p className="mr-auto text-[13px] text-muted">{neverSent ? "It has not been sent yet." : "They have not signed yet."}</p>
          {err && !ready && <p className="w-full text-[13px] text-rose-700 dark:text-rose-300">{err}</p>}
          <button type="button" disabled={pending} onClick={() => run(() => chase(id))} className={`min-h-[44px] rounded-[9px] px-4 py-2 text-[13.5px] transition disabled:opacity-60 ${neverSent ? "bg-brand font-semibold text-white shadow-sm hover:opacity-90" : "border border-border-strong bg-fill font-medium text-foreground hover:bg-surface-2"}`}>
            {pending ? "Sending…" : neverSent ? "Send the form" : "Send a reminder"}
          </button>
        </div>
      )}

      {testOnly && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-5">
          <p className="w-full text-[13px] text-amber-800 dark:text-amber-200">This is a rehearsal. It is kept out of every count, and it can be run as many times as you like.</p>
          {/* aim it at whoever is being shown it: a roster person signs as
              themselves, a typed address only gets the link */}
          {sendTo && (
            <div className="w-full">
              <p className="text-[11px] font-semibold text-muted">Send the form to</p>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                <PersonPicker
                  name="rehearsal-recipient"
                  label="Someone on the roster"
                  hint="They sign as themselves."
                  search={searchPeople}
                  onPick={(r) => { setPick(r || null); if (r) setEmail(""); }}
                />
                <label className="block text-[12px] font-medium text-muted">
                  or an address
                  <input
                    type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com"
                    disabled={!!pick}
                    className="mt-1.5 min-h-[44px] w-full rounded-[9px] border border-border-strong bg-surface px-3 text-[15px] text-foreground outline-none focus-visible:border-brand disabled:opacity-50"
                  />
                </label>
                <button
                  type="button" disabled={pending}
                  onClick={() => runRehearsal(() => sendTo(id, { recipientId: pick?.id || "", email: pick ? "" : email.trim() }), (res) => setSentMsg(res.redirected ? `Test send, redirected to ${res.sentTo}.` : `Sent to ${res.to} (${res.sentTo}).`))}
                  className="min-h-[44px] rounded-[9px] bg-brand px-4 py-2 text-[13.5px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
                >
                  {pending ? "Sending…" : "Send"}
                </button>
              </div>
              {(sentMsg || lastSent) && (
                <p className="mt-2 text-[11.5px] text-muted">
                  {sentMsg || `Last sent to ${lastSent.to}${lastSent.email ? ` (${lastSent.email})` : ""} on ${lastSent.when}.`}
                </p>
              )}
              {rErr && <p className="mt-2 text-[12.5px] text-rose-700 dark:text-rose-300">{rErr}</p>}
            </div>
          )}
          {reset && (
            !resetArmed ? (
              <>
                <button type="button" disabled={pending} onClick={() => setResetArmed(true)} className="min-h-[44px] rounded-[9px] border border-border-strong bg-surface px-4 py-2 text-[13.5px] font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-60">
                  Reset the rehearsal
                </button>
                <p className="mr-auto text-[11.5px] text-muted">Clears both signatures, the code and the approval; keeps what the office took down.</p>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setResetArmed(false)} className="min-h-[44px] rounded-[9px] px-4 py-2 text-[13.5px] font-medium text-muted transition hover:bg-fill">Keep it</button>
                <button type="button" disabled={pending} onClick={() => runRehearsal(() => reset(id), () => { setResetArmed(false); setSentMsg(null); })} className="mr-auto min-h-[44px] rounded-[9px] bg-amber-600 px-4 py-2 text-[13.5px] font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-60">
                  {pending ? "Resetting…" : "Yes, reset it"}
                </button>
              </>
            )
          )}
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
