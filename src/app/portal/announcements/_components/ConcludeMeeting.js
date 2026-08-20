"use client";

// "Meeting has concluded" - closes the roll call, and sends the attestation if
// this meeting asks for one.
//
// The press does two irreversible things at once, so it never fires straight
// from the card. The dialog states the numbers first, names the documents going
// out, and shows the wording with room to change it. What is typed here applies
// to this send only and is not written back to the meeting.
import { useState } from "react";

const BTN = "rounded-md px-4 py-1.5 text-sm font-semibold transition";
const INPUT =
  "mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-faint focus:border-brand focus:outline-none";
const LABEL = "text-xs font-semibold uppercase tracking-wider text-faint";

export default function ConcludeMeeting({
  action,
  present = 0,
  willMarkAbsent = 0,
  alreadyAbsent = 0,
  attestationTitle = null,
  documents = [],
  defaultSubject = "",
  defaultBody = "",
  concludedAt = null,
  sentCount = null,
}) {
  const [open, setOpen] = useState(false);

  if (concludedAt) {
    return (
      <div className="mt-4 rounded-xl border border-border bg-surface-2 p-3">
        <p className="text-sm font-medium text-foreground">
          Concluded{" "}
          <span className="font-normal text-muted">
            {new Date(concludedAt).toLocaleString("en-US", {
              month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
            })}
          </span>
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {sentCount
            ? `Attestation sent to ${sentCount} ${sentCount === 1 ? "person" : "people"}.`
            : attestationTitle
              ? "No attestation was sent."
              : "This meeting had no attestation."}
        </p>
      </div>
    );
  }

  const sends = !!attestationTitle && present > 0;

  return (
    <>
      <div className="mt-4 rounded-xl border border-border bg-surface-2 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Meeting has concluded</p>
            <p className="mt-0.5 text-xs text-muted">
              {attestationTitle
                ? "Closes the roll call and sends the attestation."
                : "Closes the roll call. This meeting has no attestation, so nothing is emailed."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={`${BTN} bg-brand-light text-white hover:bg-brand`}
          >
            Meeting has concluded
          </button>
        </div>
        <p className="mt-2 text-xs text-faint">
          <b className="font-semibold text-muted">Will do:</b>{" "}
          {willMarkAbsent > 0
            ? `Mark ${willMarkAbsent} unmarked ${willMarkAbsent === 1 ? "person" : "people"} absent. `
            : "Nobody is left unmarked. "}
          {sends
            ? `Email the attestation to the ${present} marked present.`
            : attestationTitle
              ? "Nobody is marked present, so no attestation is sent."
              : "No email is sent."}
        </p>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-xl">
            <h2 className="text-base font-semibold text-foreground">
              Conclude this meeting?
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Nothing has been sent yet. Check the numbers, then send.
            </p>

            <div className="mt-4 overflow-hidden rounded-lg border border-border text-sm">
              <Row k="Marked present" v={present} />
              <Row k="Marked absent" v={alreadyAbsent} />
              <Row k="Will be marked absent" v={willMarkAbsent} note="not marked either way" />
              <Row
                k="Attestation goes to"
                v={sends ? present : 0}
                note={sends ? "the ones present" : attestationTitle ? "nobody is present" : "no attestation on this meeting"}
              />
            </div>

            <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              This cannot be undone from here. Attendance can still be changed on
              the roster afterwards, but the emails will already have gone.
            </p>

            <form action={action} className="mt-4">
              {sends && (
                <>
                  {documents.length > 0 && (
                    <div className="mb-3">
                      <p className={LABEL}>Documents included</p>
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {documents.map((d) => (
                          <li
                            key={d}
                            className="rounded-full border border-border-strong bg-surface-2 px-2.5 py-1 text-xs text-muted"
                          >
                            {d}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <label className="block">
                    <span className={LABEL}>Subject</span>
                    <input
                      name="subject"
                      type="text"
                      defaultValue={defaultSubject}
                      className={INPUT}
                    />
                  </label>
                  <label className="mt-3 block">
                    <span className={LABEL}>Message</span>
                    <textarea
                      name="message"
                      rows={4}
                      defaultValue={defaultBody}
                      className={INPUT}
                    />
                  </label>
                  <p className="mt-1.5 text-xs text-faint">
                    Prefilled from this meeting. Editing here changes only this send.
                  </p>
                </>
              )}
              <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className={`${BTN} border border-border-strong text-muted hover:text-foreground`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`${BTN} bg-brand-light text-white shadow-sm hover:bg-brand`}
                >
                  {sends ? `Mark absent and send to ${present}` : "Close the roll call"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ k, v, note }) {
  return (
    <div className="flex gap-3 border-t border-border px-3 py-2 first:border-t-0">
      <span className="min-w-[150px] text-muted">{k}</span>
      <span className="font-semibold text-foreground">
        {v}
        {note && <span className="ml-2 font-normal text-faint">{note}</span>}
      </span>
    </div>
  );
}
