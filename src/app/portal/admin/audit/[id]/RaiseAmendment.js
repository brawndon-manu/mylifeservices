"use client";

// RAISE A CLOCK AMENDMENT FROM THE CARD, in the same words the amendments
// page uses, so whichever screen the office starts from asks the same
// questions in the same order: what they said happened, where they were at
// a punch with no location, the time for each end the clock has wrong, and
// who to send it to. the times start where the page starts them - their own
// note, then the schedule, never the clock that is being amended.
//
// the row IS the clock row the rules read: it carries the punches, the
// location marks and how late the clock-in was, so the same rules decide
// what to ask here as on the page and on the form itself.
import { useId, useState } from "react";
import { raiseAmendmentFromCard } from "../actions";
import { searchPeople } from "../../clock-amendments/actions";
import PersonPicker from "../../clock-amendments/new/PersonPicker";
import { asksStart, asksEnd, asksPlace, startingTimes, missingPunchText } from "@/lib/clock-amendment/rules";
import { tidyTime, anchorOf } from "@/lib/clock-amendment/typed-time";
import { ampmLabel } from "@/lib/timesheet/hours-label";
import styles from "../audit.module.css";

// why a raise was refused, in words for the card
const ERRORS = {
  auth: "You can't raise one from here.",
  nobatch: "This copy could not be found.",
  noclock: "This copy holds no clock export to read the shift from.",
  clockfile: "The clock export could not be read.",
  norow: "This shift was not found in the copy's clock export.",
  clean: "The clock has nothing wrong with this shift.",
  noaccount: "No account matches this person, so there is nobody to send it to.",
  open: "An amendment is already out for this shift.",
  reason: "Say what they said happened.",
  times: "The time is needed for the end the clock has wrong.",
  who: "Pick who to send it to.",
};

export default function RaiseAmendment({ r, batchId, onDone, onCancel }) {
  // the row read as the amendment rules read a record
  const record = {
    clockRow: r,
    clockedIn: r.noIn || r.actualFrom == null ? null : ampmLabel(r.actualFrom),
    clockedOut: r.noOut || r.actualTo == null ? null : ampmLabel(r.actualTo),
    scheduledIn: (r.originalFrom ?? r.schedFrom) != null ? ampmLabel(r.originalFrom ?? r.schedFrom) : null,
    scheduledOut: (r.originalTo ?? r.schedTo) != null ? ampmLabel(r.originalTo ?? r.schedTo) : null,
    dsnStart: r.note?.start || null,
    dsnEnd: r.note?.end || null,
  };
  const asksIn = asksStart(record);
  const asksOut = asksEnd(record);
  const place = asksPlace(record);
  const starts = startingTimes(record);
  const inAnchor = anchorOf(record.scheduledIn);
  const outAnchor = anchorOf(record.scheduledOut);

  const [reasonText, setReasonText] = useState("");
  const [actualIn, setActualIn] = useState(asksIn ? starts.in || "" : "");
  const [actualOut, setActualOut] = useState(asksOut ? starts.out || "" : "");
  const [placeIn, setPlaceIn] = useState("");
  const [placeOut, setPlaceOut] = useState("");
  const [recipient, setRecipient] = useState(null);
  const [testOnly, setTestOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = useId();

  const submit = async () => {
    if (busy) return;
    if (!reasonText.trim()) { setError(ERRORS.reason); return; }
    setBusy(true);
    setError("");
    const body = new FormData();
    body.set("batchId", batchId || "");
    body.set("employeeKey", r.employeeKey || "");
    body.set("date", r.date || "");
    body.set("client", r.client || "");
    body.set("startMin", r.startMin ?? "");
    body.set("originalFrom", r.originalFrom ?? "");
    body.set("notePage", r.note?.page ?? "");
    body.set("reasonText", reasonText);
    body.set("actualIn", actualIn);
    body.set("actualOut", actualOut);
    body.set("placeIn", placeIn);
    body.set("placeOut", placeOut);
    body.set("recipientId", recipient?.id || "");
    if (testOnly) body.set("testOnly", "1");
    let res;
    try { res = await raiseAmendmentFromCard(body); }
    catch { res = null; }
    setBusy(false);
    if (!res?.ok) {
      setError(ERRORS[res?.error] || "Could not raise the amendment. Please try again.");
      return;
    }
    onDone?.({
      id: res.id,
      stage: res.sent ? "sent" : "draft",
      line: res.sent ? "Waiting on them" : "Not sent",
      sentAt: res.sent ? new Date().toISOString() : null,
      to: recipient?.label || r.who,
      form: `/portal/admin/clock-amendments/${res.id}`,
      testOnly,
    });
  };

  return (
    <div className={styles.raisePanel}>
      <p className="text-[13px] font-semibold text-foreground">Raise a clock amendment</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">
        The clock shows they {missingPunchText(record)}. What they told you on the phone; they will see it as
        &ldquo;you told the office&rdquo;, confirm or correct it, and sign.
      </p>
      {error && <p role="alert" className={`mt-2 text-xs font-semibold ${styles.bad}`}>{error}</p>}
      <div className="mt-3">
        <label htmlFor={`${id}-words`}>What they said happened</label>
        <textarea
          id={`${id}-words`} rows={3} value={reasonText}
          onChange={(e) => setReasonText(e.target.value)}
          placeholder={`Why they ${missingPunchText(record)}, in their words.`}
        />
      </div>
      {(place.in || place.out) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {place.in && (
            <div>
              <label htmlFor={`${id}-place-in`}>Where they said they were at clock-in</label>
              <input id={`${id}-place-in`} type="text" value={placeIn} onChange={(e) => setPlaceIn(e.target.value)} placeholder="Optional here; the form asks them" />
            </div>
          )}
          {place.out && (
            <div>
              <label htmlFor={`${id}-place-out`}>Where they said they were at clock-out</label>
              <input id={`${id}-place-out`} type="text" value={placeOut} onChange={(e) => setPlaceOut(e.target.value)} placeholder="Optional here; the form asks them" />
            </div>
          )}
        </div>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="grid grid-cols-2 gap-3">
          {asksIn && (
            <div>
              <label htmlFor={`${id}-in`}>Service started</label>
              <input
                id={`${id}-in`} type="text" value={actualIn} inputMode="numeric"
                onChange={(e) => setActualIn(e.target.value)}
                onBlur={(e) => setActualIn(tidyTime(e.target.value, inAnchor))}
                placeholder="9:00 AM" className="tabular-nums"
              />
            </div>
          )}
          {asksOut && (
            <div>
              <label htmlFor={`${id}-out`}>Service ended</label>
              <input
                id={`${id}-out`} type="text" value={actualOut} inputMode="numeric"
                onChange={(e) => setActualOut(e.target.value)}
                onBlur={(e) => setActualOut(tidyTime(e.target.value, outAnchor))}
                placeholder="1:00 PM" className="tabular-nums"
              />
            </div>
          )}
        </div>
        <PersonPicker
          name={`${id}-recipient`}
          label="Send it to"
          hint="Them, or the supervisor who was there."
          search={searchPeople}
          initial={{ id: "", label: r.who }}
          onPick={(p) => setRecipient(p)}
        />
      </div>
      <label className="mt-3 flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-foreground">
        <input type="checkbox" checked={testOnly} onChange={(e) => setTestOnly(e.target.checked)} className="h-4 w-4 accent-brand" />
        <span>
          <b className="font-semibold">Test run.</b>{" "}
          <span className="text-muted">Everything goes to your own inbox and the row is marked as a rehearsal, kept out of every count and deletable.</span>
        </span>
      </label>
      <div className={`${styles.cardActions} mt-3`}>
        <button type="button" disabled={busy} onClick={onCancel} className={styles.secondary}>Cancel</button>
        <button type="button" disabled={busy} onClick={submit} className={styles.primary}>{busy ? "Sending…" : "Send the form"}</button>
      </div>
    </div>
  );
}
